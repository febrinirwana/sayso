import { useCallback, useState } from "react";

export type BoxSize = { width: number; height: number };

/** Tracks an element's content-box size; attach the returned callback ref to the element. */
export function useBoxSize<T extends HTMLElement>(): readonly [(node: T | null) => void, BoxSize] {
  const [size, setSize] = useState<BoxSize>({ width: 0, height: 0 });
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}
