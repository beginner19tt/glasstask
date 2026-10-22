/**
 * Zero-latency inline parser for the composer.
 *
 * The point of the app is that typing is never blocked, so the composer never
 * waits on the network: this runs synchronously on every keystroke and gives
 * tags / priority / due date straight away. Workers AI refines the same fields
 * afterwards (see worker/ai.ts) and only ever *adds* to what this found.
 */

import type { Priority } from './task';

export interface ParsedInput {
  title: string;
  tags: string[];
  priority: Priority;
  dueAt: string | null;
  /** Human-readable chips the composer renders as it parses. */
  hints: string[];
}

const WEEKDAYS: Record<string, number> = {
  日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6,
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/** Date-only input lands at 09:00 local — a due *day*, not a due midnight. */
const DEFAULT_HOUR = 9;

function startOfDay(base: Date, dayOffset = 0): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset, DEFAULT_HOUR, 0, 0, 0);
  return d;
}

function toLocalISO(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:00` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

export function parseQuickInput(raw: string, now: Date = new Date()): ParsedInput {
  let text = raw;
  const hints: string[] = [];

  // --- tags -----------------------------------------------------------------
  const tags: string[] = [];
  text = text.replace(/(?:^|\s)[#＃]([^\s#＃]+)/g, (_m, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
    return ' ';
  });
  if (tags.length) hints.push(...tags.map((t) => `#${t}`));

  // --- priority -------------------------------------------------------------
  // Only a trailing bang or a standalone bang token counts, so "Hello! world"
  // stays a normal memo.
  let priority: Priority = 0;
  const trailing = text.match(/([!！]{1,2})\s*$/);
  const standalone = trailing ? null : text.match(/(?:^|\s)([!！]{1,2})(?=\s)/);
  const bang = trailing ?? standalone;
  if (bang && bang.index !== undefined) {
    priority = bang[1].length >= 2 ? 2 : 1;
    text = `${text.slice(0, bang.index)} ${text.slice(bang.index + bang[0].length)}`;
    hints.push(priority === 2 ? '緊急' : '重要');
  }

  // --- date -----------------------------------------------------------------
  let due: Date | null = null;

  const relative: Array<[RegExp, number, string]> = [
    [/今日|きょう|\btoday\b/i, 0, '今日'],
    [/明後日|あさって/, 2, '明後日'],
    [/明日|あした|あす|\btomorrow\b/i, 1, '明日'],
    [/来週|\bnext week\b/i, 7, '来週'],
  ];
  for (const [re, offset, hint] of relative) {
    const m = text.match(re);
    if (m) {
      due = startOfDay(now, offset);
      text = text.replace(re, ' ');
      hints.push(hint);
      break;
    }
  }

  if (!due) {
    const wd = text.match(/([日月火水木金土])曜(?:日)?|\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i);
    if (wd) {
      const key = (wd[1] ?? wd[2]?.toLowerCase()) as string;
      const target = WEEKDAYS[key];
      if (target !== undefined) {
        const delta = (target - now.getDay() + 7) % 7 || 7;
        due = startOfDay(now, delta);
        text = text.replace(wd[0], ' ');
        hints.push(wd[0]);
      }
    }
  }

  if (!due) {
    const md = text.match(/(\d{1,2})\s*[\/月]\s*(\d{1,2})\s*日?/);
    if (md) {
      const month = Number(md[1]);
      const day = Number(md[2]);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        let year = now.getFullYear();
        let candidate = new Date(year, month - 1, day, DEFAULT_HOUR, 0, 0, 0);
        if (candidate.getTime() < startOfDay(now).getTime()) {
          year += 1;
          candidate = new Date(year, month - 1, day, DEFAULT_HOUR, 0, 0, 0);
        }
        due = candidate;
        text = text.replace(md[0], ' ');
        hints.push(`${month}/${day}`);
      }
    }
  }

  // --- time (may stand alone: implies today) --------------------------------
  const time = text.match(/(\d{1,2})\s*(?::|時)\s*(\d{1,2})?\s*分?/);
  if (time) {
    const hour = Number(time[1]);
    const minute = time[2] ? Number(time[2]) : 0;
    if (hour <= 23 && minute <= 59) {
      const base = due ?? startOfDay(now);
      base.setHours(hour, minute, 0, 0);
      due = base;
      text = text.replace(time[0], ' ');
      hints.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    }
  }

  const title = text.replace(/\s+/g, ' ').trim();

  return {
    title: title || raw.trim(),
    tags,
    priority,
    dueAt: due ? toLocalISO(due) : null,
    hints,
  };
}
