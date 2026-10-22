import { useCallback, useEffect, useRef, useState } from 'react';
import type { FlickDirection, Lane, Task } from '../../shared/task';
import { nextLane, sortTasks } from '../../shared/task';
import { parseQuickInput } from '../../shared/parse';
import { api, ApiError, type User } from './api';
import { storage } from './storage';

export type Phase = 'boot' | 'ready';

export interface StoreState {
  phase: Phase;
  user: User | null;
  tasks: Task[];
  /** ids captured locally that the server has not accepted yet */
  queue: string[];
  online: boolean;
  googleConfigured: boolean;
  devAuth: boolean;
}

/**
 * Local-first store.
 *
 * Writes land in React state and localStorage first and the network is a
 * follow-up, so a capture is never slower than a keystroke. Anything the server
 * rejected or never saw stays in `queue` and is replayed by /api/tasks/sync on
 * the next successful boot.
 */
export function useStore() {
  const [state, setState] = useState<StoreState>(() => ({
    phase: 'boot',
    user: null,
    tasks: sortTasks(storage.loadTasks()),
    queue: storage.loadQueue(),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    googleConfigured: false,
    devAuth: false,
  }));

  const tasksRef = useRef(state.tasks);
  const queueRef = useRef(state.queue);
  tasksRef.current = state.tasks;
  queueRef.current = state.queue;

  const commit = useCallback((tasks: Task[], queue?: string[]) => {
    const sorted = sortTasks(tasks);
    storage.saveTasks(sorted);
    if (queue) storage.saveQueue(queue);
    setState((prev) => ({ ...prev, tasks: sorted, queue: queue ?? prev.queue }));
  }, []);

  const enqueue = useCallback((id: string) => {
    const queue = Array.from(new Set([...queueRef.current, id]));
    storage.saveQueue(queue);
    setState((prev) => ({ ...prev, queue }));
  }, []);

  const bootstrap = useCallback(async () => {
    let googleConfigured = false;
    let devAuth = false;
    try {
      const health = await api.health();
      googleConfigured = health.googleConfigured;
      devAuth = health.devAuth;
    } catch {
      // offline or worker down: stay local-only
    }

    let user: User | null = null;
    try {
      user = (await api.me()).user;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        setState((prev) => ({ ...prev, phase: 'ready', googleConfigured, devAuth }));
        return;
      }
    }

    if (!user) {
      setState((prev) => ({ ...prev, phase: 'ready', user: null, googleConfigured, devAuth }));
      return;
    }

    try {
      const pending = tasksRef.current.filter((t) => queueRef.current.includes(t.id));
      const { tasks } = pending.length ? await api.sync(pending) : await api.tasks();
      const sorted = sortTasks(tasks);
      storage.saveTasks(sorted);
      storage.saveQueue([]);
      setState({
        phase: 'ready',
        user,
        tasks: sorted,
        queue: [],
        online: true,
        googleConfigured,
        devAuth,
      });
    } catch {
      setState((prev) => ({ ...prev, phase: 'ready', user, googleConfigured, devAuth }));
    }
  }, []);

  useEffect(() => {
    void bootstrap();
    const onOnline = () => setState((prev) => ({ ...prev, online: true }));
    const onOffline = () => setState((prev) => ({ ...prev, online: false }));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [bootstrap]);

  const capture = useCallback(
    (raw: string, lane: Lane = 'inbox'): Task | null => {
      const text = raw.trim();
      if (!text) return null;
      const parsed = parseQuickInput(text);
      const now = new Date().toISOString();
      const task: Task = {
        id: crypto.randomUUID(),
        title: parsed.title,
        note: '',
        status: lane === 'archived' ? 'inbox' : lane,
        priority: parsed.priority,
        tags: parsed.tags,
        dueAt: parsed.dueAt,
        createdAt: now,
        updatedAt: now,
        position: Date.now(),
      };
      commit([task, ...tasksRef.current]);
      void api.create(task).catch(() => enqueue(task.id));
      return task;
    },
    [commit, enqueue],
  );

  const flick = useCallback(
    (id: string, direction: FlickDirection): Lane | null => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) return null;
      const target = nextLane(task.status, direction);
      if (target === task.status) return null;
      const updated: Task = { ...task, status: target, updatedAt: new Date().toISOString() };
      commit(tasksRef.current.map((t) => (t.id === id ? updated : t)));
      void api.patch(id, { status: target }).catch(() => enqueue(id));
      return target;
    },
    [commit, enqueue],
  );

  const update = useCallback(
    (id: string, patch: Partial<Task>) => {
      const task = tasksRef.current.find((t) => t.id === id);
      if (!task) return;
      const updated: Task = { ...task, ...patch, updatedAt: new Date().toISOString() };
      commit(tasksRef.current.map((t) => (t.id === id ? updated : t)));
      void api.patch(id, patch).catch(() => enqueue(id));
    },
    [commit, enqueue],
  );

  const remove = useCallback(
    (id: string) => {
      commit(tasksRef.current.filter((t) => t.id !== id));
      void api.remove(id).catch(() => undefined);
    },
    [commit],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    storage.saveTasks([]);
    storage.saveQueue([]);
    setState((prev) => ({ ...prev, user: null, tasks: [], queue: [] }));
  }, []);

  return { state, capture, flick, update, remove, signOut, reload: bootstrap };
}
