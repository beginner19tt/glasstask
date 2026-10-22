import type { Task } from '../../shared/task';

const TASKS_KEY = 'glasstask.tasks.v1';
const QUEUE_KEY = 'glasstask.queue.v1';

// Every read is guarded: private windows and blocked site data both throw here,
// and the app has to render anyway.
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // out of quota or storage disabled: the in-memory state is still correct
  }
}

export const storage = {
  loadTasks: (): Task[] => {
    const tasks = read<Task[]>(TASKS_KEY, []);
    return Array.isArray(tasks) ? tasks.filter((t) => t && typeof t.id === 'string') : [];
  },
  saveTasks: (tasks: Task[]) => write(TASKS_KEY, tasks.slice(0, 500)),
  loadQueue: (): string[] => {
    const ids = read<string[]>(QUEUE_KEY, []);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : [];
  },
  saveQueue: (ids: string[]) => write(QUEUE_KEY, ids.slice(0, 500)),
};
