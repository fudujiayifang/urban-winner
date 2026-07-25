<script setup lang="ts">
import type { WorkspaceDefinition, WorkspaceKey } from '../store/ui';

const props = defineProps<{
  items: WorkspaceDefinition[];
  collapsed: boolean;
  embedded?: boolean;
  activeWorkspace: WorkspaceKey | null;
  fullscreen: {
    active: boolean;
    supported: boolean;
  };
  reroll: {
    enabled: boolean;
    loading: boolean;
  };
  summary: {
    race: string;
    nation: string;
    money: string;
    systemPoints: string;
    campusPoints: string;
    questCount: string;
    targetCount: string;
    inventoryCount: string;
    historyCount: string;
  };
}>();

const emit = defineEmits<{
  toggleRail: [];
  open: [key: WorkspaceKey];
  reroll: [];
  toggleFullscreen: [];
}>();
</script>

<template>
  <div class="utility-anchor">
    <button
      class="utility-toggle"
      :class="{ 'utility-toggle--active': !props.collapsed }"
      type="button"
      @click="emit('toggleRail')"
      :aria-expanded="!props.collapsed"
      :aria-label="props.collapsed ? '展开工具栏' : '收起工具栏'"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>

    <transition name="rail-slide">
      <div v-if="!props.collapsed" class="utility-rail" :class="{ 'utility-rail--embedded': props.embedded }">
        <section class="utility-header">
          <div class="utility-heading">
            <span class="utility-kicker">07 System</span>
            <strong>系统菜单</strong>
          </div>
          <p class="utility-identity">{{ props.summary.race }} · {{ props.summary.nation }}</p>
          <div class="utility-resource-row">
            <span>金钱 {{ props.summary.money }}</span>
            <span>系统 {{ props.summary.systemPoints }}</span>
            <span>学府 {{ props.summary.campusPoints }}</span>
          </div>
          <div class="utility-summary-grid">
            <span>任务 {{ props.summary.questCount }}</span>
            <span>人物 {{ props.summary.targetCount }}</span>
            <span>背包 {{ props.summary.inventoryCount }}</span>
            <span>历史 {{ props.summary.historyCount }}</span>
          </div>
        </section>

        <div class="utility-divider"></div>

        <button
          v-for="item in props.items"
          :key="item.key"
          class="utility-button"
          :class="{ 'utility-button--active': props.activeWorkspace === item.key }"
          type="button"
          @click="emit('open', item.key)"
        >
          <span class="utility-icon">{{ item.icon }}</span>
          <span class="utility-copy">
            <span class="utility-label">{{ item.label }}</span>
            <span class="utility-description">{{ item.description }}</span>
          </span>
          <span v-if="item.badge != null && item.badge !== ''" class="utility-badge">{{ item.badge }}</span>
        </button>

        <div class="utility-divider"></div>

        <button
          class="utility-button"
          :class="{ 'utility-button--signal': props.reroll.enabled }"
          type="button"
          :disabled="!props.reroll.enabled"
          @click="emit('reroll')"
        >
          <span class="utility-icon">🎲</span>
          <span class="utility-copy">
            <span class="utility-label">{{ props.reroll.loading ? '撤回本轮' : '重ROLL' }}</span>
            <span class="utility-description">
              {{
                props.reroll.enabled
                  ? props.reroll.loading
                    ? '停止当前这一轮并回填输入框'
                    : '撤回上一轮并回填输入框'
                  : '暂无可撤回输入'
              }}
            </span>
          </span>
        </button>

        <button
          class="utility-button"
          :class="{ 'utility-button--active utility-button--signal': props.fullscreen.active }"
          type="button"
          :disabled="!props.fullscreen.supported"
          @click="emit('toggleFullscreen')"
        >
          <span class="utility-icon">{{ props.fullscreen.active ? '🗗' : '⛶' }}</span>
          <span class="utility-copy">
            <span class="utility-label">{{ props.fullscreen.active ? '退出全屏' : '进入全屏' }}</span>
            <span class="utility-description">
              {{ props.fullscreen.supported ? '切换沉浸式显示模式' : '当前环境不支持全屏切换' }}
            </span>
          </span>
        </button>
      </div>
    </transition>
  </div>
</template>

<style scoped lang="scss">
.utility-anchor {
  position: fixed;
  top: 18px;
  right: 18px;
  z-index: 70;
}

.utility-toggle {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  width: 38px;
  height: 38px;
  padding: 0 10px;
  border: 1px solid rgba(0, 229, 255, 0.22);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(14, 16, 30, 0.96) 0%, rgba(8, 10, 20, 0.98) 100%);
  color: #d9e7ff;
  cursor: pointer;
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.utility-toggle span {
  display: block;
  width: 100%;
  height: 2px;
  border-radius: 999px;
  background: currentColor;
  transition: transform 0.18s ease, opacity 0.18s ease;
}

.utility-toggle:hover,
.utility-toggle--active {
  border-color: rgba(0, 229, 255, 0.42);
  background: linear-gradient(180deg, rgba(12, 18, 34, 0.98) 0%, rgba(8, 11, 24, 0.98) 100%);
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.34), 0 0 0 1px rgba(0, 229, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

.utility-toggle--active span:nth-child(1) {
  transform: translateY(7px) rotate(45deg);
}

.utility-toggle--active span:nth-child(2) {
  opacity: 0;
}

.utility-toggle--active span:nth-child(3) {
  transform: translateY(-7px) rotate(-45deg);
}

.utility-rail {
  position: absolute;
  top: 0;
  right: calc(100% + 12px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 232px;
  max-height: calc(100vh - 36px);
  padding: 12px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 10px;
  background:
    radial-gradient(circle at top left, rgba(0, 229, 255, 0.08), transparent 36%),
    linear-gradient(180deg, rgba(13, 16, 30, 0.96) 0%, rgba(7, 9, 18, 0.98) 100%);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  box-sizing: border-box;
}

.utility-rail--embedded {
  width: min(224px, calc(100vw - 84px));
}

.utility-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 2px 0;
}

.utility-heading {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.utility-kicker {
  color: #6d7b9c;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.utility-heading strong {
  color: #eef3ff;
  font-size: 15px;
  font-weight: 600;
}

.utility-identity {
  margin: 0;
  color: #8f9ec3;
  font-size: 12px;
}

.utility-resource-row,
.utility-summary-grid {
  display: grid;
  gap: 6px;
}

.utility-resource-row {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.utility-summary-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.utility-resource-row span,
.utility-summary-grid span {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  min-height: 24px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #97a6ca;
  font-size: 11px;
  white-space: nowrap;
}

.utility-divider {
  height: 1px;
  background: linear-gradient(90deg, rgba(0, 229, 255, 0.2) 0%, rgba(255, 255, 255, 0.04) 100%);
}

.utility-button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  color: #d4e1ff;
  cursor: pointer;
  text-align: left;
  transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}

.utility-button:hover,
.utility-button--active {
  transform: translateX(3px);
  border-color: rgba(0, 229, 255, 0.22);
  background: linear-gradient(180deg, rgba(0, 229, 255, 0.08) 0%, rgba(168, 85, 247, 0.06) 100%);
}

.utility-button--active {
  box-shadow: inset 0 0 0 1px rgba(0, 229, 255, 0.12);
}

.utility-button--signal {
  border-color: rgba(168, 85, 247, 0.2);
  background: linear-gradient(180deg, rgba(168, 85, 247, 0.1) 0%, rgba(0, 229, 255, 0.06) 100%);
}

.utility-button:disabled {
  opacity: 0.56;
  cursor: not-allowed;
  transform: none;
}

.utility-button:disabled:hover {
  border-color: rgba(255, 255, 255, 0.03);
  background: rgba(255, 255, 255, 0.02);
  box-shadow: none;
}

.utility-icon {
  flex: 0 0 auto;
  width: 28px;
  color: #76f3ff;
  font-size: 18px;
  text-align: center;
}

.utility-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.utility-label {
  color: #eef3ff;
  font-size: 13px;
  font-weight: 600;
}

.utility-description {
  margin-top: 3px;
  color: #7a88ac;
  font-size: 11px;
  line-height: 1.35;
}

.utility-badge {
  position: absolute;
  top: 9px;
  right: 9px;
  min-width: 18px;
  padding: 0 6px;
  border: 1px solid rgba(168, 85, 247, 0.22);
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.14);
  color: #d7a5ff;
  font-size: 10px;
  line-height: 18px;
  text-align: center;
}

.rail-slide-enter-active,
.rail-slide-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.rail-slide-enter-from,
.rail-slide-leave-to {
  opacity: 0;
  transform: translateX(6px);
}

@media (max-width: 1100px) {
  .utility-anchor {
    top: 14px;
    right: 12px;
  }

  .utility-rail {
    width: 220px;
  }
}

@media (max-width: 720px) {
  .utility-anchor {
    top: 10px;
    right: 10px;
  }

  .utility-toggle {
    position: relative;
    z-index: 2;
  }

  .utility-rail,
  .utility-rail--embedded {
    position: fixed;
    top: 10px;
    right: 10px;
    width: min(312px, calc(100vw - 20px));
    max-height: calc(100vh - 20px);
    padding-top: 56px;
  }
}
</style>
