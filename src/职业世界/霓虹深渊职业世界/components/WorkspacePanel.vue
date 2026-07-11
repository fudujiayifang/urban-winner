<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  embedded?: boolean;
  fullscreen?: boolean;
}>(), {
  subtitle: '',
  embedded: false,
  fullscreen: false,
});

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div class="workspace-backdrop" @click.self="emit('close')">
    <section class="workspace-panel" :class="{ 'workspace-panel--embedded': props.embedded, 'workspace-panel--fullscreen': props.fullscreen }">
      <header class="workspace-header">
        <div class="workspace-heading">
          <p v-if="props.subtitle" class="workspace-subtitle">{{ props.subtitle }}</p>
          <h2>{{ props.title }}</h2>
        </div>
        <button class="workspace-close" type="button" @click="emit('close')" aria-label="关闭面板">
          ×
        </button>
      </header>
      <div class="workspace-body">
        <slot />
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.workspace-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(3, 4, 10, 0.62);
  backdrop-filter: blur(10px);
}

.workspace-panel {
  width: min(980px, 100%);
  max-width: 100%;
  max-height: min(88dvh, 960px);
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(38, 49, 91, 0.92);
  border-radius: 10px;
  background:
    radial-gradient(circle at top left, rgba(168, 85, 247, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(12, 13, 27, 0.98) 0%, rgba(8, 9, 18, 0.98) 100%);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.46), inset 0 1px 0 rgba(0, 229, 255, 0.08);
}

.workspace-panel--embedded {
  width: min(920px, calc(100% - 8px));
}

.workspace-panel--fullscreen {
  width: min(1320px, calc(100vw - 20px));
  max-height: calc(100dvh - 20px);
}

.workspace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.workspace-heading {
  min-width: 0;
}

.workspace-subtitle {
  margin: 0 0 6px;
  color: #7f8aa8;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  color: #eef2ff;
  font-size: 20px;
  line-height: 1.2;
}

.workspace-close {
  flex: 0 0 auto;
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

.workspace-close:hover {
  border-color: rgba(255, 107, 129, 0.45);
  color: #ff6b81;
  background: rgba(255, 107, 129, 0.08);
}

.workspace-body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
}

@media (max-width: 900px) {
  .workspace-backdrop {
    padding: 12px;
  }

  .workspace-panel,
  .workspace-panel--embedded,
  .workspace-panel--fullscreen {
    width: min(100%, calc(100vw - 8px));
    max-height: calc(100dvh - 8px);
  }
}

@media (max-width: 720px) {
  .workspace-backdrop {
    padding: 4px;
    align-items: stretch;
  }

  .workspace-panel,
  .workspace-panel--embedded,
  .workspace-panel--fullscreen {
    width: 100%;
    min-height: calc(100dvh - 8px);
    max-height: calc(100dvh - 8px);
    border-radius: 8px;
    box-shadow: 0 16px 44px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(0, 229, 255, 0.08);
  }

  .workspace-header {
    padding: 14px 14px 12px;
    gap: 12px;
    flex-wrap: wrap;
  }

  .workspace-body {
    padding: 12px;
  }

  h2 {
    font-size: 18px;
  }
}

@media (max-width: 480px) {
  .workspace-backdrop {
    padding: 0;
  }

  .workspace-panel,
  .workspace-panel--embedded,
  .workspace-panel--fullscreen {
    min-height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
    border-left: none;
    border-right: none;
  }

  .workspace-header {
    padding: 12px;
  }

  .workspace-body {
    padding: 10px;
  }
}
</style>
