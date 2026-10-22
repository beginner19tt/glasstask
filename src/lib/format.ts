const DAY = 86_400_000;

/** Short, glanceable due label. Returns null when there is no due date. */
export function dueLabel(iso: string | null, now = new Date()): string | null {
  if (!iso) return null;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return null;

  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dueMidnight = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const days = Math.round((dueMidnight - midnight) / DAY);

  const time = `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  const hasTime = due.getHours() !== 9 || due.getMinutes() !== 0;

  if (days === 0) return hasTime ? `今日 ${time}` : '今日';
  if (days === 1) return hasTime ? `明日 ${time}` : '明日';
  if (days === -1) return '昨日';
  if (days > 1 && days < 7) return `${days}日後`;
  if (days < -1) return `${Math.abs(days)}日前`;
  return `${due.getMonth() + 1}/${due.getDate()}`;
}

export function isOverdue(iso: string | null, now = new Date()): boolean {
  if (!iso) return false;
  const due = new Date(iso);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}
