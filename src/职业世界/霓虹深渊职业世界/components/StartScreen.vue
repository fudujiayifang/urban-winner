<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  hasSave: boolean;
  fullscreen: {
    active: boolean;
    supported: boolean;
  };
}>();

const emit = defineEmits<{
  enter: [mode: 'start' | 'continue'];
  toggleFullscreen: [];
}>();

const leaving = ref(false);

function enterGame(mode: 'start' | 'continue'): void {
  if (leaving.value || (mode === 'continue' && !props.hasSave)) {
    return;
  }

  leaving.value = true;
  window.setTimeout(() => emit('enter', mode), 760);
}
</script>

<template>
  <section class="start-screen" :class="{ 'start-screen--fade-out': leaving }" aria-label="霓虹深渊职业世界开始界面">
    <div class="start-bg-dynamic" aria-hidden="true">
      <div class="grid-overlay"></div>
      <div class="ambient-glow"></div>
    </div>

    <div class="start-content">
      <h1 class="game-title">
        <span class="title-main">霓虹深渊</span>
        <span class="title-sub">职业世界</span>
      </h1>

      <div class="start-divider" aria-hidden="true">
        <div class="line"></div>
        <div class="diamond"></div>
        <div class="line"></div>
      </div>

      <div class="start-menu">
        <button class="start-btn primary" type="button" @click="enterGame('start')">
          <span class="btn-text">开始游戏</span>
          <span class="btn-border"></span>
          <span class="btn-accent"></span>
        </button>

        <button
          class="start-btn"
          :class="hasSave ? 'primary' : 'secondary'"
          type="button"
          :disabled="!hasSave"
          @click="enterGame('continue')"
        >
          <span class="btn-text">继续游戏</span>
          <span class="btn-border"></span>
          <span class="placeholder-tag" :class="{ 'placeholder-tag--found': hasSave }">
            {{ hasSave ? 'FOUND SAVE' : 'NO DATA' }}
          </span>
        </button>
        <button
          class="start-btn start-btn--compact"
          type="button"
          :disabled="!fullscreen.supported"
          @click="emit('toggleFullscreen')"
        >
          <span class="btn-text">{{ fullscreen.active ? '退出全屏' : '全屏模式' }}</span>
          <span class="btn-border"></span>
        </button>
      </div>

      <div class="start-footer">
        <div class="footer-line">NEON ABYSS OS v2.7.8</div>
        <div class="footer-copyright">© 2026 SHENG CHENG TECHNOLOGY. ALL RIGHTS RESERVED.</div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.start-screen {
  position: relative;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  width: 100%;
  min-height: 560px;
  background: #06060e;
  color: #e8e4f0;
  font-family: 'Noto Sans SC', 'Microsoft YaHei', sans-serif;
  transition: opacity 0.72s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.72s;
}

.start-screen--fade-out {
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
}

.start-bg-dynamic,
.grid-overlay,
.ambient-glow {
  position: absolute;
  inset: 0;
}

.start-bg-dynamic {
  z-index: 1;
}

.grid-overlay {
  background-image:
    linear-gradient(#1e1e3a 1px, transparent 1px),
    linear-gradient(90deg, #1e1e3a 1px, transparent 1px);
  background-position: center;
  background-size: 50px 50px;
  opacity: 0.15;
  transform: perspective(500px) rotateX(60deg);
  animation: grid-scroll 20s linear infinite;
}

.ambient-glow {
  background:
    radial-gradient(circle at 20% 30%, rgba(0, 229, 255, 0.08) 0%, transparent 50%),
    radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.08) 0%, transparent 50%);
  filter: blur(60px);
}

.start-content {
  position: relative;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: clamp(18px, 4vw, 28px);
  width: min(88vw, 620px);
  padding: 34px 18px 58px;
}

.game-title {
  margin: 0;
  text-align: center;
  cursor: default;
  font-family: Orbitron, system-ui, sans-serif;
}

.title-main,
.title-sub {
  display: block;
}

.title-main {
  color: #fff;
  font-size: clamp(38px, 8vw, 68px);
  font-weight: 900;
  letter-spacing: 0.18em;
  text-shadow:
    0 0 10px #00e5ff,
    0 0 20px #00e5ff,
    0 0 40px #006e80;
  animation: neon-pulse 2s ease-in-out infinite alternate;
}

.title-sub {
  margin-top: 8px;
  color: #c084fc;
  font-size: clamp(13px, 2.5vw, 19px);
  letter-spacing: 0.52em;
  text-shadow: 0 0 10px #a855f7;
  text-transform: uppercase;
}

.start-divider {
  display: flex;
  align-items: center;
  gap: 20px;
  width: min(100%, 400px);
}

.line {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, #2a2a50, transparent);
}

.diamond {
  width: 6px;
  height: 6px;
  background: #00e5ff;
  box-shadow: 0 0 10px #00e5ff;
  transform: rotate(45deg);
}

.start-menu {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: min(280px, 100%);
}

.start-btn {
  position: relative;
  min-height: 50px;
  padding: 14px 18px;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: #e8e4f0;
  cursor: pointer;
  font-family: Orbitron, system-ui, sans-serif;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.18em;
  transition: opacity 0.3s, transform 0.3s;
}

.start-btn:disabled {
  cursor: not-allowed;
}

.start-btn:not(:disabled):hover {
  transform: translateY(-1px);
}

.start-btn--compact {
  min-height: 44px;
  color: #a09cb8;
  font-size: 13px;
  letter-spacing: 0.14em;
}

.start-btn--compact:not(:disabled):hover {
  color: #00e5ff;
}

.start-btn--compact .btn-border {
  border-color: #5c5878;
}

.start-btn--compact:not(:disabled):hover .btn-border {
  border-color: #00e5ff;
  background: rgba(0, 229, 255, 0.07);
}

.btn-text,
.placeholder-tag,
.btn-accent {
  position: relative;
  z-index: 1;
}

.btn-border {
  position: absolute;
  inset: 0;
  border: 1px solid #2a2a50;
  clip-path: polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%);
  transition: background 0.3s, box-shadow 0.3s, border-color 0.3s;
}

.primary .btn-border {
  border-color: #00e5ff;
  background: rgba(0, 229, 255, 0.03);
}

.primary:not(:disabled):hover .btn-border {
  background: rgba(0, 229, 255, 0.1);
  box-shadow: inset 0 0 20px rgba(0, 229, 255, 0.2);
}

.primary .btn-accent {
  position: absolute;
  top: 0;
  right: 20px;
  width: 40px;
  height: 2px;
  background: #00e5ff;
  box-shadow: 0 0 10px #00e5ff;
}

.secondary {
  opacity: 0.6;
}

.secondary .btn-border {
  border-color: #5c5878;
}

.placeholder-tag {
  position: absolute;
  top: 50%;
  right: 15px;
  padding: 2px 4px;
  border: 1px solid #5c5878;
  color: #5c5878;
  font-size: 8px;
  letter-spacing: 0.08em;
  transform: translateY(-50%);
}

.placeholder-tag--found {
  border-color: #2ed573;
  color: #2ed573;
}

.start-footer {
  position: absolute;
  bottom: 22px;
  text-align: center;
  font-family: 'JetBrains Mono', monospace;
  color: #5c5878;
}

.footer-line {
  margin-bottom: 5px;
  font-size: 11px;
  letter-spacing: 0.1em;
}

.footer-copyright {
  font-size: 9px;
  opacity: 0.5;
}

@keyframes grid-scroll {
  from {
    background-position: 0 0;
  }

  to {
    background-position: 0 500px;
  }
}

@keyframes neon-pulse {
  from {
    opacity: 0.9;
    text-shadow: 0 0 10px #00e5ff, 0 0 20px #00e5ff, 0 0 40px #006e80;
  }

  to {
    opacity: 1;
    text-shadow: 0 0 15px #00e5ff, 0 0 30px #00e5ff, 0 0 60px #00f0ff, 0 0 10px #fff;
  }
}

@media (max-width: 720px) {
  .start-screen {
    min-height: 500px;
  }

  .start-content {
    width: 100%;
    padding: 32px 16px 72px;
  }

  .title-main {
    letter-spacing: 0.12em;
  }

  .title-sub {
    letter-spacing: 0.36em;
  }

  .start-btn {
    font-size: 15px;
  }
}
</style>
