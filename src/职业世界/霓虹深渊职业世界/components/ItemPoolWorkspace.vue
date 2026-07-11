<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { useUiStore } from '../store/ui';
import {
  buildItemPoolCatalog,
  buildItemPoolDetailState,
  formatPriceSummary,
  getSourceChips,
  getSourceSummary,
  type ItemPoolCatalogItem,
  type ItemPoolCategory,
} from '../services/item-pool-catalog';

type SourceFilter = 'all' | 'shop' | 'quest-fixed' | 'quest-random' | 'dual';

const gameStore = useGameStore();
const uiStore = useUiStore();

const activeCategory = ref<ItemPoolCategory | '全部'>('全部');
const activeSource = ref<SourceFilter>('all');

const catalogItems = computed<ItemPoolCatalogItem[]>(() => buildItemPoolCatalog(gameStore.data));

const categories = computed<Array<ItemPoolCategory | '全部'>>(() => {
  const values = new Set<ItemPoolCategory>();
  for (const item of catalogItems.value) {
    values.add(item.category);
  }

  const ordered: ItemPoolCategory[] = ['日常', '修炼', '情趣', '其他'].filter(category => values.has(category));
  return ['全部', ...ordered];
});

const sourceFilters: Array<{ key: SourceFilter; label: string }> = [
  { key: 'all', label: '全部来源' },
  { key: 'shop', label: '商店' },
  { key: 'quest-fixed', label: '任务固定' },
  { key: 'quest-random', label: '任务随机' },
  { key: 'dual', label: '双来源' },
];

function matchesSourceFilter(item: ItemPoolCatalogItem): boolean {
  switch (activeSource.value) {
    case 'shop':
      return item.hasShop;
    case 'quest-fixed':
      return item.hasQuestFixed;
    case 'quest-random':
      return item.hasQuestRandom;
    case 'dual':
      return item.hasShop && (item.hasQuestFixed || item.hasQuestRandom);
    case 'all':
    default:
      return true;
  }
}

const visibleItems = computed(() => catalogItems.value.filter(item => {
  const categoryMatched = activeCategory.value === '全部' || item.category === activeCategory.value;
  return categoryMatched && matchesSourceFilter(item);
}));

const shopSourceCount = computed(() => catalogItems.value.filter(item => item.hasShop).length);
const questSourceCount = computed(() => catalogItems.value.filter(item => item.hasQuestFixed || item.hasQuestRandom).length);
const dualSourceCount = computed(() => catalogItems.value.filter(item => item.hasShop && (item.hasQuestFixed || item.hasQuestRandom)).length);

function categoryLabel(category: ItemPoolCategory | '全部'): string {
  if (category === '全部') {
    return `全部 · ${catalogItems.value.length}`;
  }

  const count = catalogItems.value.filter(item => item.category === category).length;
  return `${category} · ${count}`;
}

function openItemDetail(item: ItemPoolCatalogItem): void {
  uiStore.openDetailModal(buildItemPoolDetailState(item));
}

function openItemPoolCreateMenu(): void {
  uiStore.openDetailModal({
    kind: 'item-pool-create-menu',
    title: '新增商品池物品',
    summary: '选择创建方式。自己创建会直接填写表单；导出创建适合把格式和已有物品交给外部 AI 生成后再导入。',
    chips: ['商品池', '商店主池'],
    actions: [
      { id: 'item-pool:create-manual', label: '自己创建', tone: 'primary' },
      { id: 'item-pool:create-export', label: '导出创建', tone: 'secondary' },
    ],
  });
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="商品池概览" subtitle="查看当前可从商店与任务获得的物品总表">
      <div class="summary-grid">
        <div class="summary-card"><span>物品总数</span><strong>{{ catalogItems.length }}</strong></div>
        <div class="summary-card"><span>商店可得</span><strong>{{ shopSourceCount }}</strong></div>
        <div class="summary-card"><span>任务可得</span><strong>{{ questSourceCount }}</strong></div>
        <div class="summary-card"><span>双来源</span><strong>{{ dualSourceCount }}</strong></div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="可得物品图鉴" subtitle="按分类与来源筛选当前可得物品">
      <div class="item-pool-toolbar">
        <span class="toolbar-copy">新增物品会写入商店主池，并参与后续商店刷新。</span>
        <button class="create-button" type="button" aria-label="新增商品池物品" @click="openItemPoolCreateMenu">+</button>
      </div>

      <div class="tab-row">
        <button
          v-for="category in categories"
          :key="category"
          class="tab-button"
          :class="{ 'tab-button--active': activeCategory === category }"
          type="button"
          @click="activeCategory = category"
        >
          {{ categoryLabel(category) }}
        </button>
      </div>

      <div class="filter-row">
        <button
          v-for="filter in sourceFilters"
          :key="filter.key"
          class="filter-button"
          :class="{ 'filter-button--active': activeSource === filter.key }"
          type="button"
          @click="activeSource = filter.key"
        >
          {{ filter.label }}
        </button>
      </div>

      <div v-if="visibleItems.length" class="card-grid">
        <button
          v-for="item in visibleItems"
          :key="item.key"
          class="entity-card"
          type="button"
          @click="openItemDetail(item)"
        >
          <div class="card-header">
            <div>
              <h4>{{ item.name }}</h4>
              <p class="meta-line">{{ item.category }} · {{ getSourceSummary(item) }}</p>
            </div>
            <span class="rarity-tag" :class="`rarity-${item.rarity}`">{{ item.rarity }}</span>
          </div>

          <div class="chip-row">
            <span v-for="chip in getSourceChips(item)" :key="`${item.key}-${chip}`" class="category-pill">{{ chip }}</span>
          </div>

          <p>{{ item.description }}</p>

          <div class="card-footer">
            <span>图标：{{ item.icon }}</span>
            <strong>{{ formatPriceSummary(item) }}</strong>
          </div>
        </button>
      </div>

      <p v-else class="empty-copy">当前筛选条件下还没有可展示的物品。</p>
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
.meta-line,
.empty-copy,
.toolbar-copy,
.card-footer {
  color: #8b95b4;
  font-size: 12px;
}

.summary-card strong,
h4 {
  color: #eef2ff;
}

.summary-card strong {
  display: block;
  margin-top: 8px;
}

.item-pool-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.create-button {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(0, 229, 255, 0.24);
  border-radius: 8px;
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.create-button:hover {
  border-color: rgba(0, 229, 255, 0.42);
  background: rgba(0, 229, 255, 0.14);
}

.tab-row,
.filter-row,
.chip-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tab-row,
.filter-row {
  margin-bottom: 6px;
}

.tab-button,
.filter-button {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #c9d1e8;
  cursor: pointer;
  padding: 8px 14px;
}

.tab-button--active,
.filter-button--active {
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

.card-header,
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.card-header {
  margin-bottom: 10px;
}

.card-footer {
  margin-top: 12px;
}

h4,
p {
  margin: 0;
}

p {
  color: #aeb7d1;
  line-height: 1.6;
}

.chip-row {
  margin-bottom: 10px;
}

.category-pill,
.rarity-tag {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-size: 11px;
}

.category-pill {
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.06);
  color: #dbe3ff;
}

.rarity-tag {
  flex: 0 0 auto;
  padding: 4px 8px;
}

.rarity-N { background: rgba(255,255,255,0.08); color: #c9d1e8; }
.rarity-R { background: rgba(0,229,255,0.12); color: #76f4ff; }
.rarity-SR { background: rgba(168,85,247,0.14); color: #d8a0ff; }
.rarity-SSR { background: rgba(255,184,77,0.16); color: #ffd089; }
</style>
