import type { FlickDirection } from './task';

/** px of travel, or px/s of flick velocity, that commits a status change. */
export const FLICK_DISTANCE = 72;
export const FLICK_VELOCITY = 480;

export interface FlickGesture {
  offset: { x: number };
  velocity: { x: number };
}

/**
 * A gesture commits when it travelled far enough, or when it was a quick flick
 * that barely moved. Below both thresholds the card springs back untouched.
 */
export function resolveFlick(gesture: FlickGesture): FlickDirection | null {
  const { offset, velocity } = gesture;
  const far = Math.abs(offset.x) >= FLICK_DISTANCE;
  const fast = Math.abs(velocity.x) >= FLICK_VELOCITY && Math.abs(offset.x) > 12;
  if (!far && !fast) return null;
  const sign = far ? Math.sign(offset.x) : Math.sign(velocity.x);
  return sign > 0 ? 'forward' : 'back';
}
