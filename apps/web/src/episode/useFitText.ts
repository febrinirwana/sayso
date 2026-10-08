import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/**
 * Largest font size (px, between `min` and `max`, in 0.5 px steps) at which the probe's text fits
 * the box's content width on one line, and, with `heightShare`, no taller than that share of the
 * box height so big desktop cards get big words without crowding short phone cards. Measures at
 * the candidate size itself because kerning and hinting do not scale linearly; a single scaled
 * measurement can overflow. Re-measures on resize and once web fonts load, so the fallback face
 * never decides the size.
 */
export function useFitText(
  text: string,
  {
    min,
    max,
    inset,
    heightShare,
  }: { min: number; max: number; inset: number; heightShare?: number },
): {
  size: number;
  boxRef: RefObject<HTMLElement | null>;
  probeRef: RefObject<HTMLSpanElement | null>;
} {
  const boxRef = useRef<HTMLElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const box = boxRef.current;
    const probe = probeRef.current;
    if (!box || !probe || text === "") return;

    const measure = () => {
      // 2 % headroom absorbs sub-pixel rounding between the probe and the rendered word.
      const available = (box.clientWidth - inset * 2) * 0.98;
      if (available <= 0) return;
      const tallest = heightShare === undefined ? max : box.clientHeight * heightShare;
      let candidate = Math.max(min, Math.min(max, Math.floor(tallest * 2) / 2));
      for (let attempt = 0; attempt < 6 && candidate > min; attempt++) {
        probe.style.fontSize = `${candidate}px`;
        const width = probe.getBoundingClientRect().width;
        if (width <= available) break;
        candidate = Math.max(min, Math.floor((candidate * available * 2) / width) / 2);
      }
      setSize(candidate);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    const fonts = document.fonts;
    let alive = true;
    void fonts.ready.then(() => {
      if (alive) measure();
    });
    fonts.addEventListener("loadingdone", measure);
    return () => {
      alive = false;
      observer.disconnect();
      fonts.removeEventListener("loadingdone", measure);
    };
  }, [text, min, max, inset, heightShare]);

  return { size, boxRef, probeRef };
}
