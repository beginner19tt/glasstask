import { describe, expect, it } from 'vitest';
import { FLICK_DISTANCE, FLICK_VELOCITY, resolveFlick } from '../shared/flick';

const g = (x: number, vx = 0) => ({ offset: { x }, velocity: { x: vx } });

describe('resolveFlick', () => {
  it('ignores a gesture that barely moved', () => {
    expect(resolveFlick(g(0))).toBeNull();
    expect(resolveFlick(g(20))).toBeNull();
    expect(resolveFlick(g(-20))).toBeNull();
  });

  it('commits once the travel threshold is reached', () => {
    expect(resolveFlick(g(FLICK_DISTANCE))).toBe('forward');
    expect(resolveFlick(g(-FLICK_DISTANCE))).toBe('back');
    expect(resolveFlick(g(FLICK_DISTANCE - 1))).toBeNull();
  });

  it('commits a fast flick that did not travel far', () => {
    expect(resolveFlick(g(20, FLICK_VELOCITY))).toBe('forward');
    expect(resolveFlick(g(-20, -FLICK_VELOCITY))).toBe('back');
  });

  it('needs some travel even when fast, so a tap never counts', () => {
    expect(resolveFlick(g(4, 2000))).toBeNull();
    expect(resolveFlick(g(-4, -2000))).toBeNull();
  });

  it('lets travel win over a contradictory velocity', () => {
    // Dragged far right, then flicked back at release: the position decides.
    expect(resolveFlick(g(140, -900))).toBe('forward');
    expect(resolveFlick(g(-140, 900))).toBe('back');
  });
});
