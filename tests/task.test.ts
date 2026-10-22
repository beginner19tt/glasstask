import { describe, expect, it } from 'vitest';
import { countByLane, isLaneTerminal, nextLane, sortTasks, type Task } from '../shared/task';

function task(partial: Partial<Task> = {}): Task {
  return {
    id: partial.id ?? crypto.randomUUID(),
    title: partial.title ?? 'task',
    note: '',
    status: partial.status ?? 'inbox',
    priority: partial.priority ?? 0,
    tags: partial.tags ?? [],
    dueAt: partial.dueAt ?? null,
    createdAt: partial.createdAt ?? '2026-10-01T00:00:00.000Z',
    updatedAt: partial.updatedAt ?? '2026-10-01T00:00:00.000Z',
    position: partial.position ?? 0,
  };
}

describe('nextLane', () => {
  it('walks the full axis forward', () => {
    expect(nextLane('inbox', 'forward')).toBe('today');
    expect(nextLane('today', 'forward')).toBe('doing');
    expect(nextLane('doing', 'forward')).toBe('done');
    expect(nextLane('done', 'forward')).toBe('archived');
  });

  it('walks the full axis back', () => {
    expect(nextLane('archived', 'back')).toBe('done');
    expect(nextLane('done', 'back')).toBe('doing');
    expect(nextLane('doing', 'back')).toBe('today');
    expect(nextLane('today', 'back')).toBe('inbox');
  });

  it('clamps at both ends so repeated flicks are safe', () => {
    expect(nextLane('inbox', 'back')).toBe('inbox');
    expect(nextLane('archived', 'forward')).toBe('archived');
    expect(isLaneTerminal('inbox', 'back')).toBe(true);
    expect(isLaneTerminal('archived', 'forward')).toBe(true);
    expect(isLaneTerminal('inbox', 'forward')).toBe(false);
  });

  it('is reversible for every interior lane', () => {
    for (const lane of ['today', 'doing', 'done'] as const) {
      expect(nextLane(nextLane(lane, 'forward'), 'back')).toBe(lane);
      expect(nextLane(nextLane(lane, 'back'), 'forward')).toBe(lane);
    }
  });
});

describe('sortTasks', () => {
  it('puts higher priority first', () => {
    const sorted = sortTasks([
      task({ id: 'a', priority: 0 }),
      task({ id: 'b', priority: 2 }),
      task({ id: 'c', priority: 1 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });

  it('orders by due date within a priority, undated last', () => {
    const sorted = sortTasks([
      task({ id: 'none', dueAt: null }),
      task({ id: 'late', dueAt: '2026-11-02T00:00:00.000Z' }),
      task({ id: 'soon', dueAt: '2026-10-23T00:00:00.000Z' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['soon', 'late', 'none']);
  });

  it('falls back to newest created first', () => {
    const sorted = sortTasks([
      task({ id: 'old', createdAt: '2026-10-01T00:00:00.000Z' }),
      task({ id: 'new', createdAt: '2026-10-20T00:00:00.000Z' }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(['new', 'old']);
  });

  it('does not mutate its input', () => {
    const input = [task({ id: 'a', priority: 0 }), task({ id: 'b', priority: 2 })];
    sortTasks(input);
    expect(input.map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('countByLane', () => {
  it('counts every lane, including the empty ones', () => {
    const counts = countByLane([
      task({ status: 'inbox' }),
      task({ status: 'inbox' }),
      task({ status: 'done' }),
    ]);
    expect(counts).toEqual({ inbox: 2, today: 0, doing: 0, done: 1, archived: 0 });
  });
});
