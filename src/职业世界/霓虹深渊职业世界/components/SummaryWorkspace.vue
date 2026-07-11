<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { useGameStore } from '../store/game';
import { useSessionStore } from '../store/session';

const gameStore = useGameStore();
const sessionStore = useSessionStore();
const activeTab = ref<'history' | 'settings'>('history');
const feedback = ref<string | null>(null);

const DEFAULT_SUMMARY_SETTINGS = {
  floorSummaryLength: 75,
  floorSummarySendLimit: 400,
  autoSummaryEnabled: true,
  summaryPrompt: '',
} as const;

const form = ref({ ...gameStore.data.零七系统.summarySettings });
const floorSummaries = computed(() => [...sessionStore.summaryHistory].reverse());
const settings = computed(() => gameStore.data.零七系统.summarySettings);

watch(settings, value => {
  form.value = { ...value };
}, { deep: true });

function saveSettings(): void {
  gameStore.updateSummarySettings(form.value);
  form.value = { ...gameStore.data.零七系统.summarySettings };
  feedback.value = '总结设置已保存，下一次生成开始生效。';
}

function resetSettings(): void {
  form.value = { ...DEFAULT_SUMMARY_SETTINGS };
  gameStore.updateSummarySettings(form.value);
  feedback.value = '已恢复民国风云式默认总结设置。';
}

function summaryTurnLabel(index: number): string {
  return `第 ${floorSummaries.value.length - index} 楼`;
}
</script>

<template>
  <div class="workspace-stack">
    <section class="summary-overview">
      <div>
        <span class="overview-kicker">07 Narrative Archive</span>
        <h3>剧情总结</h3>
        <p>每轮独立保存楼层要点，并在后续生成时按设置回灌给 AI。</p>
      </div>
      <div class="overview-stats">
        <span><strong>{{ floorSummaries.length }}</strong> 楼记录</span>
        <span :class="{ 'status-pill--muted': !settings.autoSummaryEnabled }">
          {{ settings.autoSummaryEnabled ? '自动总结已启用' : '自动总结已关闭' }}
        </span>
      </div>
    </section>

    <div class="tab-row" role="tablist" aria-label="剧情总结工作区">
      <button
        class="tab-button"
        :class="{ 'tab-button--active': activeTab === 'history' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'history'"
        @click="activeTab = 'history'"
      >
        楼层总结
      </button>
      <button
        class="tab-button"
        :class="{ 'tab-button--active': activeTab === 'settings' }"
        type="button"
        role="tab"
        :aria-selected="activeTab === 'settings'"
        @click="activeTab = 'settings'"
      >
        总结设置
      </button>
    </div>

    <template v-if="activeTab === 'history'">
      <CollapsibleSection title="楼层总结" subtitle="总结不会混入聊天正文；最新楼层在最上方。">
        <div v-if="floorSummaries.length" class="summary-list">
          <article v-for="(summary, index) in floorSummaries" :key="summary.turnId" class="summary-card">
            <header>
              <span class="floor-label">{{ summaryTurnLabel(index) }}</span>
              <span v-if="index === 0" class="current-label">当前</span>
            </header>
            <p>{{ summary.content }}</p>
          </article>
        </div>
        <div v-else class="empty-state">
          <strong>暂无楼层总结</strong>
          <p>开启自动总结后，模型每次返回的 <code>&lt;sum&gt;</code> 会记录在这里。</p>
        </div>
      </CollapsibleSection>
    </template>

    <template v-else>
      <CollapsibleSection title="自动总结" subtitle="复刻民国风云的楼层总结规则，并保存到当前存档。">
        <div class="settings-stack">
          <label class="switch-row">
            <input v-model="form.autoSummaryEnabled" type="checkbox">
            <span>
              <strong>启用自动总结</strong>
              <small>启用后，每轮会要求 AI 输出独立的 <code>&lt;sum&gt;</code> 楼层总结。</small>
            </span>
          </label>

          <div class="form-grid">
            <label class="field">
              <span>楼层总结字数限制</span>
              <input v-model.number="form.floorSummaryLength" type="number" min="20" max="300">
              <small>字，默认 75；AI 会得到一个围绕该数值的长度范围。</small>
            </label>

            <label class="field">
              <span>发送楼层总结数量</span>
              <input v-model.number="form.floorSummarySendLimit" type="number" min="1" max="400">
              <small>楼，发送最近 N 楼总结给 AI，默认 400。</small>
            </label>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="总结提示词" subtitle="只作用于 <sum>，不会改变正文或变量更新协议。">
        <label class="field field--full">
          <span>附加要求（可选）</span>
          <textarea
            v-model="form.summaryPrompt"
            rows="6"
            maxlength="2000"
            placeholder="例如：优先记录人物关系、任务进度和重要物品变化。"
          ></textarea>
          <small>{{ form.summaryPrompt.length }}/2000</small>
        </label>
      </CollapsibleSection>

      <div class="action-row">
        <button class="action-button action-button--primary" type="button" @click="saveSettings">保存设置</button>
        <button class="action-button" type="button" @click="resetSettings">重置默认</button>
        <span v-if="feedback" class="feedback">{{ feedback }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.workspace-stack,
.settings-stack,
.summary-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-overview {
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

.overview-kicker,
.field small,
.switch-row small,
.empty-state p,
.feedback {
  color: #8b95b4;
  font-size: 12px;
  line-height: 1.55;
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

.summary-overview p {
  max-width: 540px;
  margin-top: 8px;
  color: #aeb7d1;
  font-size: 13px;
  line-height: 1.6;
}

.overview-stats {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.overview-stats span,
.floor-label,
.current-label {
  padding: 6px 10px;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 999px;
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  font-size: 11px;
  white-space: nowrap;
}

.overview-stats strong {
  color: #eef2ff;
}

.status-pill--muted {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.03) !important;
  color: #8b95b4 !important;
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

.summary-card {
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
}

.summary-card header,
.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.current-label {
  border-color: rgba(168, 85, 247, 0.3);
  background: rgba(168, 85, 247, 0.12);
  color: #d8b4fe;
}

.summary-card p {
  margin-top: 10px;
  color: #dbe3ff;
  line-height: 1.75;
  white-space: pre-wrap;
}

.empty-state {
  padding: 22px;
  border: 1px dashed rgba(118, 244, 255, 0.18);
  border-radius: 8px;
  text-align: center;
}

.empty-state strong {
  color: #dbe3ff;
}

.empty-state p {
  margin-top: 8px;
}

.switch-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.025);
  cursor: pointer;
}

.switch-row input {
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: #00e5ff;
}

.switch-row strong,
.switch-row small {
  display: block;
}

.switch-row strong,
.field > span {
  color: #eef2ff;
  font-size: 13px;
}

.switch-row small {
  margin-top: 5px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.field--full {
  width: 100%;
}

.field input,
.field textarea {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(118, 244, 255, 0.22);
  border-radius: 8px;
  background: rgba(11, 15, 32, 0.94);
  color: #f7f9ff;
  padding: 10px 12px;
  font: inherit;
}

.field textarea {
  min-height: 118px;
  resize: vertical;
}

.field input:focus,
.field textarea:focus {
  outline: none;
  border-color: rgba(118, 244, 255, 0.72);
  box-shadow: 0 0 0 2px rgba(0, 229, 255, 0.1);
}

.action-row {
  justify-content: flex-start;
  flex-wrap: wrap;
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

.feedback {
  margin-left: 4px;
}

@media (max-width: 720px) {
  .summary-overview,
  .overview-stats {
    flex-direction: column;
    align-items: flex-start;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
