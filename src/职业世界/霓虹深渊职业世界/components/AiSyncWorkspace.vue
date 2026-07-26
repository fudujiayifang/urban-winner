<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { formatDisplayDateWithWeekday } from '../services/game-date';
import {
  applyAiSyncHistoryEntry,
  clearAiSyncApiKey,
  clearAiSyncConfig,
  clearAiSyncHistory,
  deleteAiSyncHistoryEntry,
  getAiSyncSecret,
  getRedactedAiSyncSummary,
  loadAiSyncConfig,
  loadAiSyncHistory,
  saveAiSyncConfig,
  type AiSyncConfig,
  type AiSyncHistoryEntry,
  upsertAiSyncHistoryEntry,
  validateAiSyncConfig,
} from '../services/ai-sync-config';
import { createAiSyncRawGenerator } from '../services/ai-sync-client';
import { updateAiSyncAvailability, useAiSyncStatus } from '../services/ai-sync-status';

const gameStore = useGameStore();
const aiSyncStatus = useAiSyncStatus();
const delegatedScopes = ['地点', '年月日', '时间', '星期', '天气', '社交', '任务'];
const system = computed(() => gameStore.data.零七系统);
const nearbyCount = computed(() => Object.keys(gameStore.data.周围人物).length);
const activeQuestCount = computed(() => Object.keys(system.value.任务列表).length);
const completedQuestCount = computed(() => Object.keys(system.value.已完成任务列表).length);
const dateWithWeekday = computed(() => formatDisplayDateWithWeekday(system.value.日期));
const activeTab = ref<'overview' | 'settings'>('overview');
const feedback = ref<string | null>(null);
const apiKeyDraft = ref('');
const availableModels = ref<string[]>([]);
const selectedFetchedModel = ref('');
const isLoadingModels = ref(false);
const modelFetchError = ref<string | null>(null);
const recentConfigs = ref<AiSyncHistoryEntry[]>(loadAiSyncHistory());
const rememberApiKeyWithHistory = ref(true);
const form = ref<AiSyncConfig>(loadAiSyncConfig());

function syncAvailability(config: AiSyncConfig, configError: string | null = null): void {
  const aiSyncGenerator = createAiSyncRawGenerator({
    runtime: gameStore.runtime,
    config,
  });
  const aiSyncSummary = getRedactedAiSyncSummary(config);

  updateAiSyncAvailability({
    mode: config.mode,
    transport: aiSyncGenerator.transport,
    configured: aiSyncGenerator.configured,
    hasApiKey: config.hasApiKey,
    configError: configError ?? aiSyncGenerator.configError,
    environment: gameStore.runtime.environment,
    baseUrl: aiSyncSummary.baseUrl,
    model: aiSyncSummary.model,
    systemEnabled: config.systemEnabled,
    socialEnabled: config.socialEnabled,
  });
}

function refreshForm(): void {
  form.value = loadAiSyncConfig();
  recentConfigs.value = loadAiSyncHistory();
  apiKeyDraft.value = '';
  availableModels.value = [];
  selectedFetchedModel.value = '';
  modelFetchError.value = null;
  feedback.value = null;
  syncAvailability(form.value);
}

refreshForm();

const snapshotCards = computed(() => [
  { label: '当前地点', value: system.value.当前地点 },
  { label: '年月日 / 星期', value: dateWithWeekday.value },
  { label: '时间', value: system.value.时间 },
  { label: '天气', value: system.value.当前天气 },
  { label: '周围人物', value: `${nearbyCount.value} 人` },
  { label: '任务', value: `${activeQuestCount.value} 进行中 / ${completedQuestCount.value} 已完成` },
]);

const modeLabel = computed(() => aiSyncStatus.value.mode === 'second-ai' ? '独立副 AI' : '沿用主 AI');
const transportLabel = computed(() => {
  switch (aiSyncStatus.value.transport) {
    case 'tavern-custom-api':
      return 'Tavern custom_api';
    case 'legacy-main':
      return '主 AI raw fallback';
    case 'browser-fetch':
      return '浏览器直连';
    default:
      return '不可用';
  }
});
const apiKeyStatusLabel = computed(() => form.value.hasApiKey ? '已保存 API Key' : '未保存 API Key');
const canFetchModels = computed(() => {
  const hasDraftOrSavedKey = Boolean(apiKeyDraft.value.trim()) || form.value.hasApiKey;
  return gameStore.runtime.environment === 'tavern'
    && form.value.mode === 'second-ai'
    && Boolean(form.value.baseUrl.trim())
    && hasDraftOrSavedKey
    && !isLoadingModels.value;
});
const modelFetchHint = computed(() => {
  if (gameStore.runtime.environment !== 'tavern') {
    return '当前环境不支持拉取模型';
  }
  if (form.value.mode !== 'second-ai') {
    return '请先启用独立副 AI 同步';
  }
  if (!form.value.baseUrl.trim()) {
    return '请先填写 Base URL';
  }
  if (!apiKeyDraft.value.trim() && !form.value.hasApiKey) {
    return '请先填写或保存 API Key';
  }
  return '填写端点和密钥后可直接拉取模型';
});
const systemLastFieldsLabel = computed(() => aiSyncStatus.value.system.lastFields.length ? aiSyncStatus.value.system.lastFields.join(' / ') : '暂无记录');
const socialLastFieldsLabel = computed(() => aiSyncStatus.value.social.lastFields.length ? aiSyncStatus.value.social.lastFields.join(' / ') : '暂无记录');

function saveSettings(): void {
  const validation = validateAiSyncConfig(form.value, apiKeyDraft.value);
  if (!validation.ok) {
    feedback.value = validation.error;
    return;
  }

  const saved = saveAiSyncConfig({
    mode: form.value.mode,
    systemEnabled: form.value.systemEnabled,
    socialEnabled: form.value.socialEnabled,
    baseUrl: form.value.baseUrl,
    model: form.value.model,
    temperature: form.value.temperature,
    maxTokens: form.value.maxTokens,
  }, apiKeyDraft.value);
  if (saved.mode === 'second-ai') {
    recentConfigs.value = upsertAiSyncHistoryEntry(saved, {
      apiKey: apiKeyDraft.value,
      rememberApiKey: rememberApiKeyWithHistory.value,
    });
  } else {
    recentConfigs.value = loadAiSyncHistory();
  }
  form.value = saved;
  apiKeyDraft.value = '';
  if (availableModels.value.includes(saved.model)) {
    selectedFetchedModel.value = saved.model;
  }
  feedback.value = saved.mode === 'second-ai' && gameStore.runtime.environment !== 'tavern'
    ? '副 AI 设置已保存；当前环境仅会保存配置，独立副 AI 需在 Tavern 中实际生效。'
    : '副 AI 设置已保存；下一次同步开始生效。';
  syncAvailability(saved);
}

function clearApiKey(): void {
  form.value = clearAiSyncApiKey();
  apiKeyDraft.value = '';
  feedback.value = '已清除副 AI 的 API Key。';
  syncAvailability(form.value, form.value.mode === 'second-ai' ? '副 AI API Key 缺失。' : null);
}

function clearAllSettings(): void {
  form.value = clearAiSyncConfig();
  apiKeyDraft.value = '';
  availableModels.value = [];
  selectedFetchedModel.value = '';
  modelFetchError.value = null;
  feedback.value = '已清空当前副 AI 配置，最近配置记录仍保留。';
  syncAvailability(form.value);
}

function applyHistoryEntry(entry: AiSyncHistoryEntry): void {
  const result = applyAiSyncHistoryEntry(entry.id);
  if (!result) {
    feedback.value = '这条最近配置已经不存在。';
    recentConfigs.value = loadAiSyncHistory();
    return;
  }

  form.value = result.config;
  apiKeyDraft.value = '';
  availableModels.value = [];
  selectedFetchedModel.value = '';
  modelFetchError.value = null;
  recentConfigs.value = loadAiSyncHistory();
  feedback.value = result.restoredApiKey
    ? '已套用最近配置，并恢复对应 API Key。'
    : '已套用最近配置；将沿用当前已保存 API Key。';
  syncAvailability(form.value);
}

function deleteHistoryEntry(entry: AiSyncHistoryEntry): void {
  recentConfigs.value = deleteAiSyncHistoryEntry(entry.id);
  feedback.value = `已删除最近配置：${entry.model}`;
}

function clearHistory(): void {
  recentConfigs.value = clearAiSyncHistory();
  feedback.value = '已清空副 AI 最近配置记录。';
  syncAvailability(form.value);
}

function switchToInheritMain(): void {
  form.value.mode = 'inherit-main';
  feedback.value = '已切换为沿用主 AI 同步；保存后生效。';
}

function getModelListSourceKey(): string | null {
  return apiKeyDraft.value.trim() || (form.value.hasApiKey ? getAiSyncSecret().apiKey.trim() : null);
}

async function fetchModels(): Promise<void> {
  modelFetchError.value = null;
  feedback.value = null;
  availableModels.value = [];
  selectedFetchedModel.value = '';

  const apiKey = getModelListSourceKey();
  if (gameStore.runtime.environment !== 'tavern') {
    modelFetchError.value = '当前环境不支持拉取模型。';
    return;
  }

  if (form.value.mode !== 'second-ai') {
    modelFetchError.value = '请先启用独立副 AI 同步。';
    return;
  }

  if (!form.value.baseUrl.trim()) {
    modelFetchError.value = '请先填写 Base URL。';
    return;
  }

  if (!apiKey) {
    modelFetchError.value = '请先填写或保存 API Key。';
    return;
  }

  isLoadingModels.value = true;
  try {
    const getModelList = window.parent?.TavernHelper?.getModelList ?? globalThis.getModelList;
    if (!getModelList) {
      throw new Error('当前环境没有可用的模型列表接口。');
    }

    const models = await getModelList({
      apiurl: form.value.baseUrl.trim().replace(/\/+$/, ''),
      key: apiKey,
    });

    availableModels.value = Array.from(new Set(models.map(model => model.trim()).filter(Boolean)));
    if (!availableModels.value.length) {
      modelFetchError.value = '未拉取到可用模型，请手动填写。';
      return;
    }

    if (availableModels.value.includes(form.value.model)) {
      selectedFetchedModel.value = form.value.model;
    } else {
      selectedFetchedModel.value = availableModels.value[0];
      form.value.model = selectedFetchedModel.value;
    }

    feedback.value = `已拉取 ${availableModels.value.length} 个模型。`;
  } catch (error) {
    modelFetchError.value = error instanceof Error ? error.message : String(error);
  } finally {
    isLoadingModels.value = false;
  }
}
</script>

<template>
  <div class="workspace-stack">
    <section class="sync-overview">
      <div>
        <span class="overview-kicker">07 Secondary AI</span>
        <h3>AI 同步接口</h3>
        <p>把地点、时间、天气、社交和任务等结构化变化交给副 AI 处理，主 AI 更专注正文、对话和选项。</p>
      </div>
      <span class="status-pill" :class="{ 'status-pill--muted': !aiSyncStatus.configured }">{{ modeLabel }}</span>
    </section>

    <div class="tab-row" role="tablist" aria-label="AI 同步工作区">
      <button class="tab-button" :class="{ 'tab-button--active': activeTab === 'overview' }" type="button" @click="activeTab = 'overview'">总览</button>
      <button class="tab-button" :class="{ 'tab-button--active': activeTab === 'settings' }" type="button" @click="activeTab = 'settings'">副AI设置</button>
    </div>

    <template v-if="activeTab === 'overview'">
      <CollapsibleSection title="委托范围" subtitle="这些状态会由副 AI 后置修正，非剧情系统仍由前端处理。">
        <div class="scope-row">
          <span v-for="scope in delegatedScopes" :key="scope" class="scope-chip">{{ scope }}</span>
        </div>
        <p class="note">签到、商店、背包、奖励结算等确定性操作仍由前端和状态仓库完成，不交给副 AI 猜测。</p>
      </CollapsibleSection>

      <CollapsibleSection title="当前快照" subtitle="副 AI 每轮同步时会参考这些核心状态。">
        <div class="snapshot-grid">
          <article v-for="card in snapshotCards" :key="card.label" class="snapshot-card">
            <span>{{ card.label }}</span>
            <strong>{{ card.value }}</strong>
          </article>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="运行状态" subtitle="显示当前来源与最近一次系统/社交同步结果。">
        <dl class="status-list">
          <div>
            <dt>同步模式</dt>
            <dd>{{ modeLabel }}</dd>
          </div>
          <div>
            <dt>当前来源</dt>
            <dd>{{ transportLabel }}</dd>
          </div>
          <div>
            <dt>运行环境</dt>
            <dd>{{ aiSyncStatus.environment }}</dd>
          </div>
          <div>
            <dt>副 AI 配置</dt>
            <dd>{{ aiSyncStatus.configured ? '已就绪' : '未就绪' }}</dd>
          </div>
          <div>
            <dt>Base URL</dt>
            <dd>{{ aiSyncStatus.baseUrl || '未设置' }}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{{ aiSyncStatus.model || '未设置' }}</dd>
          </div>
          <div>
            <dt>API Key</dt>
            <dd>{{ apiKeyStatusLabel }}</dd>
          </div>
          <div>
            <dt>系统/任务通道</dt>
            <dd>{{ aiSyncStatus.system.enabled ? '启用' : '关闭' }}</dd>
          </div>
          <div>
            <dt>社交通道</dt>
            <dd>{{ aiSyncStatus.social.enabled ? '启用' : '关闭' }}</dd>
          </div>
          <div>
            <dt>最近系统命中</dt>
            <dd>{{ systemLastFieldsLabel }}</dd>
          </div>
          <div>
            <dt>最近社交命中</dt>
            <dd>{{ socialLastFieldsLabel }}</dd>
          </div>
          <div>
            <dt>最近系统时间</dt>
            <dd>{{ aiSyncStatus.system.lastRunAt ?? '暂无记录' }}</dd>
          </div>
          <div>
            <dt>最近社交时间</dt>
            <dd>{{ aiSyncStatus.social.lastRunAt ?? '暂无记录' }}</dd>
          </div>
          <div v-if="aiSyncStatus.configError" class="status-list__full status-list__warn">
            <dt>配置提示</dt>
            <dd>{{ aiSyncStatus.configError }}</dd>
          </div>
          <div v-if="aiSyncStatus.system.lastError" class="status-list__full status-list__error">
            <dt>最近系统错误</dt>
            <dd>{{ aiSyncStatus.system.lastError }}</dd>
          </div>
          <div v-if="aiSyncStatus.social.lastError" class="status-list__full status-list__error">
            <dt>最近社交错误</dt>
            <dd>{{ aiSyncStatus.social.lastError }}</dd>
          </div>
        </dl>
      </CollapsibleSection>
    </template>

    <template v-else>
      <CollapsibleSection title="副 AI 开关" subtitle="开启后，系统/社交同步优先走第二套 OpenAI 兼容接口。">
        <div class="settings-stack">
          <label class="switch-row">
            <input v-model="form.mode" type="checkbox" true-value="second-ai" false-value="inherit-main">
            <span>
              <strong>启用独立副 AI 同步</strong>
              <small>关闭后将回退为沿用主 AI 的 raw 同步链路。</small>
            </span>
          </label>

          <div class="form-grid">
            <label class="switch-row switch-row--compact">
              <input v-model="form.systemEnabled" type="checkbox">
              <span>
                <strong>系统 / 任务同步</strong>
                <small>地点、日期、时间、天气、任务</small>
              </span>
            </label>
            <label class="switch-row switch-row--compact">
              <input v-model="form.socialEnabled" type="checkbox">
              <span>
                <strong>社交同步</strong>
                <small>周围人物、历史人物、攻略目标</small>
              </span>
            </label>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="最近配置" subtitle="保存副 AI 设置时会自动记录，测试不同接口时可一键套用。">
        <div v-if="recentConfigs.length" class="history-list">
          <article v-for="entry in recentConfigs" :key="entry.id" class="history-card">
            <div>
              <strong>{{ entry.model }}</strong>
              <span>{{ entry.baseUrl }}</span>
              <small>
                {{ entry.temperature ? `温度 ${entry.temperature}` : '默认温度' }} ·
                {{ entry.maxTokens ? `Max ${entry.maxTokens}` : '默认 Max tokens' }} ·
                {{ entry.hasStoredApiKey ? `已保存密钥 ${entry.apiKeyHint ?? ''}` : '沿用当前密钥' }}
              </small>
              <small>最近使用 {{ entry.lastUsedAt }} · {{ entry.useCount }} 次</small>
            </div>
            <div class="history-actions">
              <button class="action-button" type="button" @click="applyHistoryEntry(entry)">套用</button>
              <button class="action-button" type="button" @click="deleteHistoryEntry(entry)">删除</button>
            </div>
          </article>
        </div>
        <p v-else class="note">暂无最近配置；保存一次独立副 AI 设置后会出现在这里。</p>
        <div class="action-row history-footer">
          <button class="action-button" type="button" :disabled="!recentConfigs.length" @click="clearHistory">清空历史</button>
          <span class="model-hint">清空历史会删除历史里保存的密钥，但不会影响当前表单内容。</span>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="OpenAI 兼容接口" subtitle="支持主流 OpenAI 格式接口、中转或兼容代理。">
        <div class="form-grid">
          <label class="field field--full">
            <span>Base URL</span>
            <input v-model="form.baseUrl" type="text" placeholder="https://api.openai.com/v1">
          </label>
          <label class="field">
            <span>Model</span>
            <input v-model="form.model" type="text" placeholder="gpt-4.1-mini">
            <div class="model-actions">
              <button class="action-button" type="button" :disabled="!canFetchModels" @click="fetchModels">
                {{ isLoadingModels ? '拉取中…' : '拉取模型' }}
              </button>
              <span class="model-hint">{{ modelFetchHint }}</span>
            </div>
            <div v-if="availableModels.length" class="model-picker">
              <span>选择模型</span>
              <select v-model="selectedFetchedModel" @change="form.model = selectedFetchedModel">
                <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
              </select>
            </div>
            <small v-if="modelFetchError" class="model-error">{{ modelFetchError }}</small>
          </label>
          <label class="field">
            <span>API Key</span>
            <input v-model="apiKeyDraft" type="password" placeholder="留空则保留现有 API Key">
            <small>{{ apiKeyStatusLabel }}</small>
            <label class="inline-check">
              <input v-model="rememberApiKeyWithHistory" type="checkbox">
              <span>保存设置时，也随最近配置记住这次输入的 API Key</span>
            </label>
          </label>
          <label class="field">
            <span>Temperature（可选）</span>
            <input v-model="form.temperature" type="number" step="0.1" min="0" max="2" placeholder="例如 0.2">
          </label>
          <label class="field">
            <span>Max tokens（可选）</span>
            <input v-model="form.maxTokens" type="number" min="1" step="1" placeholder="例如 1200">
          </label>
        </div>
      </CollapsibleSection>

      <div class="action-row">
        <button class="action-button action-button--primary" type="button" @click="saveSettings">保存设置</button>
        <button class="action-button" type="button" @click="clearApiKey">清除 API Key</button>
        <button class="action-button" type="button" @click="clearAllSettings">清空副 AI 全部配置</button>
        <button class="action-button" type="button" @click="switchToInheritMain">恢复为沿用主AI</button>
        <span v-if="feedback" class="feedback">{{ feedback }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.workspace-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sync-overview {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border: 1px solid rgba(0, 229, 255, 0.14);
  border-radius: 10px;
  background:
    radial-gradient(circle at top right, rgba(0, 229, 255, 0.1), transparent 42%),
    rgba(255, 255, 255, 0.025);
}

.overview-kicker {
  display: block;
  color: #76f4ff;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

h3,
p {
  margin: 0;
}

h3 {
  margin-top: 5px;
  color: #eef2ff;
  font-size: 18px;
}

.sync-overview p,
.note,
.status-list dt,
.field small,
.feedback,
.switch-row small {
  color: #8b95b4;
  font-size: 12px;
  line-height: 1.55;
}

.sync-overview p {
  max-width: 520px;
  margin-top: 8px;
}

.status-pill,
.scope-chip {
  border-radius: 999px;
  white-space: nowrap;
}

.status-pill {
  flex: 0 0 auto;
  padding: 6px 10px;
  border: 1px solid rgba(0, 229, 255, 0.18);
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  font-size: 11px;
}

.status-pill--muted {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  color: #8b95b4;
}

.tab-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.tab-button,
.action-button {
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  color: #c9d1e8;
  cursor: pointer;
  font: inherit;
}

.tab-button {
  padding: 9px 14px;
}

.tab-button--active {
  border-color: rgba(0, 229, 255, 0.34);
  background: rgba(0, 229, 255, 0.1);
  color: #76f4ff;
}

.scope-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.scope-chip {
  padding: 7px 11px;
  border: 1px solid rgba(118, 244, 255, 0.18);
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  font-size: 12px;
}

.note {
  margin-top: 12px;
}

.snapshot-grid,
.status-list,
.form-grid {
  display: grid;
  gap: 12px;
}

.snapshot-grid {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.snapshot-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.snapshot-card span {
  display: block;
  color: #8b95b4;
  font-size: 12px;
}

.snapshot-card strong {
  display: block;
  margin-top: 8px;
  color: #eef2ff;
  overflow-wrap: anywhere;
}

.status-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 0;
}

.status-list div,
.switch-row {
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
}

.status-list__full {
  grid-column: 1 / -1;
}

.status-list__warn {
  border-color: rgba(250, 204, 21, 0.22) !important;
  background: rgba(250, 204, 21, 0.08) !important;
}

.status-list__error {
  border-color: rgba(248, 113, 113, 0.22) !important;
  background: rgba(248, 113, 113, 0.08) !important;
}

.status-list dt,
.status-list dd {
  margin: 0;
}

.status-list dd {
  margin-top: 5px;
  color: #eef2ff;
  overflow-wrap: anywhere;
}

.settings-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.switch-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  cursor: pointer;
}

.switch-row--compact {
  height: 100%;
}

.switch-row input {
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: #00e5ff;
}

.switch-row strong,
.field > span {
  color: #eef2ff;
  font-size: 13px;
}

.switch-row strong,
.switch-row small {
  display: block;
}

.switch-row small {
  margin-top: 5px;
}

.form-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field--full {
  grid-column: 1 / -1;
}

.field input,
.field select {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(118, 244, 255, 0.22);
  border-radius: 8px;
  background: rgba(11, 15, 32, 0.94);
  color: #f7f9ff;
  padding: 10px 12px;
  font: inherit;
}

.field input:focus,
.field select:focus {
  outline: none;
  border-color: rgba(118, 244, 255, 0.72);
  box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1);
}

.model-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.model-hint {
  color: #8b95b4;
  font-size: 12px;
}

.model-picker {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.model-picker span {
  color: #eef2ff;
  font-size: 13px;
}

.model-error {
  color: #fca5a5;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.history-list {
  display: grid;
  gap: 10px;
}

.history-card {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.history-card strong,
.history-card span,
.history-card small {
  display: block;
}

.history-card strong {
  color: #eef2ff;
  font-size: 14px;
}

.history-card span,
.history-card small {
  color: #8b95b4;
  font-size: 12px;
  line-height: 1.5;
  margin-top: 4px;
  overflow-wrap: anywhere;
}

.history-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}

.history-footer {
  margin-top: 10px;
}

.inline-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: #8b95b4;
  font-size: 12px;
  line-height: 1.5;
}

.inline-check input {
  width: 16px;
  height: 16px;
  margin-top: 2px;
  accent-color: #00e5ff;
}

.action-button {
  padding: 10px 14px;
}

.action-button:hover {
  border-color: rgba(0, 229, 255, 0.3);
  background: rgba(0, 229, 255, 0.08);
}

.action-button--primary {
  border-color: rgba(0, 229, 255, 0.34);
  background: rgba(0, 229, 255, 0.13);
  color: #76f4ff;
}

@media (max-width: 720px) {
  .sync-overview,
  .snapshot-grid,
  .status-list,
  .form-grid {
    grid-template-columns: 1fr;
  }

  .sync-overview {
    flex-direction: column;
  }
}
</style>
