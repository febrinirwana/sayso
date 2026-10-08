import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useAccount } from "@/account";
import { JoinScreen, type JoinState } from "@/screens/join/JoinScreen";

export const Route = createFileRoute("/join")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" &&
      search.redirect.startsWith("/") &&
      !search.redirect.startsWith("//")
        ? search.redirect
        : undefined,
  }),
  component: Join,
});

function Join() {
  const account = useAccount();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const lastAction = useRef<"join" | "signIn">("join");
  useEffect(() => {
    if (account.status === "ready") void navigate({ to: redirect || "/arena", replace: true });
  }, [account.status, redirect, navigate]);
  const state: JoinState =
    account.status === "error"
      ? {
          status: "error",
          message:
            account.errorCode === "PASSKEY_OPERATION_FAILED"
              ? "The passkey prompt was cancelled or could not finish. Try again when you’re ready."
              : `Your passkey could not finish (${account.errorCode}). Try again.`,
        }
      : {
          status:
            account.status === "signing-in"
              ? "waiting"
              : account.status === "signed-out" || account.status === "ready"
                ? "idle"
                : account.status,
        };
  return (
    <JoinScreen
      state={state}
      currentUrl={window.location.href}
      onJoin={() => {
        lastAction.current = "join";
        void account.join();
      }}
      onSignIn={() => {
        lastAction.current = "signIn";
        void account.signIn();
      }}
      onRetry={() => {
        void account[lastAction.current]();
      }}
    />
  );
}
