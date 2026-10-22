/**
 * Workers AI calls. Every one of them is *optional*: the deterministic parser in
 * shared/parse.ts already produced a usable task, so an AI timeout or a model
 * change can never block capture. The AI only enriches.
 */

import { parseQuickInput } from '../shared/parse';
import type { Priority } from '../shared/task';

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/**
 * Just the slice of the Workers AI binding this module uses. Depending on the
 * structural shape instead of the ambient `Ai` type keeps these functions
 * callable from the test suite, which does not load the workerd types.
 */
export interface AiBinding {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

export interface Structured {
  title: string;
  note: string;
  tags: string[];
  priority: Priority;
  dueAt: string | null;
  subtasks: string[];
  source: 'ai' | 'local';
}

function clampPriority(value: unknown): Priority | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return (Math.min(Math.max(Math.round(n), 0), 2) as Priority);
}

function stringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0 && v.length <= 80)
    .slice(0, limit);
}

/** Pulls the first balanced JSON object out of a model response. */
export function extractJson(raw: string): unknown {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < raw.length; i += 1) {
    if (raw[i] === '{') depth += 1;
    else if (raw[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function mergeStructured(
  local: ReturnType<typeof parseQuickInput>,
  ai: unknown,
): Structured {
  const base: Structured = {
    title: local.title,
    note: '',
    tags: local.tags,
    priority: local.priority,
    dueAt: local.dueAt,
    subtasks: [],
    source: 'local',
  };
  if (!ai || typeof ai !== 'object') return base;
  const o = ai as Record<string, unknown>;

  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const note = typeof o.note === 'string' ? o.note.trim() : '';
  const aiTags = stringArray(o.tags, 5).map((t) => t.replace(/^[#＃]/, ''));
  const priority = clampPriority(o.priority);
  const dueAt = typeof o.due_at === 'string' && o.due_at.length >= 10 ? o.due_at : null;

  return {
    title: title || base.title,
    note: note || base.note,
    tags: Array.from(new Set([...base.tags, ...aiTags])).slice(0, 6),
    // An explicit local `!` always wins over the model's guess.
    priority: base.priority !== 0 ? base.priority : (priority ?? 0),
    dueAt: base.dueAt ?? dueAt,
    subtasks: stringArray(o.subtasks, 6),
    source: 'ai',
  };
}

export async function structureTask(
  ai: AiBinding,
  text: string,
  now = new Date(),
): Promise<Structured> {
  const local = parseQuickInput(text, now);
  const prompt = [
    'You turn one line of a captured memo into a task record.',
    'Reply with JSON only, no prose, using exactly these keys:',
    '{"title":string,"note":string,"tags":string[],"priority":0|1|2,"due_at":string|null,"subtasks":string[]}',
    `Today is ${now.toISOString().slice(0, 10)}. due_at must be ISO 8601 or null.`,
    'Keep title under 60 characters and in the same language as the memo.',
    'priority: 0 normal, 1 important, 2 urgent. subtasks: at most 4, only if the memo clearly implies steps.',
    '',
    `Memo: ${text}`,
  ].join('\n');

  try {
    const response = (await ai.run(MODEL, {
      prompt,
      max_tokens: 400,
      temperature: 0.2,
    })) as { response?: string };
    return mergeStructured(local, extractJson(response.response ?? ''));
  } catch {
    return { ...mergeStructured(local, null) };
  }
}

export async function planDay(
  ai: AiBinding,
  tasks: Array<{ title: string; status: string; priority: number; dueAt: string | null }>,
): Promise<{ plan: string; source: 'ai' | 'local' }> {
  const lines = tasks
    .slice(0, 40)
    .map((t) => `- [${t.status}] p${t.priority} ${t.title}${t.dueAt ? ` (due ${t.dueAt})` : ''}`)
    .join('\n');

  if (tasks.length === 0) return { plan: '', source: 'local' };

  const prompt = [
    'You are a terse planning assistant. Given a task list, output an ordered plan.',
    'Rules: at most 5 lines, one task per line, prefix each with its 1-based order.',
    'No preamble, no closing remarks, no headings. Same language as the tasks.',
    '',
    lines,
  ].join('\n');

  try {
    const response = (await ai.run(MODEL, {
      prompt,
      max_tokens: 300,
      temperature: 0.3,
    })) as { response?: string };
    const plan = (response.response ?? '').trim();
    if (plan) return { plan, source: 'ai' };
  } catch {
    // fall through to the deterministic ordering below
  }

  const fallback = tasks
    .filter((t) => t.status !== 'done' && t.status !== 'archived')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map((t, i) => `${i + 1}. ${t.title}`)
    .join('\n');
  return { plan: fallback, source: 'local' };
}
