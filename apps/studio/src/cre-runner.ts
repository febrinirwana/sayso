import type { Database } from "bun:sqlite";
import { type ChildProcess, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { addresses, saysoMarketsAbi } from "@sayso/core";
import { YAML } from "bun";
import {
  type Address,
  createPublicClient,
  type DecodeEventLogReturnType,
  decodeEventLog,
  getAbiItem,
  type Hex,
  http,
  type TransactionReceipt,
  zeroAddress,
} from "viem";
import { monadTestnet } from "viem/chains";
import { operatorFailure } from "./operator-log.ts";
import { expireStudioChainId, studioRpc } from "./rpc.ts";
import type { ActionKind, Receipt } from "./runner.ts";

export type CreRunnerDeps = {
  db: Database;
  rpcUrl: string;
  receiver: Address;
  revealApiBaseUrl: string;
  resolverDir: string;
  mode: "simulation" | "don";
  startBlock: bigint;
  reporterAddress?: Address;
  // The composition root alone owns REPORTER -> CRE_ETH_PRIVATE_KEY. Never inspect this result.
  processEnv(): NodeJS.ProcessEnv;
  now?(): number;
  pollMs?: number;
  timeoutMs?: number;
  cliPath?: string;
  // Executable and optional fixed prefix, useful for a process-plumbing smoke (not CRE proof).
  command?: readonly string[];
};
export type CreRunner = {
  onReceipt(action: { episodeId: number; kind: ActionKind; receipt: Receipt }): Promise<void>;
  tick(): Promise<void>;
  start(): void;
  stop(): Promise<void>;
};
type Run = {
  id: number;
  episode_id: number;
  trigger: "evidence" | "closed";
  trigger_tx: Hex;
  trigger_log_index: number;
  trigger_block: string;
  word_ids_json: string;
  mode: "simulation" | "don";
  status: string;
  attempts: number;
  retry_count: number;
  next_attempt_ms: number;
  reporter_nonce: number | null;
  execution_block: string | null;
};
type ReportProof = { hash: Hex; block: bigint };
type ProcessResult = "ok" | "failed" | "timeout" | "not-started" | "stopped";
type NoReport = { retryable: boolean };
type Execution = { status: ProcessResult; noReport: NoReport | null };
const retryDelays = [5_000, 30_000, 120_000, 600_000] as const;
const sameAddress = (a: string | null | undefined, b: string) =>
  a?.toLowerCase() === b.toLowerCase();

/** Durable log-driven simulation runner. REPORTER is independent of OPERATOR/BOT.
 * CLI owns signing; an ambiguous execution is reconciled, NEVER automatically re-signed.
 */
export function createCreRunner(deps: CreRunnerDeps): CreRunner {
  if (deps.startBlock < 0n || deps.receiver === zeroAddress || !deps.resolverDir)
    throw new Error("CRE runner configuration invalid");
  if (deps.mode === "simulation" && !deps.reporterAddress)
    throw new Error("CRE reporter address required");
  const { db, receiver } = deps;
  const now = deps.now ?? Date.now;
  const client = createPublicClient({
    chain: monadTestnet,
    transport: studioRpc(deps.rpcUrl),
  });
  const notified = new Set<Hex>();
  let active: ChildProcess | undefined;
  let stopped = false;
  let timer: Timer | undefined;
  let work: Promise<void> | undefined;
  let discoveryAfter = 0;
  let discoveryFailures = 0;
  let processingAfter = 0;
  let processingFailures = 0;
  const forwarder =
    deps.mode === "simulation" ? addresses.creSimulationForwarder : addresses.creForwarder;

  async function discoverReceipt(hash: Hex) {
    const receipt = await client.getTransactionReceipt({ hash });
    if (receipt.status !== "success") return;
    // CLI event index is the position in THIS receipt, not the block-global logIndex.
    for (let index = 0; index < receipt.logs.length; index++) {
      const log = receipt.logs[index];
      if (!log || !sameAddress(log.address, receiver) || log.removed) continue;
      let event: DecodeEventLogReturnType<typeof saysoMarketsAbi>;
      try {
        event = decodeEventLog({
          abi: saysoMarketsAbi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
      } catch {
        continue;
      }
      if (event.eventName !== "EvidenceReady" && event.eventName !== "EpisodeClosed") continue;
      const episodeId = event.args.episodeId;
      if (!db.query("SELECT 1 FROM episodes WHERE id = ?").get(episodeId))
        throw new Error("CRE episode projection missing");
      const ids =
        event.eventName === "EvidenceReady"
          ? event.args.wordIds
          : await client.readContract({
              address: receiver,
              abi: saysoMarketsAbi,
              functionName: "episodeWords",
              args: [episodeId],
            });
      db.query(`INSERT OR IGNORE INTO cre_runs
        (episode_id,trigger,trigger_tx,trigger_log_index,trigger_block,word_ids_json,mode,status,started_ms)
        VALUES(?,?,?,?,?,?,?,'pending',?)`).run(
        episodeId,
        event.eventName === "EvidenceReady" ? "evidence" : "closed",
        hash.toLowerCase(),
        index,
        receipt.blockNumber.toString(),
        JSON.stringify(ids.map(String)),
        deps.mode,
        now(),
      );
    }
  }
  async function discover() {
    if ((await client.getChainId()) !== 10143) throw new Error("CRE chain mismatch");
    const hashes = new Set(notified);
    notified.clear();
    const actions = db
      .query<{ tx_hash: Hex }, []>(`SELECT DISTINCT tx_hash FROM actions WHERE
      kind IN ('evidence','close') AND status = 'confirmed' AND tx_hash IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM cre_runs WHERE trigger_tx = lower(actions.tx_hash))`)
      .all();
    for (const action of actions) hashes.add(action.tx_hash);
    for (const hash of hashes) {
      try {
        await discoverReceipt(hash);
      } catch (error) {
        notified.add(hash);
        throw error;
      }
    }
    const head = await client.getBlockNumber({ cacheTime: 0 });
    const cursor = db
      .query<{ next_block: string }, [string]>(
        "SELECT next_block FROM cre_runner_state WHERE receiver = ?",
      )
      .get(receiver.toLowerCase());
    const from = cursor ? BigInt(cursor.next_block) : deps.startBlock;
    if (from > head) return;
    const to = from + 99n < head ? from + 99n : head;
    const logs = await client.getLogs({
      address: receiver,
      events: [
        getAbiItem({ abi: saysoMarketsAbi, name: "EvidenceReady" }),
        getAbiItem({ abi: saysoMarketsAbi, name: "EpisodeClosed" }),
      ],
      fromBlock: from,
      toBlock: to,
    });
    const transactions = new Set<Hex>();
    for (const log of logs)
      if (log.transactionHash && !log.removed && sameAddress(log.address, receiver))
        transactions.add(log.transactionHash);
    for (const hash of transactions) await discoverReceipt(hash);
    db.query(`INSERT INTO cre_runner_state(receiver,next_block) VALUES(?,?)
      ON CONFLICT(receiver) DO UPDATE SET next_block=excluded.next_block`).run(
      receiver.toLowerCase(),
      (to + 1n).toString(),
    );
  }
  async function validateResolver() {
    if ((await client.getChainId()) !== 10143) throw new Error("CRE studio chain mismatch");
    // Load the actual selected artifact, not a shadow studio copy of resolver config.
    const workflow = YAML.parse(
      await readFile(resolve(deps.resolverDir, "workflow.yaml"), "utf8"),
    ) as {
      "monad-testnet"?: {
        "workflow-artifacts"?: { "config-path"?: string; "workflow-path"?: string };
      };
    };
    const artifacts = workflow?.["monad-testnet"]?.["workflow-artifacts"];
    if (!artifacts?.["config-path"] || artifacts["workflow-path"] !== "./src/main.ts")
      throw new Error("CRE artifact mismatch");
    const config = JSON.parse(
      await readFile(resolve(deps.resolverDir, artifacts["config-path"]), "utf8"),
    ) as {
      chainSelectorName?: string;
      saysoMarkets?: string;
      revealApiBaseUrl?: string;
      reportGasLimit?: string;
    };
    if (
      config.chainSelectorName !== "monad-testnet" ||
      !sameAddress(config.saysoMarkets, receiver) ||
      config.revealApiBaseUrl?.replace(/\/$/, "") !== deps.revealApiBaseUrl.replace(/\/$/, "") ||
      !config.reportGasLimit ||
      !/^[1-9]\d*$/.test(config.reportGasLimit) ||
      BigInt(config.reportGasLimit) > 0xffff_ffff_ffff_ffffn
    )
      throw new Error("CRE resolver configuration mismatch");
    new URL(config.revealApiBaseUrl);
    const project = YAML.parse(
      await readFile(resolve(deps.resolverDir, "project.yaml"), "utf8"),
    ) as {
      "monad-testnet"?: { rpcs?: { "chain-name"?: string; url?: string }[] };
    };
    const rpcs = project?.["monad-testnet"]?.rpcs;
    if (!rpcs?.length || rpcs.some((rpc) => rpc["chain-name"] !== "monad-testnet" || !rpc.url))
      throw new Error("CRE RPC configuration mismatch");
    for (const rpc of rpcs) {
      if (!rpc.url) throw new Error("CRE resolver RPC missing");
      const rpcClient =
        rpc.url === deps.rpcUrl
          ? client
          : createPublicClient({ transport: http(rpc.url, { retryCount: 0 }) });
      if ((await rpcClient.getChainId()) !== 10143) throw new Error("CRE resolver chain mismatch");
    }
    if (
      !(await client.getCode({ address: receiver })) ||
      !(await client.getCode({ address: forwarder }))
    )
      throw new Error("CRE contract bytecode missing");
    const [actualForwarder, origin] = await Promise.all([
      client.readContract({
        address: receiver,
        abi: saysoMarketsAbi,
        functionName: "getForwarderAddress",
      }),
      client.readContract({
        address: receiver,
        abi: saysoMarketsAbi,
        functionName: "reportOrigin",
      }),
    ]);
    if (
      !sameAddress(actualForwarder, forwarder) ||
      !sameAddress(
        origin,
        deps.mode === "simulation" ? (deps.reporterAddress ?? zeroAddress) : zeroAddress,
      )
    )
      throw new Error("CRE receiver authentication mismatch");
  }
  async function wordStates(run: Run) {
    const ids = (JSON.parse(run.word_ids_json) as string[]).map(BigInt);
    const words = await Promise.all(
      ids.map((id) =>
        client.readContract({
          address: receiver,
          abi: saysoMarketsAbi,
          functionName: "word",
          args: [id],
        }),
      ),
    );
    if (words.some((word) => word.episodeId !== run.episode_id))
      throw new Error("CRE word episode mismatch");
    return { ids, words };
  }
  function validReceipt(receipt: TransactionReceipt, run: Run, ids: readonly bigint[]) {
    const expectedForwarder =
      run.mode === "simulation" ? addresses.creSimulationForwarder : addresses.creForwarder;
    if (
      receipt.status !== "success" ||
      !sameAddress(receipt.to, expectedForwarder) ||
      (run.mode === "simulation" &&
        (!deps.reporterAddress || !sameAddress(receipt.from, deps.reporterAddress)))
    )
      return false;
    let resolved = false;
    let settled = false;
    for (const log of receipt.logs) {
      if (!sameAddress(log.address, receiver) || log.removed) continue;
      try {
        const event = decodeEventLog({
          abi: saysoMarketsAbi,
          data: log.data,
          topics: log.topics,
          strict: true,
        });
        if (event.eventName === "WordResolved") {
          if (
            event.args.episodeId !== run.episode_id ||
            !ids.includes(event.args.wordId) ||
            (event.args.outcome !== 2 && event.args.outcome !== 3) ||
            (run.trigger === "evidence" && event.args.outcome !== 2)
          )
            return false;
          resolved = true;
        }
        if (event.eventName === "EpisodeSettled") {
          if (event.args.episodeId !== run.episode_id) return false;
          settled = true;
        }
      } catch {
        /* Unrelated or malformed logs cannot substantiate a report. */
      }
    }
    return resolved && (run.trigger === "evidence" || settled);
  }
  async function corroborate(run: Run): Promise<ReportProof | null> {
    const { ids, words } = await wordStates(run);
    if (run.trigger === "closed" && words.some((word) => word.state !== 2 && word.state !== 3))
      return null;
    const head = await client.getBlockNumber({ cacheTime: 0 });
    // Bounded RPC queries; durable execution block keeps crash recovery anchored to the original run.
    const from = BigInt(run.execution_block ?? run.trigger_block);
    for (let block = from; block <= head; block += 100n) {
      const to = block + 99n < head ? block + 99n : head;
      const logs = await client.getLogs({
        address: receiver,
        event: getAbiItem({ abi: saysoMarketsAbi, name: "WordResolved" }),
        args: { episodeId: run.episode_id },
        fromBlock: block,
        toBlock: to,
      });
      const hashes = new Set<Hex>();
      for (const log of logs)
        if (log.transactionHash && !log.removed && sameAddress(log.address, receiver))
          hashes.add(log.transactionHash);
      for (const hash of hashes) {
        const receipt = await client.getTransactionReceipt({ hash });
        if (!validReceipt(receipt, run, ids)) continue;
        if (run.mode === "simulation" && run.execution_block !== null) {
          if (run.reporter_nonce === null) continue;
          const transaction = await client.getTransaction({ hash });
          if (
            transaction.nonce !== run.reporter_nonce ||
            transaction.hash !== receipt.transactionHash
          )
            continue;
        }
        return { hash, block: receipt.blockNumber };
      }
    }
    return null;
  }
  function finish(
    run: Run,
    status: "success" | "reconciled" | "superseded" | "no-report",
    proof?: ReportProof,
  ) {
    db.query("UPDATE cre_runs SET status=?,report_tx=?,finished_ms=?,error=NULL WHERE id=?").run(
      status,
      proof?.hash ?? null,
      now(),
      run.id,
    );
  }
  function defer(run: Run, reason: string) {
    const retries = run.retry_count + 1;
    const delay = retryDelays[Math.min(run.retry_count, retryDelays.length - 1)] ?? 600_000;
    // Evidence runs may give up: the close run re-decides every unresolved word. A close run never
    // does, because an unsettled Closed episode blocks all later admission.
    const exhausted = run.trigger === "evidence" && retries > retryDelays.length;
    db.query(
      `UPDATE cre_runs SET status=?,retry_count=?,next_attempt_ms=?,error=?,finished_ms=? WHERE id=?`,
    ).run(
      exhausted ? "failed" : "pending",
      retries,
      now() + delay,
      reason,
      exhausted ? now() : null,
      run.id,
    );
  }
  async function execute(run: Run): Promise<Execution> {
    const [executable, ...prefix] = deps.command ?? [deps.cliPath ?? "cre"];
    if (!executable) return { status: "not-started", noReport: null };
    const args = [
      ...prefix,
      "workflow",
      "simulate",
      ".",
      "--target",
      "monad-testnet",
      "--non-interactive",
      "--trigger-index",
      run.trigger === "evidence" ? "0" : "1",
      "--evm-tx-hash",
      run.trigger_tx,
      "--evm-event-index",
      String(run.trigger_log_index),
      "--broadcast",
    ];
    // Never retain raw output: only the resolver's bounded, exact prewrite completion protocol.
    // Successful exit is essential: a timeout/crash never proves that no signing occurred.
    const { promise, resolve: done } = Promise.withResolvers<Execution>();
    let noReport: NoReport | null = null;
    let conflicting = false;
    let line = "";
    let overflow = false;
    function parseLine() {
      const marker = "SAYSO_CRE_STATUS:";
      const start = line.indexOf(marker);
      if (start < 0 || overflow) return;
      try {
        const value = JSON.parse(
          line.slice(start + marker.length, line.lastIndexOf("}") + 1),
        ) as Record<string, unknown>;
        if (
          Object.keys(value).length !== 4 ||
          value.episodeId !== run.episode_id ||
          value.phase !== "prewrite" ||
          value.result !== "no-report" ||
          typeof value.retryable !== "boolean"
        )
          return;
        if (noReport && noReport.retryable !== value.retryable) conflicting = true;
        noReport = { retryable: value.retryable };
      } catch {
        /* Non-protocol output is discarded, not logged or persisted. */
      }
    }
    let launched = false;
    let timedOut = false;
    let timeout: Timer | undefined;
    try {
      const child = spawn(executable, args, {
        cwd: deps.resolverDir,
        env: deps.processEnv(),
        stdio: ["ignore", "pipe", "ignore"],
      });
      active = child;
      child.stdout?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        for (const character of chunk) {
          if (character === "\\n") {
            parseLine();
            line = "";
            overflow = false;
          } else if (!overflow) {
            if (line.length >= 2048) {
              line = "";
              overflow = true;
            } else line += character;
          }
        }
      });
      child.once("spawn", () => {
        launched = true;
      });
      child.once("error", () => {
        clearTimeout(timeout);
        if (active === child) active = undefined;
        done({ status: launched ? "failed" : "not-started", noReport: null });
      });
      child.once("close", (code) => {
        clearTimeout(timeout);
        if (active === child) active = undefined;
        parseLine();
        line = "";
        const status = !launched
          ? "not-started"
          : stopped
            ? "stopped"
            : timedOut
              ? "timeout"
              : code === 0
                ? "ok"
                : "failed";
        done({ status, noReport: status === "ok" && !conflicting ? noReport : null });
      });
      timeout = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, deps.timeoutMs ?? 120_000);
    } catch {
      done({ status: "not-started", noReport: null });
    }
    return promise;
  }
  async function processRuns() {
    const runs = db
      .query<Run, []>(
        "SELECT * FROM cre_runs WHERE status IN ('pending','running','ambiguous','observing') ORDER BY id",
      )
      .all();
    if (!runs.length) return;
    expireStudioChainId(deps.rpcUrl);
    if ((await client.getChainId()) !== 10143) throw new Error("CRE processing chain mismatch");
    for (const run of runs) {
      if (stopped) return;
      if (run.status !== "running" && run.next_attempt_ms > now()) continue;
      try {
        const proof = await corroborate(run);
        if (proof) {
          finish(run, "reconciled", proof);
          continue;
        }
        if (run.status === "running" || run.status === "ambiguous") {
          db.query(
            "UPDATE cre_runs SET status='ambiguous',error='report outcome unknown; reconciliation required',next_attempt_ms=? WHERE id=?",
          ).run(now() + 30_000, run.id);
          continue;
        }
        const { words } = await wordStates(run);
        if (words.every((word) => word.state >= 2)) {
          finish(run, "superseded");
          continue;
        }
        if (deps.mode === "don" || run.mode === "don") {
          db.query("UPDATE cre_runs SET status='observing',next_attempt_ms=? WHERE id=?").run(
            now() + 5_000,
            run.id,
          );
          continue;
        }
        if (
          db
            .query(
              "SELECT 1 FROM cre_runs WHERE mode='simulation' AND status IN ('running','ambiguous') LIMIT 1",
            )
            .get()
        )
          continue;
        await validateResolver();
        const reporter = deps.reporterAddress;
        if (!reporter) throw new Error("CRE reporter address missing");
        const [nonce, pendingNonce, head] = await Promise.all([
          client.getTransactionCount({ address: reporter, blockTag: "latest" }),
          client.getTransactionCount({ address: reporter, blockTag: "pending" }),
          client.getBlockNumber({ cacheTime: 0 }),
        ]);
        if (nonce !== pendingNonce) continue;
        const previous = db
          .query<{ report_tx: Hex }, []>(
            "SELECT report_tx FROM cre_runs WHERE report_tx IS NOT NULL ORDER BY finished_ms DESC LIMIT 1",
          )
          .get();
        if (
          previous &&
          (await client.getTransactionReceipt({ hash: previous.report_tx })).blockNumber >= head
        )
          continue;
        // BEFORE spawn: a process crash leaves a durable sender gate, never a fresh transaction retry.
        const claimed = db
          .query(`UPDATE cre_runs SET status='running',attempts=attempts+1,reporter_nonce=?,execution_block=?,started_ms=?,error=NULL
          WHERE id=? AND status='pending' AND NOT EXISTS
          (SELECT 1 FROM cre_runs WHERE mode='simulation' AND status IN ('running','ambiguous'))`)
          .run(nonce, head.toString(), now(), run.id);
        if (!claimed.changes || stopped) continue;
        run.execution_block = head.toString();
        run.reporter_nonce = nonce;
        const result = await execute(run);
        if (result.status === "not-started") {
          defer(run, "CRE executable unavailable");
          continue;
        }
        const mined = await corroborate(run).catch(() => null);
        if (mined) finish(run, result.status === "ok" ? "success" : "reconciled", mined);
        else if (result.noReport) {
          if (result.noReport.retryable) defer(run, "CRE prewrite capability unavailable");
          else finish(run, "no-report");
        } else
          db.query(
            "UPDATE cre_runs SET status='ambiguous',error=?,next_attempt_ms=? WHERE id=?",
          ).run(
            result.status === "timeout"
              ? "CRE execution timed out; reconciliation required"
              : "CRE report not corroborated; reconciliation required",
            now() + 30_000,
            run.id,
          );
      } catch {
        // Never persist subprocess/RPC exceptions, environment values, HTTP bodies, or CLI output.
        const persisted = db
          .query<{ status: string }, [number]>("SELECT status FROM cre_runs WHERE id=?")
          .get(run.id);
        if (persisted?.status === "running" || persisted?.status === "ambiguous") {
          db.query(
            "UPDATE cre_runs SET status='ambiguous',error='CRE reconciliation unavailable',next_attempt_ms=? WHERE id=?",
          ).run(now() + 30_000, run.id);
        } else defer(run, "CRE preflight unavailable");
      }
    }
  }
  async function tickWork() {
    if (stopped) return;
    if (now() >= discoveryAfter) {
      try {
        await discover();
        discoveryFailures = 0;
        discoveryAfter = 0;
      } catch (error) {
        operatorFailure("receipt", error);
        discoveryAfter =
          now() + (retryDelays[Math.min(discoveryFailures++, retryDelays.length - 1)] ?? 600_000);
      }
    }
    if (now() < processingAfter) return;
    try {
      await processRuns();
      processingAfter = 0;
      processingFailures = 0;
    } catch (error) {
      operatorFailure("receipt", error);
      processingAfter =
        now() + (retryDelays[Math.min(processingFailures++, retryDelays.length - 1)] ?? 600_000);
    }
  }
  const api: CreRunner = {
    async onReceipt(action) {
      if (action.receipt.success && (action.kind === "evidence" || action.kind === "close"))
        notified.add(action.receipt.hash);
      // Deliberately no await: OPERATOR's receipt hook cannot wait for REPORTER/RPC.
    },
    tick() {
      if (!work)
        work = tickWork().finally(() => {
          work = undefined;
        });
      return work;
    },
    start() {
      stopped = false;
      if (timer) return;
      timer = setInterval(() => {
        void api.tick();
      }, deps.pollMs ?? 2000);
      void api.tick();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      timer = undefined;
      active?.kill("SIGKILL");
      await work;
    },
  };
  return api;
}
