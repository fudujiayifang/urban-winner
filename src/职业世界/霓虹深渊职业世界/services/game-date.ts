export interface GameDateParts {
  year: number;
  month: number;
  day: number;
}

export interface GameTimeParts {
  hour: number;
  minute: number;
}

export interface GameClockSnapshot {
  date: string;
  time: string;
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export function parseGameDateParts(dateText: string): GameDateParts {
  const [year = '2778', month = '1', day = '1'] = dateText.split(/[.\-/]/);
  return {
    year: Number(year) || 2778,
    month: Number(month) || 1,
    day: Number(day) || 1,
  };
}

export function parseGameTimeParts(timeText: string): GameTimeParts {
  const [hour = '0', minute = '0'] = timeText.split(':');
  return {
    hour: Math.min(Math.max(Number(hour) || 0, 0), 23),
    minute: Math.min(Math.max(Number(minute) || 0, 0), 59),
  };
}

export function formatGameDateParts(year: number, month: number, day: number): string {
  return [year, month, day].map(value => String(value).padStart(2, '0')).join('.');
}

export function formatGameTimeParts(hour: number, minute: number): string {
  return [hour, minute].map(value => String(value).padStart(2, '0')).join(':');
}

export function createGameDate(dateText: string, timeText = '00:00'): Date {
  const { year, month, day } = parseGameDateParts(dateText);
  const { hour, minute } = parseGameTimeParts(timeText);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

export function formatDisplayDate(dateText: string): string {
  const { year, month, day } = parseGameDateParts(dateText);
  return `${year}年${month}月${day}日`;
}

export function getWeekdayLabel(dateText: string): string {
  return WEEKDAY_LABELS[createGameDate(dateText).getDay()] ?? WEEKDAY_LABELS[0];
}

export function formatDisplayDateWithWeekday(dateText: string): string {
  return `${formatDisplayDate(dateText)} ${getWeekdayLabel(dateText)}`;
}

export function parseChineseNumber(value: string): number | null {
  const normalized = value.trim().replaceAll('两', '二').replaceAll('〇', '零');
  if (!normalized) {
    return null;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };

  if (normalized === '十') {
    return 10;
  }

  if (normalized.includes('十')) {
    const [tensText, onesText = ''] = normalized.split('十');
    const tens = tensText ? digitMap[tensText] : 1;
    const ones = onesText ? digitMap[onesText] : 0;
    if (tens == null || (onesText && ones == null)) {
      return null;
    }

    return tens * 10 + ones;
  }

  return digitMap[normalized] ?? null;
}

export function compareGameClock(left: GameClockSnapshot, right: GameClockSnapshot): number {
  return createGameDate(left.date, left.time).getTime() - createGameDate(right.date, right.time).getTime();
}

function formatGameClockSnapshot(value: Date): GameClockSnapshot {
  return {
    date: formatGameDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate()),
    time: formatGameTimeParts(value.getHours(), value.getMinutes()),
  };
}

export function advanceGameClock(
  clock: GameClockSnapshot,
  options: { days?: number; minutes?: number },
): GameClockSnapshot {
  const nextClock = createGameDate(clock.date, clock.time);
  if (options.days) {
    nextClock.setDate(nextClock.getDate() + options.days);
  }
  if (options.minutes) {
    nextClock.setMinutes(nextClock.getMinutes() + options.minutes);
  }

  return formatGameClockSnapshot(nextClock);
}

export function overrideGameClockTime(clock: GameClockSnapshot, timeText: string): GameClockSnapshot {
  const nextClock = createGameDate(clock.date, clock.time);
  const { hour, minute } = parseGameTimeParts(timeText);
  nextClock.setHours(hour, minute, 0, 0);
  return formatGameClockSnapshot(nextClock);
}
