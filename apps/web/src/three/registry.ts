// The DOM side of the landing's single WebGL stage. Pages register slots (DOM boxes plus a scene
// description); the lazy 3D chunk draws one drei View per slot. No three.js here, so pages can
// import it freely.
import type { RefObject } from "react";
import { useSyncExternalStore } from "react";
import type { VoxelMeshName } from "./voxels";

/** Idle motion of a lone voxel. */
export type IconMotion = "bob" | "rock" | "wobble" | "spin";

export type StageScene =
  /** The hero: the mascot sits on `mascot`'s box; voxels scatter across the whole slot. */
  | { kind: "hero"; mascot: RefObject<HTMLElement | null> }
  /** One voxel filling the slot; hover or tap barrel-rolls it. */
  | { kind: "icon"; name: VoxelMeshName; motion: IconMotion; fill?: number }
  /** The mascot alone, for galleries. */
  | { kind: "mascot" }
  /** The closing star: slides in from the edge and turns from −90° as the slot scrolls in. */
  | { kind: "finale" };

export type Slot = { id: string; element: HTMLElement; scene: StageScene };

/** Something happened to a slot's DOM box: hover/tap (`roll`), mascot boop, or the ticker spoke. */
export type StageSignal = "roll" | "boop" | "talk";

let slots: readonly Slot[] = [];
let ready = false;
const listeners = new Set<() => void>();
const signalListeners = new Map<string, Set<(signal: StageSignal) => void>>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function registerSlot(slot: Slot): () => void {
  slots = [...slots.filter((s) => s.id !== slot.id), slot];
  emit();
  return () => {
    slots = slots.filter((s) => s !== slot);
    emit();
  };
}

export function useSlots(): readonly Slot[] {
  return useSyncExternalStore(
    subscribe,
    () => slots,
    () => slots,
  );
}

/** The stage drew its first frame: slot fallbacks can step aside. */
export function markStageReady(): void {
  if (ready) return;
  ready = true;
  emit();
}

export function useStageReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => ready,
    () => false,
  );
}

export function sendSignal(id: string, signal: StageSignal): void {
  for (const fn of signalListeners.get(id) ?? []) fn(signal);
}

export function onSignal(id: string, fn: (signal: StageSignal) => void): () => void {
  const set = signalListeners.get(id) ?? new Set();
  set.add(fn);
  signalListeners.set(id, set);
  return () => {
    set.delete(fn);
  };
}

/**
 * Latest pointer in viewport px. `active` drops when a touch ends or the mouse leaves the window,
 * so pieces drift home instead of staring at a stale spot. `down` counts presses, so scenes can
 * tell a tap from a hover.
 */
export const pointer = { x: 0, y: 0, active: false, down: 0 };

let tracking = 0;

const move = (event: PointerEvent) => {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.active = true;
};
const press = (event: PointerEvent) => {
  move(event);
  pointer.down++;
};
const leave = (event: PointerEvent) => {
  if (event.pointerType === "touch" || event.relatedTarget === null) pointer.active = false;
};

/** Starts the window pointer listeners while at least one scene needs them. */
export function trackPointer(): () => void {
  if (tracking++ === 0) {
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointerup", leave, { passive: true });
    document.addEventListener("pointerout", leave, { passive: true });
  }
  return () => {
    if (--tracking > 0) return;
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerdown", press);
    window.removeEventListener("pointerup", leave);
    document.removeEventListener("pointerout", leave);
  };
}
