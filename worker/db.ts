import type { Lane, Priority, Task } from '../shared/task';
import { LANES } from '../shared/task';

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  note: string;
  status: string;
  priority: number;
  tags: string;
  due_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function rowToTask(row: TaskRow): Task {
  let tags: string[] = [];
  try {
    const parsed = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((t): t is string => typeof t === 'string');
  } catch {
    tags = [];
  }
  return {
    id: row.id,
    title: row.title,
    note: row.note,
    status: (LANES.includes(row.status as Lane) ? row.status : 'inbox') as Lane,
    priority: (Math.min(Math.max(row.priority, 0), 2) as Priority),
    tags,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    position: row.position,
  };
}

export async function upsertUser(
  db: D1Database,
  user: { id: string; email: string; name: string; picture: string },
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, email, name, picture, created_at, last_seen_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         picture = excluded.picture,
         last_seen_at = excluded.last_seen_at`,
    )
    .bind(user.id, user.email, user.name, user.picture, now)
    .run();
}

export async function listTasks(db: D1Database, userId: string): Promise<Task[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM tasks
        WHERE user_id = ?1 AND deleted_at IS NULL
        ORDER BY updated_at DESC
        LIMIT 500`,
    )
    .bind(userId)
    .all<TaskRow>();
  return (results ?? []).map(rowToTask);
}

export async function insertTask(db: D1Database, userId: string, task: Task): Promise<Task> {
  await db
    .prepare(
      `INSERT INTO tasks
        (id, user_id, title, note, status, priority, tags, due_at, position, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         note = excluded.note,
         status = excluded.status,
         priority = excluded.priority,
         tags = excluded.tags,
         due_at = excluded.due_at,
         position = excluded.position,
         updated_at = excluded.updated_at`,
    )
    .bind(
      task.id,
      userId,
      task.title,
      task.note,
      task.status,
      task.priority,
      JSON.stringify(task.tags),
      task.dueAt,
      task.position,
      task.createdAt,
      task.updatedAt,
    )
    .run();
  return task;
}

const PATCHABLE: Record<string, string> = {
  title: 'title',
  note: 'note',
  status: 'status',
  priority: 'priority',
  tags: 'tags',
  dueAt: 'due_at',
  position: 'position',
};

export async function patchTask(
  db: D1Database,
  userId: string,
  id: string,
  patch: Record<string, unknown>,
): Promise<Task | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [field, column] of Object.entries(PATCHABLE)) {
    if (!(field in patch)) continue;
    const raw = patch[field];
    sets.push(`${column} = ?${values.length + 1}`);
    values.push(field === 'tags' ? JSON.stringify(raw ?? []) : (raw as never));
  }
  if (sets.length === 0) return null;
  const updatedAt = new Date().toISOString();
  sets.push(`updated_at = ?${values.length + 1}`);
  values.push(updatedAt);

  const row = await db
    .prepare(
      `UPDATE tasks SET ${sets.join(', ')}
        WHERE id = ?${values.length + 1} AND user_id = ?${values.length + 2} AND deleted_at IS NULL
        RETURNING *`,
    )
    .bind(...values, id, userId)
    .first<TaskRow>();
  return row ? rowToTask(row) : null;
}

export async function softDeleteTask(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const row = await db
    .prepare(
      `UPDATE tasks SET deleted_at = ?1, updated_at = ?1
        WHERE id = ?2 AND user_id = ?3 AND deleted_at IS NULL
        RETURNING id`,
    )
    .bind(now, id, userId)
    .first<{ id: string }>();
  return row !== null;
}
