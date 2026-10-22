import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from './env';
import { isDevAuth } from './env';
import { authRoutes, currentSession } from './auth';
import type { SessionPayload } from './session';
import { SESSION_COOKIE } from './session';
import { insertTask, listTasks, patchTask, softDeleteTask } from './db';
import { planDay, structureTask } from './ai';
import type { Lane, Priority, Task } from '../shared/task';
import { LANES } from '../shared/task';
import { parseQuickInput } from '../shared/parse';

type Variables = { session: SessionPayload };

const app = new Hono<{ Bindings: AppEnv; Variables: Variables }>();

app.route('/api/auth', authRoutes);

// Everything below /api needs a session. Assets are served by the platform
// before the Worker runs, so this never touches the HTML shell.
const PUBLIC_PATHS = new Set(['/api/health']);

app.use('/api/*', async (c, next) => {
  if (c.req.path.startsWith('/api/auth') || PUBLIC_PATHS.has(c.req.path)) return next();
  const session = await currentSession(c.env, new URL(c.req.url), getCookie(c, SESSION_COOKIE));
  if (!session) return c.json({ error: 'unauthorized' }, 401);
  c.set('session', session);
  return next();
});

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    devAuth: isDevAuth(c.env, new URL(c.req.url)),
    googleConfigured: Boolean(c.env.GOOGLE_CLIENT_ID),
  }),
);

app.get('/api/me', (c) => {
  const s = c.get('session');
  return c.json({ user: { id: s.sub, email: s.email, name: s.name, picture: s.picture } });
});

function isLane(value: unknown): value is Lane {
  return typeof value === 'string' && LANES.includes(value as Lane);
}

function asLane(value: unknown, fallback: Lane = 'inbox'): Lane {
  return isLane(value) ? value : fallback;
}

function asPriority(value: unknown): Priority {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(Math.round(n), 0), 2) as Priority;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.replace(/^[#]/, '').trim())
    .filter((t) => t.length > 0 && t.length <= 40)
    .slice(0, 6);
}

function asIso(value: unknown): string | null {
  if (typeof value !== 'string' || value.length < 10) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

// Accepts either a fully formed task (the client builds one optimistically and
// replays it) or a raw memo string, which gets parsed server-side.
function buildTask(body: Record<string, unknown>, now = new Date()): Task | null {
  const raw = typeof body.raw === 'string' ? body.raw : '';
  const parsed = raw ? parseQuickInput(raw, now) : null;
  const title = (typeof body.title === 'string' && body.title.trim()) || parsed?.title || '';
  if (!title) return null;
  const iso = now.toISOString();
  return {
    id: typeof body.id === 'string' && body.id.length >= 8 ? body.id : crypto.randomUUID(),
    title: title.slice(0, 200),
    note: typeof body.note === 'string' ? body.note.slice(0, 4000) : '',
    status: asLane(body.status),
    priority: body.priority === undefined ? (parsed?.priority ?? 0) : asPriority(body.priority),
    tags: body.tags === undefined ? (parsed?.tags ?? []) : asTags(body.tags),
    dueAt: body.dueAt === undefined ? (parsed?.dueAt ? asIso(parsed.dueAt) : null) : asIso(body.dueAt),
    createdAt: asIso(body.createdAt) ?? iso,
    updatedAt: iso,
    position: Number.isFinite(Number(body.position)) ? Number(body.position) : Date.now(),
  };
}

app.get('/api/tasks', async (c) => {
  const tasks = await listTasks(c.env.DB, c.get('session').sub);
  return c.json({ tasks });
});

app.post('/api/tasks', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const task = buildTask(body);
  if (!task) return c.json({ error: 'title_required' }, 400);
  await insertTask(c.env.DB, c.get('session').sub, task);
  return c.json({ task }, 201);
});

app.patch('/api/tasks/:id', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.title === 'string') patch.title = body.title.slice(0, 200);
  if (typeof body.note === 'string') patch.note = body.note.slice(0, 4000);
  if (body.status !== undefined) {
    // A bad status is a client bug: reject it rather than quietly parking the
    // task in inbox, which would look like data loss to the user.
    if (!isLane(body.status)) return c.json({ error: 'bad_status' }, 400);
    patch.status = body.status;
  }
  if (body.priority !== undefined) patch.priority = asPriority(body.priority);
  if (body.tags !== undefined) patch.tags = asTags(body.tags);
  if (body.dueAt !== undefined) patch.dueAt = asIso(body.dueAt);
  if (body.position !== undefined && Number.isFinite(Number(body.position))) {
    patch.position = Number(body.position);
  }
  const task = await patchTask(c.env.DB, c.get('session').sub, c.req.param('id'), patch);
  if (!task) return c.json({ error: 'not_found' }, 404);
  return c.json({ task });
});

app.delete('/api/tasks/:id', async (c) => {
  const ok = await softDeleteTask(c.env.DB, c.get('session').sub, c.req.param('id'));
  return ok ? c.json({ ok: true }) : c.json({ error: 'not_found' }, 404);
});

// Replay of the offline queue: the client pushes whatever it captured while
// signed out or offline, and gets the merged server state back in one trip.
app.post('/api/tasks/sync', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { tasks?: unknown };
  const userId = c.get('session').sub;
  const incoming = Array.isArray(body.tasks) ? body.tasks.slice(0, 200) : [];
  let accepted = 0;
  for (const candidate of incoming) {
    if (!candidate || typeof candidate !== 'object') continue;
    const task = buildTask(candidate as Record<string, unknown>);
    if (!task) continue;
    await insertTask(c.env.DB, userId, task);
    accepted += 1;
  }
  const tasks = await listTasks(c.env.DB, userId);
  return c.json({ accepted, tasks });
});

app.post('/api/ai/structure', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
  if (!text) return c.json({ error: 'text_required' }, 400);
  return c.json(await structureTask(c.env.AI, text));
});

app.post('/api/ai/plan', async (c) => {
  const tasks = await listTasks(c.env.DB, c.get('session').sub);
  const result = await planDay(
    c.env.AI,
    tasks.map((t) => ({
      title: t.title,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
    })),
  );
  return c.json(result);
});

app.all('/api/*', (c) => c.json({ error: 'not_found' }, 404));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
