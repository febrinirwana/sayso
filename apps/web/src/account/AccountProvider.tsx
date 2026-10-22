import { nicknameOf } from "@sayso/core";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { type AccountController, createAccountController } from "./controller";
import { type Account, VIEWABLE_STATUSES } from "./types";

export const AccountContext = createContext<Account | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const holder = useRef<AccountController | null>(null);
  holder.current ??= createAccountController();
  const controller = holder.current;
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => () => controller.dispose(), [controller]);
  const account = useMemo<Account>(
    () => ({
      ...snapshot,
      nickname: snapshot.address ? nicknameOf(snapshot.address) : null,
      join: controller.join,
      signIn: controller.signIn,
      unlock: controller.unlock,
      switchToFound: controller.switchToFound,
      dismissMismatch: controller.dismissMismatch,
      signOut: controller.signOut,
      send: controller.send,
    }),
    [snapshot, controller],
  );
  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount requires AccountProvider");
  return account;
}

/** For presentational pieces that also render outside a provider (tests, the design gallery). */
export function useOptionalAccount(): Account | null {
  return useContext(AccountContext);
}

/** Read-only views render while locked; only signing needs the passkey. */
export function RequireAccount({ children }: { children: ReactNode }) {
  const account = useAccount();
  const location = useLocation();
  const redirect = useRef(location.href);
  const navigate = useNavigate();
  const viewable = VIEWABLE_STATUSES.includes(account.status);
  useEffect(() => {
    if (!viewable) {
      void navigate({ to: "/join", search: { redirect: redirect.current }, replace: true });
    }
  }, [viewable, navigate]);
  return viewable ? children : null;
}
