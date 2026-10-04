<script setup lang="ts">
const props = withDefaults(defineProps<{
  name: string;
  avatar?: string | null;
  size?: 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'rounded';
  clickable?: boolean;
  disabled?: boolean;
}>(), {
  avatar: null,
  size: 'md',
  shape: 'rounded',
  clickable: false,
  disabled: false,
});

const emit = defineEmits<{
  pick: [file: File];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const initial = computed(() => props.name.trim().slice(0, 1) || '?');
const hasAvatar = computed(() => typeof props.avatar === 'string' && props.avatar.startsWith('data:image/'));

function openPicker(): void {
  if (!props.clickable || props.disabled) {
    return;
  }

  inputRef.value?.click();
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (file) {
    emit('pick', file);
  }

  if (input) {
    input.value = '';
  }
}
</script>

<template>
  <button
    v-if="props.clickable"
    class="social-avatar social-avatar--button"
    :class="[`social-avatar--${props.size}`, `social-avatar--${props.shape}`, { 'social-avatar--empty': !hasAvatar }]"
    type="button"
    :disabled="props.disabled"
    :aria-label="`更换 ${props.name} 的头像`"
    @click.stop="openPicker"
  >
    <img v-if="hasAvatar" :src="props.avatar!" :alt="`${props.name} 的头像`">
    <span v-else>{{ initial }}</span>
    <input ref="inputRef" class="social-avatar__input" type="file" accept="image/*" @change="handleFileChange">
  </button>

  <div
    v-else
    class="social-avatar"
    :class="[`social-avatar--${props.size}`, `social-avatar--${props.shape}`, { 'social-avatar--empty': !hasAvatar }]"
    :aria-label="`${props.name} 的头像`"
  >
    <img v-if="hasAvatar" :src="props.avatar!" :alt="`${props.name} 的头像`">
    <span v-else>{{ initial }}</span>
  </div>
</template>

<style scoped lang="scss">
.social-avatar {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid rgba(0, 229, 255, 0.24);
  background: linear-gradient(145deg, rgba(255, 153, 184, 0.92), rgba(255, 242, 246, 0.98));
  color: #20232d;
  font-weight: 900;
  line-height: 1;
  flex: 0 0 auto;
}

.social-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.social-avatar span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.social-avatar--button {
  padding: 0;
  cursor: pointer;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
}

.social-avatar--button:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: rgba(0, 229, 255, 0.44);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.18);
}

.social-avatar--button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.social-avatar--empty {
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.34);
}

.social-avatar--sm {
  width: 28px;
  height: 28px;
  font-size: 13px;
}

.social-avatar--md {
  width: 42px;
  height: 42px;
  font-size: 18px;
}

.social-avatar--lg {
  width: 56px;
  height: 56px;
  font-size: 22px;
}

.social-avatar--circle {
  border-radius: 50%;
}

.social-avatar--rounded {
  border-radius: 12px;
}

.social-avatar__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
