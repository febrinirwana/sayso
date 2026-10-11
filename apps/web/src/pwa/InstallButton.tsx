import { Download, Share, SquarePlus, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { Button, type ButtonProps } from "@/ui/Button";
import { installMode, promptInstall, useInstall } from "./install";

type InstallButtonProps = {
  size?: "md" | "lg" | "xl";
  className?: string;
};

/**
 * "Install app" for the landing. Chromium: opens the browser install dialog from the captured
 * `beforeinstallprompt`. iOS Safari has no such event, so it opens the Add to Home Screen steps.
 * Installed, or a browser that cannot install: renders nothing rather than a dead button.
 */
export function InstallButton({ size = "xl", className }: InstallButtonProps) {
  const install = useInstall();
  const mode = installMode(install);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLSpanElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion() === true;
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    closer.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.querySelector<HTMLElement>("button")?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (mode === "hidden") return null;

  const buttonProps: ButtonProps = {
    variant: "secondary",
    size,
    children: (
      <>
        <Download aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.5} />
        Install app
      </>
    ),
    ...(className ? { className } : {}),
  };

  if (mode === "prompt") {
    return <Button {...buttonProps} onClick={() => void promptInstall()} />;
  }

  return (
    <span ref={trigger} className="contents">
      <Button
        {...buttonProps}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      />
      <AnimatePresence>
        {open ? (
          <motion.div
            key="install-sheet"
            role="dialog"
            aria-labelledby={titleId}
            className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-3xl border-2 border-ink bg-card p-5 text-ink shadow-sticker"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 24 }}
            transition={{ duration: reduced ? 0.12 : 0.22, ease: [0.23, 1, 0.32, 1] }}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id={titleId} className="font-headline text-2xl leading-tight">
                Add SAYSO to your Home Screen
              </h2>
              <button
                type="button"
                aria-label="Close"
                ref={closer}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.querySelector<HTMLElement>("button")?.focus();
                }}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper"
              >
                <X aria-hidden="true" className="size-5" strokeWidth={2.5} />
              </button>
            </div>
            <ol className="mt-3 space-y-3 text-base text-ink-soft">
              <li className="flex items-center gap-3">
                <Share aria-hidden="true" className="size-5 shrink-0 text-ink" />
                <span>Tap Share in your browser bar.</span>
              </li>
              <li className="flex items-center gap-3">
                <SquarePlus aria-hidden="true" className="size-5 shrink-0 text-ink" />
                <span>Then tap Add to Home Screen.</span>
              </li>
            </ol>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </span>
  );
}
