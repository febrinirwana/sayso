import {
  ArrowRight,
  Check,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  QrCode,
  Smartphone,
} from "lucide-react";
import mascot from "@/assets/brand/mascot-640.webp";
import { Button } from "@/ui/Button";
import { Logo } from "@/ui/Logo";
import { CreditFooter } from "@/ui/PlayerPrimitives";
import { SoundToggle } from "@/ui/SoundToggle";
import { TestnetPill } from "@/ui/TestnetPill";
import { Voxel } from "@/ui/Voxel";

export type JoinState =
  | { status: "idle" | "waiting" | "creating" | "prf-unavailable" }
  | { status: "error"; message: string };
export type JoinScreenProps = {
  state: JoinState;
  currentUrl: string;
  onJoin(): void;
  onSignIn(): void;
  onRetry(): void;
};
export function JoinScreen({ state, currentUrl, onJoin, onSignIn, onRetry }: JoinScreenProps) {
  const busy = state.status === "waiting" || state.status === "creating";
  return (
    <div className="mx-auto max-w-[1616px] px-6 md:px-8 lg:px-12">
      <header className="flex items-center justify-between py-6">
        <a href="/" className="inline-flex min-h-11 items-center" aria-label="SAYSO home">
          <Logo height={36} />
        </a>
        <div className="flex items-center gap-3">
          <TestnetPill />
          <SoundToggle />
        </div>
      </header>
      <main className="grid items-center gap-8 py-5 md:gap-12 lg:min-h-[650px] lg:grid-cols-[1.08fr_1fr] lg:py-12">
        <div className="relative isolate flex min-h-[270px] items-center justify-center overflow-hidden rounded-[36px] border-2 border-ink bg-sun-tint md:min-h-[380px] lg:min-h-[580px]">
          <div
            aria-hidden
            className="absolute size-[74%] rounded-full border-2 border-dashed border-ink/20"
          />
          <span className="absolute top-6 left-6 -rotate-6 rounded-full border-2 border-ink bg-card px-4 py-2 font-headline text-sm shadow-sticker md:text-lg">
            GOOD CALL. GREAT GAME.
          </span>
          <img
            src={mascot}
            alt="The winking SAYSO mascot"
            width={640}
            height={640}
            className="relative w-[65%] max-w-[470px] drop-shadow-xl"
          />
          <Voxel
            name="star"
            size={100}
            className="absolute top-16 right-2 w-16 rotate-12 md:w-24"
          />
          <Voxel
            name="game-console"
            size={156}
            className="absolute bottom-5 left-3 w-24 -rotate-12 md:w-36"
          />
          <Voxel
            name="money-2"
            size={128}
            className="absolute right-3 bottom-5 w-20 rotate-12 md:w-28"
          />
          <span className="absolute right-7 bottom-7 hidden rotate-6 rounded-full border-2 border-ink bg-mint-tint px-4 py-2 font-headline md:block">
            Your next good prediction.
          </span>
        </div>
        <section className="lg:pl-6">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-ink-soft">
            S1 · Your seat at the show
          </p>
          <h1 className="font-headline text-[clamp(44px,5vw,76px)] leading-[1.02]">
            Big predictions.
            <br />
            <span className="relative inline-block">
              Tiny sign-in.
              <span
                aria-hidden
                className="absolute -bottom-2 left-0 -z-10 h-4 w-full -rotate-2 bg-bubble-tint"
              />
            </span>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-soft">
            A passkey uses your fingerprint, face or device PIN to sign you in. No password to
            remember.
          </p>
          <div
            className="mt-7 rounded-3xl border-2 border-ink bg-card p-5 shadow-sticker md:p-7"
            aria-live="polite"
            aria-busy={busy}
          >
            {state.status === "prf-unavailable" ? (
              <>
                <div className="mb-4 inline-flex size-12 items-center justify-center rounded-2xl bg-sky-tint">
                  <Smartphone aria-hidden />
                </div>
                <h2 className="font-headline text-2xl">Take the show to your phone.</h2>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  This browser cannot finish this passkey setup. Open this page on your phone or a
                  browser with passkey PRF support.
                </p>
                <div className="mt-5 flex gap-4 rounded-2xl border-2 border-dashed border-ink/30 bg-paper p-4">
                  <div className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-sky-tint">
                    <QrCode size={32} aria-hidden />
                    <span className="text-[9px] font-bold">QR placeholder</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Open this same link</p>
                    <p className="mt-2 break-all text-xs leading-relaxed text-ink-soft">
                      {currentUrl}
                    </p>
                    <p className="mt-2 text-[10px] text-ink-soft">Specimen only · not scannable</p>
                  </div>
                </div>
                <Button onClick={onRetry} variant="secondary" className="mt-5 w-full">
                  Try this browser again
                </Button>
              </>
            ) : (
              <>
                {busy ? (
                  <div className="mb-5 flex items-start gap-3">
                    <LoaderCircle aria-hidden className="mt-1 shrink-0 motion-safe:animate-spin" />
                    <div>
                      <h2 className="font-headline text-xl">
                        {state.status === "waiting"
                          ? "Check your passkey prompt"
                          : "Making your player account"}
                      </h2>
                      <p className="mt-2 text-sm text-ink-soft">
                        {state.status === "waiting"
                          ? "Finish the prompt on your device. We’ll keep your seat warm."
                          : "Your passkey is ready. One last step and you’re in."}
                      </p>
                    </div>
                  </div>
                ) : state.status === "error" ? (
                  <div role="alert" className="mb-5 rounded-2xl bg-sun-tint p-4">
                    <h2 className="font-headline text-xl">Let’s try that again.</h2>
                    <p className="mt-2 text-sm text-ink-soft">{state.message}</p>
                  </div>
                ) : (
                  <div className="mb-5 flex items-center gap-3">
                    <Fingerprint size={30} aria-hidden />
                    <span className="font-headline text-xl">One tap. You’re a player.</span>
                  </div>
                )}
                <Button
                  size="lg"
                  className="w-full"
                  disabled={busy}
                  onClick={state.status === "error" ? onRetry : onJoin}
                >
                  <KeyRound size={20} aria-hidden />
                  {state.status === "error" ? "Try again" : "Join with passkey"}
                  <ArrowRight size={20} aria-hidden />
                </Button>
                <Button
                  size="lg"
                  variant="secondary"
                  className="mt-3 w-full"
                  disabled={busy}
                  onClick={onSignIn}
                >
                  I already have one
                </Button>
              </>
            )}
          </div>
          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-3 text-xs font-semibold text-ink-soft">
            <span className="flex items-center gap-1.5">
              <Check size={16} aria-hidden />
              No passwords
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={16} aria-hidden />
              Same passkey, same player
            </span>
            <span className="flex items-center gap-1.5">
              <Check size={16} aria-hidden />
              Test tokens only
            </span>
          </div>
        </section>
      </main>
      <CreditFooter />
    </div>
  );
}
