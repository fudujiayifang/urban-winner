import {
  advanceGameClock,
  compareGameClock,
  createGameDate,
  formatGameDateParts,
  formatGameTimeParts,
  overrideGameClockTime,
  parseChineseNumber,
  type GameClockSnapshot,
} from './game-date';

export interface TurnClockDecision {
  clock: GameClockSnapshot;
  kind: 'none' | 'routine' | 'explicit';
  minutesAdvanced: number;
}

const PERIOD_DEFAULTS: Record<string, string> = {
  凌晨: '01:00',
  清晨: '06:00',
  早上: '08:00',
  上午: '09:00',
  中午: '12:00',
  下午: '13:00',
  傍晚: '18:00',
  晚上: '20:00',
  夜里: '21:00',
  深夜: '23:00',
};

const EXPLICIT_TARGET_MARKER_PATTERN = /(到|等到|直到|睡到)/;
const ROUTINE_LONG_ACTION_PATTERN = /(?:前往|赶往|抵达|来到|离开|穿过|进入|返回|回到|转移|跨区|移动|训练|修炼|调查|搜查|搜索|办理|排队|等待|上课|下课|考核|巡查|探索|洗漱|换衣|用餐|吃饭|休息|睡觉)/;

function toWeekdayIndex(token: string): number {
  const weekdayMap: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    日: 7,
    天: 7,
  };

  return weekdayMap[token] ?? 1;
}

function formatClock(value: Date): GameClockSnapshot {
  return {
    date: formatGameDateParts(value.getFullYear(), value.getMonth() + 1, value.getDate()),
    time: formatGameTimeParts(value.getHours(), value.getMinutes()),
  };
}

function addMonthsToClock(clock: GameClockSnapshot, monthsToAdvance: number): GameClockSnapshot {
  const nextDate = createGameDate(clock.date, clock.time);
  const originalDay = nextDate.getDate();
  nextDate.setDate(1);
  nextDate.setMonth(nextDate.getMonth() + monthsToAdvance);
  const daysInTargetMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
  nextDate.setDate(Math.min(originalDay, daysInTargetMonth));
  return formatClock(nextDate);
}

function normalizeNarrativeHour(hour: number, meridiem?: string): number {
  switch (meridiem) {
    case '凌晨':
    case '清晨':
    case '早上':
    case '上午':
      return hour === 12 ? 0 : hour;
    case '中午':
      return hour >= 1 && hour <= 10 ? hour + 12 : hour;
    case '下午':
    case '傍晚':
    case '晚上':
    case '夜里':
      return hour < 12 ? hour + 12 : hour;
    case '深夜':
      if (hour === 12) {
        return 0;
      }
      return hour <= 5 ? hour : hour + 12;
    default:
      return hour;
  }
}

function getLatestIndexedValue<T>(values: Array<{ index: number; value: T }>): { index: number; value: T } | null {
  return values.sort((left, right) => left.index - right.index).at(-1) ?? null;
}

function extractTargetPeriod(text: string): { index: number; value: string } | null {
  const matches = Array.from(text.matchAll(/凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜/g))
    .map(match => ({ index: match.index ?? 0, value: PERIOD_DEFAULTS[match[0]] }))
    .filter((match): match is { index: number; value: string } => match.value != null);

  return getLatestIndexedValue(matches);
}

function extractTargetTime(text: string): { index: number; value: string } | null {
  const matches: Array<{ confidence: number; index: number; hour: number; minute: number }> = [];
  const directTimePattern = /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?\s*([01]?\d|2[0-3])[:：]([0-5]\d)/g;
  const chineseTimePattern = /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?\s*([零〇一二两三四五六七八九十\d]{1,3})\s*(?:点|时)(?:\s*(半|一刻|三刻|([零〇一二两三四五六七八九十\d]{1,3})\s*分?))?/g;

  for (const match of text.matchAll(directTimePattern)) {
    const hour = normalizeNarrativeHour(Number(match[2]), match[1]);
    const minute = Number(match[3]);
    if (hour >= 0 && hour <= 23) {
      matches.push({
        confidence: (match[1] ? 100 : 0) + 20,
        index: match.index ?? 0,
        hour,
        minute,
      });
    }
  }

  for (const match of text.matchAll(chineseTimePattern)) {
    const hourValue = parseChineseNumber(match[2]);
    if (hourValue == null) {
      continue;
    }

    let minute = 0;
    const minuteToken = match[3];
    if (minuteToken === '半') {
      minute = 30;
    } else if (minuteToken === '一刻') {
      minute = 15;
    } else if (minuteToken === '三刻') {
      minute = 45;
    } else if (match[4]) {
      const parsedMinute = parseChineseNumber(match[4]);
      if (parsedMinute == null) {
        continue;
      }
      minute = parsedMinute;
    }

    const hour = normalizeNarrativeHour(hourValue, match[1]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      matches.push({
        confidence: (match[1] ? 100 : 0) + (match[3] ? 10 : 0),
        index: match.index ?? 0,
        hour,
        minute,
      });
    }
  }

  const bestMatch = matches.sort((left, right) => {
    if (left.confidence !== right.confidence) {
      return left.confidence - right.confidence;
    }

    return left.index - right.index;
  }).at(-1);

  return bestMatch
    ? { index: bestMatch.index, value: formatGameTimeParts(bestMatch.hour, bestMatch.minute) }
    : null;
}

function extractRelativeClock(text: string, currentClock: GameClockSnapshot): { index: number; value: GameClockSnapshot } | null {
  const matches: Array<{ index: number; value: GameClockSnapshot }> = [];

  for (const match of text.matchAll(/(次日|第二天|翌日|隔天|明天)/g)) {
    matches.push({
      index: match.index ?? 0,
      value: advanceGameClock(currentClock, { days: 1 }),
    });
  }

  for (const match of text.matchAll(/(?<!大)后天/g)) {
    matches.push({
      index: match.index ?? 0,
      value: advanceGameClock(currentClock, { days: 2 }),
    });
  }

  for (const match of text.matchAll(/大后天/g)) {
    matches.push({
      index: match.index ?? 0,
      value: advanceGameClock(currentClock, { days: 3 }),
    });
  }

  for (const match of text.matchAll(/半(?:个)?月(?:后|以后|之后)|过了半(?:个)?月/g)) {
    matches.push({
      index: match.index ?? 0,
      value: advanceGameClock(currentClock, { days: 15 }),
    });
  }

  for (const match of text.matchAll(/半小时(?:后|以后|之后)|过了半小时/g)) {
    matches.push({
      index: match.index ?? 0,
      value: advanceGameClock(currentClock, { minutes: 30 }),
    });
  }

  for (const match of text.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*分钟(?:后|以后|之后)|过了\s*([零〇一二两三四五六七八九十\d]{1,3})\s*分钟/g)) {
    const value = parseChineseNumber(match[1] ?? match[2] ?? '');
    if (value != null) {
      matches.push({
        index: match.index ?? 0,
        value: advanceGameClock(currentClock, { minutes: value }),
      });
    }
  }

  for (const match of text.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?小时(?:后|以后|之后)|过了\s*([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?小时/g)) {
    const value = parseChineseNumber(match[1] ?? match[2] ?? '');
    if (value != null) {
      matches.push({
        index: match.index ?? 0,
        value: advanceGameClock(currentClock, { minutes: value * 60 }),
      });
    }
  }

  for (const match of text.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:天|日)(?:后|以后|之后)|过了\s*([零〇一二两三四五六七八九十\d]{1,3})\s*(?:天|日)/g)) {
    const value = parseChineseNumber(match[1] ?? match[2] ?? '');
    if (value != null) {
      matches.push({
        index: match.index ?? 0,
        value: advanceGameClock(currentClock, { days: value }),
      });
    }
  }

  for (const match of text.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?周(?:后|以后|之后)|过了\s*([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?周/g)) {
    const value = parseChineseNumber(match[1] ?? match[2] ?? '');
    if (value != null) {
      matches.push({
        index: match.index ?? 0,
        value: advanceGameClock(currentClock, { days: value * 7 }),
      });
    }
  }

  for (const match of text.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?月(?:后|以后|之后)|过了\s*([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?月/g)) {
    const value = parseChineseNumber(match[1] ?? match[2] ?? '');
    if (value != null) {
      matches.push({
        index: match.index ?? 0,
        value: addMonthsToClock(currentClock, value),
      });
    }
  }

  for (const match of text.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*年(?:后|以后|之后)|过了\s*([零〇一二两三四五六七八九十\d]{1,3})\s*年/g)) {
    const value = parseChineseNumber(match[1] ?? match[2] ?? '');
    if (value != null) {
      matches.push({
        index: match.index ?? 0,
        value: addMonthsToClock(currentClock, value * 12),
      });
    }
  }

  for (const match of text.matchAll(/下周\s*([一二三四五六日天])/g)) {
    const currentDate = createGameDate(currentClock.date);
    const currentIsoWeekday = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
    const targetIsoWeekday = toWeekdayIndex(match[1]);
    const daysToAdvance = 7 - currentIsoWeekday + targetIsoWeekday;
    matches.push({
      index: match.index ?? 0,
      value: advanceGameClock(currentClock, { days: daysToAdvance <= 0 ? daysToAdvance + 7 : daysToAdvance }),
    });
  }

  return getLatestIndexedValue(matches);
}

function resolveForwardTargetClock(currentClock: GameClockSnapshot, targetTime: string): GameClockSnapshot {
  const sameDayClock = overrideGameClockTime(currentClock, targetTime);
  if (compareGameClock(sameDayClock, currentClock) > 0) {
    return sameDayClock;
  }

  return overrideGameClockTime(advanceGameClock(currentClock, { days: 1 }), targetTime);
}

function resolveExplicitSkipClock(playerInput: string, currentClock: GameClockSnapshot): GameClockSnapshot | null {
  const relativeClock = extractRelativeClock(playerInput, currentClock);
  const targetTime = extractTargetTime(playerInput);
  const targetPeriod = extractTargetPeriod(playerInput);
  const explicitTargetOnly = EXPLICIT_TARGET_MARKER_PATTERN.test(playerInput);

  if (relativeClock) {
    if (targetTime && targetTime.index >= relativeClock.index) {
      return overrideGameClockTime(relativeClock.value, targetTime.value);
    }

    if (targetPeriod && targetPeriod.index >= relativeClock.index) {
      return overrideGameClockTime(relativeClock.value, targetPeriod.value);
    }

    return relativeClock.value;
  }

  if (!explicitTargetOnly) {
    return null;
  }

  if (targetTime) {
    return resolveForwardTargetClock(currentClock, targetTime.value);
  }

  if (targetPeriod) {
    return resolveForwardTargetClock(currentClock, targetPeriod.value);
  }

  return null;
}

function resolveRoutineAdvanceMinutes(playerInput: string): number {
  return ROUTINE_LONG_ACTION_PATTERN.test(playerInput) ? 15 : 10;
}

export function resolveTurnClock(options: {
  currentClock: GameClockSnapshot;
  playerInput: string;
  hasNarrative: boolean;
}): TurnClockDecision {
  const { currentClock, playerInput, hasNarrative } = options;
  if (!hasNarrative) {
    return {
      clock: currentClock,
      kind: 'none',
      minutesAdvanced: 0,
    };
  }

  const explicitClock = resolveExplicitSkipClock(playerInput, currentClock);
  if (explicitClock && compareGameClock(explicitClock, currentClock) > 0) {
    return {
      clock: explicitClock,
      kind: 'explicit',
      minutesAdvanced: Math.max(0, Math.round((createGameDate(explicitClock.date, explicitClock.time).getTime() - createGameDate(currentClock.date, currentClock.time).getTime()) / 60000)),
    };
  }

  const minutesAdvanced = resolveRoutineAdvanceMinutes(playerInput);
  return {
    clock: advanceGameClock(currentClock, { minutes: minutesAdvanced }),
    kind: 'routine',
    minutesAdvanced,
  };
}
