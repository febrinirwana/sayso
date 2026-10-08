import {
  ArrowUpRight,
  Check,
  Copy,
  Fingerprint,
  LogOut,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/ui/Button";
import { CreditFooter, PageHeading, PlayerAvatar, TokenAmount } from "@/ui/PlayerPrimitives";
import { Voxel } from "@/ui/Voxel";
import { explorerAddressUrl } from "../../../../../packages/core/src/explorer";
import { nicknameOf } from "../../../../../packages/core/src/nickname";

export type AccountScreenProps = {
  address: `0x${string}`;
  balances: { monWei: bigint; ausd: bigint } | null;
  balanceState?: "loading" | "error";
  copyState: "idle" | "copied" | "error";
  restoreState: "idle" | "instructions" | "checking" | "verified" | "mismatch" | "error";
  onCopy(address: string): void;
  onRestoreCheck(): void;
  onSignOut(): void;
};
export function AccountScreen({
  address,
  balances,
  copyState,
  balanceState,
  restoreState,
  onCopy,
  onRestoreCheck,
  onSignOut,
}: AccountScreenProps) {
  const nickname = nicknameOf(address);
  return (
    <>
      <PageHeading
        eyebrow="S8 · Your player account"
        title="Same passkey. Same you."
        description="Your name, your predictions, your seat at the show."
      />
      <div className="grid gap-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[32px] border-2 border-ink bg-card shadow-sticker-lg">
          <div className="relative flex min-h-56 items-center gap-6 overflow-hidden border-b-2 border-ink bg-bubble-tint p-6 md:p-8">
            <PlayerAvatar nickname={nickname} size={100} />
            <div className="relative z-10">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-ink-soft">
                That’s you
              </p>
              <h2 className="font-headline text-3xl md:text-4xl">{nickname}</h2>
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold">
                <Fingerprint size={16} aria-hidden />
                Signed in with a passkey
              </p>
            </div>
            <Voxel
              name="star"
              size={110}
              className="absolute -right-3 -bottom-7 rotate-12 opacity-40"
            />
          </div>
          <div className="p-6 md:p-8">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">
              Your address
            </p>
            <p data-testid="account-address" className="mt-3 break-all font-mono text-sm leading-7">
              {address}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => onCopy(address)}>
                {copyState === "copied" ? (
                  <Check size={17} aria-hidden />
                ) : (
                  <Copy size={17} aria-hidden />
                )}
                {copyState === "copied" ? "Copied" : "Copy address"}
              </Button>
              <Button
                variant="secondary"
                href={explorerAddressUrl(address)}
                target="_blank"
                rel="noreferrer"
              >
                Explorer
                <ArrowUpRight size={17} aria-hidden />
              </Button>
            </div>
            {copyState === "error" && (
              <p role="alert" className="mt-4 text-sm text-ink-soft">
                Couldn’t copy. Select the address above to copy it manually.
              </p>
            )}
            <p className="mt-6 text-sm leading-relaxed text-ink-soft">
              Your nickname is made from your address. It stays yours when you come back — no
              profile to set up.
            </p>
          </div>
        </section>
        <div className="space-y-7">
          <section className="rounded-[32px] border-2 border-ink bg-sun-tint p-6 shadow-sticker md:p-8">
            <div className="flex items-center justify-between">
              <h2 className="font-headline text-2xl">Your play balance</h2>
              <Voxel name="money-2" size={62} />
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <a
                href={explorerAddressUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border-2 border-ink bg-card p-4"
              >
                <p className="mb-2 text-xs text-ink-soft">For predictions</p>
                {balances ? (
                  <TokenAmount
                    amount={balances.ausd}
                    symbol="AUSD"
                    className="font-headline text-xl"
                  />
                ) : (
                  <p className="text-sm font-semibold">
                    {balanceState === "error" ? "Unavailable" : "Loading…"} · TESTNET
                  </p>
                )}
              </a>
              <a
                href={explorerAddressUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl border-2 border-ink bg-card p-4"
              >
                <p className="mb-2 text-xs text-ink-soft">For your moves</p>
                {balances ? (
                  <TokenAmount
                    amount={balances.monWei}
                    symbol="MON"
                    className="font-headline text-xl"
                  />
                ) : (
                  <p className="text-sm font-semibold">
                    {balanceState === "error" ? "Unavailable" : "Loading…"} · TESTNET
                  </p>
                )}
              </a>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-soft">
              Monad TESTNET only. These tokens have no real-money value.
            </p>
          </section>
          <section className="rounded-[32px] border-2 border-ink bg-mint-tint p-6 shadow-sticker md:p-8">
            <div className="flex items-center gap-3">
              <ShieldCheck size={26} aria-hidden />
              <h2 className="font-headline text-2xl">Restore check</h2>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-soft">
              Clear storage, sign in with the same passkey, get the same address. Your positions
              live on the network — not just on this device.
            </p>
            {restoreState === "instructions" && (
              <ol className="mt-5 space-y-3 rounded-2xl border border-ink/20 bg-card p-5 text-sm">
                <li>
                  <strong>1.</strong> Copy your address before you begin.
                </li>
                <li>
                  <strong>2.</strong> Clear this site’s storage in browser settings.
                </li>
                <li>
                  <strong>3.</strong> Choose “I already have one” and use the same passkey.
                </li>
                <li>
                  <strong>4.</strong> Compare the restored address with your saved copy.
                </li>
              </ol>
            )}
            {restoreState === "verified" && (
              <p className="mt-5 flex items-center gap-2 rounded-2xl border border-ink/20 bg-card p-4 text-sm font-semibold">
                <Check size={20} className="text-gain" aria-hidden />
                Same address restored. Still you.
              </p>
            )}
            {(restoreState === "mismatch" ||
              restoreState === "error" ||
              restoreState === "checking") && (
              <p
                role="status"
                className="mt-5 rounded-2xl border border-ink/20 bg-card p-4 text-sm font-semibold"
              >
                {restoreState === "checking"
                  ? "Choose the same passkey to compare your address."
                  : restoreState === "mismatch"
                    ? "That passkey restores a different address. Choose your original passkey."
                    : "The passkey check could not finish. Try again."}
              </p>
            )}
            <Button
              variant="secondary"
              className="mt-5"
              onClick={onRestoreCheck}
              disabled={restoreState === "checking"}
            >
              <RotateCcw size={17} aria-hidden />
              {restoreState === "checking"
                ? "Checking passkey…"
                : restoreState === "idle"
                  ? "Check restore"
                  : "Check again"}
            </Button>
            <p className="mt-4 text-xs text-ink-soft">
              This checks your passkey without clearing storage or changing your account.
            </p>
          </section>
        </div>
      </div>
      <section className="mt-8 flex flex-wrap items-center justify-between gap-5 rounded-3xl border-2 border-ink bg-card p-6">
        <div>
          <h2 className="font-headline text-xl">Taking a break?</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Sign back in with the same passkey whenever you’re ready.
          </p>
        </div>
        <Button variant="secondary" onClick={onSignOut}>
          <LogOut size={18} aria-hidden />
          Sign out
        </Button>
      </section>
      <CreditFooter />
    </>
  );
}
