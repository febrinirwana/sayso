import { animate, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Voxel } from "@/ui/Voxel";
import { PHONE_QUERY } from "./useMediaQuery";

type EpisodeFx = {
  /** A tiny screen shake on phones when a word is said (DESIGN section 6). No-op elsewhere. */
  shake: () => void;
  /** Stable ref callback that registers an element coins can fly from or into. */
  anchor: (key: string) => (el: HTMLElement | null) => void;
  /** Coins arc from one anchor into another (default `"balance"`); resolves when the last lands. */
  flyCoins: (from: string, to?: string) => Promise<void>;
};

/** Anchor key the header's balance chip registers under; coins land there by default. */
export const BALANCE_ANCHOR = "balance";
/** Anchor key a word card registers under. */
export const wordAnchor = (word: string) => `word:${word}`;

const NONE: EpisodeFx = {
  shake: () => {},
  anchor: () => () => {},
  flyCoins: () => Promise.resolve(),
};

const FxContext = createContext<EpisodeFx>(NONE);
const ShakeZoneContext = createContext<(el: HTMLElement | null) => void>(() => {});

/** Shake, anchors and coin flights for one episode screen; outside a provider every call no-ops. */
export function useEpisodeFx(): EpisodeFx {
  return useContext(FxContext);
}

type Point = { x: number; y: number };
type Flight = { id: number; from: Point; to: Point; target: HTMLElement; done: () => void };

const COINS = 7;
const COIN_PX = 30;
const COIN_DURATION = 0.62;
const COIN_STAGGER = 0.04;
const SHAKE_X = [0, -7, 6, -4, 3, -1, 0];

export function EpisodeFxProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion() ?? false;
  const anchors = useRef(new Map<string, HTMLElement>());
  const refs = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const zone = useRef<HTMLElement | null>(null);
  const [flights, setFlights] = useState<readonly Flight[]>([]);
  const nextId = useRef(0);

  const anchor = useCallback((key: string) => {
    let ref = refs.current.get(key);
    if (!ref) {
      ref = (el: HTMLElement | null) => {
        if (el) anchors.current.set(key, el);
        else anchors.current.delete(key);
      };
      refs.current.set(key, ref);
    }
    return ref;
  }, []);

  const shake = useCallback(() => {
    const el = zone.current;
    if (!el || reduce || !window.matchMedia(PHONE_QUERY).matches) return;
    animate(el, { x: SHAKE_X }, { duration: 0.36, ease: "easeOut" });
  }, [reduce]);

  const flyCoins = useCallback(
    (from: string, to: string = BALANCE_ANCHOR) => {
      const start = anchors.current.get(from);
      const target = anchors.current.get(to);
      if (!start || !target || reduce) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const id = nextId.current++;
        const flight: Flight = {
          id,
          from: centre(start.getBoundingClientRect()),
          to: centre(target.getBoundingClientRect()),
          target,
          done: () => {
            setFlights((all) => all.filter((f) => f.id !== id));
            resolve();
          },
        };
        setFlights((all) => [...all, flight]);
      });
    },
    [reduce],
  );

  const fx = useMemo(() => ({ shake, anchor, flyCoins }), [shake, anchor, flyCoins]);
  const registerZone = useCallback((el: HTMLElement | null) => {
    zone.current = el;
  }, []);

  return (
    <FxContext value={fx}>
      <ShakeZoneContext value={registerZone}>{children}</ShakeZoneContext>
      {flights.length > 0
        ? createPortal(
            <div aria-hidden className="pointer-events-none fixed inset-0 z-[80]">
              {flights.map((flight) => (
                <CoinFlight key={flight.id} flight={flight} />
              ))}
            </div>,
            document.body,
          )
        : null}
    </FxContext>
  );
}

/** The part of the screen that shakes; header and sheets stay still so fixed layers never jump. */
export function ShakeZone({ className, children }: { className?: string; children: ReactNode }) {
  const register = useContext(ShakeZoneContext);
  return (
    <div ref={register} className={className}>
      {children}
    </div>
  );
}

function CoinFlight({ flight }: { flight: Flight }) {
  const dx = flight.to.x - flight.from.x;
  const dy = flight.to.y - flight.from.y;
  // Fixed per flight so a re-render never re-rolls the paths mid-air.
  const [paths] = useState(() =>
    Array.from({ length: COINS }, (_, i) => {
      const spread = (i - (COINS - 1) / 2) * 14 + (Math.random() - 0.5) * 18;
      // Rising flights (card → balance) arc high; falling ones (balance → card) only hop.
      const lift = (dy < 0 ? 70 : 24) + Math.random() * (dy < 0 ? 60 : 30);
      return {
        x: [0, dx * 0.3 + spread, dx],
        y: [0, Math.min(0, dy) * 0.4 - lift, dy],
        rotate: [0, (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 200)],
      };
    }),
  );
  const landed = useRef(0);

  return paths.map((path, i) => (
    <motion.span
      // biome-ignore lint/suspicious/noArrayIndexKey: a flight's coins are a fixed list.
      key={i}
      className="absolute block"
      style={{
        left: flight.from.x - COIN_PX / 2,
        top: flight.from.y - COIN_PX / 2,
        width: COIN_PX,
        height: COIN_PX,
      }}
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{
        x: path.x,
        y: path.y,
        rotate: path.rotate,
        opacity: [0, 1, 1, 0.9],
        scale: [0.5, 1.15, 0.7],
      }}
      transition={{
        duration: COIN_DURATION,
        delay: i * COIN_STAGGER,
        x: { duration: COIN_DURATION, delay: i * COIN_STAGGER, ease: "linear" },
        y: {
          duration: COIN_DURATION,
          delay: i * COIN_STAGGER,
          ease: ["easeOut", "easeIn"],
          times: [0, 0.38, 1],
        },
      }}
      onAnimationComplete={() => {
        landed.current += 1;
        animate(flight.target, { scale: [1, 1.07, 1] }, { duration: 0.16, ease: "easeOut" });
        if (landed.current === COINS) flight.done();
      }}
    >
      <Voxel name="money-1" size={COIN_PX} className="size-full" />
    </motion.span>
  ));
}

function centre(rect: DOMRect): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}
