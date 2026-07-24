import _ from 'lodash';

import { normalizePenisState, tryNormalizePenisStateText } from '../schema';
import { parseVars } from './response-parser';
import type { GameState, SocialCharacterState, TargetState } from '../schema';
import type { RuntimeAdapter } from '../adapters/runtime';

type SocialCharacterPatch = Partial<SocialCharacterState> | null;
type TargetPatch = Partial<TargetState>;

type SocialSyncPatch = {
  零七系统?: {
    当前地点?: string;
  };
  周围人物?: Record<string, SocialCharacterPatch>;
  历史人物?: Record<string, SocialCharacterPatch>;
  攻略目标?: Record<string, TargetPatch>;
};

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
    '2. 已离场、换地点后不在玩家身边，或正文明确离开的角色，必须从周围人物移除；如需要保留档案，则写入历史人物。',
    '3. 只处理本轮正文中能明确确认的具名角色或可稳定追踪身份的人。',
    '4. 无法稳定确认身份时宁可不写，不猜。',
    '5. 攻略目标只能更新已有角色，不允许新增全新攻略目标。',
    '6. 如果需要把某人从周围人物删除，请在周围人物里把该名字设为 null。',
    '7. 如果正文或现有档案里能明确确认年龄、种族、身份、好感等字段，就保留或补全它们；不要用“未知”、0、空字符串去覆盖已有明确信息。',
    '8. 如果你输出了周围人物，请把零七系统.当前地点 回显为当前地点。',
    '9. 不要改任务、背包、商店、积分、签到、总结或其他系统字段。',
    '10. 若正文无法确定有社交变更，返回空对象 {}。',
  ].join('\n');
}

function buildSocialSyncUserInput(options: {
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

  const result: Record<string, SocialCharacterPatch> = {};
  for (const [rawName, rawPatch] of Object.entries(value)) {
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

    const patch: Partial<SocialCharacterState> = {};
    for (const [key, fieldValue] of Object.entries(rawPatch)) {
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

  const result: Record<string, TargetPatch> = {};
  for (const [rawName, rawPatch] of Object.entries(value)) {
    const name = sanitizeName(rawName);
    if (!name || !(name in state.攻略目标) || !_.isPlainObject(rawPatch)) {
      continue;
    }

    const patch: TargetPatch = {};
    for (const [key, fieldValue] of Object.entries(rawPatch)) {
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
  if (!patch.周围人物 || !patch.零七系统?.当前地点) {
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
    周围人物: nextNearby,
  };
}

function sanitizeSocialSyncPatch(rawPatch: unknown, state: GameState): SocialSyncPatch | null {
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

export async function syncSocialStateBestEffort(options: {
  runtime: RuntimeAdapter;
  state: GameState;
  userInput: string;
  maintext: string;
}): Promise<SocialSyncPatch | null> {
  const { runtime, state, userInput, maintext } = options;
  if (!runtime.generateRaw || !maintext.trim()) {
    return null;
  }

  try {
    const response = await runtime.generateRaw({
      systemPrompt: buildSocialSyncSystemPrompt(),
      userInput: buildSocialSyncUserInput({ userInput, maintext, state }),
    });
    const parsed = parseVars(response.rawText);
    return sanitizeSocialSyncPatch(parsed, state);
  } catch (error) {
    console.warn('social secondary sync skipped:', error);
    return null;
  }
}
