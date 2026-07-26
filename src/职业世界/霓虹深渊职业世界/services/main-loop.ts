import _ from 'lodash';

import { buildSystemPrompt } from './prompt';
import {
  advanceGameClock,
  compareGameClock,
  createGameDate,
  formatGameDateParts,
  formatGameTimeParts,
  overrideGameClockTime,
  parseChineseNumber,
  parseGameDateParts,
  type GameClockSnapshot,
} from './game-date';
import { narrativeBlocksFromText, parseModelResponse, parseVars } from './response-parser';
import { createStreamingResponseParser } from './stream-response-parser';
import { syncSocialStateBestEffort } from './social-sync';
import { recordAiSyncError, recordAiSyncSuccess, updateAiSyncAvailability } from './ai-sync-status';
import { createAiSyncRawGenerator } from './ai-sync-client';
import { getRedactedAiSyncSummary, loadAiSyncConfig } from './ai-sync-config';
import { collectSystemStateSyncPatchFields, syncSystemStateBestEffort } from './system-state-sync';
import { collectWorldbookContext } from './worldbook';
import type { NarrativeBlock } from '../adapters/runtime';
import type { QuestState, RewardItem, ShopCategory } from '../schema';
import { useGameStore } from '../store/game';
import { useSessionStore } from '../store/session';

const RECENT_HISTORY_LIMIT = 12;
const MAX_SUMMARY_CONTEXT_CHARS = 12_000;
const COMPLETED_QUEST_PATTERN = /任务[：:「『“\s]*(.+?)[」』”'，,、\s]*(?:，|,|\s)*状态(?:更新)?[：:：\s]*已完成/g;
const QUEST_STATUS_PATTERN = /任务[：:「『“\s]*(.+?)[」』”'，,、\s]*(?:，|,|\s)*状态(?:更新)?[：:：\s]*(新|待定|进行中|已完成)/g;
const NEW_QUEST_PATTERNS = [
  /(?:新任务|获得任务|接取任务|接到任务|新增任务|解锁任务|任务发布|任务已发布|任务解锁|发布任务|派发任务|零七任务)[：:「『“【\s]*([^\n，。；;]+?)(?:[」』”】]|(?=[，。；;\n]))/g,
  /(?:【零七系统】|【零七】|零七(?:系统)?)[^。！？\n]{0,40}(?:发布|派发|生成|检测到|扫描到|解锁|开启)[^。！？\n]{0,16}(?:新)?(?:任务|委托)[：:「『“【\s]*([^\n，。；;]+?)(?:[」』”】]|(?=[，。；;\n]))/g,
  /任务[：:「『“【\s]*([^\n，。；;]+?)(?:[」』”】])?\s*(?:已发布|已解锁|已接取|已开启|发布成功|生成成功)/g,
] as const;
const QUEST_BLOCK_HEADER_PATTERN = /(?:【零七系统】|【零七】|零七(?:系统)?)[^。！？\n]{0,20}(?:新任务|任务发布|发布任务|生成任务|检测到任务|扫描到任务|任务已发布|零七任务)[：:：]?|(?:新任务|任务发布|发布任务|生成任务|任务已发布|零七任务)[：:：]?/g;
const REWARD_ITEM_PATTERN = /(?:获得|恭喜你获得)[：:：\s]*([^。】\n]+?)[x×]\s*(\d+)/g;
const QUEST_REWARD_ITEM_PATTERN = /(?:物品奖励|固定奖励|奖励物品|奖励)[：:：\s]*([^。；;，,、\n]+?)(?:[x×*]\s*(\d+))?(?=$|[。；;，,、\n])/g;
const QUEST_NAME_FIELD_PATTERN = /(?:任务(?:名称|名)?|名称|标题)[：:：\s「『“【]*([^\n，。；;」』”】]+)/;
const QUEST_TYPE_FIELD_PATTERN = /(?:类型|任务类型)[：:：\s]*([^\n，。；;]+)/;
const QUEST_DESCRIPTION_FIELD_PATTERN = /(?:描述|任务描述|目标|任务目标|内容|任务内容)[：:：\s]*([^\n。；;]+)/;
const QUEST_LOCATION_FIELD_PATTERN = /(?:地点|任务地点|位置|发生地点)[：:：\s]*([^\n，。；;]+)/;
const QUEST_POINT_REWARD_PATTERN = /(?:(系统|学府)?积分奖励|奖励积分|积分)[：:：\s]*(系统|学府)?\s*(\d+)|奖励[：:：\s]*(系统|学府)?积分\s*[+＋]?\s*(\d+)/;
const QUEST_REWARD_POOL_PATTERN = /(?:奖励池|随机奖励池|抽取奖励池)[：:：\s]*(日常|修炼|情趣)(?:\s*[x×*]\s*(\d+))?|(?:日常|修炼|情趣)\s*(?:奖励池)?\s*[x×*]\s*(\d+)/;
const LONG_ACTION_PATTERN = /(?:忙了(?:一阵|半天|许久|很久)|课程结束|训练结束|调查了?一段时间|折腾了?一阵|处理(?:完|了一阵)|办理(?:完|了一阵)|等待(?:了)?(?:一阵|许久|很久)|休息(?:了)?(?:一阵|许久|很久))/;
const MAJOR_ACTION_PATTERN = /(?:前往|赶往|抵达|来到|离开|穿过|进入|返回|回到|转移|跨区|移动|训练|修炼|调查|搜查|搜索|办理|排队|等待|上课|下课|考核|巡查|探索|洗漱|换衣|用餐|吃饭)/;
const BRIEF_ACTION_PATTERN = /(?:点头|摇头|微笑|看了?一眼|问道|说道|回答|开口|低声|轻声|递给|接过|握住|松开|坐下|起身)/;

let activeGenerationToken = 0;

function startGenerationToken(): number {
  activeGenerationToken += 1;
  return activeGenerationToken;
}

function invalidateActiveGeneration(): void {
  activeGenerationToken += 1;
}

function isGenerationTokenActive(token: number): boolean {
  return activeGenerationToken === token;
}

function makeTurnId(): string {
  return `turn-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function stripQuestName(value: string): string {
  return value.replace(/^[\s\-—–「『“'【[]+|[\s\-—–」』”'】]]+$/g, '').trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectCompletedQuestNames(maintext: string, gameStore: ReturnType<typeof useGameStore>): string[] {
  const completedNames = new Set<string>();
  const activeQuestNames = Object.keys(gameStore.data.零七系统.任务列表);
  const knownQuestNames = _.uniq([
    ...activeQuestNames,
    ...Object.keys(gameStore.data.零七系统.已完成任务列表),
  ]);

  for (const questName of knownQuestNames) {
    const safeQuestName = escapeRegex(questName);
    const patterns = [
      new RegExp(`任务[：:「『“\\s]*${safeQuestName}[」』”'】]?\\s*(?:已完成|完成)(?:了)?`, 'g'),
      new RegExp(`${safeQuestName}[」』”'】]?\\s*(?:任务)?\\s*(?:已完成|完成)(?:了)?`, 'g'),
      new RegExp(`(?:已完成|完成)(?:了)?(?:任务)?[：:「『“\\s]*${safeQuestName}[」』”'】]?`, 'g'),
      new RegExp(`(?:零七|系统)[^。！？\\n]{0,80}(?:报告|扫描|检测|判定|提示|汇报)[^。！？\\n]{0,80}${safeQuestName}[^。！？\\n]{0,80}(?:已完成|完成|达成|结算|已到账)`, 'g'),
      new RegExp(`(?:扫描到|检测到|判定|报告)[^。！？\\n]{0,80}(?:任务|委托)?[：:「『“\\s]*${safeQuestName}[」』”'】]?[^。！？\\n]{0,80}(?:已完成|完成|达成)`, 'g'),
      new RegExp(`任务完成[：:：\\s]*[「『“]?${safeQuestName}[」』”]?`, 'g'),
      new RegExp(`${safeQuestName}[^。！？\\n]{0,40}任务(?:已)?完成[^。！？\\n]{0,40}(?:奖励|结算|到账)?`, 'g'),
    ];

    if (patterns.some(pattern => pattern.test(maintext))) {
      completedNames.add(questName);
    }
  }

  if (completedNames.size === 0 && activeQuestNames.length === 1 && /(?:零七|系统)[^。！？\n]{0,80}(?:报告|扫描|检测|判定|提示|汇报)[^。！？\n]{0,80}任务[^。！？\n]{0,80}(?:已完成|完成|达成|结算|已到账)|任务完成[：:：]?/.test(maintext)) {
    completedNames.add(activeQuestNames[0]);
  }

  return Array.from(completedNames);
}

function detectNarrativeNewQuestNames(maintext: string): string[] {
  const questNames = new Set<string>();

  for (const pattern of NEW_QUEST_PATTERNS) {
    for (const match of maintext.matchAll(pattern)) {
      const questName = stripQuestName(match[1] ?? '');
      if (questName && questName.length <= 64 && !/(类型|描述|地点|奖励|状态|名称)$/.test(questName)) {
        questNames.add(questName);
      }
    }
  }

  for (const block of extractNarrativeQuestBlocks(maintext)) {
    questNames.add(block.name);
  }

  return Array.from(questNames);
}

function normalizeQuestCategory(type: string | undefined, maintext: string, questName: string): string {
  const normalized = type?.trim();
  if (normalized) {
    if (normalized === '主线') return '历程';
    if (normalized === '支线') return '探索';
    if (normalized === '社交') return '攻略';
    return normalized;
  }

  return inferQuestCategory(maintext, questName);
}

interface NarrativeQuestBlock {
  name: string;
  type?: string;
  description?: string;
  location?: string;
  pointReward?: number;
  pointType?: QuestState['积分奖励类型'];
  rewardPool?: ShopCategory;
  rewardPoolDrawCount?: number;
  itemRewards?: RewardItem[];
  status?: QuestState['状态'];
}

function matchText(pattern: RegExp, text: string): string | undefined {
  return pattern.exec(text)?.[1]?.trim() || undefined;
}

function extractNarrativeQuestBlocks(maintext: string): NarrativeQuestBlock[] {
  const blocks: NarrativeQuestBlock[] = [];
  const headers = Array.from(maintext.matchAll(QUEST_BLOCK_HEADER_PATTERN));

  for (let index = 0; index < headers.length; index += 1) {
    const start = (headers[index].index ?? 0) + headers[index][0].length;
    const end = headers[index + 1]?.index ?? maintext.length;
    const rawBlock = maintext.slice(start, end).trim();
    if (!rawBlock) continue;

    const firstLine = rawBlock.split(/\r?\n/)[0] ?? '';
    const implicitName = stripQuestName(firstLine.split(/[，。；;]/)[0] ?? '');
    const name = matchText(QUEST_NAME_FIELD_PATTERN, rawBlock) ?? implicitName;
    if (!name || name.length > 64 || /^(类型|描述|地点|奖励|状态|名称)$/.test(name)) continue;

    const pointMatch = QUEST_POINT_REWARD_PATTERN.exec(rawBlock);
    const poolMatch = QUEST_REWARD_POOL_PATTERN.exec(rawBlock);
    const itemRewards: RewardItem[] = Array.from(rawBlock.matchAll(QUEST_REWARD_ITEM_PATTERN))
      .map<RewardItem | null>(match => {
        const itemName = match[1]?.trim();
        const amount = Number(match[2] ?? 1);
        if (!itemName || !Number.isInteger(amount) || amount <= 0 || /(?:积分|奖励池|无)/.test(itemName)) return null;
        return {
          名称: itemName.slice(0, 48),
          数量: amount,
          描述: `任务奖励：${itemName}`,
          图标: 'gift',
          品质: 'R',
        };
      })
      .filter((item): item is RewardItem => item != null);

    blocks.push({
      name,
      type: matchText(QUEST_TYPE_FIELD_PATTERN, rawBlock),
      description: matchText(QUEST_DESCRIPTION_FIELD_PATTERN, rawBlock),
      location: matchText(QUEST_LOCATION_FIELD_PATTERN, rawBlock),
      pointReward: pointMatch ? Number(pointMatch[3] ?? pointMatch[5]) : undefined,
      pointType: (pointMatch?.[1] ?? pointMatch?.[2] ?? pointMatch?.[4]) as QuestState['积分奖励类型'] | undefined,
      rewardPool: (poolMatch?.[1] ?? (poolMatch?.[0].match(/日常|修炼|情趣/)?.[0])) as ShopCategory | undefined,
      rewardPoolDrawCount: Number(poolMatch?.[2] ?? poolMatch?.[3] ?? 1),
      itemRewards: itemRewards.length ? itemRewards : undefined,
      status: /(?:已完成|完成)/.test(rawBlock) ? '已完成' : /(?:进行中|待定|新)/.exec(rawBlock)?.[0] as QuestState['状态'] | undefined,
    });
  }

  return blocks;
}

function inferQuestCategory(maintext: string, questName: string): string {
  const contextPattern = new RegExp(`[^。！？\n]*${escapeRegex(questName)}[^。！？\n]*`, 'g');
  const context = maintext.match(contextPattern)?.[0] ?? questName;

  if (/(邀约|好感|约会|关系|告白|暧昧)/.test(context)) {
    return '攻略';
  }
  if (/(报到|入学|主线|推进|章节|剧情)/.test(context)) {
    return '历程';
  }
  if (/(探索|调查|搜寻|巡查|查看)/.test(context)) {
    return '探索';
  }
  if (/(训练|修炼|考核|课程|练习)/.test(context)) {
    return '修炼';
  }
  if (/(委托|帮忙|跑腿|处理)/.test(context)) {
    return '委托';
  }
  if (/(签到|日常|每日)/.test(context)) {
    return '日常';
  }

  return '其他';
}

function buildNewQuestEntry(
  questName: string,
  maintext: string,
  gameStore: ReturnType<typeof useGameStore>,
  block?: NarrativeQuestBlock,
): Record<string, unknown> {
  return {
    类型: normalizeQuestCategory(block?.type, maintext, questName),
    状态: block?.status ?? '新',
    描述: block?.description ?? `正文触发的新任务：${questName}`,
    地点: block?.location ?? gameStore.data.零七系统.当前地点,
    ...(block?.pointReward != null && Number.isFinite(block.pointReward) ? { 积分奖励: Math.max(0, Math.trunc(block.pointReward)) } : {}),
    ...(block?.pointType === '系统' || block?.pointType === '学府' ? { 积分奖励类型: block.pointType } : {}),
    ...(block?.rewardPool ? { 奖励池: block.rewardPool, 奖励池抽取数: block.rewardPoolDrawCount ?? 1 } : {}),
    ...(block?.itemRewards ? { 物品奖励: block.itemRewards } : {}),
  };
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

function formatNarrativeTime(hour: number, minute: number): string {
  return formatGameTimeParts(hour, minute);
}

function getLatestIndexedValue<T>(values: Array<{ index: number; value: T }>): { index: number; value: T } | null {
  return values.sort((left, right) => left.index - right.index).at(-1) ?? null;
}

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

function extractExplicitNarrativeDate(maintext: string, currentDateText: string): { index: number; value: string } | null {
  const currentDate = parseGameDateParts(currentDateText);
  const matches: Array<{ index: number; value: string }> = [];
  const explicitDatePatterns = [
    /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g,
    /(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})(?!\d)/g,
  ];

  for (const pattern of explicitDatePatterns) {
    for (const match of maintext.matchAll(pattern)) {
      const parsedYear = Number(match[1]);
      const year = Number.isFinite(parsedYear) && parsedYear > 0 ? parsedYear : currentDate.year;
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (!Number.isFinite(month) || !Number.isFinite(day) || month < 1 || month > 12 || day < 1 || day > 31) {
        continue;
      }

      const candidate = new Date(year, month - 1, day, 0, 0, 0, 0);
      if (
        candidate.getFullYear() !== year
        || candidate.getMonth() !== month - 1
        || candidate.getDate() !== day
      ) {
        continue;
      }

      matches.push({
        index: match.index ?? 0,
        value: formatGameDateParts(year, month, day),
      });
    }
  }

  return getLatestIndexedValue(matches);
}

function extractRelativeNarrativeDays(maintext: string, currentDateText: string): { index: number; value: number } | null {
  const matches: Array<{ index: number; value: number }> = [];

  for (const match of maintext.matchAll(/(次日|第二天|翌日|隔天|明天)/g)) {
    matches.push({ index: match.index ?? 0, value: 1 });
  }
  for (const match of maintext.matchAll(/(?<!大)后天/g)) {
    matches.push({ index: match.index ?? 0, value: 2 });
  }
  for (const match of maintext.matchAll(/大后天/g)) {
    matches.push({ index: match.index ?? 0, value: 3 });
  }
  for (const match of maintext.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:天|日)后/g)) {
    const value = parseChineseNumber(match[1]);
    if (value != null) {
      matches.push({ index: match.index ?? 0, value });
    }
  }
  for (const match of maintext.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?周后/g)) {
    const value = parseChineseNumber(match[1]);
    if (value != null) {
      matches.push({ index: match.index ?? 0, value: value * 7 });
    }
  }
  for (const match of maintext.matchAll(/(?:下周|次周)\s*([一二三四五六日天])/g)) {
    const currentDate = createGameDate(currentDateText);
    const currentIsoWeekday = currentDate.getDay() === 0 ? 7 : currentDate.getDay();
    const targetIsoWeekday = toWeekdayIndex(match[1]);
    const value = 7 - currentIsoWeekday + targetIsoWeekday;
    matches.push({ index: match.index ?? 0, value: value <= 0 ? value + 7 : value });
  }

  return getLatestIndexedValue(matches);
}

function extractNarrativeDurationMinutes(maintext: string): { index: number; value: number } | null {
  const matches: Array<{ index: number; value: number }> = [];

  for (const match of maintext.matchAll(/半小时后/g)) {
    matches.push({ index: match.index ?? 0, value: 30 });
  }
  for (const match of maintext.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*(?:个)?小时后/g)) {
    const value = parseChineseNumber(match[1]);
    if (value != null) {
      matches.push({ index: match.index ?? 0, value: value * 60 });
    }
  }
  for (const match of maintext.matchAll(/([零〇一二两三四五六七八九十\d]{1,3})\s*分钟后/g)) {
    const value = parseChineseNumber(match[1]);
    if (value != null) {
      matches.push({ index: match.index ?? 0, value });
    }
  }

  return getLatestIndexedValue(matches);
}

function extractNarrativePeriodTime(maintext: string): { index: number; value: string } | null {
  const periodDefaults: Record<string, string> = {
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
  const matches = Array.from(maintext.matchAll(/凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜/g))
    .map(match => ({ index: match.index ?? 0, value: periodDefaults[match[0]] }))
    .filter((match): match is { index: number; value: string } => match.value != null);

  return getLatestIndexedValue(matches);
}

function extractNarrativeTime(maintext: string): { index: number; value: string } | null {
  const matches: Array<{ confidence: number; index: number; hour: number; minute: number }> = [];
  const directTimePattern = /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?\s*([01]?\d|2[0-3])[:：]([0-5]\d)/g;
  const chineseTimePattern = /(凌晨|清晨|早上|上午|中午|下午|傍晚|晚上|夜里|深夜)?\s*([零〇一二两三四五六七八九十\d]{1,3})\s*(?:点|时)(?:\s*(半|一刻|三刻|([零〇一二两三四五六七八九十\d]{1,3})\s*分?))?/g;

  for (const match of maintext.matchAll(directTimePattern)) {
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

  for (const match of maintext.matchAll(chineseTimePattern)) {
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
    ? { index: bestMatch.index, value: formatNarrativeTime(bestMatch.hour, bestMatch.minute) }
    : null;
}

function buildNarrativeClockCandidate(maintext: string, currentClock: GameClockSnapshot): GameClockSnapshot | null {
  const explicitDate = extractExplicitNarrativeDate(maintext, currentClock.date);
  const relativeDays = extractRelativeNarrativeDays(maintext, currentClock.date);
  const relativeMinutes = extractNarrativeDurationMinutes(maintext);
  const narrativeTime = extractNarrativeTime(maintext);
  const narrativePeriodTime = extractNarrativePeriodTime(maintext);
  const candidates: Array<{ priority: number; index: number; clock: GameClockSnapshot }> = [];

  if (explicitDate && narrativeTime) {
    candidates.push({
      priority: 6,
      index: Math.max(explicitDate.index, narrativeTime.index),
      clock: {
        date: explicitDate.value,
        time: narrativeTime.value,
      },
    });
  }

  if (explicitDate && narrativePeriodTime) {
    candidates.push({
      priority: 5,
      index: Math.max(explicitDate.index, narrativePeriodTime.index),
      clock: {
        date: explicitDate.value,
        time: narrativePeriodTime.value,
      },
    });
  }

  if (explicitDate) {
    candidates.push({
      priority: 4,
      index: explicitDate.index,
      clock: {
        date: explicitDate.value,
        time: currentClock.time,
      },
    });
  }

  const hasRelativeAdvance = relativeDays != null || relativeMinutes != null;
  if (hasRelativeAdvance) {
    const relativeClock = advanceGameClock(currentClock, {
      days: relativeDays?.value ?? 0,
      minutes: relativeMinutes?.value ?? 0,
    });
    const relativeIndex = Math.max(relativeDays?.index ?? -1, relativeMinutes?.index ?? -1);

    if (narrativeTime) {
      candidates.push({
        priority: 3,
        index: Math.max(relativeIndex, narrativeTime.index),
        clock: overrideGameClockTime(relativeClock, narrativeTime.value),
      });
    }

    if (narrativePeriodTime) {
      candidates.push({
        priority: 2,
        index: Math.max(relativeIndex, narrativePeriodTime.index),
        clock: overrideGameClockTime(relativeClock, narrativePeriodTime.value),
      });
    }

    candidates.push({
      priority: 1,
      index: relativeIndex,
      clock: relativeClock,
    });
  }

  if (narrativeTime) {
    candidates.push({
      priority: -1,
      index: narrativeTime.index,
      clock: overrideGameClockTime(currentClock, narrativeTime.value),
    });
  } else if (narrativePeriodTime) {
    candidates.push({
      priority: -2,
      index: narrativePeriodTime.index,
      clock: overrideGameClockTime(currentClock, narrativePeriodTime.value),
    });
  }

  const bestCandidate = candidates
    .filter(candidate => compareGameClock(candidate.clock, currentClock) > 0)
    .sort((left, right) => {
      if (left.priority !== right.priority) {
        return left.priority - right.priority;
      }

      return left.index - right.index;
    })
    .at(-1);

  return bestCandidate?.clock ?? null;
}

function buildNarrativeClockPatchFromCandidate(
  currentClock: GameClockSnapshot,
  nextClock: GameClockSnapshot | null,
): unknown | null {
  if (!nextClock || compareGameClock(nextClock, currentClock) <= 0) {
    return null;
  }

  const nextClockPatch: Record<string, string> = {};
  if (nextClock.date !== currentClock.date) {
    nextClockPatch.日期 = nextClock.date;
  }
  if (nextClock.time !== currentClock.time) {
    nextClockPatch.时间 = nextClock.time;
  }

  return Object.keys(nextClockPatch).length
    ? { 零七系统: nextClockPatch }
    : null;
}

function getDeterministicOffset(text: string, rangeSize: number): number {
  let hash = 0;
  for (const char of text) {
    hash = ((hash << 5) - hash + char.codePointAt(0)!) >>> 0;
  }

  return rangeSize > 0 ? hash % rangeSize : 0;
}

function inferImplicitTurnAdvanceMinutes(userInput: string, maintext: string): number | null {
  const narrative = maintext.trim();
  if (!narrative) {
    return null;
  }

  const text = `${userInput}\n${narrative}`;
  if (LONG_ACTION_PATTERN.test(text)) {
    return 25 + getDeterministicOffset(text, 16);
  }

  if (MAJOR_ACTION_PATTERN.test(text)) {
    return 15 + getDeterministicOffset(text, 11);
  }

  if (BRIEF_ACTION_PATTERN.test(text) || narrative.length <= 180) {
    return 5 + getDeterministicOffset(text, 6);
  }

  return 8 + getDeterministicOffset(text, 5);
}

function getGameClockSnapshot(gameStore: ReturnType<typeof useGameStore>): GameClockSnapshot {
  return {
    date: gameStore.data.零七系统.日期,
    time: gameStore.data.零七系统.时间,
  };
}

function applyGameClockSnapshot(gameStore: ReturnType<typeof useGameStore>, clock: GameClockSnapshot): void {
  gameStore.mergeVars({
    零七系统: {
      日期: clock.date,
      时间: clock.time,
    },
  });
}

function buildNarrativeQuestPatch(
  maintext: string,
  gameStore: ReturnType<typeof useGameStore>,
  completionTimestamp: string,
): unknown | null {
  const activeQuestEntries: Record<string, unknown> = {};
  const completedQuestEntries: Record<string, unknown> = {};
  const questBlocks = extractNarrativeQuestBlocks(maintext);
  const blockByName = new Map(questBlocks.map(block => [block.name, block]));
  const rewardItems = Array.from(maintext.matchAll(REWARD_ITEM_PATTERN)).map(match => ({
    名称: match[1].trim(),
    数量: Number(match[2]),
    描述: `剧情奖励：${match[1].trim()}`,
    图标: 'gift',
    品质: 'R' as const,
  }));

  for (const match of maintext.matchAll(QUEST_STATUS_PATTERN)) {
    const questName = stripQuestName(match[1]);
    const nextStatus = match[2]?.trim();
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName];
    if (!existingQuest || !nextStatus) continue;

    const nextQuest = { ...existingQuest, ...buildNewQuestEntry(questName, maintext, gameStore, blockByName.get(questName)), 状态: nextStatus };
    if (nextStatus === '已完成') {
      completedQuestEntries[questName] = {
        ...nextQuest,
        完成时间: existingQuest.完成时间 ?? completionTimestamp,
        ...(rewardItems.length ? { 物品奖励: rewardItems } : {}),
      };
    } else {
      activeQuestEntries[questName] = nextQuest;
    }
  }

  for (const questName of detectNarrativeNewQuestNames(maintext)) {
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName]
      ?? activeQuestEntries[questName]
      ?? completedQuestEntries[questName];
    if (existingQuest) continue;

    const block = blockByName.get(questName);
    const entry = buildNewQuestEntry(questName, maintext, gameStore, block);
    if (entry.状态 === '已完成') {
      completedQuestEntries[questName] = { ...entry, 完成时间: completionTimestamp };
    } else {
      activeQuestEntries[questName] = entry;
    }
  }

  for (const match of maintext.matchAll(COMPLETED_QUEST_PATTERN)) {
    const questName = stripQuestName(match[1]);
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName];
    if (!existingQuest) continue;

    completedQuestEntries[questName] = {
      ...existingQuest,
      状态: '已完成',
      完成时间: existingQuest.完成时间 ?? completionTimestamp,
      ...(rewardItems.length ? { 物品奖励: rewardItems } : {}),
    };
    delete activeQuestEntries[questName];
  }

  for (const questName of detectCompletedQuestNames(maintext, gameStore)) {
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName];
    if (!existingQuest) continue;

    completedQuestEntries[questName] = {
      ...existingQuest,
      状态: '已完成',
      完成时间: existingQuest.完成时间 ?? completionTimestamp,
      ...(rewardItems.length ? { 物品奖励: rewardItems } : {}),
    };
    delete activeQuestEntries[questName];
  }

  if (!Object.keys(activeQuestEntries).length && !Object.keys(completedQuestEntries).length) return null;

  return {
    零七系统: {
      ...(Object.keys(activeQuestEntries).length ? { 任务列表: activeQuestEntries } : {}),
      ...(Object.keys(completedQuestEntries).length ? { 已完成任务列表: completedQuestEntries } : {}),
    },
  };
}

function buildSummaryContext(summaries: Array<{ content: string }>): string | null {
  const lines: string[] = [];
  let length = 0;

  for (const summary of [...summaries].reverse()) {
    const line = `- ${summary.content}`;
    if (length + line.length > MAX_SUMMARY_CONTEXT_CHARS) {
      break;
    }

    lines.unshift(line);
    length += line.length;
  }

  return lines.length ? `近期楼层总结（按时间从早到晚）：\n${lines.join('\n')}` : null;
}

async function applyParsedVariableUpdates(
  parsed: ReturnType<typeof parseModelResponse>,
  rawText: string,
  isActive: () => boolean,
): Promise<void> {
  const gameStore = useGameStore();
  const initialClock = getGameClockSnapshot(gameStore);
  const narrativeClockCandidate = buildNarrativeClockCandidate(parsed.maintext, initialClock);
  const narrativeClockPatch = buildNarrativeClockPatchFromCandidate(initialClock, narrativeClockCandidate);
  const completionClock = narrativeClockCandidate ?? initialClock;
  const completionTimestamp = `${completionClock.date} ${completionClock.time}`;
  let applied = false;

  if (!isActive()) {
    return;
  }

  if (parsed.vars) {
    gameStore.mergeVars(parsed.vars);
    applied = true;
  }

  if (parsed.updateVariableText) {
    let updatePatch: unknown | null = null;
    try {
      updatePatch = parseVars(parsed.updateVariableText);
    } catch {
      updatePatch = await gameStore.runtime.parseVariableUpdate?.(rawText, gameStore.data) ?? null;
    }

    if (!isActive()) {
      return;
    }

    if (updatePatch) {
      gameStore.mergeVars(updatePatch);
      applied = true;
    }
  }

  if (!isActive()) {
    return;
  }

  const narrativePatch = buildNarrativeQuestPatch(parsed.maintext, gameStore, completionTimestamp);
  if (narrativePatch) {
    gameStore.mergeVars(narrativePatch);
    applied = true;
  }

  if (narrativeClockPatch) {
    gameStore.mergeVars(narrativeClockPatch);
    applied = true;
  }

  const hasNarrative = parsed.maintext.trim().length > 0;
  if (!applied && !hasNarrative) {
    gameStore.save();
  }
}

export async function rerollLastResponse(): Promise<void> {
  const gameStore = useGameStore();
  const sessionStore = useSessionStore();
  const snapshot = sessionStore.rerollSnapshot;

  if (!snapshot) {
    return;
  }

  invalidateActiveGeneration();
  sessionStore.setGenerating(false);
  sessionStore.clearLiveAssistantBlock();

  gameStore.replaceState(snapshot.gameState);
  const userInput = sessionStore.restoreRerollSessionSnapshot();
  if (!userInput) {
    return;
  }

  sessionStore.fillInput(userInput);
  sessionStore.setError(null);
}

export async function sendPlayerInput(input: string): Promise<void> {
  const text = input.trim();
  const gameStore = useGameStore();
  const sessionStore = useSessionStore();

  if (!text || sessionStore.isGenerating) {
    return;
  }

  const generationToken = startGenerationToken();

  sessionStore.saveRerollSnapshot(text, gameStore.data);

  const turnId = makeTurnId();
  const playerBlock: NarrativeBlock = {
    id: `${turnId}-player`,
    kind: 'player',
    text,
    turnId,
  };

  sessionStore.setGenerating(true);
  sessionStore.setError(null);
  sessionStore.inputDraft = '';
  sessionStore.appendTurn({ role: 'user', content: text });
  sessionStore.appendNarrativeBlock(playerBlock);
  sessionStore.setOptions([]);
  sessionStore.save();

  try {
    const summarySettings = gameStore.data.零七系统.summarySettings;
    const recentHistory = sessionStore.history.slice(-(RECENT_HISTORY_LIMIT + 1), -1);
    const summaryContext = summarySettings.autoSummaryEnabled
      ? buildSummaryContext(sessionStore.getRecentSummaries(summarySettings.floorSummarySendLimit))
      : null;
    const lorebook = await gameStore.runtime.loadLorebook();
    if (!isGenerationTokenActive(generationToken)) {
      return;
    }

    const worldbookContext = collectWorldbookContext(lorebook, {
      userInput: text,
      recentHistory,
    });

    const streamParser = createStreamingResponseParser(delta => {
      if (!isGenerationTokenActive(generationToken)) {
        return;
      }
      sessionStore.appendLiveAssistantText(delta);
    });
    sessionStore.startLiveAssistantBlock(turnId);

    const result = await gameStore.runtime.generate({
      userInput: text,
      systemPrompt: buildSystemPrompt(gameStore.data, worldbookContext, summaryContext),
      recentHistory,
      onStreamDelta: delta => {
        if (!isGenerationTokenActive(generationToken)) {
          return;
        }
        streamParser.feed(delta);
      },
    });

    if (!isGenerationTokenActive(generationToken)) {
      sessionStore.clearLiveAssistantBlock();
      return;
    }

    streamParser.finish();

    const parsed = parseModelResponse(result.rawText);
    const assistantBlocks = narrativeBlocksFromText(parsed.maintext, turnId);

    sessionStore.clearLiveAssistantBlock();
    sessionStore.appendTurn({ role: 'assistant', content: result.rawText });
    sessionStore.appendNarrativeBlocks(assistantBlocks);
    sessionStore.setOptions(parsed.options);
    if (summarySettings.autoSummaryEnabled && parsed.summary) {
      sessionStore.setSummary(parsed.summary);
      sessionStore.addFloorSummary(turnId, parsed.summary);
    }

    const turnInitialClock = getGameClockSnapshot(gameStore);
    await applyParsedVariableUpdates(parsed, result.rawText, () => isGenerationTokenActive(generationToken));
    if (!isGenerationTokenActive(generationToken)) {
      return;
    }

    const aiSyncConfig = loadAiSyncConfig();
    const aiSyncGenerator = createAiSyncRawGenerator({
      runtime: gameStore.runtime,
      config: aiSyncConfig,
    });
    const aiSyncSummary = getRedactedAiSyncSummary(aiSyncConfig);

    updateAiSyncAvailability({
      mode: aiSyncConfig.mode,
      transport: aiSyncGenerator.transport,
      configured: aiSyncGenerator.configured,
      hasApiKey: aiSyncConfig.hasApiKey,
      configError: aiSyncGenerator.configError,
      environment: gameStore.runtime.environment,
      baseUrl: aiSyncSummary.baseUrl,
      model: aiSyncSummary.model,
      systemEnabled: aiSyncConfig.systemEnabled,
      socialEnabled: aiSyncConfig.socialEnabled,
    });

    try {
      const systemSyncPatch = await syncSystemStateBestEffort({
        generateRaw: aiSyncConfig.systemEnabled ? aiSyncGenerator.generate : undefined,
        state: gameStore.data,
        userInput: text,
        maintext: parsed.maintext,
      });
      if (!isGenerationTokenActive(generationToken)) {
        return;
      }

      if (systemSyncPatch) {
        gameStore.mergeVars(systemSyncPatch);
        recordAiSyncSuccess('system', collectSystemStateSyncPatchFields(systemSyncPatch));
      }
    } catch (error) {
      recordAiSyncError('system', error);
      console.warn('system secondary sync skipped:', error);
    }

    const socialSyncPatch = await syncSocialStateBestEffort({
      generateRaw: aiSyncConfig.socialEnabled ? aiSyncGenerator.generate : undefined,
      state: gameStore.data,
      userInput: text,
      maintext: parsed.maintext,
    });
    if (!isGenerationTokenActive(generationToken)) {
      return;
    }

    if (socialSyncPatch) {
      gameStore.mergeVars(socialSyncPatch);
      recordAiSyncSuccess('social', ['社交']);
    }

    if (compareGameClock(getGameClockSnapshot(gameStore), turnInitialClock) <= 0) {
      const implicitAdvanceMinutes = inferImplicitTurnAdvanceMinutes(text, parsed.maintext);
      if (implicitAdvanceMinutes != null) {
        applyGameClockSnapshot(gameStore, turnInitialClock);
        gameStore.advanceClock(implicitAdvanceMinutes);
      }
    }

    sessionStore.save();
  } catch (error) {
    if (!isGenerationTokenActive(generationToken)) {
      return;
    }

    sessionStore.clearLiveAssistantBlock();
    const message = error instanceof Error ? error.message : String(error);
    sessionStore.setError(message);
  } finally {
    if (isGenerationTokenActive(generationToken)) {
      sessionStore.setGenerating(false);
    }
  }
}
