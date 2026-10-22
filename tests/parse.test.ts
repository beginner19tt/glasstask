import { describe, expect, it } from 'vitest';
import { parseQuickInput } from '../shared/parse';

// A fixed Thursday, so weekday maths is deterministic.
const NOW = new Date(2026, 9, 22, 11, 30, 0); // 2026-10-22 11:30 local

function dayOf(iso: string | null): string {
  expect(iso).not.toBeNull();
  return (iso as string).slice(0, 10);
}

describe('parseQuickInput', () => {
  it('keeps a plain memo untouched', () => {
    const result = parseQuickInput('牛乳を買う', NOW);
    expect(result.title).toBe('牛乳を買う');
    expect(result.tags).toEqual([]);
    expect(result.priority).toBe(0);
    expect(result.dueAt).toBeNull();
    expect(result.hints).toEqual([]);
  });

  it('pulls hash tags out of the title', () => {
    const result = parseQuickInput('請求書を送る #work #経理', NOW);
    expect(result.title).toBe('請求書を送る');
    expect(result.tags).toEqual(['work', '経理']);
  });

  it('accepts the full-width hash', () => {
    expect(parseQuickInput('買い物 ＃家事', NOW).tags).toEqual(['家事']);
  });

  it('deduplicates tags', () => {
    expect(parseQuickInput('a #x #x', NOW).tags).toEqual(['x']);
  });

  it('reads priority from trailing bangs', () => {
    expect(parseQuickInput('電話する !', NOW).priority).toBe(1);
    expect(parseQuickInput('電話する !!', NOW).priority).toBe(2);
    expect(parseQuickInput('電話する ！', NOW).priority).toBe(1);
    expect(parseQuickInput('電話する !', NOW).title).toBe('電話する');
  });

  it('does not treat mid-word punctuation as priority', () => {
    const result = parseQuickInput('Hello! world', NOW);
    expect(result.priority).toBe(0);
    expect(result.title).toBe('Hello! world');
  });

  it('resolves relative days', () => {
    expect(dayOf(parseQuickInput('今日 レビュー', NOW).dueAt)).toBe('2026-10-22');
    expect(dayOf(parseQuickInput('明日 レビュー', NOW).dueAt)).toBe('2026-10-23');
    expect(dayOf(parseQuickInput('明後日 レビュー', NOW).dueAt)).toBe('2026-10-24');
    expect(dayOf(parseQuickInput('来週 レビュー', NOW).dueAt)).toBe('2026-10-29');
    expect(dayOf(parseQuickInput('tomorrow review', NOW).dueAt)).toBe('2026-10-23');
  });

  it('prefers 明後日 over 明日 when both substrings match', () => {
    expect(dayOf(parseQuickInput('明後日までに提出', NOW).dueAt)).toBe('2026-10-24');
  });

  it('resolves the next occurrence of a weekday', () => {
    // NOW is a Thursday; 月曜 is the following Monday.
    expect(dayOf(parseQuickInput('月曜 打ち合わせ', NOW).dueAt)).toBe('2026-10-26');
    // The same weekday means next week, never today.
    expect(dayOf(parseQuickInput('木曜 打ち合わせ', NOW).dueAt)).toBe('2026-10-29');
  });

  it('resolves explicit month/day, rolling into next year when past', () => {
    expect(dayOf(parseQuickInput('11/3 歯医者', NOW).dueAt)).toBe('2026-11-03');
    expect(dayOf(parseQuickInput('11月3日 歯医者', NOW).dueAt)).toBe('2026-11-03');
    expect(dayOf(parseQuickInput('1/5 初売り', NOW).dueAt)).toBe('2027-01-05');
  });

  it('applies a time to the resolved day', () => {
    const result = parseQuickInput('明日 17:30 面談', NOW);
    expect(result.dueAt).not.toBeNull();
    const due = new Date(result.dueAt as string);
    expect(due.getDate()).toBe(23);
    expect(due.getHours()).toBe(17);
    expect(due.getMinutes()).toBe(30);
    expect(result.title).toBe('面談');
  });

  it('treats a bare time as today', () => {
    const result = parseQuickInput('9時 朝会', NOW);
    const due = new Date(result.dueAt as string);
    expect(due.getDate()).toBe(22);
    expect(due.getHours()).toBe(9);
  });

  it('parses 18時30分', () => {
    const due = new Date(parseQuickInput('18時30分 退勤', NOW).dueAt as string);
    expect(due.getHours()).toBe(18);
    expect(due.getMinutes()).toBe(30);
  });

  it('combines every modifier at once', () => {
    const result = parseQuickInput('明日 10:00 請求書を送る #work !!', NOW);
    expect(result.title).toBe('請求書を送る');
    expect(result.tags).toEqual(['work']);
    expect(result.priority).toBe(2);
    expect(dayOf(result.dueAt)).toBe('2026-10-23');
    expect(result.hints).toContain('#work');
    expect(result.hints).toContain('緊急');
  });

  it('never returns an empty title', () => {
    expect(parseQuickInput('#onlytag', NOW).title).toBe('#onlytag');
    expect(parseQuickInput('   ', NOW).title).toBe('');
  });

  it('emits an ISO string with an offset, not a bare local time', () => {
    const iso = parseQuickInput('明日', NOW).dueAt as string;
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00[+-]\d{2}:\d{2}$/);
    expect(Number.isNaN(Date.parse(iso))).toBe(false);
  });
});

describe('rebuildInput round-trip', () => {
  it('re-parses to the same task after AI structuring', async () => {
    const { rebuildInput } = await import('../src/components/Composer');
    const structured = {
      title: '歯医者',
      tags: ['health'],
      priority: 1 as const,
      dueAt: new Date(2026, 9, 23, 15, 0).toISOString(),
    };
    const text = rebuildInput(structured);
    const reparsed = parseQuickInput(text, NOW);
    expect(reparsed.title).toBe('歯医者');
    expect(reparsed.tags).toEqual(['health']);
    expect(reparsed.priority).toBe(1);
    const due = new Date(reparsed.dueAt as string);
    expect(due.getMonth()).toBe(9);
    expect(due.getDate()).toBe(23);
    expect(due.getHours()).toBe(15);
  });

  it('omits the time when the due date carries no explicit one', async () => {
    const { rebuildInput } = await import('../src/components/Composer');
    const text = rebuildInput({
      title: '書類',
      tags: [],
      priority: 0,
      dueAt: new Date(2026, 10, 3, 9, 0).toISOString(),
    });
    expect(text).toBe('書類 11/3');
  });
});
