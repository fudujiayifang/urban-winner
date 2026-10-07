import _ from 'lodash';

import type { GenerateResult } from '../adapters/runtime';
import { normalizePenisState, tryNormalizePenisStateText } from '../schema';
import { extractJsonObjectText, parseVars } from './response-parser';
import { stabilizeSocialScenePatch, type SocialCharacterPatch, type SocialScenePatch, type TargetPatch } from './social-state-api';
import type { GameState, SocialCharacterState, TargetState } from '../schema';

export type SocialSyncPatch = SocialScenePatch;

type PatchRecord = Record<string, unknown>;

type SocialCharacterSummary = {
  身份: string;
  年龄: string;
  种族: string;
  当前位置: string;
  关系: string;
  好感度: number;
  心情: string;
  心里想法: string;
};

type TargetSummary = {
  身份: string;
  年龄: string;
  种族: string;
  当前位置: string;
  好感度等级: string;
  好感度: number;
  心情: string;
  心里想法: string;
};

export const SOCIAL_SYNC_JSON_SCHEMA = {
  name: 'social_sync_patch',
  description: '用于修正周围人物、历史人物与已有攻略目标的 JSON 补丁',
  value: {
    type: 'object',
    additionalProperties: false,
    properties: {
      零七系统: {
        type: 'object',
        additionalProperties: false,
        properties: {
          当前地点: { type: 'string' },
        },
      },
      周围人物: {
        type: 'object',
        additionalProperties: true,
      },
      历史人物: {
        type: 'object',
        additionalProperties: true,
      },
      攻略目标: {
        type: 'object',
        additionalProperties: true,
      },
    },
  },
} as const;

const MAX_MAINTEXT_CHARS = 2400;
const MAX_USER_INPUT_CHARS = 500;
const MAX_SOCIAL_ENTRIES = 18;
const MAX_NAME_LENGTH = 24;
const MAX_TEXT_FIELD_LENGTH = 120;
const ALLOWED_SOCIAL_FIELDS = new Set<keyof SocialCharacterState>([
  '好感度',
  '关系',
  '心情',
  '当前位置',
  '心里想法',
  '身份',
  '年龄',
  '种族',
  '性格',
  '当前状态',
  '外貌',
  '衣着',
  '备注',
]);
const ALLOWED_TARGET_FIELDS = new Set<keyof TargetState>([
  '好感度',
  '好感度等级',
  '兴奋值',
  '阴茎状态',
  '心情',
  '当前位置',
  '心里想法',
]);
const PLACEHOLDER_TEXT_VALUES = new Set(['未知', '不详', '暂无', '无']);

function truncate(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().slice(0, MAX_NAME_LENGTH);
  return normalized.length > 0 ? normalized : null;
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return truncate(value, MAX_TEXT_FIELD_LENGTH);
}

function sanitizeNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function sanitizePenisStateText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  return normalizePenisState(truncate(value, MAX_TEXT_FIELD_LENGTH));
}

function sanitizeCharacterStatusText(value: unknown, allowPenisStateNormalization = false): string | undefined {
  const text = sanitizeText(value);
  if (text == null || (PLACEHOLDER_TEXT_VALUES.has(text) && text !== '无')) {
    return undefined;
  }

  if (allowPenisStateNormalization) {
    return tryNormalizePenisStateText(text) ?? text;
  }

  const normalizedPenisState = tryNormalizePenisStateText(text);
  return normalizedPenisState ?? text;
}

function summarizeSocialCharacter(character: SocialCharacterState): SocialCharacterSummary {
  return {
    身份: truncate(character.身份, MAX_TEXT_FIELD_LENGTH),
    年龄: truncate(character.年龄, MAX_TEXT_FIELD_LENGTH),
    种族: truncate(character.种族, MAX_TEXT_FIELD_LENGTH),
    当前位置: truncate(character.当前位置, MAX_TEXT_FIELD_LENGTH),
    关系: truncate(character.关系, MAX_TEXT_FIELD_LENGTH),
    好感度: character.好感度,
    心情: truncate(character.心情, MAX_TEXT_FIELD_LENGTH),
    心里想法: truncate(character.心里想法, MAX_TEXT_FIELD_LENGTH),
  };
}

function summarizeTarget(target: TargetState): TargetSummary {
  return {
    身份: truncate(target.基础信息.身份, MAX_TEXT_FIELD_LENGTH),
    年龄: truncate(target.基础信息.年龄, MAX_TEXT_FIELD_LENGTH),
    种族: truncate(target.基础信息.种族, MAX_TEXT_FIELD_LENGTH),
    当前位置: truncate(target.当前位置, MAX_TEXT_FIELD_LENGTH),
    好感度等级: truncate(target.好感度等级, MAX_TEXT_FIELD_LENGTH),
    好感度: target.好感度,
    心情: truncate(target.心情, MAX_TEXT_FIELD_LENGTH),
    心里想法: truncate(target.心里想法, MAX_TEXT_FIELD_LENGTH),
  };
}

function limitEntries<T>(record: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(record).slice(0, MAX_SOCIAL_ENTRIES));
}

function buildSocialSyncSystemPrompt(): string {
  return [
    '你是一个只负责修正社交人物状态的 JSON 同步器。',
    '你的唯一任务是根据本轮玩家输入、当前正文和现有人物档案，输出一个最小 JSON patch。',
    '只允许输出这些顶层字段：零七系统、周围人物、历史人物、攻略目标。',
    '不要输出任何解释、Markdown、XML 或额外文本。',
    '世界观限制：所有人类、兽人、亚兽人的生殖器官结构统一，不存在生殖腔或鞘。',
    '若需要更新 阴茎状态 或对应的 当前状态，只能使用这些基础状态：自然下垂、晨勃、半勃起、微软、勃起。',
    '禁止输出“收鞘、入鞘、缩回鞘内、退回鞘内、生殖腔、鞘内”等词。',
    '如需补充外观细节，写成“基础状态｜附加描述”，不要自造新的基础状态词。',
    '规则：',
    '1. 周围人物只保留当前场景中确实在玩家身边、可立刻互动的人。',
    '2. 若玩家与单个具名角色独处、单独相处、只剩两人或无人打扰，必须输出周围人物且只保留这个角色；其他原周围人物必须设为 null。',
    '3. 若正文写“七个人都在”“众人都在”“大家都在场”“全员到齐”等多人同场，必须点名列出能确认的在场人物并写入周围人物，不能返回空对象。',
    '4. 已离场、换地点后不在玩家身边，或正文明确离开的角色，必须从周围人物移除；如需要保留档案，则写入历史人物。',
    '5. 只处理本轮正文中能明确确认的具名角色或可稳定追踪身份的人。',
    '6. 无法稳定确认身份时宁可不写，不猜。',
    '7. 攻略目标只能更新已有角色，不允许新增全新攻略目标。',
    '8. 如果需要把某人从周围人物删除，请在周围人物里把该名字设为 null。',
    '9. 如果正文或现有档案里能明确确认年龄、种族、身份、好感等字段，就保留或补全它们；不要用“未知”、0、空字符串去覆盖已有明确信息。',
    '10. 攻略目标在场时，周围人物中也必须有对应条目，并沿用攻略目标的身份、年龄、种族、好感、心情、当前位置等信息；仅仅提到名字、回忆对方、转述对方情况、通过通讯联系对方，不算在场。',
    '11. 如果你输出了周围人物，请把零七系统.当前地点 回显为当前地点。',
    '12. 不要改任务、背包、商店、积分、签到、总结或其他系统字段。',
    '13. 若正文无法确定有社交变更，返回空对象 {}。',
  ].join('\n');
}

export function buildSocialSyncUserInput(options: {
  userInput: string;
  maintext: string;
  state: GameState;
}): string {
  const { userInput, maintext, state } = options;
  const payload = {
    当前地点: truncate(state.零七系统.当前地点, MAX_TEXT_FIELD_LENGTH),
    玩家输入: truncate(userInput, MAX_USER_INPUT_CHARS),
    本轮正文: truncate(maintext, MAX_MAINTEXT_CHARS),
    当前周围人物: limitEntries(_.mapValues(state.周围人物, summarizeSocialCharacter)),
    当前历史人物: limitEntries(_.mapValues(state.历史人物, summarizeSocialCharacter)),
    当前攻略目标: limitEntries(_.mapValues(state.攻略目标, summarizeTarget)),
  };

  return JSON.stringify(payload, null, 2);
}

function sanitizeSocialPatchRecord(value: unknown, state: GameState): Record<string, SocialCharacterPatch> | undefined {
  if (!_.isPlainObject(value)) {
    return undefined;
  }

  const record = value as PatchRecord;
  const result: Record<string, SocialCharacterPatch> = {};
  for (const [rawName, rawPatch] of Object.entries(record)) {
    const name = sanitizeName(rawName);
    if (!name) {
      continue;
    }

    if (rawPatch === null) {
      result[name] = null;
      continue;
    }

    if (!_.isPlainObject(rawPatch)) {
      continue;
    }

    const patchRecord = rawPatch as PatchRecord;
    const patch: Partial<SocialCharacterState> = {};
    for (const [key, fieldValue] of Object.entries(patchRecord)) {
      if (!ALLOWED_SOCIAL_FIELDS.has(key as keyof SocialCharacterState)) {
        continue;
      }

      if (key === '好感度') {
        const numeric = sanitizeNumber(fieldValue);
        if (numeric != null && numeric !== 0) {
          patch.好感度 = numeric;
        }
        continue;
      }

      if (key === '当前状态') {
        const text = sanitizeCharacterStatusText(fieldValue, name in state.攻略目标);
        if (text != null) {
          patch.当前状态 = text;
        }
        continue;
      }

      const text = sanitizeText(fieldValue);
      if (text != null && !(PLACEHOLDER_TEXT_VALUES.has(text) && text !== '无')) {
        patch[key as keyof SocialCharacterState] = text as never;
      }
    }

    if (Object.keys(patch).length > 0) {
      result[name] = patch;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeTargetPatchRecord(value: unknown, state: GameState): Record<string, TargetPatch> | undefined {
  if (!_.isPlainObject(value)) {
    return undefined;
  }

  const record = value as PatchRecord;
  const result: Record<string, TargetPatch> = {};
  for (const [rawName, rawPatch] of Object.entries(record)) {
    const name = sanitizeName(rawName);
    if (!name || !(name in state.攻略目标) || !_.isPlainObject(rawPatch)) {
      continue;
    }

    const patchRecord = rawPatch as PatchRecord;
    const patch: TargetPatch = {};
    for (const [key, fieldValue] of Object.entries(patchRecord)) {
      if (!ALLOWED_TARGET_FIELDS.has(key as keyof TargetState)) {
        continue;
      }

      if (key === '好感度' || key === '兴奋值') {
        const numeric = sanitizeNumber(fieldValue);
        if (numeric != null && numeric !== 0) {
          patch[key as '好感度' | '兴奋值'] = numeric;
        }
        continue;
      }

      if (key === '阴茎状态') {
        const normalizedPenisState = sanitizePenisStateText(fieldValue);
        if (normalizedPenisState != null) {
          patch.阴茎状态 = normalizedPenisState;
        }
        continue;
      }

      const text = sanitizeText(fieldValue);
      if (text != null && !(PLACEHOLDER_TEXT_VALUES.has(text) && text !== '无')) {
        patch[key as Exclude<keyof TargetState, '好感度' | '兴奋值' | '基础信息' | '职业信息' | '衣物状态'>] = text as never;
      }
    }

    if (Object.keys(patch).length > 0) {
      result[name] = patch;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function enforceNearbyRemovals(patch: SocialSyncPatch, state: GameState): SocialSyncPatch {
  if (!patch.周围人物) {
    return patch;
  }

  const nextNearby = { ...patch.周围人物 };
  for (const existingName of Object.keys(state.周围人物)) {
    if (existingName in nextNearby) {
      continue;
    }

    nextNearby[existingName] = null;
  }

  return {
    ...patch,
    零七系统: {
      ...patch.零七系统,
      当前地点: patch.零七系统?.当前地点 ?? state.零七系统.当前地点,
    },
    周围人物: nextNearby,
  };
}

export function sanitizeSocialSyncPatch(rawPatch: unknown, state: GameState): SocialSyncPatch | null {
  if (!_.isPlainObject(rawPatch)) {
    return null;
  }

  const patch: SocialSyncPatch = {};
  const location = sanitizeText(_.get(rawPatch, '零七系统.当前地点'));
  if (location) {
    patch.零七系统 = { 当前地点: location };
  }

  const nearby = sanitizeSocialPatchRecord(_.get(rawPatch, '周围人物'), state);
  if (nearby) {
    patch.周围人物 = nearby;
  }

  const history = sanitizeSocialPatchRecord(_.get(rawPatch, '历史人物'), state);
  if (history) {
    patch.历史人物 = history;
  }

  const targets = sanitizeTargetPatchRecord(_.get(rawPatch, '攻略目标'), state);
  if (targets) {
    patch.攻略目标 = targets;
  }

  const normalized = enforceNearbyRemovals(patch, state);
  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function parseSocialSyncResponse(rawText: string): unknown {
  try {
    return parseVars(rawText);
  } catch {
    const jsonText = extractJsonObjectText(rawText);
    if (!jsonText) {
      throw new Error('社交二次同步未返回 JSON');
    }

    return parseVars(jsonText);
  }
}

export async function syncSocialStateBestEffort(options: {
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
}): Promise<SocialSyncPatch | null> {
  const { generateRaw, state, userInput, maintext } = options;
  if (!maintext.trim()) {
    return null;
  }

  let sanitizedPatch: SocialSyncPatch = {};

  if (generateRaw) {
    try {
      const response = await generateRaw({
        systemPrompt: buildSocialSyncSystemPrompt(),
        userInput: buildSocialSyncUserInput({ userInput, maintext, state }),
        jsonSchema: SOCIAL_SYNC_JSON_SCHEMA,
      });
      const parsed = parseSocialSyncResponse(response.rawText);
      sanitizedPatch = sanitizeSocialSyncPatch(parsed, state) ?? {};
    } catch (error) {
      console.warn('social secondary sync skipped:', error);
    }
  }

  const stabilizedPatch = stabilizeSocialScenePatch({
    state,
    patch: sanitizedPatch,
    userInput,
    maintext,
  });
  return stabilizedPatch && Object.keys(stabilizedPatch).length > 0 ? stabilizedPatch : null;
}
