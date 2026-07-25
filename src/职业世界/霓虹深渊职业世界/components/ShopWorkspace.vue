<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { useUiStore } from '../store/ui';
import type { ShopCategory, ShopItemState } from '../schema';

const gameStore = useGameStore();
const uiStore = useUiStore();
const activeCategory = ref<ShopCategory | '全部'>('全部');
const categories: Array<ShopCategory | '全部'> = ['全部', '日常', '修炼', '情趣'];

const shopState = computed(() => gameStore.data.零七系统.商店);
const items = computed(() => shopState.value.当前商品);
const visibleItems = computed(() => activeCategory.value === '全部'
  ? items.value
  : items.value.filter(item => item.category === activeCategory.value));
const totalOwnedCount = computed(() => items.value.reduce((sum, item) => sum + (gameStore.data.谢自国.背包[item.name]?.数量 ?? 0), 0));
const soldOutCount = computed(() => items.value.filter(item => item.status === 'sold_out').length);
const availableCount = computed(() => items.value.length - soldOutCount.value);
const lastRefreshAt = computed(() => shopState.value.上次刷新时间 || '未刷新');
const shopFeedback = ref<string>('');
const restockRoundsLabel = computed(() => `总补货 ${shopState.value.补货轮次} · 日常 ${shopState.value.分类补货轮次.日常} / 修炼 ${shopState.value.分类补货轮次.修炼} / 情趣 ${shopState.value.分类补货轮次.情趣}`);

const categoryStats = computed(() => {
  return Object.fromEntries(
    categories
      .filter((category): category is ShopCategory => category !== '全部')
      .map(category => {
        const categoryItems = items.value.filter(item => item.category === category);
        return [category, {
          total: categoryItems.length,
          soldOut: categoryItems.filter(item => item.status === 'sold_out').length,
        }];
      }),
  ) as Record<ShopCategory, { total: number; soldOut: number }>;
});

function getOwnedCount(item: ShopItemState): number {
  return gameStore.data.谢自国.背包[item.name]?.数量 ?? 0;
}

function getStatusLabel(item: ShopItemState): string {
  return item.status === 'sold_out' ? '已售罄' : '可购买';
}

function getCategoryLabel(category: ShopCategory | '全部'): string {
  if (category === '全部') {
    return `全部 · ${items.value.length}`;
  }

  const stats = categoryStats.value[category];
  return `${category} · ${stats.total}/${stats.soldOut}售罄`;
}

function showShopItem(item: ShopItemState): void {
  const ownedCount = getOwnedCount(item);
  const isSoldOut = item.status === 'sold_out';

  uiStore.openDetailModal({
    kind: 'shop-item',
    title: item.name,
    summary: item.description,
    fields: [
      { label: '槽位', value: item.slotId ?? '未编号' },
      { label: '状态', value: getStatusLabel(item) },
      { label: '分类', value: item.category },
      { label: '稀有度', value: item.rarity },
      { label: '图标', value: item.icon },
      { label: '价格', value: `${item.price} 系统积分` },
      { label: '已拥有', value: `x${ownedCount}` },
      ...(item.soldAt ? [{ label: '售罄时间', value: item.soldAt }] : []),
    ],
    chips: [item.category, item.rarity, isSoldOut ? '已售罄' : '可购买', ownedCount > 0 ? `已拥有 ${ownedCount}` : '未拥有'],
    payload: item,
    actions: isSoldOut ? [] : [{ id: `buy:${item.slotId ?? item.id}`, label: `购买 · ${item.price} 系统积分`, tone: 'primary' }],
  });
}

function refreshShop(): void {
  const result = gameStore.refreshShop();
  shopFeedback.value = result.success
    ? `商店已刷新，当前剩余 ${result.remainingPoints} 系统积分；本次上新 ${result.freshCount} 件，重复铺货 ${result.repeatedCount} 件，新轮补货 ${result.restockedCategories.length ? result.restockedCategories.join('、') : '无'}。`
    : `系统积分不足，刷新需要 ${result.refreshPrice} 系统积分。`;
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="商店概览" subtitle="固定 60 槽位货架，刷新优先补新货">
      <div class="summary-grid">
        <div class="summary-card"><span>当前系统积分</span><strong>{{ gameStore.data.零七系统.积分 }}</strong></div>
        <div class="summary-card"><span>上架槽位</span><strong>{{ items.length }}</strong></div>
        <div class="summary-card"><span>可购买 / 售罄</span><strong>{{ availableCount }} / {{ soldOutCount }}</strong></div>
        <div class="summary-card"><span>刷新价格</span><strong>{{ shopState.刷新价格 }}</strong></div>
      </div>
      <div class="shop-toolbar">
        <span class="toolbar-copy">最近刷新：{{ lastRefreshAt }} · 已拥有总计：{{ totalOwnedCount }}</span>
        <button class="refresh-button" type="button" @click="refreshShop">刷新零七商店 · {{ shopState.刷新价格 }} 系统积分</button>
      </div>
      <p class="shop-feedback">{{ restockRoundsLabel }}</p>
      <p v-if="shopFeedback" class="shop-feedback">{{ shopFeedback }}</p>
    </CollapsibleSection>

    <CollapsibleSection title="零七商店" subtitle="按日常 / 修炼 / 情趣浏览 20 槽位货架，仅消耗系统积分">
      <div class="tab-row">
        <button
          v-for="category in categories"
          :key="category"
          class="tab-button"
          :class="{ 'tab-button--active': activeCategory === category }"
          type="button"
          @click="activeCategory = category"
        >
          {{ getCategoryLabel(category) }}
        </button>
      </div>

      <div class="card-grid">
        <button
          v-for="item in visibleItems"
          :key="item.slotId ?? item.id"
          class="entity-card"
          :class="{ 'entity-card--sold-out': item.status === 'sold_out' }"
          type="button"
          @click="showShopItem(item)"
        >
          <div class="card-header">
            <div>
              <h4>{{ item.name }}</h4>
              <p class="slot-copy">{{ item.slotId ?? '未编号槽位' }}</p>
            </div>
            <span v-if="item.status === 'sold_out'" class="sold-out-tag">售罄</span>
            <span v-else class="price-tag">{{ item.price }}</span>
          </div>
          <div class="meta-row">
            <span class="category-pill">{{ item.category }}</span>
            <span class="rarity-tag" :class="`rarity-${item.rarity}`">{{ item.rarity }}</span>
          </div>
          <p>{{ item.description }}</p>
          <div class="card-footer">
            <span>图标：{{ item.icon }}</span>
            <span>{{ getStatusLabel(item) }} · 已拥有 x{{ getOwnedCount(item) }}</span>
          </div>
        </button>
      </div>
    </CollapsibleSection>
  </div>
</template>

<style scoped lang="scss">
.workspace-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-grid,
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.summary-card,
.entity-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.summary-card {
  padding: 14px;
}

.summary-card span,
.toolbar-copy,
.card-footer,
.slot-copy {
  color: #8b95b4;
  font-size: 12px;
}

.summary-card strong {
  display: block;
  margin-top: 8px;
  color: #eef2ff;
}

.shop-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.refresh-button {
  border: 1px solid rgba(0, 229, 255, 0.24);
  border-radius: 8px;
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  cursor: pointer;
  padding: 10px 14px;
}

.shop-feedback {
  margin: 10px 0 0;
  color: #8b95b4;
  font-size: 12px;
  line-height: 1.6;
}

.tab-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.tab-button {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #c9d1e8;
  cursor: pointer;
  padding: 8px 14px;
}

.tab-button--active {
  border-color: rgba(0, 229, 255, 0.22);
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
}

.entity-card {
  padding: 14px;
  color: #dbe3ff;
  text-align: left;
  cursor: pointer;
}

.entity-card:hover {
  border-color: rgba(0, 229, 255, 0.22);
  background: rgba(0, 229, 255, 0.06);
}

.entity-card--sold-out,
.entity-card--sold-out:hover {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.015);
}

.entity-card--sold-out {
  opacity: 0.74;
}

.card-header,
.card-footer,
.meta-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-header {
  margin-bottom: 8px;
  align-items: flex-start;
}

.meta-row {
  margin-bottom: 10px;
}

.card-footer {
  margin-top: 12px;
  flex-wrap: wrap;
}

.price-tag,
.category-pill,
.rarity-tag,
.sold-out-tag {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.price-tag {
  background: rgba(255, 184, 77, 0.16);
  color: #ffd089;
}

.sold-out-tag {
  background: rgba(255, 107, 129, 0.14);
  color: #ff9aaa;
}

.category-pill {
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
}

.rarity-N { background: rgba(255,255,255,0.08); color: #c9d1e8; }
.rarity-R { background: rgba(0,229,255,0.12); color: #76f4ff; }
.rarity-SR { background: rgba(168,85,247,0.14); color: #d8a0ff; }
.rarity-SSR { background: rgba(255,184,77,0.16); color: #ffd089; }

h4,
p {
  margin: 0;
}

p {
  color: #aeb7d1;
  line-height: 1.6;
}

.slot-copy {
  margin-top: 4px;
}

@media (max-width: 720px) {
  .shop-workspace {
    gap: 12px;
  }

  .shop-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .summary-grid,
  .card-grid {
    grid-template-columns: 1fr;
  }

  .tab-row {
    gap: 8px;
  }

  .tab-button {
    flex: 1 1 calc(50% - 4px);
    min-height: 42px;
    justify-content: center;
  }

  .card-header,
  .meta-row,
  .card-footer {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .summary-grid,
  .card-grid {
    gap: 10px;
  }

  .refresh-button,
  .tab-button {
    width: 100%;
    justify-content: center;
  }

  .entity-card {
    padding: 12px;
  }

  h4,
  p,
  .card-footer,
  .slot-copy {
    overflow-wrap: anywhere;
  }
}
</style>
