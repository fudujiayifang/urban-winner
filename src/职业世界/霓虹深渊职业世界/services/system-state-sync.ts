import _ from 'lodash';

import type { GenerateResult } from '../adapters/runtime';
import type { GameState, QuestState, RewardItem, ShopCategory } from '../schema';
import {
  formatDisplayDateWithWeekday,
} from './game-date';
import { extractJsonObjectText, parseVars } from './response-parser';

export type SystemStateSyncPatch = {
  零七系统?: Partial<GameState['零七系统']>;
};

type PatchRecord = Record<string, unknown>;

const MAX_TEXT_FIELD_LENGTH = 160;
const MAX_MAINTEXT_CHARS = 2600;
const MAX_USER_INPUT_CHARS = 600;
const ALLOWED_QUEST_FIELDS = new Set<keyof QuestState>([
  '类型',
  '状态',
  '描述',
  '地点',
  '积分奖励',
  '积分奖励类型',
  '完成时间',
  '奖励池',
  '奖励池抽取数',
  '物品奖励',
]);
const ALLOWED_POINT_TYPES = new Set(['系统', '学府']);
const ALLOWED_REWARD_POOLS = new Set<ShopCategory>(['日常', '修炼', '情趣']);
const ALLOWED_REWARD_RARITIES = new Set(['N', 'R', 'SR', 'SSR']);
export const SYSTEM_SYNC_JSON_SCHEMA = {
  name: 'system_state_sync_patch',
  description: '用于修正地点、天气和任务的 JSON 补丁',
  value: {
    type: 'object',
    additionalProperties: false,
    properties: {
      零七系统: {
        type: 'object',
        additionalProperties: false,
        properties: {
          当前地点: { type: 'string' },
          当前天气: { type: 'string' },
          任务列表: { type: 'object', additionalProperties: true },
          已完成任务列表: { type: 'object', additionalProperties: true },
        },
      },
    },
  },
} as const;

function truncate(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function sanitizeText(value: unknown, maxLength = MAX_TEXT_FIELD_LENGTH): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const text = truncate(value, maxLength);
  return text.length > 0 ? text : undefined;
}

function sanitizeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function sanitizePositiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) && Number.isInteger(numeric) && numeric > 0 ? numeric : undefined;
}

function sanitizeRewardItems(value: unknown): RewardItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value.map(rawItem => {
    if (!_.isPlainObject(rawItem)) {
      return null;
    }

    const item = rawItem as PatchRecord;
    const name = sanitizeText(item.名称, 48);
    const amount = sanitizePositiveInteger(item.数量);
    const description = sanitizeText(item.描述, 180);
    if (!name || amount == null || !description) {
      return null;
    }

    const icon = sanitizeText(item.图标, 32);
    const rarity = sanitizeText(item.品质, 8);
    return {
      名称: name,
      数量: amount,
      描述: description,
      ...(icon ? { 图标: icon } : {}),
      ...(rarity && ALLOWED_REWARD_RARITIES.has(rarity) ? { 品质: rarity as RewardItem['品质'] } : {}),
    };
  }).filter((item): item is RewardItem => item != null);

  return items.length > 0 ? items : undefined;
}

function sanitizeQuestPatch(value: unknown, fallbackLocation: string): Partial<QuestState> | undefined {
  if (!_.isPlainObject(value)) {
    return undefined;
  }

  const record = value as PatchRecord;
  const patch: Partial<QuestState> = {};
  for (const [key, fieldValue] of Object.entries(record)) {
    if (!ALLOWED_QUEST_FIELDS.has(key as keyof QuestState)) {
      continue;
    }

    if (key === '积分奖励') {
      const numeric = sanitizeNumber(fieldValue);
      if (numeric != null) {
        patch.积分奖励 = Math.max(0, Math.trunc(numeric));
      }
      continue;
    }

    if (key === '奖励池抽取数') {
      const numeric = sanitizePositiveInteger(fieldValue);
      if (numeric != null) {
        patch.奖励池抽取数 = numeric;
      }
      continue;
    }

    if (key === '积分奖励类型') {
      const text = sanitizeText(fieldValue, 8);
      if (text && ALLOWED_POINT_TYPES.has(text)) {
        patch.积分奖励类型 = text as QuestState['积分奖励类型'];
      }
      continue;
    }

    if (key === '奖励池') {
      const text = sanitizeText(fieldValue, 8);
      if (text && ALLOWED_REWARD_POOLS.has(text as ShopCategory)) {
        patch.奖励池 = text as ShopCategory;
      }
      continue;
    }

    if (key === '物品奖励') {
      const items = sanitizeRewardItems(fieldValue);
      if (items) {
        patch.物品奖励 = items;
      }
      continue;
    }

    const text = sanitizeText(fieldValue);
    if (text) {
      patch[key as Exclude<keyof QuestState, '积分奖励' | '积分奖励类型' | '奖励池' | '奖励池抽取数' | '物品奖励' | '获得积分' | '获得积分类型' | '获得物品'>] = text as never;
    }
  }

  if (!patch.地点) {
    patch.地点 = fallbackLocation;
  }
  if (!patch.状态) {
    patch.状态 = '进行中';
  }
  if (!patch.类型) {
    patch.类型 = '其他';
  }
  if (!patch.描述) {
    patch.描述 = '副 AI 根据本轮正文同步的任务记录。';
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

function sanitizeQuestPatchRecord(value: unknown, fallbackLocation: string): Record<string, Partial<QuestState>> | undefined {
  if (!_.isPlainObject(value)) {
    return undefined;
  }

  const result: Record<string, Partial<QuestState>> = {};
  for (const [rawName, rawPatch] of Object.entries(value as PatchRecord)) {
    const name = sanitizeText(rawName, 64);
    if (!name) {
      continue;
    }

    const questPatch = sanitizeQuestPatch(rawPatch, fallbackLocation);
    if (questPatch) {
      result[name] = questPatch;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

export function sanitizeSystemStateSyncPatch(rawPatch: unknown, state: GameState): SystemStateSyncPatch | null {
  if (!_.isPlainObject(rawPatch)) {
    return null;
  }

  const rawRecord = rawPatch as PatchRecord;
  const rawSystem = rawRecord.零七系统;
  if (!_.isPlainObject(rawSystem)) {
    return null;
  }

  const systemRecord = rawSystem as PatchRecord;
  const systemPatch: Record<string, unknown> = {};
  const location = sanitizeText(systemRecord.当前地点);
  const weather = sanitizeText(systemRecord.当前天气, 48);

  if (location && location !== state.零七系统.当前地点) {
    systemPatch.当前地点 = location;
  }
  if (weather && weather !== state.零七系统.当前天气) {
    systemPatch.当前天气 = weather;
  }

  const fallbackLocation = typeof systemPatch.当前地点 === 'string'
    ? systemPatch.当前地点
    : state.零七系统.当前地点;
  const activeQuests = sanitizeQuestPatchRecord(systemRecord.任务列表, fallbackLocation);
  const completedQuests = sanitizeQuestPatchRecord(systemRecord.已完成任务列表, fallbackLocation);
  if (activeQuests) {
    systemPatch.任务列表 = activeQuests;
  }
  if (completedQuests) {
    systemPatch.已完成任务列表 = _.mapValues(completedQuests, quest => ({
      ...quest,
      状态: '已完成',
      完成时间: quest.完成时间 ?? `${state.零七系统.日期} ${state.零七系统.时间}`,
    }));

    const activePatch = _.isPlainObject(systemPatch.任务列表)
      ? { ...(systemPatch.任务列表 as Record<string, unknown>) }
      : {};
    for (const questName of Object.keys(completedQuests)) {
      if (state.零七系统.任务列表[questName] || questName in activePatch) {
        activePatch[questName] = null;
      }
    }
    if (Object.keys(activePatch).length > 0) {
      systemPatch.任务列表 = activePatch;
    }
  }

  return Object.keys(systemPatch).length > 0
    ? { 零七系统: systemPatch as Partial<GameState['零七系统']> }
    : null;
}

export function parseSystemSyncResponse(rawText: string): unknown {
  try {
    return parseVars(rawText);
  } catch {
    const jsonText = extractJsonObjectText(rawText);
    if (!jsonText) {
      throw new Error('系统副 AI 同步未返回 JSON');
    }

    return parseVars(jsonText);
  }
}

function summarizeQuestRecord(quests: Record<string, QuestState>): Record<string, Pick<QuestState, '类型' | '状态' | '描述' | '地点' | '积分奖励' | '积分奖励类型' | '奖励池' | '奖励池抽取数' | '物品奖励' | '完成时间'>> {
  return _.mapValues(quests, quest => ({
    类型: quest.类型,
    状态: quest.状态,
    描述: truncate(quest.描述, MAX_TEXT_FIELD_LENGTH),
    地点: quest.地点,
    积分奖励: quest.积分奖励,
    积分奖励类型: quest.积分奖励类型,
    奖励池: quest.奖励池,
    奖励池抽取数: quest.奖励池抽取数,
    物品奖励: quest.物品奖励,
    完成时间: quest.完成时间,
  }));
}

function buildSystemStateSyncPrompt(): string {
  return [
    '你是一个只负责修正世界状态、天气和任务的 JSON 同步器。',
    '你的任务是根据本轮玩家输入、当前正文和当前状态，输出最小 JSON patch。',
    '只允许输出顶层字段：零七系统。',
    '零七系统 里只允许输出：当前地点、当前天气、任务列表、已完成任务列表。',
    '不要输出任何解释、Markdown、XML 或额外文本。',
    '规则：',
    '1. 只根据本轮正文中明确发生或强烈暗示的变化更新字段；不确定就不要写。',
    '2. 时间推进由主系统统一处理；不要输出 日期、时间，也不要根据“次日 / 当晚 / 两小时后 / 下周X”换算时钟。',
    '3. 天气只写当前场景正在发生或明确切换后的天气，不要写气氛词。',
    '4. 当前地点变化时写 零七系统.当前地点；不要在这里处理人物，人物由社交同步器处理。',
    '5. 新任务或任务状态变化必须写入 任务列表；完成的任务写入 已完成任务列表，状态为“已完成”。',
    '6. 识别任务时优先处理正文中的“【零七系统】新任务”或“任务发布”结构块；如果正文给出任务名称、类型、描述、地点、状态、积分奖励、积分奖励类型、奖励池、奖励池抽取数、物品奖励，必须逐项保留。',
    '7. 新任务必须使用稳定的任务名称作为任务列表的键，不要使用“新任务”“任务发布”“零七系统”等标题作为键；如果只能确认任务名称，至少输出类型、状态、描述和地点。',
    '8. 任务完成时必须从任务列表删除同名任务，并在已完成任务列表写入完整记录；不要让同一任务同时存在于两个列表。',
    '9. 任务完成时保留奖励配置字段：积分奖励、积分奖励类型、奖励池、奖励池抽取数、物品奖励。',
    '10. 绝对不要输出 获得积分、获得积分类型、获得物品，也不要改背包、商店、签到、积分。',
    '11. 若正文没有明确任务变化，不要凭空创建任务；若没有可同步变化，返回空对象 {}。',
  ].join('\n');
}

export function buildSystemStateSyncUserInput(options: {
  userInput: string;
  maintext: string;
  state: GameState;
}): string {
  const { userInput, maintext, state } = options;
  const system = state.零七系统;
  const payload = {
    当前系统快照: {
      当前地点: system.当前地点,
      日期: system.日期,
      星期: formatDisplayDateWithWeekday(system.日期),
      时间: system.时间,
      当前天气: system.当前天气,
    },
    时钟同步要求: '时间由主系统统一结算，本同步器禁止输出日期和时间。',
    任务输出格式: '新任务示例：{"零七系统":{"任务列表":{"调查旧校舍":{"类型":"探索","状态":"新","描述":"调查旧校舍的异常能量","地点":"天穹学府·旧校舍","积分奖励":50,"积分奖励类型":"学府","奖励池":"日常","奖励池抽取数":1,"物品奖励":[]}}}}；完成任务时放入已完成任务列表并从任务列表删除同名键。',
    玩家输入: truncate(userInput, MAX_USER_INPUT_CHARS),
    本轮正文: truncate(maintext, MAX_MAINTEXT_CHARS),
    当前任务列表: summarizeQuestRecord(system.任务列表),
    当前已完成任务列表: summarizeQuestRecord(system.已完成任务列表),
  };

  return JSON.stringify(payload, null, 2);
}

export function collectSystemStateSyncPatchFields(patch: SystemStateSyncPatch | null | undefined): string[] {
  if (!patch?.零七系统) {
    return [];
  }

  const fields: string[] = [];
  const systemPatch = patch.零七系统;
  if (systemPatch.当前地点 != null) {
    fields.push('地点');
  }
  if (systemPatch.当前天气 != null) {
    fields.push('天气');
  }
  if (systemPatch.任务列表 != null || systemPatch.已完成任务列表 != null) {
    fields.push('任务');
  }

  return _.uniq(fields);
}

export async function syncSystemStateBestEffort(options: {
  generateRaw?: (request: {
    systemPrompt: string;
    userInput: string;
    jsonSchema?: {
      name: string;
      description?: string;
      value: Record<string, unknown>;
    };
  }) => Promise<GenerateResult>;
  state: GameState;
  userInput: string;
  maintext: string;
}): Promise<SystemStateSyncPatch | null> {
  const { generateRaw, state, userInput, maintext } = options;
  if (!maintext.trim() || !generateRaw) {
    return null;
  }

  const response = await generateRaw({
    systemPrompt: buildSystemStateSyncPrompt(),
    userInput: buildSystemStateSyncUserInput({ userInput, maintext, state }),
    jsonSchema: SYSTEM_SYNC_JSON_SCHEMA,
  });
  const parsed = parseSystemSyncResponse(response.rawText);
  return sanitizeSystemStateSyncPatch(parsed, state);
}
