import { buildSystemPrompt } from './prompt';
import {
  createGameDate,
  formatGameDateParts,
  formatGameTimeParts,
  parseGameDateParts,
} from './game-date';
import { narrativeBlocksFromText, parseModelResponse, parseVars } from './response-parser';
import { createStreamingResponseParser } from './stream-response-parser';
import { syncSocialStateBestEffort } from './social-sync';
import { collectWorldbookContext } from './worldbook';
import type { NarrativeBlock } from '../adapters/runtime';
import { useGameStore } from '../store/game';
import { useSessionStore } from '../store/session';

const RECENT_HISTORY_LIMIT = 12;
const MAX_SUMMARY_CONTEXT_CHARS = 12_000;
const COMPLETED_QUEST_PATTERN = /任务[：:「『“\s]*(.+?)[」』”'，,、\s]*(?:，|,|\s)*状态(?:更新)?[：:：\s]*已完成/g;
const QUEST_STATUS_PATTERN = /任务[：:「『“\s]*(.+?)[」』”'，,、\s]*(?:，|,|\s)*状态(?:更新)?[：:：\s]*(新|待定|进行中|已完成)/g;
const NEW_QUEST_PATTERNS = [
  /(?:新任务|获得任务|接取任务|接到任务|新增任务|解锁任务)[：:「『“\s]*([^\n，。；;]+?)(?:[」』”】]|(?=[，。；;\n]))/g,
  /任务[：:「『“\s]*([^\n，。；;]+?)(?:[」』”】])?\s*(?:已发布|已解锁|已接取|已开启)/g,
] as const;
const REWARD_ITEM_PATTERN = /(?:获得|恭喜你获得)[：:：\s]*([^。】\n]+?)[x×]\s*(\d+)/g;

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

  for (const questName of Object.keys(gameStore.data.零七系统.任务列表)) {
    const safeQuestName = escapeRegex(questName);
    const patterns = [
      new RegExp(`任务[：:「『“\\s]*${safeQuestName}[」』”'】]?\\s*(?:已完成|完成)(?:了)?`, 'g'),
      new RegExp(`${safeQuestName}[」』”'】]?\\s*(?:任务)?\\s*(?:已完成|完成)(?:了)?`, 'g'),
      new RegExp(`(?:已完成|完成)(?:了)?(?:任务)?[：:「『“\\s]*${safeQuestName}[」』”'】]?`, 'g'),
    ];

    if (patterns.some(pattern => pattern.test(maintext))) {
      completedNames.add(questName);
    }
  }

  return Array.from(completedNames);
}

function detectNarrativeNewQuestNames(maintext: string): string[] {
  const questNames = new Set<string>();

  for (const pattern of NEW_QUEST_PATTERNS) {
    for (const match of maintext.matchAll(pattern)) {
      const questName = stripQuestName(match[1] ?? '');
      if (questName) {
        questNames.add(questName);
      }
    }
  }

  return Array.from(questNames);
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

function buildNewQuestEntry(questName: string, maintext: string, gameStore: ReturnType<typeof useGameStore>): Record<string, unknown> {
  return {
    类型: inferQuestCategory(maintext, questName),
    状态: '新',
    描述: `正文触发的新任务：${questName}`,
    地点: gameStore.data.零七系统.当前地点,
  };
}

function parseChineseNumber(value: string): number | null {
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

function extractNarrativeDate(maintext: string, currentDateText: string): string | null {
  const currentDate = parseGameDateParts(currentDateText);
  const explicitDatePatterns = [
    /(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g,
    /(?:(\d{4})[.\-/])?(\d{1,2})[.\-/](\d{1,2})(?!\d)/g,
  ];

  for (const pattern of explicitDatePatterns) {
    const matches = Array.from(maintext.matchAll(pattern));
    const match = matches.at(-1);
    if (!match) {
      continue;
    }

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

    const nextDateText = formatGameDateParts(year, month, day);
    if (nextDateText !== currentDateText) {
      return nextDateText;
    }
  }

  if (/(次日|第二天|翌日|隔天|明天)/.test(maintext)) {
    const nextDate = createGameDate(currentDateText);
    nextDate.setDate(nextDate.getDate() + 1);
    return formatGameDateParts(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
  }

  return null;
}

function extractNarrativeClock(maintext: string, currentDateText: string): { date: string | null; time: string | null } {
  return {
    date: extractNarrativeDate(maintext, currentDateText),
    time: extractNarrativeTime(maintext),
  };
}

function extractNarrativeTime(maintext: string): string | null {
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
  return bestMatch ? formatNarrativeTime(bestMatch.hour, bestMatch.minute) : null;
}

function buildNarrativeClockPatch(maintext: string, gameStore: ReturnType<typeof useGameStore>): unknown | null {
  const currentClock = getGameClockSnapshot(gameStore);
  const { date: nextDate, time: nextTime } = extractNarrativeClock(maintext, currentClock.date);
  const candidateClock = {
    date: nextDate ?? currentClock.date,
    time: nextTime ?? currentClock.time,
  };

  if (compareGameClock(candidateClock, currentClock) <= 0) {
    return null;
  }

  const nextClockPatch: Record<string, string> = {};
  if (nextDate && nextDate !== currentClock.date) {
    nextClockPatch.日期 = nextDate;
  }
  if (nextTime && nextTime !== currentClock.time) {
    nextClockPatch.时间 = nextTime;
  }

  return Object.keys(nextClockPatch).length
    ? { 零七系统: nextClockPatch }
    : null;
}

interface GameClockSnapshot {
  date: string;
  time: string;
}

function compareGameClock(left: GameClockSnapshot, right: GameClockSnapshot): number {
  return createGameDate(left.date, left.time).getTime() - createGameDate(right.date, right.time).getTime();
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

function buildNarrativeQuestPatch(maintext: string, gameStore: ReturnType<typeof useGameStore>): unknown | null {
  const activeQuestEntries: Record<string, unknown> = {};
  const completedQuestEntries: Record<string, unknown> = {};
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
    if (!existingQuest || !nextStatus) {
      continue;
    }

    const nextQuest = {
      ...existingQuest,
      状态: nextStatus,
    };

    if (nextStatus === '已完成') {
      completedQuestEntries[questName] = {
        ...nextQuest,
        完成时间: existingQuest.完成时间 ?? `${gameStore.data.零七系统.日期} ${gameStore.data.零七系统.时间}`,
        ...(rewardItems.length ? { 物品奖励: rewardItems } : {}),
      };
      continue;
    }

    activeQuestEntries[questName] = nextQuest;
  }

  for (const questName of detectNarrativeNewQuestNames(maintext)) {
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName]
      ?? activeQuestEntries[questName]
      ?? completedQuestEntries[questName];
    if (existingQuest) {
      continue;
    }

    activeQuestEntries[questName] = buildNewQuestEntry(questName, maintext, gameStore);
  }

  for (const match of maintext.matchAll(COMPLETED_QUEST_PATTERN)) {
    const questName = stripQuestName(match[1]);
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName];
    if (!existingQuest) {
      continue;
    }

    completedQuestEntries[questName] = {
      ...existingQuest,
      状态: '已完成',
      完成时间: existingQuest.完成时间 ?? `${gameStore.data.零七系统.日期} ${gameStore.data.零七系统.时间}`,
      ...(rewardItems.length ? { 物品奖励: rewardItems } : {}),
    };
    delete activeQuestEntries[questName];
  }

  for (const questName of detectCompletedQuestNames(maintext, gameStore)) {
    const existingQuest = gameStore.data.零七系统.任务列表[questName]
      ?? gameStore.data.零七系统.已完成任务列表[questName];
    if (!existingQuest) {
      continue;
    }

    completedQuestEntries[questName] = {
      ...existingQuest,
      状态: '已完成',
      完成时间: existingQuest.完成时间 ?? `${gameStore.data.零七系统.日期} ${gameStore.data.零七系统.时间}`,
      ...(rewardItems.length ? { 物品奖励: rewardItems } : {}),
    };
    delete activeQuestEntries[questName];
  }

  if (!Object.keys(activeQuestEntries).length && !Object.keys(completedQuestEntries).length) {
    return null;
  }

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

  const narrativePatch = buildNarrativeQuestPatch(parsed.maintext, gameStore);
  if (narrativePatch) {
    gameStore.mergeVars(narrativePatch);
    applied = true;
  }

  const narrativeClockPatch = buildNarrativeClockPatch(parsed.maintext, gameStore);
  if (narrativeClockPatch) {
    gameStore.mergeVars(narrativeClockPatch);
    applied = true;
  }

  // The model may echo the old clock in <vars>. Only a clock that moved forward
  // is authoritative; otherwise advance the preserved clock for this turn.
  const hasNarrative = parsed.maintext.trim().length > 0;
  if (!applied && !hasNarrative) {
    gameStore.save();
    return;
  }

  const currentClock = getGameClockSnapshot(gameStore);
  if (compareGameClock(currentClock, initialClock) <= 0) {
    applyGameClockSnapshot(gameStore, initialClock);
    gameStore.advanceClock();
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

    await applyParsedVariableUpdates(parsed, result.rawText, () => isGenerationTokenActive(generationToken));
    if (!isGenerationTokenActive(generationToken)) {
      return;
    }

    const socialSyncPatch = await syncSocialStateBestEffort({
      runtime: gameStore.runtime,
      state: gameStore.data,
      userInput: text,
      maintext: parsed.maintext,
    });
    if (!isGenerationTokenActive(generationToken)) {
      return;
    }

    if (socialSyncPatch) {
      gameStore.mergeVars(socialSyncPatch);
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
