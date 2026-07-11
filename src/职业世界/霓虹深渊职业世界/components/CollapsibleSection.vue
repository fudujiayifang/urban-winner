<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string;
  subtitle?: string;
  open?: boolean;
}>(), {
  subtitle: '',
  open: true,
});
</script>

<template>
  <section class="collapsible-section">
    <header class="section-header">
      <div>
        <h3>{{ props.title }}</h3>
        <p v-if="props.subtitle" class="section-subtitle">{{ props.subtitle }}</p>
      </div>
      <span class="section-indicator" :class="{ 'section-indicator--open': props.open }">⌄</span>
    </header>
    <div v-if="props.open" class="section-body">
      <slot />
    </div>
  </section>
</template>

<style scoped lang="scss">
.collapsible-section {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 14px 16px;
}

.section-header > div {
  min-width: 0;
  flex: 1 1 220px;
}

h3 {
  margin: 0;
  color: #eef2ff;
  font-size: 16px;
}

.section-subtitle {
  margin: 6px 0 0;
  color: #8b95b4;
  font-size: 12px;
}

.section-indicator {
  flex: 0 0 auto;
  color: #76f4ff;
  font-size: 18px;
  transform: rotate(-90deg);
}

.section-indicator--open {
  transform: rotate(0deg);
}

.section-body {
  padding: 0 16px 16px;
}

@media (max-width: 720px) {
  .section-header {
    padding: 12px 12px 10px;
    gap: 10px;
  }

  .section-body {
    padding: 0 12px 12px;
  }

  h3 {
    font-size: 15px;
  }

  .section-subtitle {
    line-height: 1.5;
  }

  .section-body :deep(.section-header) {
    padding: 12px 12px 10px;
  }

  .section-body :deep(.section-body) {
    padding: 0 12px 12px;
  }
}

@media (max-width: 480px) {
  .section-header {
    padding: 10px 10px 8px;
  }

  .section-body {
    padding: 0 10px 10px;
  }

  .section-body :deep(.section-header) {
    padding: 10px 10px 8px;
  }

  .section-body :deep(.section-body) {
    padding: 0 10px 10px;
  }
}
</style>
