import { buildSystemPrompt } from './prompt';
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

  if (!applied) {
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
