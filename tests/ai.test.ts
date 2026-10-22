import { describe, expect, it } from 'vitest';
import { extractJson, mergeStructured, responseText, takeOrderedLines } from '../worker/ai';
import { parseQuickInput } from '../shared/parse';

const NOW = new Date(2026, 9, 22, 11, 30, 0);

describe('extractJson', () => {
  it('reads a bare JSON object', () => {
    expect(extractJson('{"title":"a"}')).toEqual({ title: 'a' });
  });

  it('reads JSON wrapped in the prose models like to add', () => {
    const raw = 'Sure! Here you go:\n```json\n{"title":"a","tags":["x"]}\n```\nHope that helps.';
    expect(extractJson(raw)).toEqual({ title: 'a', tags: ['x'] });
  });

  it('handles nested braces', () => {
    expect(extractJson('noise {"a":{"b":1},"c":2} tail')).toEqual({ a: { b: 1 }, c: 2 });
  });

  it('returns null for unparseable output', () => {
    expect(extractJson('I cannot help with that.')).toBeNull();
    expect(extractJson('{"broken": ')).toBeNull();
    expect(extractJson('')).toBeNull();
  });
});

describe('mergeStructured', () => {
  it('falls back to the local parse when the model said nothing usable', () => {
    const local = parseQuickInput('明日 請求書 #work !', NOW);
    const merged = mergeStructured(local, null);
    expect(merged.source).toBe('local');
    expect(merged.title).toBe('請求書');
    expect(merged.tags).toEqual(['work']);
    expect(merged.priority).toBe(1);
    expect(merged.dueAt).toBe(local.dueAt);
  });

  it('takes the model title and note', () => {
    const local = parseQuickInput('請求書', NOW);
    const merged = mergeStructured(local, { title: '請求書を送付する', note: '経理に確認' });
    expect(merged.title).toBe('請求書を送付する');
    expect(merged.note).toBe('経理に確認');
    expect(merged.source).toBe('ai');
  });

  it('unions tags and strips a leading hash from the model', () => {
    const local = parseQuickInput('請求書 #work', NOW);
    const merged = mergeStructured(local, { tags: ['#経理', 'work'] });
    expect(merged.tags).toEqual(['work', '経理']);
  });

  it('never lets the model lower an explicit local priority', () => {
    const local = parseQuickInput('請求書 !!', NOW);
    expect(mergeStructured(local, { priority: 0 }).priority).toBe(2);
  });

  it('uses the model priority only when the memo had none', () => {
    const local = parseQuickInput('請求書', NOW);
    expect(mergeStructured(local, { priority: 2 }).priority).toBe(2);
    expect(mergeStructured(local, { priority: 9 }).priority).toBe(2);
    expect(mergeStructured(local, { priority: -4 }).priority).toBe(0);
    expect(mergeStructured(local, { priority: 'high' }).priority).toBe(0);
  });

  it('keeps a locally parsed due date over the model guess', () => {
    const local = parseQuickInput('明日 請求書', NOW);
    const merged = mergeStructured(local, { due_at: '2030-01-01T00:00:00.000Z' });
    expect(merged.dueAt).toBe(local.dueAt);
  });

  it('accepts a model due date when the memo had none', () => {
    const local = parseQuickInput('請求書', NOW);
    expect(mergeStructured(local, { due_at: '2026-12-01T09:00:00.000Z' }).dueAt).toBe(
      '2026-12-01T09:00:00.000Z',
    );
  });

  it('drops junk subtasks and caps the list', () => {
    const local = parseQuickInput('引っ越し', NOW);
    const merged = mergeStructured(local, {
      subtasks: ['住所変更', '', '   ', 42, null, 'ガス停止', 'x'.repeat(200), 'a', 'b', 'c', 'd'],
    });
    expect(merged.subtasks).toEqual(['住所変更', 'ガス停止', 'a', 'b', 'c', 'd']);
  });

  it('survives a model that returned the wrong shape entirely', () => {
    const local = parseQuickInput('請求書', NOW);
    expect(mergeStructured(local, 'not an object').title).toBe('請求書');
    expect(mergeStructured(local, []).title).toBe('請求書');
    expect(mergeStructured(local, { title: '   ' }).title).toBe('請求書');
  });
});

describe('takeOrderedLines', () => {
  const tasks = [{ title: '請求書を送る' }, { title: '歯医者' }, { title: 'ジムに行く' }];

  it('keeps a well-formed plan as is', () => {
    const raw = '1. 歯医者\n2. 請求書を送る';
    expect(takeOrderedLines(raw, tasks)).toBe('1. 歯医者\n2. 請求書を送る');
  });

  it('drops the echoed input the model continued instead of answering', () => {
    // Verbatim shape of a real @cf/meta/llama-3.3 response: it continued the
    // input format and invented rows that were never in the list.
    const raw = [
      '- [inbox] p2 本番確認 (due 2026-10-23T00:00:00.000Z)',
      '- [inbox] p3 本番確認 (due 2026-10-23T00:00:00.000Z)',
      '1. p1 本番確認',
      '2. p2 本番確認',
      '3. p3 本番確認',
    ].join('\n');
    expect(takeOrderedLines(raw, [{ title: '本番確認' }])).toBe('');
  });

  it('never repeats a task, even when the model does', () => {
    const raw = '1. 歯医者\n2. 歯医者\n3. 請求書を送る\n4. 歯医者';
    expect(takeOrderedLines(raw, tasks)).toBe('1. 歯医者\n2. 請求書を送る');
  });

  it('drops titles that are not in the list', () => {
    const raw = '1. 歯医者\n2. 洗車する\n3. ジムに行く';
    expect(takeOrderedLines(raw, tasks)).toBe('1. 歯医者\n2. ジムに行く');
  });

  it('renumbers from 1 after dropping lines', () => {
    const raw = '7. ジムに行く\n9. 歯医者';
    expect(takeOrderedLines(raw, tasks)).toBe('1. ジムに行く\n2. 歯医者');
  });

  it('strips a trailing due marker the model copied over', () => {
    const raw = '1. 歯医者 (due 2026-10-23T00:00:00.000Z)';
    expect(takeOrderedLines(raw, tasks)).toBe('1. 歯医者');
  });

  it('accepts both "1." and "1)" numbering', () => {
    expect(takeOrderedLines('1) 歯医者', tasks)).toBe('1. 歯医者');
  });

  it('caps the plan at five lines', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ title: `task ${i}` }));
    const raw = many.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
    expect(takeOrderedLines(raw, many).split('\n')).toHaveLength(5);
  });

  it('returns nothing for prose, so the caller falls back', () => {
    expect(takeOrderedLines('Sure! Here is your plan for today:', tasks)).toBe('');
    expect(takeOrderedLines('', tasks)).toBe('');
  });
});

describe('responseText', () => {
  it('reads the bare prompt shape', () => {
    expect(responseText({ response: 'hello' })).toBe('hello');
  });

  it('reads the OpenAI chat-completion shape that `messages` returns', () => {
    // Verbatim shape from Workers AI for @cf/meta/llama-3.3-70b-instruct.
    const result = {
      id: 'chatcmpl-1dc27a0a',
      object: 'chat.completion',
      choices: [
        { index: 0, message: { role: 'assistant', content: '{"title":"引っ越し準備"}' }, finish_reason: 'stop' },
      ],
    };
    expect(responseText(result)).toBe('{"title":"引っ越し準備"}');
  });

  it('falls back to a choice-level text field', () => {
    expect(responseText({ choices: [{ text: 'plain' }] })).toBe('plain');
  });

  it('unwraps a nested response object', () => {
    expect(responseText({ response: { response: 'nested' } })).toBe('nested');
  });

  it('returns an empty string for anything it does not recognise', () => {
    expect(responseText(null)).toBe('');
    expect(responseText('a string')).toBe('');
    expect(responseText({})).toBe('');
    expect(responseText({ choices: [] })).toBe('');
    expect(responseText({ choices: [{ message: {} }] })).toBe('');
    expect(responseText({ response: 42 })).toBe('');
  });
});

describe('extractJson is defensive about the value it is handed', () => {
  it('returns null rather than throwing on a non-string', () => {
    // This threw "raw.indexOf is not a function" in production once the
    // module moved to chat roles and `response` stopped being a string.
    expect(extractJson(undefined)).toBeNull();
    expect(extractJson({ response: 'x' })).toBeNull();
    expect(extractJson(42)).toBeNull();
    expect(extractJson(null)).toBeNull();
  });
});
