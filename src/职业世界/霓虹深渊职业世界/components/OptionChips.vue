<script setup lang="ts">
const props = defineProps<{
  options: string[];
}>();

const emit = defineEmits<{
  choose: [option: string];
}>();
</script>

<template>
  <div v-if="props.options.length > 0" class="option-chips">
    <button
      v-for="option in props.options"
      :key="option"
      class="option-chip"
      type="button"
      @click="emit('choose', option)"
    >
      {{ option }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.option-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 18px;
  width: 100%;
}

.option-chip {
  max-width: 100%;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 999px;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.08), rgba(168, 85, 247, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  color: #76f4ff;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 13px;
  overflow-wrap: anywhere;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.option-chip:hover {
  border-color: #00e5ff;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.14), rgba(168, 85, 247, 0.12));
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.12);
  transform: translateY(-1px);
}
</style>
