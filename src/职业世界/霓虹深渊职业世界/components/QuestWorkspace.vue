<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { useUiStore } from '../store/ui';
import type { RewardItem } from '../schema';

const gameStore = useGameStore();
const uiStore = useUiStore();
const activeTab = ref<'active' | 'completed'>('active');

const CATEGORY_ORDER = ['攻略', '修炼', '探索', '委托', '日常', '历程', '其他'] as const;

interface QuestViewItem {
  name: string;
  类型?: string;
  状态?: string;
  描述: string;
  地点: string;
  积分奖励?: number;
  积分奖励类型?: '系统' | '学府';
  完成时间?: string;
  获得积分?: number;
  获得积分类型?: '系统' | '学府';
  奖励池?: '日常' | '修炼' | '情趣';
  奖励池抽取数?: number;
  物品奖励?: RewardItem[];
  获得物品?: RewardItem[];
  展示系别: string;
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

function sortCategoryName(a: string, b: string): number {
  const indexA = CATEGORY_ORDER.indexOf(a as (typeof CATEGORY_ORDER)[number]);
  const indexB = CATEGORY_ORDER.indexOf(b as (typeof CATEGORY_ORDER)[number]);
  const safeIndexA = indexA === -1 ? CATEGORY_ORDER.length : indexA;
  const safeIndexB = indexB === -1 ? CATEGORY_ORDER.length : indexB;
  return safeIndexA - safeIndexB || a.localeCompare(b, 'zh-Hans-CN');
}

function mapQuestEntries(source: Record<string, Omit<QuestViewItem, 'name' | '展示系别'>>): QuestViewItem[] {
  return Object.entries(source).map(([name, quest]) => ({
    name,
    ...quest,
    展示系别: normalizeQuestCategory(quest.类型),
  }));
}

function groupQuestsByCategory(quests: QuestViewItem[]): Array<{ category: string; quests: QuestViewItem[] }> {
  const groups = _.groupBy(quests, quest => quest.展示系别);

  return Object.entries(groups)
    .sort(([left], [right]) => sortCategoryName(left, right))
    .map(([category, group]) => ({
      category,
      quests: group,
    }));
}

function summarizeRewardItems(items?: RewardItem[]): string {
  if (!items?.length) {
    return '无';
  }

  return items.map(item => `${item.名称} x${item.数量}`).join('、');
}

function getQuestPointLabel(quest: QuestViewItem): string {
  const pointValue = quest.积分奖励 ?? quest.获得积分 ?? 0;
  const pointType = quest.获得积分 != null
    ? (quest.获得积分类型 ?? '系统')
    : (quest.积分奖励类型 ?? '系统');

  return `${pointType}积分 ${pointValue}`;
}

const activeQuests = computed(() => mapQuestEntries(gameStore.data.零七系统.任务列表));
const completedQuests = computed(() => mapQuestEntries(gameStore.data.零七系统.已完成任务列表));
const visibleQuests = computed(() => activeTab.value === 'active' ? activeQuests.value : completedQuests.value);
const visibleQuestGroups = computed(() => groupQuestsByCategory(visibleQuests.value));
const visibleCategoryCount = computed(() => visibleQuestGroups.value.length);
const activePendingCount = computed(() => activeQuests.value.filter(quest => ['新', '待定'].includes(quest.状态 ?? '')).length);

function groupSubtitle(category: string, count: number): string {
  return `当前分类下共有 ${count} 条任务记录`;
}

function showQuestDetail(quest: QuestViewItem): void {
  uiStore.openDetailModal({
    kind: 'quest',
    title: quest.name,
    summary: quest.描述,
    fields: [
      { label: '系别', value: quest.展示系别 },
      { label: '原始类型', value: quest.类型 ?? '未标注' },
      { label: '状态', value: quest.状态 ?? '已完成' },
      { label: '地点', value: quest.地点 },
      { label: '积分奖励', value: getQuestPointLabel(quest) },
      ...(quest.奖励池 ? [{ label: '奖励池', value: `${quest.奖励池}池${quest.奖励池抽取数 ? ` · 抽取 ${quest.奖励池抽取数} 件` : ''}` }] : []),
      ...(quest.物品奖励?.length ? [{ label: '固定奖励', value: summarizeRewardItems(quest.物品奖励) }] : []),
      ...(quest.获得物品?.length ? [{ label: '实际获得', value: summarizeRewardItems(quest.获得物品) }] : []),
      ...(quest.完成时间 ? [{ label: '完成时间', value: quest.完成时间 }] : []),
    ],
    chips: [quest.展示系别, quest.状态 ?? '已完成', ...(quest.奖励池 ? [`${quest.奖励池}池`] : [])],
    payload: quest,
  });
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="任务概览" subtitle="按系别整理当前任务与完成记录">
      <div class="summary-grid">
        <div class="summary-card"><span>进行中</span><strong>{{ activeQuests.length }}</strong></div>
        <div class="summary-card"><span>已完成</span><strong>{{ completedQuests.length }}</strong></div>
        <div class="summary-card"><span>当前系别</span><strong>{{ visibleCategoryCount }}</strong></div>
        <div class="summary-card"><span>新 / 待定</span><strong>{{ activePendingCount }}</strong></div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="任务日志" subtitle="先看状态，再按系别阅读任务">
      <div class="tab-row">
        <button class="tab-button" :class="{ 'tab-button--active': activeTab === 'active' }" type="button" @click="activeTab = 'active'">
          进行中
        </button>
        <button class="tab-button" :class="{ 'tab-button--active': activeTab === 'completed' }" type="button" @click="activeTab = 'completed'">
          已完成
        </button>
      </div>

      <div v-if="visibleQuestGroups.length" class="group-stack">
        <CollapsibleSection
          v-for="group in visibleQuestGroups"
          :key="group.category"
          :title="`${group.category} · ${group.quests.length}`"
          :subtitle="groupSubtitle(group.category, group.quests.length)"
          :open="activeTab === 'active' || group === visibleQuestGroups[0]"
        >
          <div class="list-stack list-stack--nested">
            <button
              v-for="quest in group.quests"
              :key="quest.name"
              class="entity-card"
              type="button"
              @click="showQuestDetail(quest)"
            >
              <div class="card-header">
                <div>
                  <h4>{{ quest.name }}</h4>
                  <p class="meta-line">{{ quest.展示系别 }} · {{ quest.地点 }}</p>
                </div>
                <span class="state-pill">{{ quest.状态 ?? '已完成' }}</span>
              </div>
              <p>{{ quest.描述 }}</p>
              <div class="reward-stack">
                <span v-if="quest.积分奖励 != null">奖励 {{ getQuestPointLabel(quest) }}</span>
                <span v-else-if="quest.获得积分 != null">获得 {{ getQuestPointLabel(quest) }}</span>
                <span v-else>暂无积分记录</span>
                <span v-if="quest.奖励池">随机：{{ quest.奖励池 }}池<span v-if="quest.奖励池抽取数"> ×{{ quest.奖励池抽取数 }}</span></span>
                <span v-if="quest.物品奖励?.length">固定：{{ summarizeRewardItems(quest.物品奖励) }}</span>
                <span v-if="quest.获得物品?.length">到账：{{ summarizeRewardItems(quest.获得物品) }}</span>
              </div>
              <div class="card-footer">
                <span>{{ quest.完成时间 ?? '等待结算' }}</span>
              </div>
            </button>
          </div>
        </CollapsibleSection>
      </div>

      <p v-else class="empty-copy">当前标签下还没有任务记录。</p>
    </CollapsibleSection>
  </div>
</template>

<style scoped lang="scss">
.workspace-stack,
.group-stack,
.list-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
.card-footer,
.empty-copy,
.reward-stack {
  color: #8b95b4;
  font-size: 12px;
}

.summary-card strong,
.state-pill,
h4 {
  color: #eef2ff;
}

.summary-card strong {
  display: block;
  margin-top: 8px;
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

.list-stack--nested {
  gap: 10px;
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
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.card-header {
  margin-bottom: 10px;
}

.card-footer {
  margin-top: 10px;
  flex-wrap: wrap;
}

.reward-stack {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  margin-top: 12px;
}

.state-pill {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.14);
  color: #d8a0ff;
  font-size: 11px;
}

h4,
p {
  margin: 0;
}

p {
  color: #aeb7d1;
  line-height: 1.6;
}

.empty-copy {
  margin: 0;
  padding: 10px 0 2px;
}

@media (max-width: 720px) {
  .quest-workspace {
    gap: 12px;
  }

  .summary-grid {
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
  .card-footer,
  .reward-stack {
    flex-direction: column;
    align-items: flex-start;
  }
}

@media (max-width: 480px) {
  .summary-grid {
    gap: 10px;
  }

  .tab-button {
    width: 100%;
    justify-content: center;
  }

  .entity-card {
    padding: 12px;
  }

  h4,
  p,
  .reward-stack,
  .card-footer,
  .state-pill {
    overflow-wrap: anywhere;
  }
}
</style>
