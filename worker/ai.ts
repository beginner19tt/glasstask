/**
 * Workers AI calls. Every one of them is *optional*: the deterministic parser in
 * shared/parse.ts already produced a usable task, so an AI timeout or a model
 * change can never block capture. The AI only enriches.
 */

import { parseQuickInput } from '../shared/parse';
import type { ParsedInput } from '../shared/parse';
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

/**
 * Workers AI answers in two shapes. A bare `prompt` comes back as
 * `{ response: "..." }`, while `messages` comes back in the OpenAI
 * chat-completion shape, with the text under `choices[0].message.content`.
 * Reading only `response` silently yielded nothing - or a non-string - the
 * moment this module moved to chat roles, so take whichever is actually there.
 */
export function responseText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return '';
  const r = result as Record<string, unknown>;

  if (typeof r.response === 'string') return r.response;

  const choices = r.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') return message.content;
    if (typeof first?.text === 'string') return first.text;
  }

  // Some models nest the old shape one level down.
  if (typeof r.response === 'object' && r.response !== null) {
    const nested = r.response as Record<string, unknown>;
    if (typeof nested.response === 'string') return nested.response;
  }

  return '';
}

/** Pulls the first balanced JSON object out of a model response. */
export function extractJson(raw: unknown): unknown {
  if (typeof raw !== 'string') return null;
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
  /**
   * The parse the browser already did. Relative dates like "来週" resolve
   * against a calendar day, and the Worker's calendar is UTC while the
   * person's is not: parsing here would hand a Tokyo user a due time nine
   * hours off. The client has the right clock, so when it sends its parse we
   * use it, and only fall back to parsing here for direct API callers.
   */
  clientParse?: ParsedInput,
): Promise<Structured> {
  const local = clientParse ?? parseQuickInput(text, now);
  // Chat roles, not a bare prompt: an instruct model handed a raw prompt tends
  // to continue the text it was given instead of answering it.
  const system = [
    'You turn one line of a captured memo into a task record.',
    'Reply with JSON only, no prose, using exactly these keys:',
    '{"title":string,"note":string,"tags":string[],"priority":0|1|2,"due_at":string|null,"subtasks":string[]}',
    `Today is ${now.toISOString().slice(0, 10)}. due_at must be ISO 8601 or null.`,
    'Keep title under 60 characters and in the same language as the memo.',
    'priority: 0 normal, 1 important, 2 urgent. subtasks: at most 4, only if the memo clearly implies steps.',
  ].join('\n');

  try {
    const response = (await ai.run(MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: text },
      ],
      max_tokens: 400,
      temperature: 0.2,
    })) as unknown;
    const raw = responseText(response);
    const parsed = extractJson(raw);
    if (!parsed) {
      // Falling back is correct, but silently is not: a model that stops
      // returning JSON would otherwise look like a quiet quality regression.
      console.warn('ai.structure: no JSON in model output', JSON.stringify(raw.slice(0, 300)));
    }
    return mergeStructured(local, parsed);
  } catch (error) {
    console.warn('ai.structure: model call failed', String(error));
    return { ...mergeStructured(local, null) };
  }
}

/**
 * Keeps only what the plan contract allows: numbered lines naming a task that
 * actually exists, each one once, five at most.
 *
 * An instruct model asked to reorder a list will sometimes continue the input
 * format instead of answering it, echoing the list back and inventing more
 * rows. Rather than trust the prose, we take the lines that fit the contract
 * and let the caller fall back to the deterministic order if nothing does.
 */
export function takeOrderedLines(
  raw: string,
  tasks: ReadonlyArray<{ title: string }>,
): string {
  const titles = new Set(tasks.map((t) => t.title));
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const line of raw.split('\n')) {
    const match = line.trim().match(/^(\d{1,2})[.)]\s+(.*)$/);
    if (!match) continue;
    const title = match[2].trim().replace(/\s*\(due [^)]*\)\s*$/, '');
    if (!titles.has(title) || seen.has(title)) continue;
    seen.add(title);
    kept.push(`${kept.length + 1}. ${title}`);
    if (kept.length === 5) break;
  }

  return kept.join('\n');
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

  const system = [
    'You order a task list for today. Reply with the ordered list and nothing else.',
    'At most 5 lines. Every line is exactly "<n>. <task title>", numbered from 1.',
    'Use only titles from the list, never invent one, never repeat one.',
    'No preamble, no closing remarks, no headings, no status or priority markers.',
    'Write the titles in the language they are given in.',
  ].join('\n');

  try {
    const response = (await ai.run(MODEL, {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: lines },
      ],
      max_tokens: 200,
      temperature: 0.3,
    })) as unknown;
    const plan = takeOrderedLines(responseText(response), tasks);
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
