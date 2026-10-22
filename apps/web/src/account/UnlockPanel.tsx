import { Fingerprint, LoaderCircle } from "lucide-react";
import { Button } from "@/ui/Button";
import { useOptionalAccount } from "./AccountProvider";
import type { AddressMismatch } from "./types";

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function unlockErrorMessage(code: string): string {
  if (code === "PASSKEY_OPERATION_FAILED")
    return "The passkey prompt was cancelled or could not finish. Try again when you’re ready.";
  if (code === "PRF_UNAVAILABLE")
    return "This browser cannot finish this passkey check. Open this page on your phone or a browser with passkey PRF support.";
  return `Your passkey could not finish (${code}). Try again.`;
}

/** Expected vs found addresses after a passkey of another player answered. */
export function AddressPair({ expected, found }: AddressMismatch) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-3 rounded-2xl bg-card p-4 text-sm">
      <div>
        <dt className="text-xs text-ink-soft">Expected</dt>
        <dd className="mt-1 font-mono font-semibold">{short(expected)}</dd>
      </div>
      <div>
        <dt className="text-xs text-ink-soft">Found</dt>
        <dd className="mt-1 font-mono font-semibold">{short(found)}</dd>
      </div>
    </dl>
  );
}

export type UnlockPanelProps = {
  unlocking: boolean;
  errorCode: string | null;
  mismatch: AddressMismatch | null;
  onUnlock(): void;
  onSwitch(): void;
  onKeep(): void;
  /** One line above the button: what unlocking is for. */
  hint?: string;
  label?: string;
  className?: string;
};

/**
 * Explicit passkey unlock for a refreshed page that still knows the player's address. The
 * passkey sheet opens only from the button tap (WebAuthn needs a user gesture). A passkey of a
 * different account never switches by itself: both addresses show and the player chooses.
 */
export function UnlockPanel({
  unlocking,
  errorCode,
  mismatch,
  onUnlock,
  onSwitch,
  onKeep,
  hint,
  label = "Unlock with passkey",
  className,
}: UnlockPanelProps) {
  if (mismatch)
    return (
      <div role="alert" className={className}>
        <p className="rounded-2xl border border-ink/20 bg-card p-4 text-sm font-semibold">
          That passkey belongs to another player. Choose your original passkey, or switch to this
          one.
        </p>
        <AddressPair {...mismatch} />
        <div className="mt-3 flex flex-wrap gap-3">
          <Button onClick={onSwitch}>Use this account</Button>
          <Button variant="secondary" onClick={onKeep}>
            Keep {short(mismatch.expected)}
          </Button>
        </div>
      </div>
    );
  return (
    <div className={className}>
      {hint ? <p className="mb-2 text-[13px] leading-5 text-ink-soft">{hint}</p> : null}
      {errorCode && !unlocking ? (
        <p role="alert" className="mb-2 text-[13px] leading-5 text-ink-soft">
          {unlockErrorMessage(errorCode)}
        </p>
      ) : null}
      <Button size="lg" className="w-full" disabled={unlocking} onClick={onUnlock}>
        {unlocking ? (
          <LoaderCircle aria-hidden size={20} className="motion-safe:animate-spin" />
        ) : (
          <Fingerprint aria-hidden size={20} />
        )}
        {unlocking ? "Check your passkey prompt…" : label}
      </Button>
    </div>
  );
}

/** Connected panel: renders only while the account is locked, nothing outside a provider. */
export function AccountUnlock(props: Pick<UnlockPanelProps, "hint" | "label" | "className">) {
  const account = useOptionalAccount();
  if (account?.status !== "locked") return null;
  return (
    <UnlockPanel
      {...props}
      unlocking={account.unlocking}
      errorCode={account.errorCode}
      mismatch={account.mismatch}
      onUnlock={() => void account.unlock()}
      onSwitch={account.switchToFound}
      onKeep={account.dismissMismatch}
    />
  );
}
