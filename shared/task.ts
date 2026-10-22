/**
 * Domain model shared by the browser app, the Worker and the test suite.
 * Keeping it in one place means a flick on the phone and an UPDATE in D1 can
 * never disagree about what the next status is.
 */

export const STATUSES = ['inbox', 'today', 'doing', 'done'] as const;
export type Status = (typeof STATUSES)[number];

/** `archived` lives off the main axis: reachable only past `done`. */
export type Lane = Status | 'archived';

export const LANES: readonly Lane[] = [...STATUSES, 'archived'];

export type Priority = 0 | 1 | 2;

export interface Task {
  id: string;
  title: string;
  note: string;
  status: Lane;
  priority: Priority;
  tags: string[];
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Lower sorts first inside a lane. */
  position: number;
}

export const STATUS_META: Record<Lane, { label: string; glyph: string; hue: number }> = {
  inbox: { label: 'Inbox', glyph: '◦', hue: 220 },
  today: { label: 'Today', glyph: '◗', hue: 190 },
  doing: { label: 'Doing', glyph: '◔', hue: 275 },
  done: { label: 'Done', glyph: '●', hue: 150 },
  archived: { label: 'Archive', glyph: '⌯', hue: 0 },
};

export type FlickDirection = 'forward' | 'back';

/**
 * One linear axis, flicked in either direction:
 *   inbox → today → doing → done → archived
 * Both ends clamp, so a repeated flick is always safe.
 */
export function nextLane(current: Lane, direction: FlickDirection): Lane {
  const index = LANES.indexOf(current);
  if (index === -1) return current;
  const target = direction === 'forward' ? index + 1 : index - 1;
  const clamped = Math.min(Math.max(target, 0), LANES.length - 1);
  return LANES[clamped];
}

/** True when the flick would not move the task — used to suppress haptics/animation. */
export function isLaneTerminal(current: Lane, direction: FlickDirection): boolean {
  return nextLane(current, direction) === current;
}

export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.dueAt !== b.dueAt) {
      if (a.dueAt === null) return 1;
      if (b.dueAt === null) return -1;
      return a.dueAt < b.dueAt ? -1 : 1;
    }
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function countByLane(tasks: readonly Task[]): Record<Lane, number> {
  const counts = Object.fromEntries(LANES.map((lane) => [lane, 0])) as Record<Lane, number>;
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}
