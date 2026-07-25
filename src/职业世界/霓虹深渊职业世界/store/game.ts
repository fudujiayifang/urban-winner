import _ from 'lodash';

import { createRuntimeAdapter } from '../adapters/runtime';
import { stabilizeSocialScenePatch, type SocialScenePatch } from '../services/social-state-api';
import {
  DEFAULT_GAME_STATE,
  DEFAULT_SHOP_CATEGORY_ORDER,
  DEFAULT_SHOP_SLOT_COUNT_PER_CATEGORY,
} from '../defaults';
import { normalizePenisState, Schema } from '../schema';
import type {
  GameState,
  QuestState,
  RewardItem,
  RewardPoolCollection,
  ShopCategory,
  ShopItem,
  ShopItemState,
  SocialCharacterState,
  TargetState,
} from '../schema';

export interface QuestRewardResult {
  questName: string;
  category: string;
  rewardPool?: QuestState['奖励池'];
  grantedPoints: number;
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
const OPENABLE_INVENTORY_BOXES: Record<string, { pool: ShopCategory; drawCount: number }> = {
  签到补给箱: { pool: '日常', drawCount: 2 },
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
    衣着: [
      target.衣物状态.衣服,
      target.衣物状态.裤子,
      target.衣物状态.鞋子,
    ].filter(Boolean).join(' / '),
    备注: character.备注 || `${target.职业信息.职业名称}｜${target.职业信息.派系}`,
  };
}

function targetToSocialCharacter(target: TargetState): SocialCharacterState {
  return syncSocialCharacterFromTarget({} as SocialCharacterState, target);
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

  const stabilizedState = mergeGameState(previousState, stabilizedPatch as Partial<GameState>);
  return normalizeSocialBuckets(stabilizedState);
}

function archiveStaleNearbyCharacters(previousState: GameState, nextState: GameState, patch: Partial<GameState>): GameState {
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
  return Schema.parse(next);
}

function normalizeCompletedQuestArchive(state: GameState): GameState {
  for (const [questName, completedQuest] of Object.entries(state.零七系统.已完成任务列表)) {
    state.零七系统.已完成任务列表[questName] = {
      ...completedQuest,
      状态: '已完成',
    };
    delete state.零七系统.任务列表[questName];
  }

  return state;
}

function createTodayRecord(existing: number[]): number {
  const next = existing.length + 1;
  return next;
}

function cloneRewardItems(items?: RewardItem[]): RewardItem[] {
  return items ? items.map(item => ({ ...item })) : [];
}

function getCurrentTimestamp(state: GameState): string {
  return `${state.零七系统.日期} ${state.零七系统.时间}`;
}

function normalizeQuestCategory(type?: string): string {
  if (!type?.trim()) {
    return '其他';
  }

  const normalized = type.trim();

  if (normalized === '社交') {
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

  const freshItems = _.shuffle(categoryPool.filter(item => !workingSeenIds.has(item.id) && !workingSoldIds.has(item.id)))
    .slice(0, SHOP_SLOT_COUNT_PER_CATEGORY);
  const selectedItems: ShopItem[] = [...freshItems];
  const selectedIds = new Set(freshItems.map(item => item.id));

  const unsoldItems = _.shuffle(categoryPool.filter(item => !selectedIds.has(item.id) && !workingSoldIds.has(item.id)))
    .slice(0, SHOP_SLOT_COUNT_PER_CATEGORY - selectedItems.length);
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
    nextSeenIds: Array.from(workingSeenIds).filter(id => !categoryIds.has(id) || selectedItems.some(item => item.id === id) || seenIds.has(id)),
    nextSoldIds: Array.from(workingSoldIds),
    restocked: shouldRestock,
  };
}

function buildShopSlots(
  shopState: GameState['零七系统']['商店'],
  masterPool: ShopItem[],
): ShopBuildResult {
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

function normalizeShopState(state: GameState): GameState {
  const pool = state.零七系统.商品池;
  pool.商店主池 = pool.商店主池.map(item => ({ ...item }));
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

  return state;
}

export const useGameStore = defineStore('neon-abyss-career-world.game', () => {
  const runtime = createRuntimeAdapter();
  const data = ref<GameState>(normalizeCompletedQuestArchive(normalizeShopState(Schema.parse(DEFAULT_GAME_STATE))));
  const initialized = ref(false);
  const recentQuestRewards = ref<QuestRewardResult[]>([]);

  function enqueueRewardResult(...rewards: QuestRewardResult[]): void {
    recentQuestRewards.value.push(...rewards);
  }

  function resolveMergedState(loaded: Partial<GameState> | null | undefined): GameState {
    const merged = loaded ? mergeGameState(DEFAULT_GAME_STATE, loaded) : Schema.parse(DEFAULT_GAME_STATE);
    const normalized = normalizeSocialBuckets(merged);
    return syncTrackedSocialCharactersFromTargets(normalizeCompletedQuestArchive(normalizeShopState(normalized)));
  }

  function init(): GameState {
    if (initialized.value) {
      return data.value;
    }

    const loaded = runtime.loadState();
    data.value = resolveMergedState(loaded);
    initialized.value = true;
    return data.value;
  }

  function load(): GameState {
    const loaded = runtime.loadState();
    data.value = resolveMergedState(loaded);
    initialized.value = true;
    return data.value;
  }

  function replaceState(nextState: GameState | Partial<GameState>): GameState {
    data.value = resolveMergedState(nextState);
    clearRecentQuestRewards();
    save();
    return data.value;
  }

  function save(): void {
    runtime.saveState(data.value);
  }

  function updateSummarySettings(patch: Partial<GameState['零七系统']['summarySettings']>): void {
    const settings = data.value.零七系统.summarySettings;

    if (patch.floorSummaryLength != null) {
      settings.floorSummaryLength = _.clamp(Math.round(Number(patch.floorSummaryLength) || settings.floorSummaryLength), 20, 300);
    }

    if (patch.floorSummarySendLimit != null) {
      settings.floorSummarySendLimit = _.clamp(Math.round(Number(patch.floorSummarySendLimit) || settings.floorSummarySendLimit), 1, 400);
    }

    if (typeof patch.autoSummaryEnabled === 'boolean') {
      settings.autoSummaryEnabled = patch.autoSummaryEnabled;
    }

    if (typeof patch.summaryPrompt === 'string') {
      settings.summaryPrompt = patch.summaryPrompt.trim().slice(0, 2_000);
    }

    save();
  }

  function addInventoryItem(name: string, item: { 描述: string; 图标?: string; 品质?: 'N' | 'R' | 'SR' | 'SSR' }, amount = 1): void {
    const current = data.value.谢自国.背包[name];
    data.value.谢自国.背包[name] = {
      数量: (current?.数量 ?? 0) + amount,
      描述: current?.描述 ?? item.描述,
      图标: current?.图标 ?? item.图标 ?? 'chip',
      品质: current?.品质 ?? item.品质 ?? 'N',
    };
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
    return buckets.flatMap(bucket => Object.entries(data.value[bucket]).map(([name, character]) => ({
      name,
      bucket,
      ...cloneSocialCharacter(character),
    })));
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
    const character = getSocialCharacter(name)
      ?? (data.value.攻略目标[name] ? {
        name,
        bucket: '周围人物' as const,
        ...targetToSocialCharacter(data.value.攻略目标[name]),
      } : null);

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

    return shopItems.find(entry => entry.id === item.id && entry.status !== 'sold_out')
      ?? shopItems.find(entry => entry.id === item.id);
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
    addInventoryItem(currentItem.name, { 描述: currentItem.description, 图标: currentItem.icon, 品质: currentItem.rarity }, 1);
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

  function grantQuestRewards(questName: string, quest: QuestState): { completedQuest: QuestState; rewardResult: QuestRewardResult | null } {
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

    if (grantedPoints > 0) {
      data.value.零七系统.积分 += grantedPoints;
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

    const completedAt = quest.完成时间 ?? getCurrentTimestamp(data.value);
    const completedQuest: QuestState = {
      ...quest,
      获得积分: grantedPoints,
      获得物品: grantedItems,
      完成时间: completedAt,
      状态: '已完成',
    };

    data.value.零七系统.已完成任务列表[questName] = completedQuest;
    delete data.value.零七系统.任务列表[questName];

    return {
      completedQuest,
      rewardResult: {
        questName,
        category: normalizeQuestCategory(quest.类型),
        rewardPool: quest.奖励池,
        grantedPoints,
        grantedItems,
        completedAt,
      },
    };
  }

  function settleNewCompletedQuests(previousState: GameState): QuestRewardResult[] {
    const rewards: QuestRewardResult[] = [];
    const existingCompletedNames = new Set(Object.keys(previousState.零七系统.已完成任务列表));

    for (const [questName, completedQuest] of Object.entries(data.value.零七系统.已完成任务列表)) {
      if (completedQuest.获得积分 != null || completedQuest.获得物品?.length) {
        continue;
      }

      const sourceQuest = existingCompletedNames.has(questName)
        ? previousState.零七系统.已完成任务列表[questName]
        : previousState.零七系统.任务列表[questName];

      const rewardSource = sourceQuest ?? completedQuest;
      const { rewardResult } = grantQuestRewards(questName, rewardSource);
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
    const patch = _.isPlainObject(vars) ? (vars as Partial<GameState>) : {};
    const previousState = klona(data.value);
    const merged = normalizeCompletedQuestArchive(normalizeShopState(mergeGameState(data.value, patch)));
    const stabilized = stabilizeSocialBuckets(previousState, patch, merged);
    const normalized = normalizeSocialBuckets(stabilized);
    const withArchivedNearby = archiveStaleNearbyCharacters(previousState, normalized, patch);
    data.value = syncTrackedSocialCharactersFromTargets(syncSocialUpdatesIntoTargets(withArchivedNearby, patch));
    const rewards = settleNewCompletedQuests(previousState);
    if (rewards.length) {
      enqueueRewardResult(...rewards);
    }
    save();
    return data.value;
  }

  function applyCheckin(): boolean {
    const checkin = data.value.零七系统.签到;
    if (checkin.今日已签到) {
      return false;
    }

    const dayRecord = createTodayRecord(checkin.历史记录);
    const completedAt = getCurrentTimestamp(data.value);
    const grantedPoints = 25;
    const fixedItems: RewardItem[] = [{
      名称: '签到补给箱',
      数量: 1,
      描述: '来自零七系统的每日签到补给。',
      图标: 'gift',
      品质: 'R',
    }];
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
    initialized,
    recentQuestRewards,
    init,
    load,
    replaceState,
    save,
    updateSummarySettings,
    mergeVars,
    addInventoryItem,
    spendPoints,
    refreshShop,
    purchaseShopItem,
    openInventoryBox,
    applyCheckin,
    grantQuestRewards,
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
    getAllTrackedSocialNames,
    consumeRecentQuestReward,
    clearRecentQuestRewards,
  };
});
