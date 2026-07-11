<script setup lang="ts">
import type { SocialCharacterState } from '../schema';
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { useUiStore } from '../store/ui';

const gameStore = useGameStore();
const uiStore = useUiStore();

type PersonTab = '周围人物' | '攻略' | '历史人物';
type SortKey = 'favor' | 'name';
type SocialBucketKey = '周围人物' | '历史人物' | '关注人物';

type SocialCharacterEntry = SocialCharacterState & {
  name: string;
  bucket: SocialBucketKey;
};

const activeTab = ref<PersonTab>('周围人物');
const sortKey = ref<SortKey>('favor');
const selectedName = ref<string | null>(null);

const tabOptions: PersonTab[] = ['周围人物', '攻略', '历史人物'];
const sortOptions: Array<{ key: SortKey; label: string }> = [
  { key: 'favor', label: '好感优先' },
  { key: 'name', label: '姓名排序' },
];
const roasts: Record<string, string> = {
  敖锐: '【零七：龙少爷表面高冷，心里可能已经把你二楼的房间布置成新房了。】',
  石磊: '【零七：这狮子在大门口吹冷风就为了等你，我是该说他深情还是说他憨？】',
  苍岚: '【零七：狼盯着猎物的时候也是这么笑的，你猜你是他的谁？】',
  雷啸: '【零七：这老虎满脑子都是“训练”，但他看你的眼神可不像是想教你打拳。】',
  敖昂: '【零七：影龙最擅长在暗处观察，你确定昨晚睡觉没感觉到视线吗？】',
  白祈: '【零七：睡美人豹子？你要是不趁他睡着亲一口，简直对不起这张脸。】',
  闻骁: '【零七：在他眼里，零件比你重要……除非你把自己变成他拆不开的精密锁。】',
};

const focusedNearbyCharacters = computed<SocialCharacterEntry[]>(() => Object.entries(gameStore.data.关注人物)
  .filter(([name, character]) => !gameStore.data.周围人物[name] && !gameStore.data.历史人物[name] && character.当前位置 !== '未知')
  .map(([name, character]) => ({
    name,
    bucket: '关注人物',
    ...character,
  })));
const nearbyCharacters = computed<SocialCharacterEntry[]>(() => [
  ...Object.entries(gameStore.data.周围人物).map(([name, character]) => ({
    name,
    bucket: '周围人物' as const,
    ...character,
  })),
  ...focusedNearbyCharacters.value,
]);
const historyCharacters = computed<SocialCharacterEntry[]>(() => Object.entries(gameStore.data.历史人物).map(([name, character]) => ({
  name,
  bucket: '历史人物',
  ...character,
})));
const strategyCharacters = computed<SocialCharacterEntry[]>(() => {
  const targetEntries = Object.entries(gameStore.data.攻略目标).map(([name, target]) => ({
    name,
    bucket: '关注人物' as const,
    好感度: target.好感度,
    关系: target.好感度等级,
    心情: target.心情,
    当前位置: target.当前位置,
    心里想法: target.心里想法,
    身份: target.基础信息.身份,
    年龄: target.基础信息.年龄,
    种族: target.基础信息.种族,
    性格: target.职业信息.天赋,
    当前状态: target.阴茎状态,
    外貌: target.职业信息.职业名称,
    衣着: [target.衣物状态.衣服, target.衣物状态.裤子, target.衣物状态.鞋子].filter(Boolean).join(' / '),
    备注: `${target.职业信息.职业名称}｜${target.职业信息.派系}`,
  }));
  const targetNames = new Set(targetEntries.map(character => character.name));
  const followedEntries = Object.entries(gameStore.data.关注人物)
    .filter(([name]) => !targetNames.has(name))
    .map(([name, character]) => ({
      name,
      bucket: '关注人物' as const,
      ...character,
    }));

  return [...targetEntries, ...followedEntries];
});

const activeCharacters = computed<SocialCharacterEntry[]>(() => {
  const source = activeTab.value === '周围人物'
    ? nearbyCharacters.value
    : activeTab.value === '攻略'
      ? strategyCharacters.value
      : historyCharacters.value;

  return [...source].sort((left, right) => {
    if (sortKey.value === 'name') {
      return left.name.localeCompare(right.name, 'zh-Hans-CN');
    }

    return right.好感度 - left.好感度 || left.name.localeCompare(right.name, 'zh-Hans-CN');
  });
});

const tabCounts = computed<Record<PersonTab, number>>(() => ({
  周围人物: nearbyCharacters.value.length,
  攻略: strategyCharacters.value.length,
  历史人物: historyCharacters.value.length,
}));

function displayBucket(bucket: SocialBucketKey): string {
  return bucket === '关注人物' ? '攻略' : bucket;
}

function tabHint(tab: PersonTab): string {
  if (tab === '周围人物') {
    return '当前在场、适合立刻接触的人。';
  }

  if (tab === '攻略') {
    return '已经重点留意、准备长期推进关系的人。';
  }

  return '曾经遇见、暂时离场但可以回溯的人。';
}

function openCharacterDetail(character: SocialCharacterEntry): void {
  selectedName.value = character.name;
  const bucketLabel = displayBucket(character.bucket);

  uiStore.openDetailModal({
    kind: 'social-character',
    title: character.name,
    summary: character.心里想法,
    chips: [bucketLabel, character.关系, character.当前位置],
    payload: {
      ...character,
      roast: roasts[character.name] ?? `【零七：${character.name}现在被归档在${bucketLabel}，别光看，想互动就点按钮。】`,
    },
    actions: [
      { id: `social:focus:${character.name}`, label: '填入互动', tone: 'primary' },
      ...(character.bucket === '关注人物'
        ? [{ id: `social:unfollow:${character.name}`, label: '移出攻略', tone: 'secondary' as const }]
        : [{ id: `social:follow:${character.name}`, label: '加入攻略', tone: 'secondary' as const }]),
      ...(character.bucket === '历史人物'
        ? [{ id: `social:restore:${character.name}`, label: '移回周围', tone: 'secondary' as const }]
        : [{ id: `social:archive:${character.name}`, label: '移入历史', tone: 'secondary' as const }]),
      { id: `social:promote:${character.name}`, label: '升级为攻略目标', tone: 'primary' },
    ],
  });
}

function favorPercent(value: number): number {
  return Math.min(Math.max(Math.round(value / 3000 * 100), 0), 100);
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="人物管理" subtitle="周围人物 / 攻略 / 历史人物">
      <div class="character-tabs" role="tablist" aria-label="人物分类">
        <button
          v-for="tab in tabOptions"
          :key="tab"
          type="button"
          :class="{ active: activeTab === tab }"
          role="tab"
          :aria-selected="activeTab === tab"
          @click="activeTab = tab"
        >
          <span>{{ tab }}</span>
          <strong>({{ tabCounts[tab] }})</strong>
        </button>
      </div>

      <div class="toolbar-row">
        <p class="tab-hint">{{ tabHint(activeTab) }}</p>
        <select v-model="sortKey" class="sort-select" aria-label="人物排序">
          <option v-for="option in sortOptions" :key="option.key" :value="option.key">{{ option.label }}</option>
        </select>
      </div>

      <div v-if="activeCharacters.length" class="card-grid">
        <button
          v-for="character in activeCharacters"
          :key="`${character.bucket}-${character.name}`"
          class="entity-card"
          :class="{ 'entity-card--active': selectedName === character.name }"
          type="button"
          @click="openCharacterDetail(character)"
        >
          <div class="card-header">
            <h4>{{ character.name }}</h4>
            <span class="state-pill">{{ displayBucket(character.bucket) }}</span>
          </div>
          <p class="meta-line">{{ character.身份 }} · {{ character.关系 }}</p>
          <p>{{ character.当前位置 }} · {{ character.心情 }}</p>
          <div class="mini-meter"><span :style="{ width: `${favorPercent(character.好感度)}%` }"></span></div>
          <div class="card-footer">
            <span>好感 {{ character.好感度 }}</span>
            <span>{{ character.当前状态 }}</span>
          </div>
        </button>
      </div>

      <div v-else class="empty-card">
        <strong>暂无{{ activeTab }}</strong>
        <span>等剧情把人物写入对应人物池后，这里会自动出现。</span>
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

.character-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.character-tabs button,
.sort-select {
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: #c9d1e8;
  padding: 8px 12px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}

.character-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.character-tabs button.active {
  border-color: rgba(0, 229, 255, 0.28);
  background: rgba(0, 229, 255, 0.12);
  color: #76f4ff;
}

.character-tabs strong {
  color: inherit;
  font-weight: 600;
}

.toolbar-row,
.card-header,
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-row {
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.tab-hint,
.meta-line,
.card-footer {
  color: #8b95b4;
  font-size: 12px;
}

.tab-hint {
  margin: 0;
}

.sort-select option {
  background: #0b0f20;
  color: #f7f9ff;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.entity-card,
.empty-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.entity-card {
  padding: 14px;
  color: #dbe3ff;
  cursor: pointer;
  text-align: left;
}

.entity-card:hover,
.entity-card--active {
  border-color: rgba(0, 229, 255, 0.22);
  background: rgba(0, 229, 255, 0.06);
}

.card-header {
  margin-bottom: 8px;
}

.card-footer {
  margin-top: 10px;
}

.mini-meter {
  height: 6px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.mini-meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #00e5ff, #a855f7);
}

.state-pill {
  flex: 0 0 auto;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.14);
  color: #d8a0ff;
  font-size: 11px;
}

.empty-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 22px;
  color: #8b95b4;
  text-align: center;
}

.empty-card strong {
  color: #eef2ff;
}

h4,
p {
  margin: 0;
}

h4 {
  color: #eef2ff;
}

p {
  color: #aeb7d1;
  line-height: 1.6;
}

@media (max-width: 720px) {
  .toolbar-row {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
