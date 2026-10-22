import type { Task } from '../../shared/task';

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${init?.method ?? 'GET'} ${path} -> ${response.status}`);
  }
  return (await response.json()) as T;
}

export const api = {
  me: () => request<{ user: User }>('/api/me'),
  health: () =>
    request<{ ok: boolean; devAuth: boolean; googleConfigured: boolean }>('/api/health'),
  devLogin: () => request<{ user: User }>('/api/auth/dev', { method: 'POST' }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  tasks: () => request<{ tasks: Task[] }>('/api/tasks'),
  create: (task: Task) =>
    request<{ task: Task }>('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
  patch: (id: string, patch: Partial<Task>) =>
    request<{ task: Task }>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  remove: (id: string) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  sync: (tasks: Task[]) =>
    request<{ accepted: number; tasks: Task[] }>('/api/tasks/sync', {
      method: 'POST',
      body: JSON.stringify({ tasks }),
    }),
  structure: (text: string) =>
    request<{
      title: string;
      note: string;
      tags: string[];
      priority: 0 | 1 | 2;
      dueAt: string | null;
      subtasks: string[];
      source: 'ai' | 'local';
    }>('/api/ai/structure', { method: 'POST', body: JSON.stringify({ text }) }),
  plan: () => request<{ plan: string; source: 'ai' | 'local' }>('/api/ai/plan', { method: 'POST' }),
};
