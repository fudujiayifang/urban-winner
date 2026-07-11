import type { GameState, RewardItem, ShopCategory, ShopItem } from '../schema';
import type { ItemPoolSourceRef } from '../store/game';
import type { DetailModalState } from '../store/ui';

export type ItemPoolCategory = ShopCategory | '其他';
export type ItemPoolSourceType = 'shop' | 'quest-fixed' | 'quest-random';

export interface ItemPoolSourceView {
  type: ItemPoolSourceType;
  label: string;
  ref: ItemPoolSourceRef;
}

export interface ItemPoolCatalogItem {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: 'N' | 'R' | 'SR' | 'SSR';
  category: ItemPoolCategory;
  hasShop: boolean;
  hasQuestFixed: boolean;
  hasQuestRandom: boolean;
  shopPrices: number[];
  shopCategories: ShopCategory[];
  fixedQuestNames: string[];
  randomPools: ShopCategory[];
  randomQuestNames: string[];
  sources: ItemPoolSourceView[];
}

function createBaseView(options: {
  key: string;
  name: string;
  description: string;
  icon?: string;
  rarity?: 'N' | 'R' | 'SR' | 'SSR';
  category: ItemPoolCategory;
}): ItemPoolCatalogItem {
  return {
    key: options.key,
    name: options.name,
    description: options.description,
    icon: options.icon ?? 'chip',
    rarity: options.rarity ?? 'N',
    category: options.category,
    hasShop: false,
    hasQuestFixed: false,
    hasQuestRandom: false,
    shopPrices: [],
    shopCategories: [],
    fixedQuestNames: [],
    randomPools: [],
    randomQuestNames: [],
    sources: [],
  };
}

function ensureItemView(
  catalog: Map<string, ItemPoolCatalogItem>,
  options: {
    key: string;
    name: string;
    description: string;
    icon?: string;
    rarity?: 'N' | 'R' | 'SR' | 'SSR';
    category: ItemPoolCategory;
    preferIncoming?: boolean;
  },
): ItemPoolCatalogItem {
  const existing = catalog.get(options.key);
  if (!existing) {
    const created = createBaseView(options);
    catalog.set(options.key, created);
    return created;
  }

  if (options.preferIncoming) {
    existing.name = options.name;
    existing.description = options.description;
    existing.icon = options.icon ?? existing.icon;
    existing.rarity = options.rarity ?? existing.rarity;
    existing.category = options.category;
    return existing;
  }

  if (!existing.description && options.description) {
    existing.description = options.description;
  }

  if (existing.icon === 'chip' && options.icon) {
    existing.icon = options.icon;
  }

  if (existing.category === '其他' && options.category !== '其他') {
    existing.category = options.category;
  }

  return existing;
}

function pushUnique(list: string[], value?: string): void {
  if (!value || list.includes(value)) {
    return;
  }

  list.push(value);
}

function pushUniqueCategory(list: ShopCategory[], value?: ShopCategory): void {
  if (!value || list.includes(value)) {
    return;
  }

  list.push(value);
}

function pushUniqueNumber(list: number[], value?: number): void {
  if (typeof value !== 'number' || list.includes(value)) {
    return;
  }

  list.push(value);
}

function refsMatch(left: ItemPoolSourceRef, right: ItemPoolSourceRef): boolean {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === 'shop' && right.type === 'shop') {
    return left.itemId === right.itemId;
  }

  if (left.type === 'quest-random' && right.type === 'quest-random') {
    return left.poolName === right.poolName && left.index === right.index;
  }

  return left.type === 'quest-fixed'
    && right.type === 'quest-fixed'
    && left.questName === right.questName
    && left.index === right.index;
}

function pushSource(list: ItemPoolSourceView[], source: ItemPoolSourceView): void {
  if (list.some(entry => refsMatch(entry.ref, source.ref))) {
    return;
  }

  list.push(source);
}

function resolveQuestCategory(poolName?: ShopCategory): ItemPoolCategory {
  return poolName ?? '其他';
}

function applyShopSource(catalog: Map<string, ItemPoolCatalogItem>, item: ShopItem): void {
  const view = ensureItemView(catalog, {
    key: item.name,
    name: item.name,
    description: item.description,
    icon: item.icon,
    rarity: item.rarity,
    category: item.category,
    preferIncoming: true,
  });

  view.hasShop = true;
  pushUniqueNumber(view.shopPrices, item.price);
  pushUniqueCategory(view.shopCategories, item.category);
  pushSource(view.sources, {
    type: 'shop',
    label: `商店 · ${item.category} · ${item.price} 积分`,
    ref: { type: 'shop', itemId: item.id },
  });
}

function applyFixedQuestSource(
  catalog: Map<string, ItemPoolCatalogItem>,
  questName: string,
  poolName: ShopCategory | undefined,
  item: RewardItem,
  index: number,
): void {
  const view = ensureItemView(catalog, {
    key: item.名称,
    name: item.名称,
    description: item.描述,
    icon: item.图标,
    rarity: item.品质,
    category: resolveQuestCategory(poolName),
  });

  view.hasQuestFixed = true;
  pushUnique(view.fixedQuestNames, questName);
  pushSource(view.sources, {
    type: 'quest-fixed',
    label: `任务固定 · ${questName}`,
    ref: { type: 'quest-fixed', questName, index },
  });
}

function applyRandomQuestSource(
  catalog: Map<string, ItemPoolCatalogItem>,
  questName: string,
  poolName: ShopCategory,
  item: RewardItem,
  index: number,
): void {
  const view = ensureItemView(catalog, {
    key: item.名称,
    name: item.名称,
    description: item.描述,
    icon: item.图标,
    rarity: item.品质,
    category: poolName,
  });

  view.hasQuestRandom = true;
  pushUniqueCategory(view.randomPools, poolName);
  pushUnique(view.randomQuestNames, questName);
  pushSource(view.sources, {
    type: 'quest-random',
    label: `任务随机 · ${poolName}池 · ${questName}`,
    ref: { type: 'quest-random', poolName, index },
  });
}

export function buildItemPoolCatalog(state: GameState): ItemPoolCatalogItem[] {
  const catalog = new Map<string, ItemPoolCatalogItem>();

  for (const item of state.零七系统.商品池.商店主池) {
    applyShopSource(catalog, item);
  }

  for (const [questName, quest] of Object.entries(state.零七系统.任务列表)) {
    for (const [index, item] of (quest.物品奖励 ?? []).entries()) {
      applyFixedQuestSource(catalog, questName, quest.奖励池, item, index);
    }

    if (quest.奖励池) {
      const rewardPool = state.零七系统.商品池.奖励池[quest.奖励池] ?? [];
      for (const [index, item] of rewardPool.entries()) {
        applyRandomQuestSource(catalog, questName, quest.奖励池, item, index);
      }
    }
  }

  return Array.from(catalog.values()).sort((left, right) => {
    const categoryCompare = left.category.localeCompare(right.category, 'zh-Hans-CN');
    if (categoryCompare !== 0) {
      return categoryCompare;
    }

    return left.name.localeCompare(right.name, 'zh-Hans-CN');
  });
}

export function getSourceChips(item: ItemPoolCatalogItem): string[] {
  const chips: string[] = [item.category, item.rarity];

  if (item.hasShop && (item.hasQuestFixed || item.hasQuestRandom)) {
    chips.push('双来源');
  } else if (item.hasShop) {
    chips.push('商店可得');
  } else {
    chips.push('任务可得');
  }

  if (item.hasQuestFixed) {
    chips.push('任务固定');
  }

  if (item.hasQuestRandom) {
    chips.push('任务随机');
  }

  return chips;
}

export function getSourceSummary(item: ItemPoolCatalogItem): string {
  if (item.hasShop && (item.hasQuestFixed || item.hasQuestRandom)) {
    return '商店 + 任务';
  }

  if (item.hasShop) {
    return '商店';
  }

  return item.hasQuestFixed && item.hasQuestRandom ? '任务固定 + 随机池' : item.hasQuestFixed ? '任务固定' : '任务随机池';
}

export function formatPriceSummary(item: ItemPoolCatalogItem): string {
  if (!item.shopPrices.length) {
    return '任务来源';
  }

  const sorted = [...item.shopPrices].sort((left, right) => left - right);
  return sorted[0] === sorted[sorted.length - 1]
    ? `${sorted[0]} 积分`
    : `${sorted[0]} - ${sorted[sorted.length - 1]} 积分`;
}

export function buildItemPoolDetailState(item: ItemPoolCatalogItem): DetailModalState {
  return {
    kind: 'item-pool-item',
    title: item.name,
    summary: item.description,
    fields: [
      { label: '分类', value: item.category },
      { label: '品质', value: item.rarity },
      { label: '图标', value: item.icon },
      { label: '来源', value: getSourceSummary(item) },
      ...(item.shopPrices.length ? [{ label: '商店价格', value: formatPriceSummary(item) }] : []),
      ...(item.shopCategories.length ? [{ label: '商店分类', value: item.shopCategories.join('、') }] : []),
      ...(item.fixedQuestNames.length ? [{ label: '固定任务', value: item.fixedQuestNames.join('、') }] : []),
      ...(item.randomPools.length ? [{ label: '随机奖励池', value: item.randomPools.map(pool => `${pool}池`).join('、') }] : []),
      ...(item.randomQuestNames.length ? [{ label: '相关任务', value: item.randomQuestNames.join('、') }] : []),
      { label: '来源明细', value: item.sources.map(source => source.label).join('；') },
    ],
    chips: getSourceChips(item),
    payload: item,
    actions: [
      { id: 'edit', label: '编辑来源', tone: 'primary' },
      { id: 'delete', label: '删除来源', tone: 'danger' },
    ],
  };
}

export function findItemPoolDetailByKey(state: GameState, key: string): ItemPoolCatalogItem | null {
  return buildItemPoolCatalog(state).find(item => item.key === key) ?? null;
}

export function findItemPoolDetailBySource(state: GameState, ref: ItemPoolSourceRef): ItemPoolCatalogItem | null {
  return buildItemPoolCatalog(state).find(item => item.sources.some(source => refsMatch(source.ref, ref))) ?? null;
}
