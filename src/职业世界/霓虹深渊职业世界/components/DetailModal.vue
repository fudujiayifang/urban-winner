<script setup lang="ts">
import type { DetailModalState } from '../store/ui';

const props = defineProps<{
  state: DetailModalState;
}>();

const emit = defineEmits<{
  close: [];
  action: [actionId: string];
}>();
</script>

<template>
  <div class="detail-backdrop" @click.self="emit('close')">
    <section class="detail-modal" :class="`detail-modal--${props.state.kind}`">
      <header class="detail-header">
        <div>
          <p class="detail-kicker">详细信息</p>
          <h2>{{ props.state.title }}</h2>
        </div>
        <button class="detail-close" type="button" @click="emit('close')" aria-label="关闭详情">
          ×
        </button>
      </header>
      <div class="detail-body">
        <slot :payload="props.state.payload" :kind="props.state.kind" />
      </div>
      <footer v-if="props.state.actions?.length" class="detail-footer">
        <button
          v-for="action in props.state.actions"
          :key="action.id"
          class="detail-action"
          :class="[`detail-action--${action.tone ?? 'secondary'}`]"
          type="button"
          @click="emit('action', action.id)"
        >
          {{ action.label }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.detail-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.72);
}

.detail-modal {
  display: flex;
  width: min(720px, 100%);
  max-height: calc(100dvh - 40px);
  min-height: 0;
  flex-direction: column;
  border: 1px solid rgba(38, 49, 91, 0.92);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(13, 14, 28, 0.98) 0%, rgba(9, 10, 18, 0.98) 100%);
  box-shadow: 0 28px 72px rgba(0, 0, 0, 0.5);
}

.detail-modal--social-target {
  width: min(560px, 100%);
}

.detail-modal--social-target .detail-header,
.detail-modal--social-target .detail-footer {
  padding: 12px 14px;
}

.detail-modal--social-target .detail-body {
  padding: 12px;
}

.detail-modal--social-target h2 {
  font-size: 16px;
}

.detail-header,
.detail-footer {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
}

.detail-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.detail-kicker {
  margin: 0 0 6px;
  color: #8b95b4;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #eef2ff;
  font-size: 18px;
}

.detail-close {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
  color: #aeb7d1;
  cursor: pointer;
  font-size: 24px;
  line-height: 1;
}

.detail-body {
  min-height: 0;
  padding: 18px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.detail-footer {
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.detail-action {
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 14px;
}

.detail-action--primary {
  background: rgba(0, 229, 255, 0.12);
  border-color: rgba(0, 229, 255, 0.24);
  color: #76f4ff;
}

.detail-action--secondary {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.08);
  color: #dbe3ff;
}

.detail-action--danger {
  background: rgba(255, 107, 129, 0.12);
  border-color: rgba(255, 107, 129, 0.28);
  color: #ff8c9d;
}

@media (max-width: 720px) {
  .detail-backdrop {
    align-items: flex-start;
    padding: 8px;
  }

  .detail-modal {
    width: 100%;
    max-height: calc(100dvh - 16px);
  }

  .detail-header,
  .detail-body,
  .detail-footer {
    padding: 12px;
  }

  .detail-close {
    width: 36px;
    height: 36px;
    font-size: 22px;
  }

  .detail-footer {
    flex-wrap: wrap;
  }

  .detail-action {
    flex: 1 1 140px;
  }
}
</style>
