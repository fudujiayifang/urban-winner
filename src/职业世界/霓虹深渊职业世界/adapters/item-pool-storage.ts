import type { ShopItem } from '../schema';

const ITEM_POOL_STORAGE_KEY = 'neon-abyss-career-world.item-pool-archive.v1';
const ITEM_POOL_ID_PREFIX = 'custom-';
const SHOP_CATEGORIES = new Set(['日常', '修炼', '情趣']);
const ITEM_RARITIES = new Set(['N', 'R', 'SR', 'SSR']);

type ItemPoolArchive = {
  version: 1;
  items: ShopItem[];
};

export function isCustomShopItem(item: Pick<ShopItem, 'id'>): boolean {
  return item.id.startsWith(ITEM_POOL_ID_PREFIX);
}

function normalizeArchivedItems(value: unknown): ShopItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenIds = new Set<string>();
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') {
      return [];
    }

    const item = raw as Partial<ShopItem>;
    if (
      typeof item.id !== 'string' ||
      !isCustomShopItem(item as ShopItem) ||
      seenIds.has(item.id) ||
      typeof item.name !== 'string' ||
      typeof item.description !== 'string' ||
      typeof item.icon !== 'string' ||
      typeof item.price !== 'number' ||
      !Number.isInteger(item.price) ||
      item.price <= 0 ||
      typeof item.category !== 'string' ||
      !SHOP_CATEGORIES.has(item.category) ||
      typeof item.rarity !== 'string' ||
      !ITEM_RARITIES.has(item.rarity)
    ) {
      return [];
    }

    seenIds.add(item.id);
    return [
      {
        id: item.id,
        name: item.name.trim(),
        description: item.description.trim(),
        icon: item.icon.trim() || 'chip',
        price: item.price,
        category: item.category as ShopItem['category'],
        rarity: item.rarity as ShopItem['rarity'],
      },
    ];
  });
}

function parseArchive(value: unknown): ItemPoolArchive | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const archive = value as Partial<ItemPoolArchive>;
  if (archive.version !== 1 || !Array.isArray(archive.items)) {
    return null;
  }

  return {
    version: 1,
    items: normalizeArchivedItems(archive.items),
  };
}

export function loadItemPoolArchive(): ItemPoolArchive | null {
  try {
    const raw = localStorage.getItem(ITEM_POOL_STORAGE_KEY);
    return raw ? parseArchive(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function saveItemPoolArchive(items: ShopItem[]): void {
  try {
    const normalized = normalizeArchivedItems(items);
    localStorage.setItem(
      ITEM_POOL_STORAGE_KEY,
      JSON.stringify({ version: 1, items: normalized } satisfies ItemPoolArchive),
    );
  } catch {
    // 本地存储不可用时仍保留商品池当前状态，不阻塞游玩。
  }
}
