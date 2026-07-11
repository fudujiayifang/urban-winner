<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Component } from 'vue';
import type { RewardItem, ShopCategory, ShopItem } from './schema';
import CheckinWorkspace from './components/CheckinWorkspace.vue';
import CollapsibleSection from './components/CollapsibleSection.vue';
import ComposerPanel from './components/ComposerPanel.vue';
import DetailModal from './components/DetailModal.vue';
import InventoryWorkspace from './components/InventoryWorkspace.vue';
import ItemPoolWorkspace from './components/ItemPoolWorkspace.vue';
import NarrativePanel from './components/NarrativePanel.vue';
import OptionChips from './components/OptionChips.vue';
import QuestWorkspace from './components/QuestWorkspace.vue';
import RightUtilityRail from './components/RightUtilityRail.vue';
import ShopWorkspace from './components/ShopWorkspace.vue';
import SocialCharacterDetailCard from './components/SocialCharacterDetailCard.vue';
import SocialTargetDetailCard from './components/SocialTargetDetailCard.vue';
import SocialWorkspace from './components/SocialWorkspace.vue';
import StartScreen from './components/StartScreen.vue';
import WorkspacePanel from './components/WorkspacePanel.vue';
import {
  buildItemPoolDetailState,
  findItemPoolDetailByKey,
  findItemPoolDetailBySource,
  type ItemPoolCatalogItem,
} from './services/item-pool-catalog';
import { sendPlayerInput } from './services/main-loop';
import { useGameStore, type ItemPoolSourceRef } from './store/game';
import { useSessionStore } from './store/session';
import type { WorkspaceDefinition, WorkspaceKey } from './store/ui';
import { useUiStore } from './store/ui';

const gameStore = useGameStore();
const sessionStore = useSessionStore();
const uiStore = useUiStore();

gameStore.init();
sessionStore.init();

const isFullscreen = ref(false);
const showStartScreen = ref(true);
const canToggleFullscreen = typeof document !== 'undefined'
  && typeof document.documentElement.requestFullscreen === 'function'
  && typeof document.exitFullscreen === 'function';
const rewardModalActive = ref(false);

function syncFullscreenState(): void {
  isFullscreen.value = typeof document !== 'undefined' && Boolean(document.fullscreenElement);
  document.body.classList.toggle('neon-career-fullscreen', isFullscreen.value);
}

const ITEM_RARITIES = ['N', 'R', 'SR', 'SSR'] as const;
const ITEM_POOL_CATEGORIES: ShopCategory[] = ['日常', '修炼', '情趣'];
const ITEM_POOL_FORMAT_EXAMPLE = JSON.stringify([
  {
    name: '物品名称',
    category: '日常',
    price: 30,
    rarity: 'R',
    icon: 'chip',
    description: '物品简介',
  },
], null, 2);

type ItemPoolCreateForm = {
  name: string;
  description: string;
  icon: string;
  rarity: (typeof ITEM_RARITIES)[number];
  category: ShopCategory;
  price: string;
};

function createBlankItemPoolForm(): ItemPoolCreateForm {
  return {
    name: '',
    description: '',
    icon: 'chip',
    rarity: 'N',
    category: '日常',
    price: '',
  };
}

const itemPoolEditState = ref<{
  original: ItemPoolCatalogItem;
  selectedSourceIndex: number;
  form: ItemPoolCreateForm;
  feedback: string | null;
} | null>(null);

const itemPoolDeleteState = ref<{
  original: ItemPoolCatalogItem;
  selectedSourceIndex: number;
  feedback: string | null;
} | null>(null);

const itemPoolCreateState = ref<{
  form: ItemPoolCreateForm;
  feedback: string | null;
} | null>(null);

const itemPoolExportCreateState = ref<{
  exportText: string;
  importText: string;
  feedback: string | null;
} | null>(null);

function summarizeRewardItems(items: RewardItem[]): string {
  return items.length
    ? items.map(item => `${item.名称} x${item.数量}`).join('、')
    : '无额外物品';
}

function createItemPoolEditForm(payload: ItemPoolCatalogItem) {
  return {
    name: payload.name,
    description: payload.description,
    icon: payload.icon,
    rarity: payload.rarity,
    category: payload.category === '其他' ? '日常' : payload.category,
    price: payload.shopPrices[0] != null ? String(payload.shopPrices[0]) : '',
  };
}

function reopenItemPoolDetailBySource(ref: ItemPoolSourceRef): boolean {
  const nextDetail = findItemPoolDetailBySource(gameStore.data, ref);
  if (!nextDetail) {
    return false;
  }

  uiStore.openDetailModal(buildItemPoolDetailState(nextDetail));
  return true;
}

function reopenItemPoolDetailByKey(key: string): boolean {
  const nextDetail = findItemPoolDetailByKey(gameStore.data, key);
  if (!nextDetail) {
    return false;
  }

  uiStore.openDetailModal(buildItemPoolDetailState(nextDetail));
  return true;
}

function openItemPoolEditModal(payload: ItemPoolCatalogItem): void {
  itemPoolDeleteState.value = null;
  itemPoolEditState.value = {
    original: payload,
    selectedSourceIndex: 0,
    form: createItemPoolEditForm(payload),
    feedback: null,
  };

  uiStore.openDetailModal({
    kind: 'item-pool-edit',
    title: `编辑 · ${payload.name}`,
    summary: '先选择要修改的来源，再保存到当前存档。',
    chips: payload.sources.map(source => source.label),
    payload,
    actions: [
      { id: 'item-pool:save', label: '保存修改', tone: 'primary' },
      { id: 'item-pool:cancel', label: '取消', tone: 'secondary' },
    ],
  });
}

function openItemPoolDeleteModal(payload: ItemPoolCatalogItem): void {
  itemPoolEditState.value = null;
  itemPoolDeleteState.value = {
    original: payload,
    selectedSourceIndex: 0,
    feedback: null,
  };

  const source = payload.sources[0];
  uiStore.openDetailModal({
    kind: 'item-pool-delete',
    title: `删除来源 · ${payload.name}`,
    summary: source ? `请选择要删除的来源。删除后会立即写入当前存档。` : '当前没有可删除的来源。',
    chips: payload.sources.map(entry => entry.label),
    payload,
    actions: source
      ? [
          { id: 'item-pool:delete-confirm', label: '确认删除此来源', tone: 'danger' },
          { id: 'item-pool:delete-cancel', label: '返回详情', tone: 'secondary' },
        ]
      : [
          { id: 'item-pool:delete-cancel', label: '返回详情', tone: 'secondary' },
        ],
  });
}

function updateItemPoolEditSource(index: number): void {
  if (!itemPoolEditState.value) {
    return;
  }

  itemPoolEditState.value.selectedSourceIndex = index;
  itemPoolEditState.value.feedback = null;
}

function updateItemPoolDeleteSource(index: number): void {
  if (!itemPoolDeleteState.value) {
    return;
  }

  itemPoolDeleteState.value.selectedSourceIndex = index;
  itemPoolDeleteState.value.feedback = null;
}

function saveItemPoolEdit(): void {
  const state = itemPoolEditState.value;
  if (!state) {
    return;
  }

  const source = state.original.sources[state.selectedSourceIndex];
  if (!source) {
    state.feedback = '未找到可编辑来源。';
    return;
  }

  const price = Number(state.form.price);
  const ok = gameStore.updateItemPoolSource(source.ref, {
    name: state.form.name.trim() || state.original.name,
    description: state.form.description.trim() || state.original.description,
    icon: state.form.icon.trim() || state.original.icon,
    rarity: state.form.rarity,
    category: state.form.category,
    price: Number.isFinite(price) ? price : undefined,
  });

  if (!ok) {
    state.feedback = '保存失败，来源可能已不存在。';
    return;
  }

  const reopened = reopenItemPoolDetailBySource(source.ref)
    || reopenItemPoolDetailByKey(state.form.name.trim() || state.original.key)
    || reopenItemPoolDetailByKey(state.original.key);

  itemPoolEditState.value = null;
  if (!reopened) {
    uiStore.openDetailModal({
      kind: 'item-pool-item',
      title: '保存成功',
      summary: `${state.original.name} 的来源已更新，但未能重新定位详情。`,
      chips: ['商品池', '已保存'],
    });
  }
}

function confirmDeleteItemPoolSource(): void {
  const state = itemPoolDeleteState.value;
  if (!state) {
    return;
  }

  const source = state.original.sources[state.selectedSourceIndex];
  if (!source) {
    state.feedback = '未找到可删除来源。';
    return;
  }

  const ok = gameStore.deleteItemPoolSource(source.ref);
  if (!ok) {
    state.feedback = '删除失败，来源可能已经不存在。';
    return;
  }

  itemPoolDeleteState.value = null;
  const reopened = reopenItemPoolDetailByKey(state.original.key);
  if (reopened) {
    return;
  }

  uiStore.openDetailModal({
    kind: 'item-pool-item',
    title: '来源已删除',
    summary: `${state.original.name} 的来源“${source.label}”已从当前存档移除。`,
    chips: [source.type === 'shop' ? '商店来源' : source.type === 'quest-fixed' ? '任务固定' : '任务随机', '已删除'],
    fields: [
      { label: '物品', value: state.original.name },
      { label: '来源', value: source.label },
    ],
  });
}

function returnToItemPoolDetailFromDelete(): void {
  const state = itemPoolDeleteState.value;
  if (!state) {
    uiStore.closeDetailModal();
    return;
  }

  itemPoolDeleteState.value = null;
  uiStore.openDetailModal(buildItemPoolDetailState(state.original));
}

function openItemPoolCreateManualModal(): void {
  itemPoolEditState.value = null;
  itemPoolDeleteState.value = null;
  itemPoolExportCreateState.value = null;
  itemPoolCreateState.value = {
    form: createBlankItemPoolForm(),
    feedback: null,
  };

  uiStore.openDetailModal({
    kind: 'item-pool-create-manual',
    title: '自己创建物品',
    summary: '填写后会新增到商店主池；图标可以留空，系统会使用 chip。',
    chips: ['商品池', '商店主池', '自己创建'],
    actions: [
      { id: 'item-pool:create-save', label: '完成', tone: 'primary' },
      { id: 'item-pool:create-cancel', label: '取消', tone: 'secondary' },
    ],
  });
}

function openItemPoolExportCreateModal(): void {
  itemPoolEditState.value = null;
  itemPoolDeleteState.value = null;
  itemPoolCreateState.value = null;
  itemPoolExportCreateState.value = {
    exportText: ITEM_POOL_FORMAT_EXAMPLE,
    importText: '',
    feedback: null,
  };

  uiStore.openDetailModal({
    kind: 'item-pool-export-create',
    title: '导出创建物品',
    summary: '先导出格式或已有物品给外部 AI 参考，再把生成的新物品 JSON 粘贴回来导入。',
    chips: ['商品池', '导出创建'],
    actions: [
      { id: 'item-pool:export-format', label: '导出物品格式', tone: 'secondary' },
      { id: 'item-pool:export-existing', label: '导出已有物品', tone: 'secondary' },
      { id: 'item-pool:import-new', label: '导入新的物品', tone: 'primary' },
      { id: 'item-pool:export-cancel', label: '关闭', tone: 'secondary' },
    ],
  });
}

function validateItemPoolCreateForm(form: ItemPoolCreateForm): string | null {
  if (!form.name.trim()) {
    return '请填写名称。';
  }

  if (!form.description.trim()) {
    return '请填写简介。';
  }

  const price = Number(form.price);
  if (!Number.isFinite(price) || !Number.isInteger(price) || price <= 0) {
    return '价格必须是正整数。';
  }

  return null;
}

function saveItemPoolCreate(): void {
  const state = itemPoolCreateState.value;
  if (!state) {
    return;
  }

  const validation = validateItemPoolCreateForm(state.form);
  if (validation) {
    state.feedback = validation;
    return;
  }

  const created = gameStore.addItemPoolShopItem({
    name: state.form.name.trim(),
    description: state.form.description.trim(),
    icon: state.form.icon.trim() || 'chip',
    rarity: state.form.rarity,
    category: state.form.category,
    price: state.form.price,
  });

  if (!created) {
    state.feedback = '创建失败，请检查字段格式。';
    return;
  }

  itemPoolCreateState.value = null;
  const reopened = reopenItemPoolDetailBySource({ type: 'shop', itemId: created.id })
    || reopenItemPoolDetailByKey(created.name);
  if (!reopened) {
    uiStore.openDetailModal({
      kind: 'item-pool-item',
      title: '创建成功',
      summary: `${created.name} 已加入商品池。`,
      chips: [created.category, created.rarity, '已新增'],
    });
  }
}

function exportItemPoolFormat(): void {
  if (!itemPoolExportCreateState.value) {
    return;
  }

  itemPoolExportCreateState.value.exportText = ITEM_POOL_FORMAT_EXAMPLE;
  itemPoolExportCreateState.value.feedback = '已生成物品格式模板，可复制给外部 AI。';
}

function exportExistingItemPool(): void {
  if (!itemPoolExportCreateState.value) {
    return;
  }

  const items = gameStore.data.零七系统.商品池.商店主池.map(item => ({
    name: item.name,
    category: item.category,
    price: item.price,
    rarity: item.rarity,
    icon: item.icon,
    description: item.description,
  }));
  itemPoolExportCreateState.value.exportText = JSON.stringify(items, null, 2);
  itemPoolExportCreateState.value.feedback = `已导出 ${items.length} 个已有商店主池物品。`;
}

function normalizeImportedItem(raw: unknown): ItemPoolCreateForm | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const name = typeof entry.name === 'string' ? entry.name : typeof entry.名称 === 'string' ? entry.名称 : '';
  const description = typeof entry.description === 'string' ? entry.description : typeof entry.简介 === 'string' ? entry.简介 : typeof entry.描述 === 'string' ? entry.描述 : '';
  const icon = typeof entry.icon === 'string' ? entry.icon : typeof entry.图标 === 'string' ? entry.图标 : 'chip';
  const category = typeof entry.category === 'string' ? entry.category : typeof entry.分类 === 'string' ? entry.分类 : '';
  const rarity = typeof entry.rarity === 'string' ? entry.rarity : typeof entry.品质 === 'string' ? entry.品质 : '';
  const price = entry.price ?? entry.价格 ?? '';

  return {
    name,
    description,
    icon,
    category: category as ShopCategory,
    rarity: rarity as (typeof ITEM_RARITIES)[number],
    price: String(price),
  };
}

function parseImportedItemPoolItems(text: string): ItemPoolCreateForm[] | null {
  const parsed = JSON.parse(text) as unknown;
  const source = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { items?: unknown[] }).items)
      ? (parsed as { items: unknown[] }).items
      : null;

  if (!source) {
    return null;
  }

  return source.map(normalizeImportedItem).filter((item): item is ItemPoolCreateForm => Boolean(item));
}

function importNewItemPoolItems(): void {
  const state = itemPoolExportCreateState.value;
  if (!state) {
    return;
  }

  if (!state.importText.trim()) {
    state.feedback = '请先粘贴要导入的新物品 JSON。';
    return;
  }

  let items: ItemPoolCreateForm[] | null = null;
  try {
    items = parseImportedItemPoolItems(state.importText);
  } catch {
    state.feedback = 'JSON 解析失败，请检查格式。';
    return;
  }

  if (!items?.length) {
    state.feedback = '没有找到可导入的有效物品。';
    return;
  }

  const result = gameStore.importItemPoolShopItems(items);
  const skippedCopy = result.skipped.length
    ? `跳过 ${result.skipped.length} 个：${result.skipped.slice(0, 5).map(item => `${item.name}（${item.reason}）`).join('；')}${result.skipped.length > 5 ? '……' : ''}`
    : '没有跳过项。';

  itemPoolExportCreateState.value = null;
  if (result.added.length === 1) {
    const created = result.added[0];
    const reopened = reopenItemPoolDetailBySource({ type: 'shop', itemId: created.id })
      || reopenItemPoolDetailByKey(created.name);
    if (reopened) {
      return;
    }
  }

  uiStore.openDetailModal({
    kind: 'item-pool-item',
    title: result.added.length ? '导入完成' : '没有导入新物品',
    summary: `新增 ${result.added.length} 个物品。${skippedCopy}`,
    chips: ['商品池', '导入结果'],
    fields: result.added.map((item: ShopItem) => ({ label: item.name, value: `${item.category} · ${item.rarity} · ${item.price} 积分` })),
  });
}

function openNextQuestRewardModal(): void {
  if (rewardModalActive.value || uiStore.detailModal) {
    return;
  }

  const reward = gameStore.consumeRecentQuestReward();
  if (!reward) {
    rewardModalActive.value = false;
    return;
  }

  rewardModalActive.value = true;
  const isCheckinReward = reward.source === 'checkin';
  uiStore.openDetailModal({
    kind: 'quest-reward',
    title: isCheckinReward ? '签到奖励已到账' : '任务奖励已到账',
    summary: isCheckinReward ? '今日签到已完成，奖励已自动结算。' : `${reward.questName} 已完成，奖励已自动结算。`,
    chips: [reward.category, ...(reward.rewardPool ? [`${reward.rewardPool}池`] : []), isCheckinReward ? '已签到' : '已完成'],
    fields: [
      { label: isCheckinReward ? '奖励类型' : '任务名', value: reward.questName },
      { label: '获得积分', value: String(reward.grantedPoints) },
      { label: '奖励池来源', value: reward.rewardPool ? `${reward.rewardPool}池` : '无随机池' },
      { label: isCheckinReward ? '签到时间' : '完成时间', value: reward.completedAt },
    ],
    payload: reward,
  });
}

onMounted(() => {
  syncFullscreenState();
  document.addEventListener('fullscreenchange', syncFullscreenState);
});

onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreenState);
  document.body.classList.remove('neon-career-fullscreen');
});

watch(() => gameStore.recentQuestRewards.length, length => {
  if (length > 0) {
    openNextQuestRewardModal();
  }
});

watch(() => uiStore.detailModal, modal => {
  if (modal?.kind === 'quest-reward') {
    rewardModalActive.value = true;
    return;
  }

  if (modal?.kind !== 'item-pool-edit') {
    itemPoolEditState.value = null;
  }

  if (modal?.kind !== 'item-pool-delete') {
    itemPoolDeleteState.value = null;
  }

  if (modal?.kind !== 'item-pool-create-manual') {
    itemPoolCreateState.value = null;
  }

  if (modal?.kind !== 'item-pool-export-create') {
    itemPoolExportCreateState.value = null;
  }

  if (!modal && rewardModalActive.value) {
    rewardModalActive.value = false;
    openNextQuestRewardModal();
  }
});

async function handleFullscreenToggle(): Promise<void> {
  if (!canToggleFullscreen) {
    return;
  }

  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }

  await document.documentElement.requestFullscreen();
}

const environmentInfo = computed(() => gameStore.runtime.getEnvironmentInfo());
const environment = computed(() => environmentInfo.value.environment);
const useEmbeddedLayout = computed(() => environmentInfo.value.isTavern || environmentInfo.value.isEmbedded);
const visibleNarrativeBlocks = computed(() => {
  const liveBlock = sessionStore.liveAssistantBlock;
  return liveBlock?.text
    ? [...sessionStore.narrativeBlocks, liveBlock]
    : sessionStore.narrativeBlocks;
});
const hasExistingSession = computed(() => sessionStore.history.length > 0
  || Boolean(sessionStore.lastSummary)
  || sessionStore.suggestedActions.length > 0);
const shellClasses = computed(() => ({
  'shell--tavern': environmentInfo.value.isTavern,
  'shell--embedded': useEmbeddedLayout.value,
  'shell--fullscreen': isFullscreen.value,
  'shell--start': showStartScreen.value,
}));
const storyLayoutClasses = computed(() => ({
  'story-layout--embedded': useEmbeddedLayout.value,
}));
const supportGridClasses = computed(() => ({
  'support-grid--embedded': useEmbeddedLayout.value,
}));

const player = computed(() => gameStore.data.谢自国);
const system = computed(() => gameStore.data.零七系统);
const targets = computed(() => Object.entries(gameStore.data.攻略目标));
const trackedSocialCount = computed(() => gameStore.getAllTrackedSocialNames().length);
const activeQuests = computed(() => Object.entries(gameStore.data.零七系统.任务列表));
const railSummary = computed(() => ({
  race: player.value.种族,
  nation: player.value.国籍,
  money: player.value.金钱.toLocaleString(),
  points: String(system.value.积分),
  questCount: String(activeQuests.value.length),
  targetCount: String(trackedSocialCount.value),
  inventoryCount: String(Object.keys(player.value.背包).length),
  historyCount: String(sessionStore.history.length),
}));

const workspaceRegistry: Record<WorkspaceKey, { title: string; subtitle: string; component: Component }> = {
  inventory: { title: '背包管理', subtitle: '查看当前携带的道具与资源', component: InventoryWorkspace },
  'item-pool': { title: '商品池', subtitle: '浏览商店与任务可得物品', component: ItemPoolWorkspace },
  quests: { title: '任务日志', subtitle: '浏览进行中与已完成任务', component: QuestWorkspace },
  shop: { title: '积分商店', subtitle: '消耗积分购买补给与稀有物品', component: ShopWorkspace },
  social: { title: '社交', subtitle: '周围人物 / 攻略 / 历史人物', component: SocialWorkspace },
  checkin: { title: '每日签到', subtitle: '领取每日补给并追踪连续奖励', component: CheckinWorkspace },
};

const workspaceItems = computed<WorkspaceDefinition[]>(() => [
  {
    key: 'inventory',
    label: '背包',
    icon: '🎒',
    description: '查看物品与资源',
    badge: Object.keys(player.value.背包).length,
    component: InventoryWorkspace,
  },
  {
    key: 'item-pool',
    label: '商品池',
    icon: '🧾',
    description: '商店与任务可得物品',
    component: ItemPoolWorkspace,
  },
  {
    key: 'quests',
    label: '任务',
    icon: '🗒',
    description: '主线与支线日志',
    badge: activeQuests.value.length,
    component: QuestWorkspace,
  },
  {
    key: 'shop',
    label: '商店',
    icon: '🛒',
    description: '积分兑换补给',
    badge: system.value.积分,
    component: ShopWorkspace,
  },
  {
    key: 'social',
    label: '社交',
    icon: '👥',
    description: '人物档案与关系',
    badge: trackedSocialCount.value,
    component: SocialWorkspace,
  },
  {
    key: 'checkin',
    label: '签到',
    icon: '📅',
    description: '每日奖励与里程碑',
    badge: system.value.签到.今日已签到 ? '✓' : null,
    component: CheckinWorkspace,
  },
]);

const activeWorkspaceMeta = computed(() => {
  const key = uiStore.activeWorkspace;
  return key ? workspaceRegistry[key] : null;
});

async function handleSend(): Promise<void> {
  await sendPlayerInput(sessionStore.inputDraft);
}

function handleStartScreenEnter(): void {
  showStartScreen.value = false;
}

function chooseOption(option: string): void {
  sessionStore.fillInput(option);
}

function handleWorkspaceOpen(key: WorkspaceKey): void {
  uiStore.toggleWorkspace(key);
}

function handleDetailAction(actionId: string): void {
  const detail = uiStore.detailModal;
  if (!detail) {
    return;
  }

  if ((detail.kind === 'social-target' || detail.kind === 'social-character') && actionId.startsWith('social:focus:')) {
    const payload = detail.payload as { name?: string; 心情?: string; 当前位置?: string; 心里想法?: string } | undefined;
    const targetName = payload?.name ?? actionId.replace('social:focus:', '');
    sessionStore.fillInput(`走到${targetName}身边，结合他现在的${payload?.心情 ?? '状态'}、所在位置“${payload?.当前位置 ?? '附近'}”和心里想法，主动发起一次自然的互动。`);
    uiStore.closeDetailModal();
    uiStore.closeWorkspace();
    return;
  }

  if ((detail.kind === 'social-target' || detail.kind === 'social-character') && actionId.startsWith('social:follow:')) {
    const name = actionId.replace('social:follow:', '');
    gameStore.followSocialCharacter(name);
    uiStore.closeDetailModal();
    return;
  }

  if (detail.kind === 'social-character' && actionId.startsWith('social:unfollow:')) {
    const name = actionId.replace('social:unfollow:', '');
    gameStore.unfollowSocialCharacter(name);
    uiStore.closeDetailModal();
    return;
  }

  if ((detail.kind === 'social-target' || detail.kind === 'social-character') && actionId.startsWith('social:archive:')) {
    const name = actionId.replace('social:archive:', '');
    gameStore.moveSocialCharacterToHistory(name);
    uiStore.closeDetailModal();
    return;
  }

  if (detail.kind === 'social-character' && actionId.startsWith('social:restore:')) {
    const name = actionId.replace('social:restore:', '');
    gameStore.restoreSocialCharacterToNearby(name);
    uiStore.closeDetailModal();
    return;
  }

  if (detail.kind === 'social-character' && actionId.startsWith('social:promote:')) {
    const payload = detail.payload as { name?: string; bucket?: string; 关系?: string; 心情?: string; 当前位置?: string; 心里想法?: string } | undefined;
    const name = payload?.name ?? actionId.replace('social:promote:', '');
    sessionStore.fillInput(`我想把${name}从${payload?.bucket ?? '人物池'}升级为正式攻略目标。请在正文里自然推进我们的关系，并在 vars 的 攻略目标 中用该角色姓名新增完整档案：好感度、好感度等级、兴奋值、阴茎状态、心情、当前位置、心里想法、基础信息、职业信息、衣物状态都要补齐；现有线索包括关系“${payload?.关系 ?? '普通'}”、心情“${payload?.心情 ?? '未知'}”、位置“${payload?.当前位置 ?? '未知'}”、想法“${payload?.心里想法 ?? ''}”。`);
    uiStore.closeDetailModal();
    uiStore.closeWorkspace();
    return;
  }

  if (detail.kind === 'inventory-item' && actionId.startsWith('inventory:open-box:')) {
    const boxName = actionId.replace('inventory:open-box:', '');
    const result = gameStore.openInventoryBox(boxName);
    uiStore.openDetailModal({
      kind: 'inventory-result',
      title: result.success ? '补给箱已打开' : '无法打开补给箱',
      summary: result.success
        ? `${result.boxName} 已消耗 1 个，获得物品已自动放入背包。`
        : result.reason === 'empty'
          ? `${result.boxName} 数量不足，无法打开。`
          : `${result.boxName} 目前不是可开启物品。`,
      chips: [result.success ? '已入包' : '未开启', result.boxName],
      fields: [
        { label: '箱子', value: result.boxName },
        { label: '剩余数量', value: `x${result.remainingCount}` },
        { label: '开启时间', value: result.openedAt },
      ],
      payload: result,
    });
    return;
  }

  if (detail.kind === 'shop-item' && actionId.startsWith('buy:')) {
    const item = {
      ...(detail.payload as {
        id: string;
        slotId?: string;
        name: string;
        category: '日常' | '修炼' | '情趣';
        description: string;
        icon: string;
        rarity: 'N' | 'R' | 'SR' | 'SSR';
        price: number;
        status?: 'available' | 'sold_out';
        soldAt?: string;
      }),
      status: (detail.payload as { status?: 'available' | 'sold_out' }).status ?? 'available',
    };
    const result = gameStore.purchaseShopItem(item);
    const resultItem = result.item;
    const resultTitle = result.success
      ? '购买成功'
      : result.reason === 'sold_out'
        ? '商品已售罄'
        : '积分不足';
    const resultSummary = result.success
      ? `${resultItem.name} 已加入背包，当前槽位已售罄。`
      : result.reason === 'sold_out'
        ? `${resultItem.name} 所在槽位已经售罄，请刷新商店查看新货。`
        : `购买 ${resultItem.name} 需要 ${resultItem.price} 积分，当前积分不足。`;

    uiStore.openDetailModal({
      kind: 'shop-result',
      title: resultTitle,
      summary: resultSummary,
      chips: [
        resultItem.category,
        resultItem.rarity,
        result.success ? '已入包' : result.reason === 'sold_out' ? '已售罄' : '购买失败',
      ],
      fields: [
        { label: '商品', value: resultItem.name },
        { label: '槽位', value: resultItem.slotId ?? '未编号' },
        { label: '状态', value: result.success ? '已售罄' : result.reason === 'sold_out' ? '已售罄' : '待购买' },
        { label: '价格', value: `${resultItem.price} 积分` },
        { label: '剩余积分', value: String(result.remainingPoints) },
        { label: '已拥有', value: `x${result.ownedCount}` },
        ...(resultItem.soldAt ? [{ label: '售罄时间', value: resultItem.soldAt }] : []),
      ],
      payload: result,
    });
    return;
  }

  if (detail.kind === 'item-pool-item') {
    const payload = detail.payload as ItemPoolCatalogItem | undefined;
    if (!payload) {
      return;
    }

    if (actionId === 'edit') {
      openItemPoolEditModal(payload);
      return;
    }

    if (actionId === 'delete') {
      openItemPoolDeleteModal(payload);
      return;
    }
  }

  if (detail.kind === 'item-pool-edit') {
    if (actionId === 'item-pool:save') {
      saveItemPoolEdit();
      return;
    }

    if (actionId === 'item-pool:cancel') {
      itemPoolEditState.value = null;
      uiStore.closeDetailModal();
    }

    return;
  }

  if (detail.kind === 'item-pool-delete') {
    if (actionId === 'item-pool:delete-confirm') {
      confirmDeleteItemPoolSource();
      return;
    }

    if (actionId === 'item-pool:delete-cancel') {
      returnToItemPoolDetailFromDelete();
    }

    return;
  }

  if (detail.kind === 'item-pool-create-menu') {
    if (actionId === 'item-pool:create-manual') {
      openItemPoolCreateManualModal();
      return;
    }

    if (actionId === 'item-pool:create-export') {
      openItemPoolExportCreateModal();
      return;
    }
  }

  if (detail.kind === 'item-pool-create-manual') {
    if (actionId === 'item-pool:create-save') {
      saveItemPoolCreate();
      return;
    }

    if (actionId === 'item-pool:create-cancel') {
      itemPoolCreateState.value = null;
      uiStore.closeDetailModal();
    }

    return;
  }

  if (detail.kind === 'item-pool-export-create') {
    if (actionId === 'item-pool:export-format') {
      exportItemPoolFormat();
      return;
    }

    if (actionId === 'item-pool:export-existing') {
      exportExistingItemPool();
      return;
    }

    if (actionId === 'item-pool:import-new') {
      importNewItemPoolItems();
      return;
    }

    if (actionId === 'item-pool:export-cancel') {
      itemPoolExportCreateState.value = null;
      uiStore.closeDetailModal();
    }
  }
}
</script>

<template>
  <div class="shell" :class="shellClasses">
    <StartScreen
      v-if="showStartScreen"
      :has-save="hasExistingSession"
      :fullscreen="{ active: isFullscreen, supported: canToggleFullscreen }"
      @enter="handleStartScreenEnter"
      @toggle-fullscreen="handleFullscreenToggle"
    />

    <template v-else>
      <header class="topbar">
        <div class="topbar-identity">
          <p class="eyebrow">霓虹深渊 · 职业世界</p>
          <h1>{{ player.身份 }}</h1>
        </div>
        <div class="status-cluster">
          <span class="chip">{{ system.日期 }}</span>
          <span class="chip">{{ system.时间 }}</span>
          <span class="chip">{{ system.当前地点 }}</span>
          <span class="chip">{{ system.当前天气 }}</span>
        </div>
      </header>

    <main class="story-layout" :class="storyLayoutClasses">
      <div class="story-main">
        <section class="panel narrative-panel">
          <div class="panel-header">
            <h2>主叙事区</h2>
            <span v-if="sessionStore.lastSummary" class="summary-chip">{{ sessionStore.lastSummary }}</span>
          </div>
          <div class="narrative-scroll-area">
            <NarrativePanel :blocks="visibleNarrativeBlocks" :embedded="useEmbeddedLayout" />
            <OptionChips :options="sessionStore.suggestedActions" @choose="chooseOption" />
          </div>
        </section>

        <section class="panel input-panel">
          <ComposerPanel
            v-model="sessionStore.inputDraft"
            :disabled="sessionStore.isGenerating"
            :error="sessionStore.error"
            :embedded="useEmbeddedLayout"
            @send="handleSend"
          />
        </section>
      </div>
    </main>

    <RightUtilityRail
      :items="workspaceItems"
      :collapsed="uiStore.utilityRailCollapsed"
      :embedded="useEmbeddedLayout"
      :active-workspace="uiStore.activeWorkspace"
      :fullscreen="{ active: isFullscreen, supported: canToggleFullscreen }"
      :summary="railSummary"
      @toggle-rail="uiStore.toggleUtilityRail()"
      @open="handleWorkspaceOpen"
      @toggle-fullscreen="handleFullscreenToggle"
    />

    <Teleport to="body">
      <WorkspacePanel
        v-if="activeWorkspaceMeta"
        :title="activeWorkspaceMeta.title"
        :subtitle="activeWorkspaceMeta.subtitle"
        :embedded="useEmbeddedLayout"
        @close="uiStore.closeWorkspace()"
      >
        <component :is="activeWorkspaceMeta.component" />
      </WorkspacePanel>

      <DetailModal v-if="uiStore.detailModal" :state="uiStore.detailModal" @close="uiStore.closeDetailModal()" @action="handleDetailAction">
        <template #default="{ payload, kind }">
          <div class="detail-stack">
            <SocialTargetDetailCard
              v-if="kind === 'social-target' && payload"
              :target="payload as InstanceType<typeof SocialTargetDetailCard>['$props']['target']"
            />

            <SocialCharacterDetailCard
              v-else-if="kind === 'social-character' && payload"
              :character="payload as InstanceType<typeof SocialCharacterDetailCard>['$props']['character']"
            />

            <template v-else>
              <p v-if="uiStore.detailModal?.summary" class="detail-summary">{{ uiStore.detailModal.summary }}</p>

              <div v-if="uiStore.detailModal?.chips?.length" class="detail-chip-row">
                <span v-for="chip in uiStore.detailModal.chips" :key="chip" class="detail-chip">{{ chip }}</span>
              </div>

              <dl v-if="uiStore.detailModal?.fields?.length" class="detail-field-list">
                <div v-for="field in uiStore.detailModal.fields" :key="field.label">
                  <dt>{{ field.label }}</dt>
                  <dd>{{ field.value }}</dd>
                </div>
              </dl>
            </template>

            <div
              v-if="kind === 'item-pool-edit' && itemPoolEditState"
              class="item-pool-editor"
            >
              <div class="detail-chip-row">
                <button
                  v-for="(source, index) in itemPoolEditState.original.sources"
                  :key="`${source.label}-${index}`"
                  class="detail-chip detail-chip--button"
                  :class="{ 'detail-chip--active': itemPoolEditState.selectedSourceIndex === index }"
                  type="button"
                  @click="updateItemPoolEditSource(index)"
                >
                  {{ source.label }}
                </button>
              </div>

              <div class="editor-grid">
                <label>
                  <span>名称</span>
                  <input v-model="itemPoolEditState.form.name" type="text">
                </label>
                <label>
                  <span>图标</span>
                  <input v-model="itemPoolEditState.form.icon" type="text">
                </label>
                <label>
                  <span>品质</span>
                  <select v-model="itemPoolEditState.form.rarity">
                    <option v-for="rarity in ITEM_RARITIES" :key="rarity" :value="rarity">{{ rarity }}</option>
                  </select>
                </label>
                <label>
                  <span>分类</span>
                  <select v-model="itemPoolEditState.form.category">
                    <option v-for="category in ITEM_POOL_CATEGORIES" :key="category" :value="category">{{ category }}</option>
                  </select>
                </label>
                <label>
                  <span>价格（商店来源）</span>
                  <input v-model="itemPoolEditState.form.price" type="number" min="1">
                </label>
                <label class="editor-grid__full">
                  <span>描述</span>
                  <textarea v-model="itemPoolEditState.form.description" rows="4"></textarea>
                </label>
              </div>

              <p v-if="itemPoolEditState.feedback" class="detail-note">{{ itemPoolEditState.feedback }}</p>
            </div>

            <div
              v-else-if="kind === 'item-pool-delete' && itemPoolDeleteState"
              class="item-pool-editor"
            >
              <div class="detail-chip-row">
                <button
                  v-for="(source, index) in itemPoolDeleteState.original.sources"
                  :key="`${source.label}-${index}`"
                  class="detail-chip detail-chip--button"
                  :class="{ 'detail-chip--active': itemPoolDeleteState.selectedSourceIndex === index }"
                  type="button"
                  @click="updateItemPoolDeleteSource(index)"
                >
                  {{ source.label }}
                </button>
              </div>

              <dl v-if="itemPoolDeleteState.original.sources[itemPoolDeleteState.selectedSourceIndex]" class="detail-field-list">
                <div>
                  <dt>当前物品</dt>
                  <dd>{{ itemPoolDeleteState.original.name }}</dd>
                </div>
                <div>
                  <dt>删除来源</dt>
                  <dd>{{ itemPoolDeleteState.original.sources[itemPoolDeleteState.selectedSourceIndex]?.label }}</dd>
                </div>
              </dl>

              <p class="detail-note">删除后会立即写入当前存档；如果该物品还有其它来源，会自动回到更新后的详情。</p>
              <p v-if="itemPoolDeleteState.feedback" class="detail-note">{{ itemPoolDeleteState.feedback }}</p>
            </div>

            <div
              v-else-if="kind === 'item-pool-create-manual' && itemPoolCreateState"
              class="item-pool-editor"
            >
              <div class="editor-grid">
                <label>
                  <span>名称</span>
                  <input v-model="itemPoolCreateState.form.name" type="text">
                </label>
                <label>
                  <span>图标（可留空）</span>
                  <input v-model="itemPoolCreateState.form.icon" type="text" placeholder="chip">
                </label>
                <label>
                  <span>品质</span>
                  <select v-model="itemPoolCreateState.form.rarity">
                    <option v-for="rarity in ITEM_RARITIES" :key="rarity" :value="rarity">{{ rarity }}</option>
                  </select>
                </label>
                <label>
                  <span>分类</span>
                  <select v-model="itemPoolCreateState.form.category">
                    <option v-for="category in ITEM_POOL_CATEGORIES" :key="category" :value="category">{{ category }}</option>
                  </select>
                </label>
                <label>
                  <span>价格</span>
                  <input v-model="itemPoolCreateState.form.price" type="number" min="1">
                </label>
                <label class="editor-grid__full">
                  <span>简介</span>
                  <textarea v-model="itemPoolCreateState.form.description" rows="4"></textarea>
                </label>
              </div>

              <p v-if="itemPoolCreateState.feedback" class="detail-note">{{ itemPoolCreateState.feedback }}</p>
            </div>

            <div
              v-else-if="kind === 'item-pool-export-create' && itemPoolExportCreateState"
              class="item-pool-editor"
            >
              <div class="export-grid">
                <label>
                  <span>导出内容</span>
                  <textarea v-model="itemPoolExportCreateState.exportText" rows="9" readonly></textarea>
                </label>
                <label>
                  <span>导入新的物品</span>
                  <textarea v-model="itemPoolExportCreateState.importText" rows="9" placeholder="把外部 AI 生成的新物品 JSON 粘贴到这里"></textarea>
                </label>
              </div>

              <p v-if="itemPoolExportCreateState.feedback" class="detail-note">{{ itemPoolExportCreateState.feedback }}</p>
            </div>

            <div
              v-else-if="kind === 'shop-result' && payload"
              class="detail-reward-list"
            >
              <div class="detail-reward-item">
                <span>当前结果</span>
                <strong>{{ (payload as { success: boolean }).success ? '已入包' : '未购买' }}</strong>
              </div>
            </div>

            <div
              v-else-if="(kind === 'quest-reward' || kind === 'inventory-result') && payload && 'grantedItems' in (payload as Record<string, unknown>) && Array.isArray((payload as { grantedItems?: unknown[] }).grantedItems)"
              class="detail-reward-list"
            >
              <div
                v-for="reward in (payload as { grantedItems: Array<{ 名称: string; 数量: number; 品质?: string }> }).grantedItems"
                :key="`reward-${reward.名称}-${reward.品质 ?? 'N'}`"
                class="detail-reward-item"
              >
                <span>{{ reward.名称 }}</span>
                <strong>x{{ reward.数量 }}</strong>
              </div>
            </div>

            <div
              v-else-if="kind === 'quest' && payload && '获得物品' in (payload as Record<string, unknown>) && Array.isArray((payload as { 获得物品?: unknown[] }).获得物品) && (payload as { 获得物品?: unknown[] }).获得物品?.length"
              class="detail-reward-list"
            >
              <div
                v-for="reward in (payload as { 获得物品: Array<{ 名称: string; 数量: number; 品质?: string }> }).获得物品"
                :key="`${reward.名称}-${reward.品质 ?? 'N'}`"
                class="detail-reward-item"
              >
                <span>{{ reward.名称 }}</span>
                <strong>x{{ reward.数量 }}</strong>
              </div>
            </div>
          </div>
        </template>
      </DetailModal>
    </Teleport>
    </template>
  </div>
</template>

<style scoped lang="scss">
:global(html),
:global(body),
:global(#app) {
  margin: 0;
  width: 100%;
  max-width: 100%;
}

:global(body.neon-career-fullscreen),
:global(body.neon-career-fullscreen #app) {
  height: 100%;
  overflow: hidden;
}

:global(body) {
  overflow-x: hidden;
}

.shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  padding: clamp(12px, 2.2vw, 20px);
  box-sizing: border-box;
  color: #e8e4f0;
  background: #06060e;
  font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
}

.shell--embedded {
  max-width: 100%;
  gap: 14px;
  padding: 12px 10px 16px;
}

.shell--start {
  gap: 0;
  padding: 0;
}

.shell--fullscreen {
  height: 100vh;
  max-height: 100vh;
  overflow: hidden;
}

.shell--fullscreen .topbar,
.shell--fullscreen .input-panel {
  flex: 0 0 auto;
}

.shell--fullscreen .story-layout {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.shell--fullscreen .story-main {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.shell--fullscreen .narrative-panel {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.shell--fullscreen .narrative-scroll-area {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 8px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 229, 255, 0.42) transparent;
}

.shell--fullscreen .narrative-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.shell--fullscreen .narrative-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.shell--fullscreen .narrative-scroll-area::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: rgba(0, 229, 255, 0.28);
}

.topbar,
.panel {
  border: 1px solid #1e1e3a;
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(17, 17, 34, 0.96) 0%, rgba(12, 12, 24, 0.96) 100%);
  box-shadow: inset 0 1px 0 rgba(0, 229, 255, 0.06);
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: clamp(14px, 2vw, 18px) clamp(16px, 2.2vw, 22px);
}

.topbar-identity {
  min-width: 0;
}

.eyebrow {
  margin: 0 0 6px;
  color: #00e5ff;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
p,
ul,
dl {
  margin: 0;
}

h1 {
  font-size: clamp(20px, 3vw, 24px);
  font-weight: 700;
}

h2 {
  font-size: 14px;
  color: #00e5ff;
}

.status-cluster {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.chip,
.summary-chip {
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid rgba(0, 229, 255, 0.2);
  background: rgba(0, 229, 255, 0.08);
  color: #00e5ff;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.summary-chip {
  max-width: min(52ch, 100%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.story-layout {
  display: block;
  min-height: 0;
}

.story-layout--embedded {
  display: block;
}

.story-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.panel {
  min-width: 0;
  padding: clamp(14px, 1.8vw, 18px) clamp(16px, 2vw, 20px);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.compact-header {
  margin-bottom: 14px;
}

.narrative-panel {
  padding: clamp(16px, 2vw, 22px);
  background:
    radial-gradient(circle at 12% 0%, rgba(168, 85, 247, 0.08), transparent 36%),
    linear-gradient(180deg, rgba(14, 14, 30, 0.97) 0%, rgba(8, 8, 18, 0.97) 100%);
}

.input-panel {
  border-color: rgba(0, 229, 255, 0.16);
  padding-block: 12px;
}

.detail-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-summary,
.detail-note {
  color: #dbe3ff;
  line-height: 1.75;
}

.detail-note--system {
  border: 1px solid rgba(168, 85, 247, 0.16);
  border-radius: 8px;
  background: rgba(168, 85, 247, 0.08);
  padding: 10px 12px;
  color: #d8a0ff;
}

.detail-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-chip {
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  font-size: 12px;
}

.detail-chip--button {
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
}

.detail-chip--active {
  border-color: rgba(0, 229, 255, 0.24);
  background: rgba(0, 229, 255, 0.12);
}

.item-pool-editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(118, 244, 255, 0.12);
  border-radius: 8px;
  background: rgba(6, 8, 18, 0.78);
}

.editor-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.export-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.editor-grid label,
.export-grid label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #c9d1e8;
  font-size: 12px;
}

.editor-grid__full {
  grid-column: 1 / -1;
}

.editor-grid input,
.editor-grid select,
.editor-grid textarea,
.export-grid textarea {
  border: 1px solid rgba(118, 244, 255, 0.24);
  border-radius: 8px;
  background: rgba(11, 15, 32, 0.94);
  color: #f7f9ff;
  padding: 10px 12px;
  font: inherit;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.editor-grid input:focus,
.editor-grid select:focus,
.editor-grid textarea:focus,
.export-grid textarea:focus {
  outline: none;
  border-color: rgba(118, 244, 255, 0.72);
  background: rgba(13, 20, 42, 0.98);
  box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.12);
}

.editor-grid input::placeholder,
.editor-grid textarea::placeholder,
.export-grid textarea::placeholder {
  color: #7f8aa8;
}

.editor-grid select option {
  background: #0b0f20;
  color: #f7f9ff;
}

.detail-field-list {
  display: grid;
  gap: 12px;
}

.detail-field-list div {
  display: grid;
  gap: 4px;
}

.detail-field-list dt {
  color: #8b95b4;
  font-size: 12px;
}

.detail-field-list dd {
  color: #eef2ff;
  overflow-wrap: anywhere;
}

.detail-reward-list {
  display: grid;
  gap: 10px;
}

.detail-reward-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

@media (max-width: 720px) {
  .topbar,
  .panel-header,
  .detail-reward-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .topbar {
    gap: 10px;
    padding-right: 72px;
  }

  .topbar-identity {
    display: none;
  }

  .status-cluster {
    justify-content: flex-start;
    gap: 6px;
  }

  .chip {
    padding: 5px 8px;
    font-size: 11px;
  }

  .input-panel {
    padding: 12px;
  }

  .editor-grid,
  .export-grid {
    grid-template-columns: 1fr;
  }
}
</style>
