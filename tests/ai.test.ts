import { describe, expect, it } from 'vitest';
import { extractJson, mergeStructured } from '../worker/ai';
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
