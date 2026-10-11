import _ from 'lodash';

import { createRuntimeAdapter } from '../adapters/runtime';
import { isCustomShopItem, loadItemPoolArchive, saveItemPoolArchive } from '../adapters/item-pool-storage';
import {
  advanceGameClock,
  formatGameDateParts,
  formatGameTimeParts,
  getWeekdayIndex,
  parseGameDateParts,
  parseGameTimeParts,
  type GameClockSnapshot,
} from '../services/game-date';
import { stabilizeSocialScenePatch, type SocialScenePatch } from '../services/social-state-api';
import { findQuestKeyByCanonical, getQuestCanonicalKey, normalizeQuestName } from '../services/quest-normalization';
import { DEFAULT_GAME_STATE, DEFAULT_SHOP_CATEGORY_ORDER, DEFAULT_SHOP_SLOT_COUNT_PER_CATEGORY } from '../defaults';
import {
  preparePhoneAction as preparePhoneActionResult,
  reconcilePrivateAgreements,
  runPrivatePhoneChat,
  syncMarkedPhoneRepliesFromNarrative,
  type PhoneAction,
  type PhoneActionResult,
} from '../services/phone-actions';
import { syncCommunityBootstrapBestEffort } from '../services/community-sync';
import { createAiSyncRawGenerator } from '../services/ai-sync-client';
import { loadAiSyncConfig } from '../services/ai-sync-config';
import { fileToAvatarDataUrl } from '../services/avatar';
import {
  migrateCommunityHandles,
  migrateCommunityLikes,
  normalizeGameCommunityState,
  prepareCommunityInputForSchema,
} from '../services/community-state';
import { collectWorldbookContext } from '../services/worldbook';
import {
  normalizePenisState,
  Schema,
  type CourseScheduleEntry,
  type GameState,
  type NpcProfileState,
  type QuestState,
  type RewardItem,
  type RewardPoolCollection,
  type ShopCategory,
  type ShopItem,
  type ShopItemState,
  type SocialCharacterState,
  type TargetState,
} from '../schema';

export interface QuestRewardResult {
  questName: string;
  category: string;
  rewardPool?: QuestState['奖励池'];
  grantedPoints: number;
  grantedPointType: QuestState['积分奖励类型'] | '系统';
  grantedItems: RewardItem[];
  completedAt: string;
  source?: 'quest' | 'checkin';
}

export interface ShopPurchaseResult {
  success: boolean;
  item: ShopItemState;
  ownedCount: number;
  remainingPoints: number;
  reason?: 'insufficient_points' | 'sold_out';
}

export interface ShopRefreshResult {
  success: boolean;
  items: ShopItemState[];
  remainingPoints: number;
  refreshPrice: number;
  freshCount: number;
  replenishedCount: number;
  repeatedCount: number;
  restockedCategories: ShopCategory[];
  reason?: 'insufficient_points';
}

export interface InventoryBoxOpenResult {
  success: boolean;
  boxName: string;
  grantedItems: RewardItem[];
  openedAt: string;
  remainingCount: number;
  reason?: 'not_openable' | 'empty';
}

export interface ItemPoolShopSourceRef {
  type: 'shop';
  itemId: string;
}

export interface ItemPoolRewardPoolSourceRef {
  type: 'quest-random';
  poolName: ShopCategory;
  index: number;
}

export interface ItemPoolQuestFixedSourceRef {
  type: 'quest-fixed';
  questName: string;
  index: number;
}

export type ItemPoolSourceRef = ItemPoolShopSourceRef | ItemPoolRewardPoolSourceRef | ItemPoolQuestFixedSourceRef;

export interface ItemPoolItemPatch {
  name: string;
  description: string;
  icon: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  category: ShopCategory;
  price?: number;
}

export interface NewItemPoolShopItemInput {
  name: string;
  description: string;
  icon?: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  category: ShopCategory;
  price: number | string;
}

export interface ItemPoolShopItemImportSkip {
  name: string;
  reason: string;
}

export interface ItemPoolShopItemImportResult {
  added: ShopItem[];
  skipped: ItemPoolShopItemImportSkip[];
}

interface ShopBuildResult {
  items: ShopItemState[];
  freshCount: number;
  replenishedCount: number;
  repeatedCount: number;
  restockedCategories: ShopCategory[];
  seenIds: string[];
  soldIds: string[];
}

type SocialBucketKey = '周围人物' | '历史人物';

export interface SocialCharacterEntry extends SocialCharacterState {
  name: string;
  bucket: SocialBucketKey;
}

export interface SocialTargetEntry extends TargetState {
  name: string;
}

const SHOP_CATEGORY_ORDER: ShopCategory[] = DEFAULT_SHOP_CATEGORY_ORDER;
const SHOP_SLOT_COUNT_PER_CATEGORY = DEFAULT_SHOP_SLOT_COUNT_PER_CATEGORY;
const SHOP_TOTAL_SLOT_COUNT = SHOP_CATEGORY_ORDER.length * SHOP_SLOT_COUNT_PER_CATEGORY;
const ITEM_POOL_RARITIES = ['N', 'R', 'SR', 'SSR'] as const;
const DEFAULT_SOCIAL_AVATARS: Record<string, string> = {};
const OPENABLE_INVENTORY_BOXES: Record<string, { pool: ShopCategory; drawCount: number }> = {
  签到补给箱: { pool: '日常', drawCount: 1 },
  零七日用包: { pool: '日常', drawCount: 2 },
};

function isShopCategory(value: unknown): value is ShopCategory {
  return typeof value === 'string' && SHOP_CATEGORY_ORDER.includes(value as ShopCategory);
}

function isItemPoolRarity(value: unknown): value is NewItemPoolShopItemInput['rarity'] {
  return typeof value === 'string' && ITEM_POOL_RARITIES.includes(value as NewItemPoolShopItemInput['rarity']);
}

function normalizePositiveInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric) || numeric <= 0) {
    return null;
  }

  return numeric;
}

function createCustomShopItemId(name: string, existingIds: Set<string>): string {
  let hash = 0;
  for (const char of name.trim()) {
    hash = ((hash << 5) - hash + char.codePointAt(0)!) >>> 0;
  }

  const base = `custom-${hash.toString(36) || 'item'}`;
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  existingIds.add(candidate);
  return candidate;
}

function cloneSocialCharacter(character: SocialCharacterState): SocialCharacterState {
  return klona(character);
}

function syncSocialCharacterFromTarget(character: SocialCharacterState, target: TargetState): SocialCharacterState {
  return {
    ...character,
    好感度: target.好感度,
    关系: target.好感度等级,
    心情: target.心情,
    当前位置: target.当前位置,
    心里想法: target.心里想法,
    身份: target.基础信息.身份,
    年龄: target.基础信息.年龄,
    种族: target.基础信息.种族,
    性格: target.职业信息.天赋,
    当前状态: normalizePenisState(target.阴茎状态),
    外貌: target.职业信息.职业名称,
    衣着: [target.衣物状态.衣服, target.衣物状态.裤子, target.衣物状态.鞋子].filter(Boolean).join(' / '),
    备注: character.备注 || `${target.职业信息.职业名称}｜${target.职业信息.派系}`,
  };
}

function targetToSocialCharacter(target: TargetState): SocialCharacterState {
  return syncSocialCharacterFromTarget({} as SocialCharacterState, target);
}

const NPC_PROFILE_TEXT_FIELDS = [
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
] as const;
const NPC_PROFILE_PLACEHOLDER_VALUES = new Set(['', '未知', '不详', '暂无', '无', '空', '可互动']);
const NPC_PROFILE_RELATION_PLACEHOLDER_VALUES = new Set(['', '未知', '不详', '暂无', '无', '空', '普通']);
const NPC_PROFILE_STAGE_ORDER: NpcProfileState['认知阶段'][] = ['待识别', '初识', '熟识', '攻略'];

function cloneNpcProfile(profile: NpcProfileState): NpcProfileState {
  return klona(profile);
}

function normalizeCommunityState(state: GameState): GameState {
  return normalizeGameCommunityState(state);
}

function createEmptyNpcProfile(): NpcProfileState {
  return {
    好感度: 0,
    关系: '普通',
    心情: '未知',
    当前位置: '未知',
    心里想法: '',
    身份: '未知',
    年龄: '未知',
    种族: '未知',
    性格: '未知',
    当前状态: '可互动',
    外貌: '',
    衣着: '',
    备注: '',
    认知阶段: '待识别',
    首次发现时间: '',
    最后更新时间: '',
    最近来源: '',
  };
}

function normalizeNpcProfileStage(stage: unknown): NpcProfileState['认知阶段'] {
  return NPC_PROFILE_STAGE_ORDER.includes(stage as NpcProfileState['认知阶段'])
    ? (stage as NpcProfileState['认知阶段'])
    : '待识别';
}

function getNpcProfileStageRank(stage: NpcProfileState['认知阶段']): number {
  return NPC_PROFILE_STAGE_ORDER.indexOf(stage);
}

function isUsefulNpcProfileText(
  field: (typeof NPC_PROFILE_TEXT_FIELDS)[number],
  value: unknown,
  existingValue: string,
): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const text = value.trim();
  if (!text) {
    return false;
  }

  const placeholderValues = field === '关系' ? NPC_PROFILE_RELATION_PLACEHOLDER_VALUES : NPC_PROFILE_PLACEHOLDER_VALUES;
  if (placeholderValues.has(text) && !placeholderValues.has(existingValue)) {
    return false;
  }

  return true;
}

function socialCharacterToNpcProfilePatch(character: SocialCharacterState): Partial<NpcProfileState> {
  return {
    好感度: character.好感度,
    关系: character.关系,
    心情: character.心情,
    当前位置: character.当前位置,
    心里想法: character.心里想法,
    身份: character.身份,
    年龄: character.年龄,
    种族: character.种族,
    性格: character.性格,
    当前状态: character.当前状态,
    外貌: character.外貌,
    衣着: character.衣着,
    备注: character.备注,
  };
}

function targetToNpcProfilePatch(target: TargetState): Partial<NpcProfileState> {
  return {
    ...socialCharacterToNpcProfilePatch(targetToSocialCharacter(target)),
    认知阶段: '攻略',
  };
}

function mergeNpcProfile(
  existing: NpcProfileState | undefined,
  patch: Partial<NpcProfileState>,
  options: {
    stage: NpcProfileState['认知阶段'];
    source: string;
    updatedAt: string;
  },
): NpcProfileState {
  const next = existing ? cloneNpcProfile(existing) : createEmptyNpcProfile();

  for (const field of NPC_PROFILE_TEXT_FIELDS) {
    const currentValue = next[field];
    const nextValue = patch[field];
    if (isUsefulNpcProfileText(field, nextValue, currentValue)) {
      next[field] = nextValue.trim();
    }
  }

  if (typeof patch.好感度 === 'number' && Number.isFinite(patch.好感度) && (patch.好感度 !== 0 || next.好感度 === 0)) {
    next.好感度 = patch.好感度;
  }

  const currentStage = normalizeNpcProfileStage(next.认知阶段);
  const nextStage = normalizeNpcProfileStage(options.stage);
  if (getNpcProfileStageRank(nextStage) > getNpcProfileStageRank(currentStage)) {
    next.认知阶段 = nextStage;
  } else {
    next.认知阶段 = currentStage;
  }

  if (!next.首次发现时间) {
    next.首次发现时间 = options.updatedAt;
  }
  next.最后更新时间 = options.updatedAt;
  next.最近来源 = options.source;

  return next;
}

function syncNpcProfilesFromSocialState(state: GameState): GameState {
  const updatedAt = getCurrentTimestamp(state);
  const names = _.uniq([
    ...Object.keys(state.周围人物),
    ...Object.keys(state.历史人物),
    ...Object.keys(state.攻略目标),
  ]);

  for (const name of names) {
    let patch: Partial<NpcProfileState> | null = null;
    let stage: NpcProfileState['认知阶段'] = '初识';
    let source = '历史人物';

    if (state.攻略目标[name]) {
      patch = targetToNpcProfilePatch(state.攻略目标[name]);
      stage = '攻略';
      source = '攻略目标';
    } else if (state.周围人物[name]) {
      patch = socialCharacterToNpcProfilePatch(state.周围人物[name]);
      stage = '初识';
      source = '周围人物';
    } else if (state.历史人物[name]) {
      patch = socialCharacterToNpcProfilePatch(state.历史人物[name]);
      stage = '初识';
      source = '历史人物';
    }

    state.零七系统.手机.NPC档案[name] = mergeNpcProfile(state.零七系统.手机.NPC档案[name], patch ?? {}, {
      stage,
      source,
      updatedAt,
    });
  }

  return state;
}

function normalizePhoneContactsFromLegacyState(
  state: GameState,
  loaded: Partial<GameState> | null | undefined,
): GameState {
  const rawPhone =
    loaded?.零七系统 && _.isPlainObject(loaded.零七系统)
      ? (loaded.零七系统 as Record<string, unknown>).手机
      : undefined;
  const hasContactsField = Boolean(
    rawPhone && _.isPlainObject(rawPhone) && Object.prototype.hasOwnProperty.call(rawPhone, '联系人'),
  );
  if (hasContactsField) {
    state.零七系统.手机.联系人 = _.uniq(state.零七系统.手机.联系人.filter(Boolean));
    return state;
  }

  state.零七系统.手机.联系人 = _.uniq([
    ...state.零七系统.手机.联系人,
    ...Object.keys(state.零七系统.手机.通讯记录),
    ...Object.keys(state.攻略目标),
  ]);
  return state;
}

function syncPhoneStateProfiles(state: GameState, loaded?: Partial<GameState> | null): GameState {
  if (loaded !== undefined) {
    normalizePhoneContactsFromLegacyState(state, loaded);
  } else {
    state.零七系统.手机.联系人 = _.uniq(state.零七系统.手机.联系人.filter(Boolean));
  }
  return syncNpcProfilesFromSocialState(state);
}

function syncTargetFromSocialCharacter(
  target: TargetState,
  character: SocialCharacterState,
  characterPatch: Partial<SocialCharacterState>,
): TargetState {
  const nextTarget: TargetState = {
    ...target,
  };

  if ('好感度' in characterPatch) {
    nextTarget.好感度 = character.好感度;
  }
  if ('关系' in characterPatch) {
    nextTarget.好感度等级 = character.关系;
  }
  if ('心情' in characterPatch) {
    nextTarget.心情 = character.心情;
  }
  if ('当前位置' in characterPatch) {
    nextTarget.当前位置 = character.当前位置;
  }
  if ('心里想法' in characterPatch) {
    nextTarget.心里想法 = character.心里想法;
  }
  if ('当前状态' in characterPatch) {
    nextTarget.阴茎状态 = normalizePenisState(character.当前状态);
  }

  let shouldSyncBaseInfo = false;
  const nextBaseInfo = {
    ...target.基础信息,
  };
  if ('身份' in characterPatch) {
    nextBaseInfo.身份 = character.身份;
    shouldSyncBaseInfo = true;
  }
  if ('年龄' in characterPatch) {
    nextBaseInfo.年龄 = character.年龄;
    shouldSyncBaseInfo = true;
  }
  if ('种族' in characterPatch) {
    nextBaseInfo.种族 = character.种族;
    shouldSyncBaseInfo = true;
  }
  if (shouldSyncBaseInfo) {
    nextTarget.基础信息 = nextBaseInfo;
  }

  return nextTarget;
}

function syncSocialUpdatesIntoTargets(state: GameState, patch: Partial<GameState>): GameState {
  const buckets: SocialBucketKey[] = ['周围人物', '历史人物'];

  for (const bucket of buckets) {
    const bucketPatch = patch[bucket];
    if (!_.isPlainObject(bucketPatch)) {
      continue;
    }

    for (const [name, rawCharacterPatch] of Object.entries(bucketPatch as Record<string, unknown>)) {
      const target = state.攻略目标[name];
      const character = state[bucket][name];
      if (!target || !character || !_.isPlainObject(rawCharacterPatch)) {
        continue;
      }

      state.攻略目标[name] = syncTargetFromSocialCharacter(
        target,
        character,
        rawCharacterPatch as Partial<SocialCharacterState>,
      );
    }
  }

  return state;
}

function syncTrackedSocialCharactersFromTargets(state: GameState): GameState {
  const buckets: SocialBucketKey[] = ['周围人物', '历史人物'];

  for (const [name, target] of Object.entries(state.攻略目标)) {
    for (const bucket of buckets) {
      const character = state[bucket][name];
      if (character) {
        state[bucket][name] = syncSocialCharacterFromTarget(character, target);
      }
    }
  }

  return state;
}

function normalizeSocialBuckets(state: GameState): GameState {
  for (const name of Object.keys(state.周围人物)) {
    delete state.历史人物[name];
  }

  return state;
}

function stabilizeSocialBuckets(previousState: GameState, patch: Partial<GameState>, nextState: GameState): GameState {
  const hasScenePatch = _.isPlainObject(patch.周围人物) || patch.零七系统?.当前地点 != null;
  if (!hasScenePatch) {
    return nextState;
  }

  const scenePatch: SocialScenePatch = {
    ...(patch.零七系统?.当前地点 != null ? { 零七系统: { 当前地点: patch.零七系统.当前地点 } } : {}),
    ...(_.isPlainObject(patch.周围人物) ? { 周围人物: patch.周围人物 } : {}),
    ...(_.isPlainObject(patch.历史人物) ? { 历史人物: patch.历史人物 } : {}),
    ...(_.isPlainObject(patch.攻略目标) ? { 攻略目标: patch.攻略目标 } : {}),
  };

  const stabilizedPatch = stabilizeSocialScenePatch({
    state: previousState,
    patch: scenePatch,
    userInput: '',
    maintext: '',
  });
  if (!stabilizedPatch) {
    return nextState;
  }

  const stabilizedState = mergeGameState(nextState, stabilizedPatch as Partial<GameState>);
  return normalizeSocialBuckets(stabilizedState);
}

function archiveStaleNearbyCharacters(
  previousState: GameState,
  nextState: GameState,
  patch: Partial<GameState>,
): GameState {
  if (patch.零七系统?.当前地点 == null || !_.isPlainObject(patch.周围人物)) {
    return nextState;
  }

  const nextNearbyNames = new Set(Object.keys(nextState.周围人物));
  for (const [name, character] of Object.entries(previousState.周围人物)) {
    if (nextNearbyNames.has(name)) {
      continue;
    }

    nextState.历史人物[name] = cloneSocialCharacter(nextState.历史人物[name] ?? character);
  }

  return nextState;
}

function applyPatchWithNullDeletion(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete target[key];
      continue;
    }

    if (_.isPlainObject(value) && _.isPlainObject(target[key])) {
      applyPatchWithNullDeletion(target[key] as Record<string, unknown>, value as Record<string, unknown>);
      continue;
    }

    target[key] = Array.isArray(value) || _.isPlainObject(value) ? klona(value) : value;
  }
}

function mergeGameState(base: GameState, patch: Partial<GameState>): GameState {
  const next = klona(base) as Record<string, unknown>;
  applyPatchWithNullDeletion(next, patch as Record<string, unknown>);
  return Schema.parse(prepareCommunityInputForSchema(next)) as GameState;
}

function resolveQuestRecordKey(record: Record<string, QuestState>, rawName: string): string | undefined {
  return findQuestKeyByCanonical(record, rawName);
}

function normalizeQuestPatchRecordKeys(
  record: Record<string, unknown>,
  previousActive: Record<string, QuestState>,
  previousCompleted: Record<string, QuestState>,
  nextActive: Record<string, unknown>,
  nextCompleted: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedRecord: Record<string, unknown> = {};

  for (const [rawName, value] of Object.entries(record)) {
    const normalizedName = normalizeQuestName(rawName);
    if (!normalizedName) {
      continue;
    }

    const key =
      findQuestKeyByCanonical(previousActive, normalizedName) ??
      findQuestKeyByCanonical(previousCompleted, normalizedName) ??
      findQuestKeyByCanonical(nextActive, normalizedName) ??
      findQuestKeyByCanonical(nextCompleted, normalizedName) ??
      normalizedName;
    normalizedRecord[key] = value;
  }

  return normalizedRecord;
}

function stripSystemClockPatch(patch: Partial<GameState>): Partial<GameState> {
  if (!_.isPlainObject(patch.零七系统)) {
    return patch;
  }

  const nextPatch = klona(patch) as Partial<GameState>;
  const nextSystemPatch = nextPatch.零七系统 as Partial<GameState['零七系统']>;
  if ('日期' in nextSystemPatch) {
    delete nextSystemPatch.日期;
  }
  if ('时间' in nextSystemPatch) {
    delete nextSystemPatch.时间;
  }

  if (Object.keys(nextSystemPatch).length === 0) {
    delete nextPatch.零七系统;
  }

  return nextPatch;
}

function normalizeQuestPatchKeys(previousState: GameState, patch: Partial<GameState>): Partial<GameState> {
  const systemPatch = patch.零七系统;
  if (!systemPatch || (!_.isPlainObject(systemPatch.任务列表) && !_.isPlainObject(systemPatch.已完成任务列表))) {
    return patch;
  }

  const nextPatch = klona(patch) as Partial<GameState>;
  const nextSystemPatch = nextPatch.零七系统 as Partial<GameState['零七系统']>;
  const activePatch = _.isPlainObject(nextSystemPatch.任务列表)
    ? normalizeQuestPatchRecordKeys(
        nextSystemPatch.任务列表 as Record<string, unknown>,
        previousState.零七系统.任务列表,
        previousState.零七系统.已完成任务列表,
        {},
        {},
      )
    : undefined;
  const completedPatch = _.isPlainObject(nextSystemPatch.已完成任务列表)
    ? normalizeQuestPatchRecordKeys(
        nextSystemPatch.已完成任务列表 as Record<string, unknown>,
        previousState.零七系统.任务列表,
        previousState.零七系统.已完成任务列表,
        activePatch ?? {},
        {},
      )
    : undefined;

  if (activePatch) {
    nextSystemPatch.任务列表 = activePatch as GameState['零七系统']['任务列表'];
  }

  if (completedPatch) {
    nextSystemPatch.已完成任务列表 = completedPatch as GameState['零七系统']['已完成任务列表'];
    const deletePatch = _.isPlainObject(nextSystemPatch.任务列表)
      ? { ...(nextSystemPatch.任务列表 as Record<string, unknown>) }
      : {};
    for (const completedName of Object.keys(completedPatch)) {
      const activeKey =
        findQuestKeyByCanonical(previousState.零七系统.任务列表, completedName) ??
        findQuestKeyByCanonical(deletePatch, completedName);
      if (activeKey) {
        deletePatch[activeKey] = null;
      }
    }
    if (Object.keys(deletePatch).length) {
      nextSystemPatch.任务列表 = deletePatch as GameState['零七系统']['任务列表'];
    }
  }

  return nextPatch;
}

function mergeCompletedQuestRecord(existing: QuestState | undefined, next: QuestState): QuestState {
  return {
    ...next,
    ...existing,
    积分奖励: existing?.积分奖励 ?? next.积分奖励,
    积分奖励类型: existing?.积分奖励类型 ?? next.积分奖励类型,
    奖励池: existing?.奖励池 ?? next.奖励池,
    奖励池抽取数: existing?.奖励池抽取数 ?? next.奖励池抽取数,
    物品奖励: existing?.物品奖励 ?? next.物品奖励,
    获得积分: existing?.获得积分 ?? next.获得积分,
    获得积分类型: existing?.获得积分类型 ?? next.获得积分类型,
    获得物品: existing?.获得物品 ?? next.获得物品,
    完成时间: existing?.完成时间 ?? next.完成时间,
    状态: '已完成',
  };
}

function isQuestCompletedStatus(status?: string): boolean {
  return status?.trim() === '已完成';
}

function normalizeCompletedQuestArchive(state: GameState): GameState {
  for (const [questName, quest] of Object.entries(state.零七系统.任务列表)) {
    if (!isQuestCompletedStatus(quest.状态)) {
      continue;
    }

    const completedKey = resolveQuestRecordKey(state.零七系统.已完成任务列表, questName) ?? questName;
    state.零七系统.已完成任务列表[completedKey] = mergeCompletedQuestRecord(
      state.零七系统.已完成任务列表[completedKey],
      {
        ...quest,
        状态: '已完成',
        完成时间: state.零七系统.已完成任务列表[completedKey]?.完成时间 ?? quest.完成时间,
      },
    );
    delete state.零七系统.任务列表[questName];
  }

  for (const [questName, completedQuest] of Object.entries({ ...state.零七系统.已完成任务列表 })) {
    const canonical = getQuestCanonicalKey(questName);
    if (!canonical) {
      delete state.零七系统.已完成任务列表[questName];
      continue;
    }

    const canonicalCompletedKey = Object.keys(state.零七系统.已完成任务列表).find(
      key => key !== questName && getQuestCanonicalKey(key) === canonical,
    );
    const targetKey = canonicalCompletedKey ?? questName;
    if (targetKey !== questName) {
      state.零七系统.已完成任务列表[targetKey] = mergeCompletedQuestRecord(
        state.零七系统.已完成任务列表[targetKey],
        completedQuest,
      );
      delete state.零七系统.已完成任务列表[questName];
    } else {
      state.零七系统.已完成任务列表[targetKey] = mergeCompletedQuestRecord(undefined, completedQuest);
    }

    const activeKey = resolveQuestRecordKey(state.零七系统.任务列表, targetKey);
    if (activeKey) {
      delete state.零七系统.任务列表[activeKey];
    }
  }

  return state;
}

function createTodayRecord(existing: number[]): number {
  const next = existing.length + 1;
  return next;
}

function syncCheckinStateForDateChange(previousDateText: string, nextDateText: string, state: GameState): void {
  if (nextDateText !== previousDateText) {
    state.零七系统.签到.今日已签到 = false;
  }
}

function cloneRewardItems(items?: RewardItem[]): RewardItem[] {
  return items ? items.map(item => ({ ...item })) : [];
}

function advanceSystemClock(state: GameState, minutesToAdvance = 15): void {
  const system = state.零七系统;
  const { year, month, day } = parseGameDateParts(system.日期);
  const { hour, minute } = parseGameTimeParts(system.时间);
  const nextDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  nextDate.setMinutes(nextDate.getMinutes() + minutesToAdvance);

  const nextYear = nextDate.getFullYear();
  const nextMonth = nextDate.getMonth() + 1;
  const nextDay = nextDate.getDate();
  const nextHour = nextDate.getHours();
  const nextMinute = nextDate.getMinutes();
  const previousDateText = system.日期;
  const nextDateText = formatGameDateParts(nextYear, nextMonth, nextDay);

  system.日期 = nextDateText;
  system.时间 = formatGameTimeParts(nextHour, nextMinute);
  syncCheckinStateForDateChange(previousDateText, nextDateText, state);
  reconcilePrivateAgreements(state);
}

function getCurrentTimestamp(state: GameState): string {
  return `${state.零七系统.日期} ${state.零七系统.时间}`;
}

function normalizeQuestCategory(type?: string): string {
  if (!type?.trim()) {
    return '其他';
  }

  const normalized = type.trim();

  if (normalized === '社交' || normalized === '管理1') {
    return '攻略';
  }

  if (normalized === '主线') {
    return '历程';
  }

  if (normalized === '支线') {
    return '探索';
  }

  return normalized;
}

function resolveQuestPointType(quest: QuestState): QuestState['积分奖励类型'] | '系统' {
  if (quest.积分奖励类型) {
    return quest.积分奖励类型;
  }

  const category = normalizeQuestCategory(quest.类型);
  const context = `${quest.描述} ${quest.地点}`;

  if (/(学府|校园|学院|行政楼|教学楼|学生会|导师|竞赛|科研|论文|专利|公会|委托)/.test(context)) {
    return '学府';
  }

  if (['历程', '探索', '修炼', '委托'].includes(category)) {
    return '学府';
  }

  return '系统';
}

function createShopSlotId(category: ShopCategory, index: number): string {
  return `${category}-${String(index + 1).padStart(2, '0')}`;
}

function normalizeCategoryRestockRounds(shop: GameState['零七系统']['商店']): void {
  shop.分类补货轮次 = {
    日常: Math.max(shop.分类补货轮次?.日常 ?? 0, 0),
    修炼: Math.max(shop.分类补货轮次?.修炼 ?? 0, 0),
    情趣: Math.max(shop.分类补货轮次?.情趣 ?? 0, 0),
  };
}

function buildCategorySlots(options: {
  category: ShopCategory;
  categoryPool: ShopItem[];
  seenIds: Set<string>;
  soldIds: Set<string>;
}): Pick<ShopBuildResult, 'freshCount' | 'replenishedCount' | 'repeatedCount'> & {
  items: ShopItemState[];
  nextSeenIds: string[];
  nextSoldIds: string[];
  restocked: boolean;
} {
  const { category, categoryPool, seenIds, soldIds } = options;
  if (!categoryPool.length) {
    return {
      items: [],
      freshCount: 0,
      replenishedCount: 0,
      repeatedCount: 0,
      nextSeenIds: [],
      nextSoldIds: [],
      restocked: false,
    };
  }

  const workingSeenIds = new Set(seenIds);
  const workingSoldIds = new Set(soldIds);
  const categoryIds = new Set(categoryPool.map(item => item.id));
  const unsoldUniqueItems = categoryPool.filter(item => !workingSoldIds.has(item.id));
  const soldUniqueItems = categoryPool.filter(item => workingSoldIds.has(item.id));
  const shouldRestock = unsoldUniqueItems.length === 0 && soldUniqueItems.length > 0;

  if (shouldRestock) {
    for (const item of categoryPool) {
      workingSoldIds.delete(item.id);
      workingSeenIds.delete(item.id);
    }
  }

  const freshItems = _.shuffle(
    categoryPool.filter(item => !workingSeenIds.has(item.id) && !workingSoldIds.has(item.id)),
  ).slice(0, SHOP_SLOT_COUNT_PER_CATEGORY);
  const selectedItems: ShopItem[] = [...freshItems];
  const selectedIds = new Set(freshItems.map(item => item.id));

  const unsoldItems = _.shuffle(
    categoryPool.filter(item => !selectedIds.has(item.id) && !workingSoldIds.has(item.id)),
  ).slice(0, SHOP_SLOT_COUNT_PER_CATEGORY - selectedItems.length);
  for (const item of unsoldItems) {
    selectedItems.push(item);
    selectedIds.add(item.id);
  }

  const unsoldPool = categoryPool.filter(item => !workingSoldIds.has(item.id));
  while (selectedItems.length < SHOP_SLOT_COUNT_PER_CATEGORY && unsoldPool.length) {
    selectedItems.push(unsoldPool[selectedItems.length % unsoldPool.length]);
  }

  const repeatedCount = Math.max(selectedItems.length - selectedIds.size, 0);
  for (const item of selectedItems) {
    workingSeenIds.add(item.id);
  }

  return {
    items: _.shuffle(selectedItems).map((item, index) => ({
      ...item,
      slotId: createShopSlotId(category, index),
      status: 'available' as const,
      soldAt: undefined,
    })),
    freshCount: freshItems.length,
    replenishedCount: shouldRestock ? selectedItems.length : 0,
    repeatedCount,
    nextSeenIds: Array.from(workingSeenIds).filter(
      id => !categoryIds.has(id) || selectedItems.some(item => item.id === id) || seenIds.has(id),
    ),
    nextSoldIds: Array.from(workingSoldIds),
    restocked: shouldRestock,
  };
}

function buildShopSlots(shopState: GameState['零七系统']['商店'], masterPool: ShopItem[]): ShopBuildResult {
  let workingSeenIds = new Set(shopState.已见商品);
  let workingSoldIds = new Set(shopState.已售商品);
  let freshCount = 0;
  let replenishedCount = 0;
  let repeatedCount = 0;
  const restockedCategories: ShopCategory[] = [];

  const items = SHOP_CATEGORY_ORDER.flatMap(category => {
    const categoryPool = masterPool.filter(item => item.category === category);
    const built = buildCategorySlots({
      category,
      categoryPool,
      seenIds: workingSeenIds,
      soldIds: workingSoldIds,
    });

    workingSeenIds = new Set(built.nextSeenIds);
    workingSoldIds = new Set(built.nextSoldIds);
    freshCount += built.freshCount;
    replenishedCount += built.replenishedCount;
    repeatedCount += built.repeatedCount;

    if (built.restocked) {
      restockedCategories.push(category);
    }

    return built.items;
  });

  return {
    items,
    freshCount,
    replenishedCount,
    repeatedCount,
    restockedCategories,
    seenIds: Array.from(workingSeenIds),
    soldIds: Array.from(workingSoldIds),
  };
}

function shouldRebuildShopItems(items: ShopItemState[]): boolean {
  return items.length !== SHOP_TOTAL_SLOT_COUNT || items.some(item => !item.slotId || !item.status);
}

function normalizeRewardPools(pools: RewardPoolCollection): RewardPoolCollection {
  return {
    日常: cloneRewardItems(pools.日常),
    修炼: cloneRewardItems(pools.修炼),
    情趣: cloneRewardItems(pools.情趣),
  };
}

function mergeArchivedCustomShopItems(pool: ShopItem[]): ShopItem[] {
  const archive = loadItemPoolArchive();
  if (!archive) {
    return pool;
  }

  return [...pool.filter(item => !isCustomShopItem(item)), ...archive.items];
}

function syncCustomShopArchive(pool: ShopItem[]): void {
  saveItemPoolArchive(pool.filter(isCustomShopItem));
}

function normalizeShopState(state: GameState): GameState {
  const pool = state.零七系统.商品池;
  const archivedItems = loadItemPoolArchive();
  pool.商店主池 = mergeArchivedCustomShopItems(pool.商店主池).map(item => ({ ...item }));
  if (!archivedItems && pool.商店主池.some(isCustomShopItem)) {
    syncCustomShopArchive(pool.商店主池);
  }
  pool.奖励池 = normalizeRewardPools(pool.奖励池);

  const shop = state.零七系统.商店;
  shop.已见商品 = _.uniq([...(shop.已见商品 ?? []), ...shop.当前商品.map(item => item.id)]);
  shop.已售商品 = _.uniq(shop.已售商品 ?? []);
  shop.补货轮次 = Math.max(shop.补货轮次 ?? 0, 0);
  normalizeCategoryRestockRounds(shop);

  if (shouldRebuildShopItems(shop.当前商品)) {
    const rebuilt = buildShopSlots(shop, pool.商店主池);
    shop.当前商品 = rebuilt.items;
    shop.已见商品 = _.uniq(rebuilt.seenIds);
    shop.已售商品 = rebuilt.soldIds;
    if (rebuilt.restockedCategories.length > 0) {
      shop.补货轮次 += rebuilt.restockedCategories.length;
      for (const category of rebuilt.restockedCategories) {
        shop.分类补货轮次[category] += 1;
      }
    }
  }

  reconcilePrivateAgreements(state);
  return state;
}

export const useGameStore = defineStore('neon-abyss-career-world.game', () => {
  const runtime = createRuntimeAdapter();
  const data = ref<GameState>(normalizeCompletedQuestArchive(normalizeShopState(Schema.parse(DEFAULT_GAME_STATE))));
  const socialAvatars = ref<Record<string, string>>(klona(DEFAULT_SOCIAL_AVATARS));
  const initialized = ref(false);
  const recentQuestRewards = ref<QuestRewardResult[]>([]);

  function enqueueRewardResult(...rewards: QuestRewardResult[]): void {
    recentQuestRewards.value.push(...rewards);
  }

  function resolveMergedState(loaded: Partial<GameState> | null | undefined): GameState {
    const merged = loaded ? mergeGameState(DEFAULT_GAME_STATE, loaded) : Schema.parse(DEFAULT_GAME_STATE);
    const normalized = normalizeSocialBuckets(merged);
    const synced = syncTrackedSocialCharactersFromTargets(
      normalizeCompletedQuestArchive(normalizeShopState(normalized)),
    );
    const communityState = normalizeCommunityState(syncPhoneStateProfiles(synced, loaded));
    if (loaded) {
      migrateCommunityLikes(communityState);
    }
    migrateCommunityHandles(communityState);
    return communityState;
  }

  function resolveLoadedSocialAvatars(loaded: Partial<GameState> | null | undefined): Record<string, string> {
    const persisted = runtime.loadAvatarState?.();
    if (persisted && _.isPlainObject(persisted)) {
      return klona(persisted);
    }

    const avatarState = loaded?.社交头像;
    return avatarState && _.isPlainObject(avatarState) ? klona(avatarState) : klona(DEFAULT_SOCIAL_AVATARS);
  }

  function init(): GameState {
    if (initialized.value) {
      return data.value;
    }

    const loaded = runtime.loadState();
    data.value = resolveMergedState(loaded);
    socialAvatars.value = resolveLoadedSocialAvatars(loaded);
    initialized.value = true;
    if (
      loaded &&
      loaded.零七系统?.手机?.communityConfig?.communityMigrationVersion !==
        data.value.零七系统.手机.communityConfig.communityMigrationVersion
    ) {
      runtime.saveState(data.value);
    }
    return data.value;
  }

  function load(): GameState {
    const loaded = runtime.loadState();
    data.value = resolveMergedState(loaded);
    socialAvatars.value = resolveLoadedSocialAvatars(loaded);
    initialized.value = true;
    if (
      loaded &&
      loaded.零七系统?.手机?.communityConfig?.communityMigrationVersion !==
        data.value.零七系统.手机.communityConfig.communityMigrationVersion
    ) {
      runtime.saveState(data.value);
    }
    return data.value;
  }

  function replaceState(nextState: GameState | Partial<GameState>): GameState {
    data.value = resolveMergedState(nextState);
    clearRecentQuestRewards();
    save();
    return data.value;
  }

  function replaceSocialAvatars(nextAvatars: Record<string, string>): void {
    socialAvatars.value = klona(nextAvatars);
    data.value.社交头像 = klona(nextAvatars);
    save();
  }

  function save(): void {
    runtime.saveState(data.value);
    runtime.saveAvatarState(socialAvatars.value);
  }

  function updateSummarySettings(patch: Partial<GameState['零七系统']['summarySettings']>): void {
    const settings = data.value.零七系统.summarySettings;

    if (patch.floorSummaryLength != null) {
      settings.floorSummaryLength = _.clamp(
        Math.round(Number(patch.floorSummaryLength) || settings.floorSummaryLength),
        20,
        300,
      );
    }

    if (patch.floorSummarySendLimit != null) {
      settings.floorSummarySendLimit = _.clamp(
        Math.round(Number(patch.floorSummarySendLimit) || settings.floorSummarySendLimit),
        1,
        400,
      );
    }

    if (typeof patch.autoSummaryEnabled === 'boolean') {
      settings.autoSummaryEnabled = patch.autoSummaryEnabled;
    }

    if (typeof patch.summaryPrompt === 'string') {
      settings.summaryPrompt = patch.summaryPrompt.trim().slice(0, 2_000);
    }

    save();
  }

  function addInventoryItem(
    name: string,
    item: { 描述: string; 图标?: string; 品质?: 'N' | 'R' | 'SR' | 'SSR' },
    amount = 1,
  ): void {
    const current = data.value.谢自国.背包[name];
    data.value.谢自国.背包[name] = {
      数量: (current?.数量 ?? 0) + amount,
      描述: current?.描述 ?? item.描述,
      图标: current?.图标 ?? item.图标 ?? 'chip',
      品质: current?.品质 ?? item.品质 ?? 'N',
    };
  }

  function addPointReward(amount: number, pointType: QuestState['积分奖励类型'] | '系统' | '学府' = '系统'): void {
    if (amount <= 0) {
      return;
    }

    if (pointType === '学府') {
      data.value.零七系统.学府积分 += amount;
      return;
    }

    data.value.零七系统.积分 += amount;
  }

  function spendCampusPoints(amount: number): boolean {
    if (data.value.零七系统.学府积分 < amount) {
      return false;
    }

    data.value.零七系统.学府积分 -= amount;
    save();
    return true;
  }

  function getSocialCharacter(name: string): SocialCharacterEntry | null {
    const buckets: SocialBucketKey[] = ['周围人物', '历史人物'];
    for (const bucket of buckets) {
      const character = data.value[bucket][name];
      if (character) {
        return {
          name,
          bucket,
          ...cloneSocialCharacter(character),
        };
      }
    }

    return null;
  }

  function getAllSocialCharacters(): SocialCharacterEntry[] {
    const buckets: SocialBucketKey[] = ['周围人物', '历史人物'];
    return buckets.flatMap(bucket =>
      Object.entries(data.value[bucket]).map(([name, character]) => ({
        name,
        bucket,
        ...cloneSocialCharacter(character),
      })),
    );
  }

  function upsertNearbyCharacter(name: string, character: SocialCharacterState): void {
    delete data.value.历史人物[name];
    data.value.周围人物[name] = cloneSocialCharacter(character);
    save();
  }

  function upsertHistoryCharacter(name: string, character: SocialCharacterState): void {
    delete data.value.周围人物[name];
    data.value.历史人物[name] = cloneSocialCharacter(character);
    save();
  }

  function moveSocialCharacterToHistory(name: string): boolean {
    const character =
      getSocialCharacter(name) ??
      (data.value.攻略目标[name]
        ? {
            name,
            bucket: '周围人物' as const,
            ...targetToSocialCharacter(data.value.攻略目标[name]),
          }
        : null);

    if (!character) {
      return false;
    }

    delete data.value.周围人物[name];
    data.value.历史人物[name] = cloneSocialCharacter(character);
    save();
    return true;
  }

  function restoreSocialCharacterToNearby(name: string): boolean {
    const character = data.value.历史人物[name];
    if (!character) {
      return false;
    }

    data.value.周围人物[name] = cloneSocialCharacter(character);
    delete data.value.历史人物[name];
    save();
    return true;
  }

  function getAllTrackedSocialNames(): string[] {
    return _.uniq([
      ...Object.keys(data.value.周围人物),
      ...Object.keys(data.value.历史人物),
      ...Object.keys(data.value.攻略目标),
    ]);
  }

  function getPhoneContacts(): string[] {
    return [...data.value.零七系统.手机.联系人];
  }

  function getAvailablePhoneContactNames(): string[] {
    return _.uniq([
      ...Object.keys(data.value.零七系统.手机.NPC档案),
      ...Object.keys(data.value.攻略目标),
      ...Object.keys(data.value.周围人物),
      ...Object.keys(data.value.历史人物),
    ]).filter(name => !data.value.零七系统.手机.联系人.includes(name));
  }

  function addPhoneContact(name: string): boolean {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return false;
    }

    const candidateExists = Boolean(
      data.value.零七系统.手机.NPC档案[normalizedName] ||
      data.value.攻略目标[normalizedName] ||
      data.value.周围人物[normalizedName] ||
      data.value.历史人物[normalizedName] ||
      data.value.零七系统.手机.通讯记录[normalizedName],
    );
    if (!candidateExists) {
      return false;
    }

    if (!data.value.零七系统.手机.联系人.includes(normalizedName)) {
      data.value.零七系统.手机.联系人.push(normalizedName);
    }
    data.value = syncPhoneStateProfiles(data.value);
    save();
    return true;
  }

  function removePhoneContact(name: string): boolean {
    const normalizedName = name.trim();
    const nextContacts = data.value.零七系统.手机.联系人.filter(entry => entry !== normalizedName);
    if (nextContacts.length === data.value.零七系统.手机.联系人.length) {
      return false;
    }

    data.value.零七系统.手机.联系人 = nextContacts;
    save();
    return true;
  }

  function getNpcProfile(name: string): NpcProfileState | null {
    const profile = data.value.零七系统.手机.NPC档案[name];
    return profile ? cloneNpcProfile(profile) : null;
  }

  function getAllNpcProfiles(): Array<NpcProfileState & { name: string }> {
    return Object.entries(data.value.零七系统.手机.NPC档案).map(([name, profile]) => ({
      name,
      ...cloneNpcProfile(profile),
    }));
  }

  function getSocialAvatar(name: string): string | null {
    const avatar = socialAvatars.value[name];
    return typeof avatar === 'string' && avatar.startsWith('data:image/') ? avatar : null;
  }

  function setSocialAvatar(name: string, avatar: string | null): boolean {
    const normalizedName = name.trim();
    if (!normalizedName) {
      return false;
    }

    if (typeof avatar === 'string' && avatar.startsWith('data:image/')) {
      socialAvatars.value[normalizedName] = avatar;
      data.value.社交头像[normalizedName] = avatar;
    } else {
      delete socialAvatars.value[normalizedName];
      delete data.value.社交头像[normalizedName];
    }

    save();
    return true;
  }

  async function updateSocialAvatarFromFile(name: string, file: File): Promise<boolean> {
    const avatar = await fileToAvatarDataUrl(file);
    return setSocialAvatar(name, avatar);
  }

  function removeSocialAvatar(name: string): boolean {
    return setSocialAvatar(name, null);
  }

  function removeInventoryItem(name: string, amount = 1): boolean {
    const current = data.value.谢自国.背包[name];
    if (!current || current.数量 < amount) {
      return false;
    }

    current.数量 -= amount;
    if (current.数量 <= 0) {
      delete data.value.谢自国.背包[name];
    }
    return true;
  }

  function spendPoints(amount: number): boolean {
    if (data.value.零七系统.积分 < amount) {
      return false;
    }

    data.value.零七系统.积分 -= amount;
    save();
    return true;
  }

  function getCurrentShopItem(item: ShopItemState): ShopItemState | undefined {
    const shopItems = data.value.零七系统.商店.当前商品;

    if (item.slotId) {
      return shopItems.find(entry => entry.slotId === item.slotId);
    }

    return (
      shopItems.find(entry => entry.id === item.id && entry.status !== 'sold_out') ??
      shopItems.find(entry => entry.id === item.id)
    );
  }

  function markShopItemSold(item: ShopItemState): ShopItemState | null {
    const current = getCurrentShopItem(item);
    if (!current) {
      return null;
    }

    current.status = 'sold_out';
    current.soldAt = getCurrentTimestamp(data.value);
    data.value.零七系统.商店.已售商品 = _.uniq([...data.value.零七系统.商店.已售商品, current.id]);
    return current;
  }

  function refreshShop(): ShopRefreshResult {
    const shop = data.value.零七系统.商店;
    const refreshPrice = shop.刷新价格;
    if (data.value.零七系统.积分 < refreshPrice) {
      return {
        success: false,
        items: shop.当前商品,
        remainingPoints: data.value.零七系统.积分,
        refreshPrice,
        freshCount: 0,
        replenishedCount: 0,
        repeatedCount: 0,
        restockedCategories: [],
        reason: 'insufficient_points',
      };
    }

    data.value.零七系统.积分 -= refreshPrice;
    const built = buildShopSlots(shop, data.value.零七系统.商品池.商店主池);
    shop.当前商品 = built.items;
    shop.刷新次数 += 1;
    shop.上次刷新时间 = getCurrentTimestamp(data.value);
    shop.已见商品 = _.uniq(built.seenIds);
    shop.已售商品 = built.soldIds;
    if (built.restockedCategories.length > 0) {
      shop.补货轮次 += built.restockedCategories.length;
      for (const category of built.restockedCategories) {
        shop.分类补货轮次[category] += 1;
      }
    }
    save();

    return {
      success: true,
      items: shop.当前商品,
      remainingPoints: data.value.零七系统.积分,
      refreshPrice,
      freshCount: built.freshCount,
      replenishedCount: built.replenishedCount,
      repeatedCount: built.repeatedCount,
      restockedCategories: built.restockedCategories,
    };
  }

  function syncMarkedPhoneReplies(maintexts: string[]): boolean {
    let changed = false;
    for (const maintext of maintexts) {
      changed ||= syncMarkedPhoneRepliesFromNarrative(data.value, maintext);
    }

    if (changed) {
      save();
    }
    return changed;
  }

  function preparePhoneAction(action: PhoneAction): PhoneActionResult {
    return preparePhoneActionResult(action, data.value, {
      getState: () => data.value,
      save,
      addInventoryItem,
    });
  }

  async function runPrivatePhoneAction(
    action: Extract<PhoneAction, { kind: 'contact-message' }>,
  ): Promise<PhoneActionResult> {
    return runPrivatePhoneChat(action, data.value, {
      save,
      mergeVars,
      advanceClock,
      generate: runtime.generate,
      generateRaw: runtime.generateRaw,
    });
  }

  async function runCommunityBootstrapAction(
    action: Extract<PhoneAction, { kind: 'community-bootstrap' }>,
  ): Promise<PhoneActionResult> {
    const aiSyncConfig = loadAiSyncConfig();
    const aiSyncGenerator = createAiSyncRawGenerator({
      runtime,
      config: aiSyncConfig,
    });

    const response = await syncCommunityBootstrapBestEffort({
      generateRaw: aiSyncConfig.socialEnabled ? aiSyncGenerator.generate : undefined,
      state: data.value,
      userInput: data.value.零七系统.当前地点,
      maintext: '',
      app: action.app,
      worldbookContext: collectWorldbookContext(await runtime.loadLorebook(), {
        userInput: data.value.零七系统.当前地点,
        recentHistory: [],
      }),
    });

    if (!response) {
      return { success: false, reason: aiSyncGenerator.configError ?? '当前环境没有可用的社区生成通道。' };
    }

    if (!response.patch) {
      return { success: true, reason: '本轮没有相关新内容。' };
    }

    const hasAppPosts = response.patch.零七系统?.手机?.动态记录?.some(post => post.app === action.app) ?? false;
    const hasAppInbox = response.patch.零七系统?.手机?.communityInbox?.some(item => item.app === action.app) ?? false;
    mergeVars(response.patch);
    if (!hasAppPosts && !hasAppInbox) {
      return { success: true, reason: '本轮没有相关新内容。' };
    }
    return { success: true };
  }

  function purchaseShopItem(item: ShopItemState): ShopPurchaseResult {
    const currentItem = getCurrentShopItem(item);
    if (!currentItem || currentItem.status === 'sold_out') {
      return {
        success: false,
        item: {
          ...item,
          status: 'sold_out',
          soldAt: currentItem?.soldAt ?? item.soldAt,
        },
        ownedCount: data.value.谢自国.背包[item.name]?.数量 ?? 0,
        remainingPoints: data.value.零七系统.积分,
        reason: 'sold_out',
      };
    }

    if (data.value.零七系统.积分 < currentItem.price) {
      return {
        success: false,
        item: currentItem,
        ownedCount: data.value.谢自国.背包[currentItem.name]?.数量 ?? 0,
        remainingPoints: data.value.零七系统.积分,
        reason: 'insufficient_points',
      };
    }

    data.value.零七系统.积分 -= currentItem.price;
    addInventoryItem(
      currentItem.name,
      { 描述: currentItem.description, 图标: currentItem.icon, 品质: currentItem.rarity },
      1,
    );
    const soldItem = markShopItemSold(currentItem) ?? currentItem;
    save();

    return {
      success: true,
      item: { ...soldItem },
      ownedCount: data.value.谢自国.背包[currentItem.name]?.数量 ?? 1,
      remainingPoints: data.value.零七系统.积分,
    };
  }

  function drawRewardItems(poolName: QuestState['奖励池'], drawCount = 1): RewardItem[] {
    if (!poolName) {
      return [];
    }

    const pool = data.value.零七系统.商品池.奖励池[poolName] ?? [];
    if (!pool.length) {
      return [];
    }

    return Array.from({ length: drawCount }, () => {
      const index = _.random(0, pool.length - 1);
      return { ...pool[index] };
    });
  }

  function drawInventoryBoxRewards(poolName: ShopCategory, drawCount = 1): RewardItem[] {
    const openableNames = new Set(Object.keys(OPENABLE_INVENTORY_BOXES));
    const pool = data.value.零七系统.商品池.奖励池[poolName]?.filter(item => !openableNames.has(item.名称)) ?? [];
    if (!pool.length) {
      return [];
    }

    return Array.from({ length: drawCount }, () => {
      const index = _.random(0, pool.length - 1);
      return { ...pool[index] };
    });
  }

  function openInventoryBox(boxName: string): InventoryBoxOpenResult {
    const current = data.value.谢自国.背包[boxName];
    if (!current || current.数量 <= 0) {
      return {
        success: false,
        boxName,
        grantedItems: [],
        openedAt: getCurrentTimestamp(data.value),
        remainingCount: 0,
        reason: 'empty',
      };
    }

    const boxConfig = OPENABLE_INVENTORY_BOXES[boxName];
    if (!boxConfig) {
      return {
        success: false,
        boxName,
        grantedItems: [],
        openedAt: getCurrentTimestamp(data.value),
        remainingCount: current.数量,
        reason: 'not_openable',
      };
    }

    const grantedItems = mergeRewardItems(drawInventoryBoxRewards(boxConfig.pool, boxConfig.drawCount));
    if (!removeInventoryItem(boxName, 1)) {
      return {
        success: false,
        boxName,
        grantedItems: [],
        openedAt: getCurrentTimestamp(data.value),
        remainingCount: data.value.谢自国.背包[boxName]?.数量 ?? 0,
        reason: 'empty',
      };
    }

    for (const reward of grantedItems) {
      addInventoryItem(
        reward.名称,
        {
          描述: reward.描述,
          图标: reward.图标,
          品质: reward.品质,
        },
        reward.数量,
      );
    }

    save();
    return {
      success: true,
      boxName,
      grantedItems,
      openedAt: getCurrentTimestamp(data.value),
      remainingCount: data.value.谢自国.背包[boxName]?.数量 ?? 0,
    };
  }

  function rebuildShopAfterPoolChange(): void {
    const shop = data.value.零七系统.商店;
    const masterPool = data.value.零七系统.商品池.商店主池;
    const validIds = new Set(masterPool.map(item => item.id));
    shop.已见商品 = shop.已见商品.filter(id => validIds.has(id));
    shop.已售商品 = shop.已售商品.filter(id => validIds.has(id));
    const built = buildShopSlots(shop, masterPool);
    shop.当前商品 = built.items;
    shop.已见商品 = _.uniq(built.seenIds);
    shop.已售商品 = built.soldIds;
  }

  function createShopItemFromInput(input: NewItemPoolShopItemInput, existingIds: Set<string>): ShopItem | null {
    const name = input.name.trim();
    const description = input.description.trim();
    const price = normalizePositiveInteger(input.price);
    if (!name || !description || !isShopCategory(input.category) || !isItemPoolRarity(input.rarity) || price == null) {
      return null;
    }

    return {
      id: createCustomShopItemId(name, existingIds),
      name,
      category: input.category,
      price,
      rarity: input.rarity,
      icon: input.icon?.trim() || 'chip',
      description,
    };
  }

  function addItemPoolShopItem(input: NewItemPoolShopItemInput): ShopItem | null {
    const existingIds = new Set(data.value.零七系统.商品池.商店主池.map(item => item.id));
    const item = createShopItemFromInput(input, existingIds);
    if (!item) {
      return null;
    }

    data.value.零七系统.商品池.商店主池.push(item);
    syncCustomShopArchive(data.value.零七系统.商品池.商店主池);
    rebuildShopAfterPoolChange();
    save();
    return item;
  }

  function importItemPoolShopItems(inputs: NewItemPoolShopItemInput[]): ItemPoolShopItemImportResult {
    const existingIds = new Set(data.value.零七系统.商品池.商店主池.map(item => item.id));
    const existingNames = new Set(data.value.零七系统.商品池.商店主池.map(item => item.name.trim()));
    const added: ShopItem[] = [];
    const skipped: ItemPoolShopItemImportSkip[] = [];

    for (const [index, input] of inputs.entries()) {
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      const displayName = name || `第 ${index + 1} 项`;
      if (!name) {
        skipped.push({ name: displayName, reason: '缺少名称。' });
        continue;
      }

      if (existingNames.has(name)) {
        skipped.push({ name, reason: '商品池中已存在同名物品。' });
        continue;
      }

      const item = createShopItemFromInput(input, existingIds);
      if (!item) {
        skipped.push({ name: displayName, reason: '字段不完整或格式不合法。' });
        continue;
      }

      existingNames.add(item.name);
      added.push(item);
    }

    if (added.length) {
      data.value.零七系统.商品池.商店主池.push(...added);
      syncCustomShopArchive(data.value.零七系统.商品池.商店主池);
      rebuildShopAfterPoolChange();
      save();
    }

    return { added, skipped };
  }

  function updateItemPoolSource(ref: ItemPoolSourceRef, patch: ItemPoolItemPatch): boolean {
    if (ref.type === 'shop') {
      const item = data.value.零七系统.商品池.商店主池.find(entry => entry.id === ref.itemId);
      if (!item) {
        return false;
      }

      item.name = patch.name;
      item.description = patch.description;
      item.icon = patch.icon;
      item.rarity = patch.rarity;
      item.category = patch.category;
      item.price = Math.max(1, Math.trunc(patch.price ?? item.price));
      if (isCustomShopItem(item)) {
        syncCustomShopArchive(data.value.零七系统.商品池.商店主池);
      }
      rebuildShopAfterPoolChange();
      save();
      return true;
    }

    if (ref.type === 'quest-random') {
      const pool = data.value.零七系统.商品池.奖励池[ref.poolName];
      const item = pool?.[ref.index];
      if (!item) {
        return false;
      }

      item.名称 = patch.name;
      item.描述 = patch.description;
      item.图标 = patch.icon;
      item.品质 = patch.rarity;
      save();
      return true;
    }

    const quest = data.value.零七系统.任务列表[ref.questName];
    const item = quest?.物品奖励?.[ref.index];
    if (!item) {
      return false;
    }

    item.名称 = patch.name;
    item.描述 = patch.description;
    item.图标 = patch.icon;
    item.品质 = patch.rarity;
    save();
    return true;
  }

  function deleteItemPoolSource(ref: ItemPoolSourceRef): boolean {
    if (ref.type === 'shop') {
      const nextPool = data.value.零七系统.商品池.商店主池.filter(item => item.id !== ref.itemId);
      if (nextPool.length === data.value.零七系统.商品池.商店主池.length) {
        return false;
      }

      data.value.零七系统.商品池.商店主池 = nextPool;
      syncCustomShopArchive(nextPool);
      rebuildShopAfterPoolChange();
      save();
      return true;
    }

    if (ref.type === 'quest-random') {
      const pool = data.value.零七系统.商品池.奖励池[ref.poolName];
      if (!pool?.[ref.index]) {
        return false;
      }

      pool.splice(ref.index, 1);
      save();
      return true;
    }

    const quest = data.value.零七系统.任务列表[ref.questName];
    if (!quest?.物品奖励?.[ref.index]) {
      return false;
    }

    quest.物品奖励.splice(ref.index, 1);
    if (!quest.物品奖励.length) {
      delete quest.物品奖励;
    }
    save();
    return true;
  }

  function mergeRewardItems(items: RewardItem[]): RewardItem[] {
    const rewardMap = new Map<string, RewardItem>();

    for (const item of items) {
      const current = rewardMap.get(item.名称);
      if (current) {
        current.数量 += item.数量;
      } else {
        rewardMap.set(item.名称, { ...item });
      }
    }

    return Array.from(rewardMap.values());
  }

  function grantQuestRewards(
    questName: string,
    quest: QuestState,
  ): { completedQuest: QuestState; rewardResult: QuestRewardResult | null } {
    if (quest.获得积分 != null || quest.获得物品?.length) {
      return {
        completedQuest: quest,
        rewardResult: null,
      };
    }

    const fixedItems = cloneRewardItems(quest.物品奖励);
    const randomItems = drawRewardItems(quest.奖励池, quest.奖励池抽取数 ?? 1);
    const grantedItems = mergeRewardItems([...fixedItems, ...randomItems]);
    const grantedPoints = quest.积分奖励 ?? 0;
    const grantedPointType = resolveQuestPointType(quest);

    addPointReward(grantedPoints, grantedPointType);

    for (const reward of grantedItems) {
      addInventoryItem(
        reward.名称,
        {
          描述: reward.描述,
          图标: reward.图标,
          品质: reward.品质,
        },
        reward.数量,
      );
    }

    const completedAt = quest.完成时间 ?? getCurrentTimestamp(data.value);
    const completedQuest: QuestState = {
      ...quest,
      获得积分: grantedPoints,
      获得积分类型: grantedPointType,
      获得物品: grantedItems,
      完成时间: completedAt,
      状态: '已完成',
    };

    const completedQuestKey = resolveQuestRecordKey(data.value.零七系统.已完成任务列表, questName) ?? questName;
    const activeQuestKey = resolveQuestRecordKey(data.value.零七系统.任务列表, questName) ?? questName;
    data.value.零七系统.已完成任务列表[completedQuestKey] = completedQuest;
    delete data.value.零七系统.任务列表[activeQuestKey];

    return {
      completedQuest,
      rewardResult: {
        questName: completedQuestKey,
        category: normalizeQuestCategory(quest.类型),
        rewardPool: quest.奖励池,
        grantedPoints,
        grantedPointType,
        grantedItems,
        completedAt,
      },
    };
  }

  function settleNewCompletedQuests(previousState: GameState): QuestRewardResult[] {
    const rewards: QuestRewardResult[] = [];
    const existingCompletedCanonicalKeys = new Set(
      Object.keys(previousState.零七系统.已完成任务列表)
        .map(name => getQuestCanonicalKey(name))
        .filter((key): key is string => key != null),
    );

    for (const [questName, completedQuest] of Object.entries(data.value.零七系统.已完成任务列表)) {
      const previousActiveKey = resolveQuestRecordKey(previousState.零七系统.任务列表, questName);
      const previousActiveQuest = previousActiveKey ? previousState.零七系统.任务列表[previousActiveKey] : undefined;
      if (previousActiveQuest) {
        const rewardSource: QuestState = {
          ...previousActiveQuest,
          ...completedQuest,
          状态: '已完成',
          完成时间: completedQuest.完成时间 ?? previousActiveQuest.完成时间,
        };
        const { rewardResult } = grantQuestRewards(questName, rewardSource);
        if (rewardResult) {
          rewards.push(rewardResult);
        }
        continue;
      }

      const canonicalKey = getQuestCanonicalKey(questName);
      if (canonicalKey && existingCompletedCanonicalKeys.has(canonicalKey)) {
        continue;
      }

      if (completedQuest.获得积分 != null || completedQuest.获得物品?.length) {
        continue;
      }

      const { rewardResult } = grantQuestRewards(questName, completedQuest);
      if (rewardResult) {
        rewards.push(rewardResult);
      }
    }

    return rewards;
  }

  function consumeRecentQuestReward(): QuestRewardResult | null {
    if (!recentQuestRewards.value.length) {
      return null;
    }

    return recentQuestRewards.value.shift() ?? null;
  }

  function clearRecentQuestRewards(): void {
    recentQuestRewards.value = [];
  }

  function mergeVars(vars: unknown): GameState {
    const rawPatch = _.isPlainObject(vars) ? (vars as Partial<GameState>) : {};
    const previousState = klona(data.value);
    const withoutClockPatch = stripSystemClockPatch(rawPatch);
    const patch = normalizeQuestPatchKeys(previousState, withoutClockPatch);
    const previousDateText = previousState.零七系统.日期;
    const merged = normalizeCompletedQuestArchive(normalizeShopState(mergeGameState(data.value, patch)));
    const stabilized = stabilizeSocialBuckets(previousState, patch, merged);
    const normalized = normalizeSocialBuckets(stabilized);
    const withArchivedNearby = archiveStaleNearbyCharacters(previousState, normalized, patch);
    const syncedState = syncTrackedSocialCharactersFromTargets(syncSocialUpdatesIntoTargets(withArchivedNearby, patch));
    data.value = normalizeCommunityState(syncPhoneStateProfiles(syncedState));
    syncCheckinStateForDateChange(previousDateText, data.value.零七系统.日期, data.value);
    const rewards = settleNewCompletedQuests(previousState);
    if (rewards.length) {
      enqueueRewardResult(...rewards);
    }
    save();
    return data.value;
  }

  function setCourseRecurring(id: string): boolean {
    const entry = data.value.零七系统.课程表.记录.find(record => record.id === id);
    if (!entry) {
      return false;
    }

    entry.类型 = '周期';
    entry.周期星期 = getWeekdayIndex(entry.日期);
    entry.下次日期 = advanceGameClock({ date: entry.日期, time: entry.时间 || '00:00' }, { days: 7 }).date;
    if (entry.状态 === '待确认') {
      entry.状态 = '已安排';
    }
    save();
    return true;
  }

  function updateCourseScheduleEntry(id: string, patch: Partial<CourseScheduleEntry>): boolean {
    const entry = data.value.零七系统.课程表.记录.find(record => record.id === id);
    if (!entry) {
      return false;
    }

    Object.assign(entry, patch);
    save();
    return true;
  }
  function setClock(nextClock: GameClockSnapshot): GameState {
    const previousDateText = data.value.零七系统.日期;
    data.value.零七系统.日期 = nextClock.date;
    data.value.零七系统.时间 = nextClock.time;
    syncCheckinStateForDateChange(previousDateText, nextClock.date, data.value);
    reconcilePrivateAgreements(data.value);
    save();
    return data.value;
  }

  function applyClockMinutes(minutesToAdvance: number): GameState {
    advanceSystemClock(data.value, minutesToAdvance);
    save();
    return data.value;
  }

  function advanceClock(minutesToAdvance: number): GameState {
    return applyClockMinutes(minutesToAdvance);
  }

  function applyCheckin(): boolean {
    const checkin = data.value.零七系统.签到;
    if (checkin.今日已签到) {
      return false;
    }

    const dayRecord = createTodayRecord(checkin.历史记录);
    const completedAt = getCurrentTimestamp(data.value);
    const grantedPoints = 25;
    const fixedItems: RewardItem[] = [
      {
        名称: '签到补给箱',
        数量: 1,
        描述: '来自零七系统的每日签到补给。',
        图标: 'gift',
        品质: 'R',
      },
    ];
    const randomItems = drawInventoryBoxRewards('日常', 1);
    const grantedItems = mergeRewardItems([...fixedItems, ...randomItems]);

    checkin.今日已签到 = true;
    checkin.连续天数 += 1;
    checkin.历史记录.push(dayRecord);
    checkin.奖励记录.push({
      日期: data.value.零七系统.日期,
      日序号: dayRecord,
      获得积分: grantedPoints,
      获得物品: cloneRewardItems(grantedItems),
      签到时间: completedAt,
    });

    data.value.零七系统.积分 += grantedPoints;
    for (const reward of grantedItems) {
      addInventoryItem(
        reward.名称,
        {
          描述: reward.描述,
          图标: reward.图标,
          品质: reward.品质,
        },
        reward.数量,
      );
    }

    enqueueRewardResult({
      questName: '每日签到',
      category: '签到奖励',
      grantedPoints,
      grantedPointType: '系统',
      grantedItems,
      completedAt,
      source: 'checkin',
    });

    save();
    return true;
  }

  return {
    runtime,
    data,
    socialAvatars,
    initialized,
    recentQuestRewards,
    init,
    load,
    replaceState,
    replaceSocialAvatars,
    save,
    updateSummarySettings,
    mergeVars,
    setCourseRecurring,
    updateCourseScheduleEntry,
    setClock,
    advanceClock,
    addInventoryItem,
    spendPoints,
    refreshShop,
    syncMarkedPhoneReplies,
    preparePhoneAction,
    runPrivatePhoneAction,
    runCommunityBootstrapAction,
    purchaseShopItem,
    openInventoryBox,
    applyCheckin,
    grantQuestRewards,
    addPointReward,
    spendCampusPoints,
    addItemPoolShopItem,
    importItemPoolShopItems,
    updateItemPoolSource,
    deleteItemPoolSource,
    moveSocialCharacterToHistory,
    restoreSocialCharacterToNearby,
    upsertNearbyCharacter,
    upsertHistoryCharacter,
    getSocialCharacter,
    getAllSocialCharacters,
    removeSocialAvatar,
    getAllTrackedSocialNames,
    getPhoneContacts,
    getAvailablePhoneContactNames,
    addPhoneContact,
    removePhoneContact,
    getNpcProfile,
    getAllNpcProfiles,
    getSocialAvatar,
    setSocialAvatar,
    updateSocialAvatarFromFile,
    consumeRecentQuestReward,
    clearRecentQuestRewards,
  };
});
