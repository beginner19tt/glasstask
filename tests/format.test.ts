import { describe, expect, it } from 'vitest';
import { dueLabel, isOverdue } from '../src/lib/format';

const NOW = new Date(2026, 9, 22, 11, 30, 0);
const at = (y: number, m: number, d: number, h = 9, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

describe('dueLabel', () => {
  it('returns null without a due date', () => {
    expect(dueLabel(null, NOW)).toBeNull();
    expect(dueLabel('not-a-date', NOW)).toBeNull();
  });

  it('labels today and tomorrow', () => {
    expect(dueLabel(at(2026, 10, 22), NOW)).toBe('今日');
    expect(dueLabel(at(2026, 10, 23), NOW)).toBe('明日');
  });

  it('shows the time when it is not the default hour', () => {
    expect(dueLabel(at(2026, 10, 22, 17, 30), NOW)).toBe('今日 17:30');
    expect(dueLabel(at(2026, 10, 23, 8, 0), NOW)).toBe('明日 08:00');
  });

  it('labels the near future in days', () => {
    expect(dueLabel(at(2026, 10, 25), NOW)).toBe('3日後');
  });

  it('labels the past', () => {
    expect(dueLabel(at(2026, 10, 21), NOW)).toBe('昨日');
    expect(dueLabel(at(2026, 10, 18), NOW)).toBe('4日前');
  });

  it('falls back to a date beyond a week', () => {
    expect(dueLabel(at(2026, 11, 15), NOW)).toBe('11/15');
  });
});

describe('isOverdue', () => {
  it('is true only for a past instant', () => {
    expect(isOverdue(at(2026, 10, 22, 9, 0), NOW)).toBe(true);
    expect(isOverdue(at(2026, 10, 22, 18, 0), NOW)).toBe(false);
    expect(isOverdue(null, NOW)).toBe(false);
  });
});
