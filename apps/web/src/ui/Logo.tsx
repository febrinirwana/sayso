import logoUrl from "@/assets/brand/logo.webp";
import markUrl from "@/assets/brand/mark.webp";

type LogoProps = { variant?: "full" | "mark"; height: number; className?: string };

/** The SaySo mark; `full` adds the wordmark. Source art: apps/web/assets-src/brand. */
export function Logo({ variant = "full", height, className }: LogoProps) {
  const full = variant === "full";
  return (
    <img
      src={full ? logoUrl : markUrl}
      alt="SaySo"
      height={height}
      width={full ? Math.round(height * LOGO_ASPECT) : height}
      draggable={false}
      className={className}
    />
  );
}

/** Width / height of the generated logo.webp (559 × 160). */
const LOGO_ASPECT = 559 / 160;
