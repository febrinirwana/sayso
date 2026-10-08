import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RequireAccount, useAccount } from "@/account";
import { restoreIdentity } from "@/account/AccountProvider";
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
        onCopy={(value) => {
          void navigator.clipboard.writeText(value).then(
            () => setCopyState("copied"),
            () => setCopyState("error"),
          );
        }}
        onRestoreCheck={() => {
          setRestoreState("checking");
          void restoreIdentity().then(
            (restored) => {
              try {
                setRestoreState(restored.signer.address === address ? "verified" : "mismatch");
              } finally {
                restored.session.end();
              }
            },
            () => setRestoreState("error"),
          );
        }}
        onSignOut={account.signOut}
      />
    </AppShell>
  );
}
