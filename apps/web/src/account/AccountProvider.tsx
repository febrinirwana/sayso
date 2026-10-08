import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  MeraError,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { nicknameOf } from "@sayso/core";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import { createWalletClient, http, type LocalAccount } from "viem";
import { monadTestnet, publicClient } from "@/lib/chain";
import { config } from "@/lib/config";
import { sessionFromPrf } from "./derive";
import { createSendQueue, type Send } from "./sendQueue";
import type { Account, AccountStatus } from "./types";

const Context = createContext<Account | null>(null);
type Identity = { session: Secp256k1SigningSession; signer: LocalAccount };

export function accountErrorCode(error: unknown): string {
  if (isMeraError(error)) return error.code;
  if (error instanceof Error && error.cause) return accountErrorCode(error.cause);
  return "PASSKEY_OPERATION_FAILED";
}

export async function restoreIdentity(): Promise<Identity> {
  const { prfOutput } = await getPasskeyPrfOutput({ rpId: config.rpId });
  return sessionFromPrf(prfOutput);
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AccountStatus>("signed-out");
  const [signer, setSigner] = useState<LocalAccount | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const identity = useRef<Identity | null>(null);
  const generation = useRef(0);
  const authenticating = useRef(false);

  function clear() {
    identity.current?.session.end();
    identity.current = null;
    setSigner(null);
  }

  function install(next: Identity) {
    clear();
    identity.current = next;
    setSigner(next.signer);
    setErrorCode(null);
    setStatus("ready");
  }

  async function authenticate(join: boolean) {
    if (authenticating.current) return;
    authenticating.current = true;
    const version = ++generation.current;
    clear();
    setErrorCode(null);
    setStatus(join ? "creating" : "signing-in");
    try {
      let next: Identity;
      if (join) {
        const result = await createPasskeyWithPrfOutput({
          rp: { id: config.rpId, name: "SAYSO" },
          user: { name: "SAYSO player", displayName: "SAYSO player" },
        });
        try {
          next = sessionFromPrf(result.prfOutput);
        } finally {
          result.prfOutput.fill(0);
          result.prfSalt.fill(0);
        }
      } else {
        next = await restoreIdentity();
      }
      if (generation.current !== version) next.session.end();
      else install(next);
    } catch (error) {
      if (generation.current !== version) return;
      const code = accountErrorCode(error);
      setErrorCode(code);
      setStatus(
        code === "PRF_UNAVAILABLE"
          ? "prf-unavailable"
          : code === "SESSION_ENDED"
            ? "signed-out"
            : "error",
      );
    } finally {
      authenticating.current = false;
    }
  }

  const send = useRef<Send | null>(null);
  if (!send.current) {
    send.current = createSendQueue({
      broadcast: async (tx) => {
        const active = identity.current;
        if (!active) throw new MeraError("SESSION_ENDED", "Sign in to send a transaction");
        const version = generation.current;
        const broadcast = (account: LocalAccount) =>
          createWalletClient({
            account,
            chain: monadTestnet,
            transport: http(config.rpcUrl),
          }).sendTransaction({ ...tx, chain: monadTestnet });
        try {
          return await broadcast(active.signer);
        } catch (error) {
          if (accountErrorCode(error) !== "SESSION_ENDED") throw error;
          // One discoverable re-prompt, never a transaction from a different account.
          try {
            const restored = await restoreIdentity();
            if (
              version !== generation.current ||
              restored.signer.address !== active.signer.address
            ) {
              restored.session.end();
              throw new MeraError("SESSION_ENDED", "The original passkey is required");
            }
            install(restored);
            return await broadcast(restored.signer);
          } catch (retryError) {
            generation.current++;
            clear();
            setErrorCode(accountErrorCode(retryError));
            setStatus("signed-out");
            throw retryError;
          }
        }
      },
      waitForTransactionReceipt: (request) => publicClient.waitForTransactionReceipt(request),
      getBlockNumber: () => publicClient.getBlockNumber({ cacheTime: 0 }),
    });
  }

  useEffect(
    () => () => {
      generation.current++;
      identity.current?.session.end();
      identity.current = null;
    },
    [],
  );

  const account: Account = {
    status,
    address: status === "ready" ? (signer?.address ?? null) : null,
    nickname: status === "ready" && signer ? nicknameOf(signer.address) : null,
    signer: status === "ready" ? signer : null,
    errorCode,
    join: () => authenticate(true),
    signIn: () => authenticate(false),
    signOut: () => {
      generation.current++;
      clear();
      setErrorCode(null);
      setStatus("signed-out");
    },
    send: send.current,
  };
  return <Context.Provider value={account}>{children}</Context.Provider>;
}

export function useAccount(): Account {
  const account = useContext(Context);
  if (!account) throw new Error("useAccount requires AccountProvider");
  return account;
}

export function RequireAccount({ children }: { children: ReactNode }) {
  const account = useAccount();
  const location = useLocation();
  const redirect = useRef(location.href);
  const navigate = useNavigate();
  useEffect(() => {
    if (account.status !== "ready") {
      void navigate({ to: "/join", search: { redirect: redirect.current }, replace: true });
    }
  }, [account.status, navigate]);
  return account.status === "ready" ? children : null;
}
