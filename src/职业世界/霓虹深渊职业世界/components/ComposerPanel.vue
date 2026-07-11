<script setup lang="ts">
const props = defineProps<{
  modelValue: string;
  disabled: boolean;
  error: string | null;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  send: [];
}>();

function update(value: string): void {
  emit('update:modelValue', value);
}

function submit(): void {
  if (!props.disabled && props.modelValue.trim()) {
    emit('send');
  }
}
</script>

<template>
  <div class="composer" :class="{ 'composer--embedded': props.embedded }">
    <input
      :value="props.modelValue"
      :disabled="props.disabled"
      class="composer-input"
      type="text"
      placeholder="输入行动或对话…"
      autocomplete="off"
      @input="update(($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="submit"
    >
    <button
      class="send-button"
      type="button"
      :disabled="props.disabled || !props.modelValue.trim()"
      @click="submit"
    >
      {{ props.disabled ? '生成中…' : '发送' }}
    </button>
  </div>
  <p v-if="props.error" class="error-text">{{ props.error }}</p>
</template>

<style scoped lang="scss">
.composer {
  display: flex;
  gap: 10px;
  width: 100%;
}

.composer--embedded {
  gap: 8px;
}

.composer-input {
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 6px;
  background: rgba(6, 6, 14, 0.78);
  color: #e8e4f0;
  font-size: 14px;
  outline: none;
  padding: 11px 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  box-sizing: border-box;
}

.composer-input:focus {
  border-color: #00e5ff;
  box-shadow: 0 0 20px rgba(0, 229, 255, 0.15), inset 0 0 16px rgba(0, 229, 255, 0.03);
}

.send-button {
  flex: 0 0 auto;
  border: 1px solid #00e5ff;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(0, 229, 255, 0.12), rgba(168, 85, 247, 0.14));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  color: #00e5ff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  min-width: 88px;
  max-width: 100%;
  padding: 0 18px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.composer--embedded .send-button {
  min-width: 80px;
  padding-inline: 14px;
}

.send-button:not(:disabled):hover {
  border-color: #76f4ff;
  box-shadow: 0 0 22px rgba(0, 229, 255, 0.2);
  transform: translateY(-1px);
}

.send-button:disabled,
.composer-input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.error-text {
  color: #ff6b81;
  font-size: 12px;
  line-height: 1.6;
  margin: 8px 0 0;
}

@media (max-width: 640px) {
  .composer {
    gap: 8px;
  }

  .composer-input {
    padding: 10px 12px;
  }

  .send-button {
    min-width: 72px;
    padding-inline: 14px;
    white-space: nowrap;
  }
}
</style>
