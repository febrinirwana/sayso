import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAccount, restoreIdentity, useAccount } from "@/account";
import { useBalances } from "@/data/chain";
import { AccountScreen, type AccountScreenProps } from "@/screens/account/AccountScreen";
import { AppShell } from "@/shell/AppShell";

export const Route = createFileRoute("/account")({
  component: () => (
    <RequireAccount>
      <AccountPage />
    </RequireAccount>
  ),
});

function AccountPage() {
  const account = useAccount();
  const address = account.address;
  const [copyState, setCopyState] = useState<AccountScreenProps["copyState"]>("idle");
  const [restoreState, setRestoreState] = useState<AccountScreenProps["restoreState"]>("idle");
  const [restoredAddress, setRestoredAddress] = useState<`0x${string}` | undefined>();
  const balances = useBalances(address);
  if (!address || !account.nickname) return null;
  return (
    <AppShell active="account" balance={balances.data?.ausd ?? null} nickname={account.nickname}>
      <AccountScreen
        address={address}
        balances={balances.data ?? null}
        balanceState={balances.isError ? "error" : "loading"}
        copyState={copyState}
        restoreState={restoreState}
        restoredAddress={restoredAddress}
        onCopy={(value) => {
          void navigator.clipboard.writeText(value).then(
            () => setCopyState("copied"),
            () => setCopyState("error"),
          );
        }}
        onRestoreCheck={() => {
          setRestoreState("checking");
          setRestoredAddress(undefined);
          void restoreIdentity().then(
            (restored) => {
              try {
                setRestoredAddress(restored.signer.address);
                setRestoreState(restored.signer.address === address ? "verified" : "mismatch");
              } finally {
                restored.session.end();
              }
            },
            () => setRestoreState("error"),
          );
        }}
        onSignOut={account.signOut}
        lock={
          account.status === "locked"
            ? {
                unlocking: account.unlocking,
                errorCode: account.errorCode,
                mismatch: account.mismatch,
                onUnlock: () => {
                  void account.unlock().then((result) => {
                    if (result === "ready") setRestoreState("verified");
                  });
                },
                onSwitch: account.switchToFound,
                onKeep: account.dismissMismatch,
              }
            : undefined
        }
      />
    </AppShell>
  );
}
