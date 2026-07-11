<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { useUiStore } from '../store/ui';

const gameStore = useGameStore();
const uiStore = useUiStore();

const items = computed(() => Object.entries(gameStore.data.谢自国.背包).map(([name, item]) => ({
  name,
  ...item,
})));
const totalCount = computed(() => items.value.reduce((sum, item) => sum + item.数量, 0));
const raritySummary = computed(() => {
  const summary = { N: 0, R: 0, SR: 0, SSR: 0 };
  for (const item of items.value) {
    summary[item.品质] += item.数量;
  }
  return summary;
});

function showItemDetail(item: (typeof items.value)[number]): void {
  const canOpen = ['签到补给箱', '零七日用包'].includes(item.name) && item.数量 > 0;
  uiStore.openDetailModal({
    kind: 'inventory-item',
    title: item.name,
    summary: item.描述,
    fields: [
      { label: '数量', value: `x${item.数量}` },
      { label: '图标', value: item.图标 },
      { label: '品质', value: item.品质 },
    ],
    chips: [item.品质, item.图标, ...(canOpen ? ['可开启'] : [])],
    payload: item,
    actions: canOpen
      ? [{ id: `inventory:open-box:${item.name}`, label: '打开物品', tone: 'primary' }]
      : undefined,
  });
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="背包概览" subtitle="当前携带与资源摘要">
      <div class="summary-grid">
        <div class="summary-card">
          <span class="summary-label">物品总数</span>
          <strong>{{ totalCount }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">现金</span>
          <strong>{{ gameStore.data.谢自国.金钱.toLocaleString() }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">普通 / 稀有</span>
          <strong>{{ raritySummary.N }} / {{ raritySummary.R }}</strong>
        </div>
        <div class="summary-card">
          <span class="summary-label">高阶 / 顶级</span>
          <strong>{{ raritySummary.SR }} / {{ raritySummary.SSR }}</strong>
        </div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="物品列表" subtitle="点击查看物品详情">
      <div class="card-grid">
        <button
          v-for="item in items"
          :key="item.name"
          class="entity-card"
          type="button"
          @click="showItemDetail(item)"
        >
          <div class="card-header">
            <h4>{{ item.name }}</h4>
            <span class="rarity-tag" :class="`rarity-${item.品质}`">{{ item.品质 }}</span>
          </div>
          <p>{{ item.描述 }}</p>
          <div class="card-footer">
            <span>图标：{{ item.图标 }}</span>
            <strong>x{{ item.数量 }}</strong>
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.summary-card,
.entity-card {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.summary-card {
  padding: 14px;
}

.summary-label {
  display: block;
  color: #8b95b4;
  font-size: 12px;
  margin-bottom: 8px;
}

strong {
  color: #eef2ff;
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
  color: #8b95b4;
  font-size: 12px;
}

h4,
p {
  margin: 0;
}

p {
  color: #aeb7d1;
  line-height: 1.6;
}

.rarity-tag {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 11px;
}

.rarity-N { background: rgba(255,255,255,0.08); color: #c9d1e8; }
.rarity-R { background: rgba(0,229,255,0.12); color: #76f4ff; }
.rarity-SR { background: rgba(168,85,247,0.14); color: #d8a0ff; }
.rarity-SSR { background: rgba(255,184,77,0.16); color: #ffd089; }
</style>
