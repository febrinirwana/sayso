import { Volume2, VolumeX } from "lucide-react";
import { play, useMuted } from "@/sound";

type SoundToggleProps = { className?: string };

/** 44 px round sticker that mutes every sound effect; the choice persists through `@/sound`. */
export function SoundToggle({ className }: SoundToggleProps) {
  const [muted, setMuted] = useMuted();
  const Icon = muted ? VolumeX : Volume2;
  return (
    <button
      type="button"
      aria-label="Mute sound effects"
      aria-pressed={muted}
      title={muted ? "Sound off" : "Sound on"}
      onClick={() => {
        setMuted(!muted);
        if (muted) play("tap");
      }}
      className={[
        "sticker pressable inline-flex size-11 shrink-0 items-center justify-center rounded-full",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <Icon aria-hidden size={20} strokeWidth={2} />
    </button>
  );
}
