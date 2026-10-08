import { useSyncExternalStore } from "react";

/** Phone breakpoint from DESIGN section 5: phones are narrower than 768 px. */
export const PHONE_QUERY = "(max-width: 767.98px)";
/** Desktop breakpoint from DESIGN section 5: the studio layout starts at 1024 px. */
export const DESKTOP_QUERY = "(min-width: 1024px)";

/** Live `matchMedia` result; correct on the first render, so a layout never flashes the wrong mode. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
