import type { Database } from "bun:sqlite";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { parseAmount } from "@sayso/core";
import { type Address, getAddress, type Hex, isAddress, parseEther, zeroAddress } from "viem";

export const DRIP_MON_WEI = parseEther("0.5");
export const DRIP_AUSD = parseAmount("10");
export type DripLeg = "mon" | "ausd";
export type DripLegStatus = "pending" | "signed" | "confirmed" | "reverted";
export interface DripPrepared {
  hash: Hex;
  raw: Hex;
}
export interface DripReceipt {
  hash: Hex;
  block: number;
  success: boolean;
}
export interface DripBudget {
  mon: bigint;
  ausd: bigint;
  monGas: bigint;
  ausdGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}
export interface DripChain {
  inspect(address: Address, signed: Partial<Record<DripLeg, DripPrepared>>): Promise<DripBudget>;
  prepare(
    address: Address,
    leg: DripLeg,
    budget: DripBudget,
    afterBlock: number,
  ): Promise<DripPrepared>;
  receipt(hash: Hex): Promise<DripReceipt | null>;
  broadcast(transaction: DripPrepared): Promise<DripReceipt>;
}
export interface DripStatus {
  address: Address;
  network: "TESTNET";
  chainId: 10143;
  amounts: { monWei: string; ausd: string };
  status: "pending" | "completed";
  mon: { status: DripLegStatus; hash: Hex | null; block: number | null };
  ausd: { status: DripLegStatus; hash: Hex | null; block: number | null };
}
export interface DripDependencies {
  db: Database;
  chain: DripChain;
  ipSalt: string;
  /** New addresses one client IP may receive per rolling hour; production keeps 1. */
  maxPerIpHour?: number;
  now?: () => number;
}
export class DripError extends Error {
  constructor(
    readonly code:
      | "invalid_address"
      | "invalid_ip"
      | "already_awarded"
      | "rate_limited"
      | "low_balance"
      | "unavailable"
      | "pending"
      | "reverted",
    readonly httpStatus: 400 | 409 | 429 | 503,
  ) {
    super(code);
    this.name = "DripError";
  }
}
interface DripRow {
  address: Address;
  mon_wei: string;
  ausd: string;
  status: "pending" | "completed";
  tx_mon: Hex | null;
  tx_ausd: Hex | null;
  raw_mon: Hex | null;
  raw_ausd: Hex | null;
  status_mon: DripLegStatus;
  status_ausd: DripLegStatus;
  block_mon: number | null;
  block_ausd: number | null;
}
function recipient(input: string): Address {
  if (
    typeof input !== "string" ||
    !isAddress(input, { strict: false }) ||
    input.toLowerCase() === zeroAddress
  )
    throw new DripError("invalid_address", 400);
  // A lowercase primary key is invariant across checksummed/all-uppercase clients.
  return getAddress(input.toLowerCase()).toLowerCase() as Address;
}
export class DripService {
  readonly #deps: DripDependencies;
  #tail = Promise.resolve();
  #stopped = false;
  constructor(deps: DripDependencies) {
    if (deps.ipSalt.length < 32) throw new Error("Drip IP salt must have at least 32 characters");
    this.#deps = deps;
  }
  status(input: string): DripStatus | null {
    const row = this.#row(recipient(input));
    if (!row) return null;
    return {
      address: row.address,
      network: "TESTNET",
      chainId: 10143,
      amounts: { monWei: row.mon_wei, ausd: row.ausd },
      status: row.status,
      mon: { status: row.status_mon, hash: row.tx_mon, block: row.block_mon },
      ausd: { status: row.status_ausd, hash: row.tx_ausd, block: row.block_ausd },
    };
  }
  async stop(): Promise<void> {
    this.#stopped = true;
    await this.#tail;
  }
  async claim(input: string, ip: string): Promise<DripStatus> {
    if (this.#stopped) throw new DripError("unavailable", 503);
    const address = recipient(input);
    if (typeof ip !== "string") throw new DripError("invalid_ip", 400);
    // IPv4-mapped peers share their IPv4 bucket; canonicalize equivalent IPv6 spellings.
    const directIp =
      ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
    const family = isIP(directIp);
    if (!family) throw new DripError("invalid_ip", 400);
    const canonicalIp = family === 6 ? new URL(`http://[${directIp}]/`).hostname : directIp;
    const ipHash = createHmac("sha256", this.#deps.ipSalt).update(canonicalIp).digest("hex");
    const previous = this.#tail;
    const gate = Promise.withResolvers<void>();
    this.#tail = gate.promise;
    await previous;
    try {
      return await this.#claim(address, ipHash);
    } catch (error) {
      // Nothing signed yet: release the reservation so a transient failure cannot hold the
      // sender gate and IP hour for every player. Signed legs stay for same-bytes recovery.
      this.#deps.db
        .query(
          "DELETE FROM drips WHERE address=? AND tx_mon IS NULL AND tx_ausd IS NULL AND status='pending'",
        )
        .run(address);
      if (error instanceof DripError) throw error;
      // RPC errors can embed serialized transactions and URL credentials; never expose them.
      throw new DripError("unavailable", 503);
    } finally {
      gate.resolve();
    }
  }
  #row(address: Address): DripRow | null {
    return this.#deps.db
      .query<DripRow, [string]>(
        "SELECT * FROM drips WHERE lower(address)=? ORDER BY status='completed' DESC LIMIT 1",
      )
      .get(address.toLowerCase());
  }
  #requiredRow(address: Address): DripRow {
    const row = this.#row(address);
    if (!row) throw new DripError("unavailable", 503);
    return row;
  }
  #reserve(address: Address, ipHash: string, at: number) {
    const db = this.#deps.db;
    db.transaction(() => {
      const current = this.#row(address);
      if (current?.status === "completed") throw new DripError("already_awarded", 409);
      if (current) return;
      const recent = db
        .query<{ n: number }, [string, number]>(
          "SELECT count(*) AS n FROM drips WHERE ip_hash=? AND at>?",
        )
        .get(ipHash, at - 3_600_000);
      if ((recent?.n ?? 0) >= (this.#deps.maxPerIpHour ?? 1))
        throw new DripError("rate_limited", 429);
      // An unresolved signed nonce must block every other recipient, even across restart.
      if (db.query("SELECT address FROM drips WHERE status<>'completed' LIMIT 1").get())
        throw new DripError("pending", 503);
      db.query(`INSERT INTO drips(address,mon_wei,ausd,ip_hash,at,status,status_mon,status_ausd)
        VALUES(?,?,?,?,?,'pending','pending','pending')`).run(
        address,
        DRIP_MON_WEI.toString(),
        DRIP_AUSD.toString(),
        ipHash,
        at,
      );
    }).immediate();
  }
  #record(address: Address, leg: DripLeg, receipt: DripReceipt) {
    if (!Number.isSafeInteger(receipt.block) || receipt.block < 0)
      throw new DripError("unavailable", 503);
    this.#deps.db
      .query(`UPDATE drips SET status_${leg}=?,block_${leg}=? WHERE address=? AND tx_${leg}=?`)
      .run(
        receipt.success ? "confirmed" : "reverted",
        receipt.block,
        this.#row(address)?.address ?? address,
        receipt.hash,
      );
  }
  async #claim(address: Address, ipHash: string): Promise<DripStatus> {
    const { db, chain } = this.#deps;
    let row = this.#row(address);
    if (row?.status === "completed") throw new DripError("already_awarded", 409);
    // Reconcile before budgeting: a broadcast may have mined while the RPC was unreachable.
    if (row)
      for (const leg of ["mon", "ausd"] as const) {
        const hash = row[`tx_${leg}`];
        if (hash && row[`status_${leg}`] === "signed") {
          const receipt = await chain.receipt(hash);
          if (receipt) this.#record(address, leg, receipt);
        }
      }
    row = this.#row(address);
    if (row?.status_mon === "confirmed" && row.status_ausd === "confirmed") {
      db.query("UPDATE drips SET status='completed' WHERE address=?").run(row.address);
      const status = this.status(address);
      if (!status) throw new DripError("unavailable", 503);
      return status;
    }
    const signed: Partial<Record<DripLeg, DripPrepared>> = {};
    if (row)
      for (const leg of ["mon", "ausd"] as const) {
        const hash = row[`tx_${leg}`],
          raw = row[`raw_${leg}`];
        if (hash && raw && row[`status_${leg}`] === "signed") signed[leg] = { hash, raw };
      }
    let budget = await chain.inspect(address, signed);
    this.#budget(row, budget);
    if (!row) this.#reserve(address, ipHash, (this.#deps.now ?? Date.now)());
    row = this.#requiredRow(address);
    if (!row.tx_mon && !row.tx_ausd) {
      // Another recipient may have completed between the first balance read and
      // winning the durable sender gate. Re-budget before signing either leg.
      budget = await chain.inspect(address, signed);
      this.#budget(row, budget);
    }
    for (const leg of ["mon", "ausd"] as const) {
      row = this.#requiredRow(address);
      if (row[`status_${leg}`] === "confirmed") continue;
      if (leg === "ausd") {
        budget = await chain.inspect(address, signed);
        this.#budget(row, budget);
      }
      let hash = row[`tx_${leg}`],
        raw = row[`raw_${leg}`];
      if (row[`status_${leg}`] !== "signed") {
        const last =
          db
            .query<{ block: number | null }, []>(
              "SELECT MAX(block) AS block FROM (SELECT block_mon AS block FROM drips UNION ALL SELECT block_ausd AS block FROM drips)",
            )
            .get()?.block ?? -1;
        const prepared = await chain.prepare(address, leg, budget, last);
        // Only the winning candidate is ever broadcast. A concurrent process may sign, but
        // cannot replace an unknown transaction with a new fee/nonce/hash.
        db.query(`UPDATE drips SET tx_${leg}=?,raw_${leg}=?,status_${leg}='signed',block_${leg}=NULL
          WHERE address=? AND status_${leg}=? AND tx_${leg} IS ?`).run(
          prepared.hash,
          prepared.raw,
          row.address,
          row[`status_${leg}`],
          hash,
        );
        row = this.#requiredRow(address);
        if (row[`status_${leg}`] === "confirmed") continue;
        hash = row[`tx_${leg}`];
        raw = row[`raw_${leg}`];
      }
      if (!hash || !raw) throw new DripError("pending", 503);
      let receipt: DripReceipt;
      try {
        receipt = await chain.broadcast({ hash, raw });
      } catch {
        throw new DripError("pending", 503);
      }
      if (receipt.hash !== hash) throw new DripError("pending", 503);
      this.#record(address, leg, receipt);
      if (!receipt.success) throw new DripError("reverted", 503);
    }
    row = this.#requiredRow(address);
    if (row.status_mon !== "confirmed" || row.status_ausd !== "confirmed")
      throw new DripError("pending", 503);
    db.query("UPDATE drips SET status='completed' WHERE address=?").run(row.address);
    const status = this.status(address);
    if (!status) throw new DripError("unavailable", 503);
    return status;
  }
  #budget(row: DripRow | null, budget: DripBudget) {
    const needsMon = row?.status_mon !== "confirmed",
      needsAusd = row?.status_ausd !== "confirmed";
    const gas = (needsMon ? budget.monGas : 0n) + (needsAusd ? budget.ausdGas : 0n);
    if (
      budget.mon < (needsMon ? DRIP_MON_WEI : 0n) + gas * budget.maxFeePerGas ||
      (needsAusd && budget.ausd < DRIP_AUSD)
    )
      throw new DripError("low_balance", 503);
  }
}
