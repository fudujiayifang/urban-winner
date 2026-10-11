import {
  advanceGameClock,
  formatGameDateParts,
  parseChineseNumber,
  parseGameDateParts,
  type GameClockSnapshot,
} from './game-date';
import type { CourseScheduleEntry } from '../schema';

const COURSE_TRIGGER_PATTERN = /(?:上课|课程|课堂|第[一二三四五六七八九十\d]+节|(?:上午|下午|晚上)\s*[一二三四五六七八九十\d]*节)/;
const COURSE_SENTENCE_PATTERN = /[^。！？\n]{1,220}(?=[。！？\n]|$)/g;
const COURSE_NAME_PATTERNS = [
  /(?:上|去上|参加|开始上|正在上|安排(?:了)?|选修)\s*([^，。；;：:\n]{1,24}?)(?:课程|课|课堂)/,
  /([^，。；;：:\n]{1,24}?)(?:课程|课)(?=[，。；;：:\n]|在|于|是|开始|进行)/,
] as const;
const EXCLUDED_COURSE_NAMES = new Set(['有', '去', '开始', '正在', '安排', '课程表', '下一节', '这节', '那节']);

function cleanInlineText(value: string, maxLength = 160): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function parseRelativeDate(text: string, currentDate: string): string {
  const current = { date: currentDate, time: '00:00' } satisfies GameClockSnapshot;
  const explicitDate = text.match(/(?:(\d{4})[./-])?(\d{1,2})月(\d{1,2})日/);
  if (explicitDate) {
    const currentParts = parseGameDateParts(currentDate);
    return formatGameDateParts(
      Number(explicitDate[1] ?? currentParts.year),
      Number(explicitDate[2]),
      Number(explicitDate[3]),
    );
  }

  if (/后天/.test(text)) return advanceGameClock(current, { days: 2 }).date;
  if (/明天/.test(text)) return advanceGameClock(current, { days: 1 }).date;
  if (/昨天/.test(text)) return advanceGameClock(current, { days: -1 }).date;

  const weekdayMatch = text.match(/(下周|本周|这周|周|星期)([一二三四五六日天七1-7])/);
  if (weekdayMatch) {
    const weekdayValue = weekdayMatch[2] === '日' || weekdayMatch[2] === '天'
      ? 0
      : parseChineseNumber(weekdayMatch[2]) ?? Number(weekdayMatch[2]) % 7;
    const currentWeekday = new Date(Date.UTC(
      parseGameDateParts(currentDate).year,
      parseGameDateParts(currentDate).month - 1,
      parseGameDateParts(currentDate).day,
    )).getUTCDay();
    const isNextWeek = weekdayMatch[1] === '下周';
    let days = (weekdayValue - currentWeekday + 7) % 7;
    if (isNextWeek || days === 0) days += 7;
    return advanceGameClock(current, { days }).date;
  }

  return currentDate;
}

function parseCourseTime(text: string): { time: string; lesson: string } {
  const lessonMatch = text.match(/第\s*([一二三四五六七八九十\d]+)\s*节/);
  const lesson = lessonMatch ? `第${lessonMatch[1]}节` : '';
  const clockMatch = text.match(/(?:上午|下午|晚上)?\s*(\d{1,2})[:：](\d{2})/);
  if (clockMatch) {
    let hour = Number(clockMatch[1]);
    if (/下午|晚上/.test(text) && hour < 12) hour += 12;
    return { time: `${String(hour).padStart(2, '0')}:${clockMatch[2]}`, lesson };
  }

  const chineseHourMatch = text.match(/(上午|下午|晚上)\s*([一二三四五六七八九十\d]+)点/);
  if (chineseHourMatch) {
    let hour = parseChineseNumber(chineseHourMatch[2]) ?? Number(chineseHourMatch[2]);
    if (/下午|晚上/.test(chineseHourMatch[1]) && hour < 12) hour += 12;
    return { time: `${String(hour).padStart(2, '0')}:00`, lesson };
  }

  return { time: '', lesson };
}

function parseCourseLocation(text: string): string {
  const locationMatch = text.match(/(?:地点(?:是|为)?|(?:在|前往|去往|位于))\s*([^，。；;：:\n]{1,32})/);
  if (!locationMatch) return '';
  return cleanInlineText(locationMatch[1]).replace(/(?:上课|听课|集合|开始).*$/u, '').trim();
}

function parseCourseName(text: string): string | null {
  for (const pattern of COURSE_NAME_PATTERNS) {
    const match = text.match(pattern);
    const name = cleanInlineText(match?.[1] ?? '', 40).replace(/^[的这那一节次]+|[的这那一节次]+$/g, '');
    if (name && !EXCLUDED_COURSE_NAMES.has(name) && !/(课程表|下一节课|有课)/.test(name)) {
      return name;
    }
  }
  return null;
}

function makeEntryId(sourceFloorId: string, index: number, entry: Omit<CourseScheduleEntry, 'id'>): string {
  const source = `${sourceFloorId}|${index}|${entry.课程}|${entry.日期}|${entry.时间}|${entry.地点}`;
  let hash = 0;
  for (const char of source) {
    hash = ((hash << 5) - hash + char.codePointAt(0)!) >>> 0;
  }
  return `course-${hash.toString(36)}`;
}

function buildEntry(text: string, currentDate: string, sourceFloorId: string, index: number): CourseScheduleEntry | null {
  if (!COURSE_TRIGGER_PATTERN.test(text) || /课程表(?:中|里|上)?(?:显示|记录)/.test(text)) {
    return null;
  }

  const courseName = parseCourseName(text);
  if (!courseName) return null;

  const date = parseRelativeDate(text, currentDate);
  const { time, lesson } = parseCourseTime(text);
  const location = parseCourseLocation(text);
  const isActive = /正在|开始|进行中/.test(text);
  const complete = Boolean(time || lesson) && Boolean(location);
  const entry: Omit<CourseScheduleEntry, 'id'> = {
    课程: courseName,
    日期: date,
    时间: time,
    节次: lesson,
    地点: location,
    状态: isActive ? '进行中' : complete ? '已安排' : '待确认',
    类型: '单次',
    来源楼层: sourceFloorId,
    原文摘要: cleanInlineText(text),
  };

  return { id: makeEntryId(sourceFloorId, index, entry), ...entry };
}

export function extractCourseScheduleEntries(
  maintext: string,
  currentDate: string,
  sourceFloorId: string,
): CourseScheduleEntry[] {
  const entries: CourseScheduleEntry[] = [];
  for (const [index, match] of Array.from(maintext.matchAll(COURSE_SENTENCE_PATTERN)).entries()) {
    const entry = buildEntry(cleanInlineText(match[0]), currentDate, sourceFloorId, index);
    if (entry) entries.push(entry);
  }
  return entries;
}

export function buildCourseSchedulePatch(
  maintext: string,
  currentDate: string,
  sourceFloorId: string,
  existingEntries: CourseScheduleEntry[],
): CourseScheduleEntry[] | null {
  const nextEntries = extractCourseScheduleEntries(maintext, currentDate, sourceFloorId);
  const additions = nextEntries.filter(entry => !existingEntries.some(existing =>
    existing.id === entry.id
      || (existing.来源楼层 === entry.来源楼层
        && existing.课程 === entry.课程
        && existing.日期 === entry.日期
        && existing.时间 === entry.时间
        && existing.地点 === entry.地点),
  ));

  return additions.length ? [...existingEntries, ...additions] : null;
}

export function getNextWeeklyCourseDate(date: string, time = '00:00'): string {
  return advanceGameClock({ date, time }, { days: 7 }).date;
}
