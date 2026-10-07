import type { ComponentPropsWithoutRef, MouseEvent, ReactNode } from "react";
import { play } from "@/sound";

type ButtonBase = {
  /** `primary` is the ink pill; `secondary` is the white sticker pill. There is no red button. */
  variant?: "primary" | "secondary";
  /** `md` is 44 px tall (minimum tap target); `lg` is 56 px for hero and closing CTAs. */
  size?: "md" | "lg";
  children: ReactNode;
  className?: string;
};

type AnchorButtonProps = ButtonBase &
  Omit<ComponentPropsWithoutRef<"a">, keyof ButtonBase | "href"> & { href: string };

type NativeButtonProps = ButtonBase &
  Omit<ComponentPropsWithoutRef<"button">, keyof ButtonBase> & { href?: undefined };

export type ButtonProps = AnchorButtonProps | NativeButtonProps;

const base =
  "sticker pressable inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-full font-display-wide whitespace-nowrap disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary: "bg-ink text-paper",
  secondary: "bg-card text-ink",
} as const;

const sizes = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-7 text-lg",
} as const;

/** Pill button per DESIGN section 4. Renders `<a>` when `href` is given; every press plays `tap`. */
export function Button(props: ButtonProps) {
  const { variant = "primary", size = "md", className, children } = props;
  const classes = [base, variants[variant], sizes[size], className].filter(Boolean).join(" ");

  if (props.href !== undefined) {
    const { variant: _v, size: _s, className: _c, children: _ch, href, onClick, ...rest } = props;
    return (
      <a
        {...rest}
        href={href}
        className={classes}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          play("tap");
          onClick?.(event);
        }}
      >
        {children}
      </a>
    );
  }

  const {
    variant: _v,
    size: _s,
    className: _c,
    children: _ch,
    href: _h,
    onClick,
    type = "button",
    ...rest
  } = props;
  return (
    <button
      {...rest}
      type={type}
      className={classes}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        play("tap");
        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
