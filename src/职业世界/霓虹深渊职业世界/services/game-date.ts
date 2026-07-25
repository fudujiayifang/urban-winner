export interface GameDateParts {
  year: number;
  month: number;
  day: number;
}

export interface GameTimeParts {
  hour: number;
  minute: number;
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
