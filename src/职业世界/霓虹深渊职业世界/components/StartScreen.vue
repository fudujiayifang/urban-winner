<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CustomOpening } from '../adapters/runtime';

const props = defineProps<{
  hasSave: boolean;
  openings: CustomOpening[];
  startError: string | null;
  fullscreen: { active: boolean; supported: boolean };
}>();
const emit = defineEmits<{
  enter: [mode: 'start' | 'continue', opening?: CustomOpening | null, childhoodFriendsEnabled?: boolean];
  manage: [];
  toggleFullscreen: [];
}>();
const leaving = ref(false);
const showPicker = ref(false);
const selectedId = ref('default');
const childhoodFriendsEnabled = ref(true);
const canContinue = computed(() => props.hasSave);
watch(() => props.startError, error => { if (error) leaving.value = false; });

function enterGame(mode: 'start' | 'continue', opening?: CustomOpening | null): void {
  if (leaving.value || (mode === 'continue' && !canContinue.value)) return;
  leaving.value = true;
  window.setTimeout(() => emit('enter', mode, opening, childhoodFriendsEnabled.value), 300);
}

function continueToGame(): void {
  const opening = props.openings.find(item => item.id === selectedId.value) ?? null;
  enterGame('start', opening);
}
</script>

<template>
  <section class="start-screen" :class="{ 'start-screen--fade-out': leaving }" aria-label="霓虹深渊职业世界开始界面">
    <div class="start-bg-dynamic" aria-hidden="true"><div class="grid-overlay"></div><div class="ambient-glow"></div></div>
    <div class="start-content">
      <h1 class="game-title"><span class="title-main">霓虹深渊</span><span class="title-sub">职业世界</span></h1>
      <div class="start-divider" aria-hidden="true"><div class="line"></div><div class="diamond"></div><div class="line"></div></div>
      <p v-if="startError" class="start-error" role="alert">{{ startError }}</p>
      <div class="start-menu">
        <template v-if="showPicker">
          <div class="opening-picker" role="dialog" aria-modal="true" aria-labelledby="opening-picker-title">
            <h2 id="opening-picker-title">选择开场白</h2>
            <label class="opening-choice"><input v-model="selectedId" type="radio" value="default" /><span><strong>默认开场白</strong><small>沿用职业世界原有剧情开局</small></span></label>
            <label v-for="opening in openings" :key="opening.id" class="opening-choice"><input v-model="selectedId" type="radio" :value="opening.id" /><span><strong>{{ opening.name }}</strong><small>{{ opening.content.slice(0, 100) }}{{ opening.content.length > 100 ? '…' : '' }}</small></span></label>
            <label class="opening-choice"><input v-model="childhoodFriendsEnabled" type="checkbox" /><span><strong>发小</strong><small>默认开启。关闭后，七位发小的档案会被封存，零七也不会知道他们存在。</small></span></label>
            <div class="picker-actions"><button class="start-btn start-btn--compact" type="button" @click="showPicker = false">返回</button><button class="start-btn primary" type="button" @click="continueToGame">确定</button></div>
          </div>
        </template>
        <template v-else>
          <button class="start-btn primary" type="button" @click="showPicker = true"><span class="btn-text">开始游戏</span><span class="btn-border"></span><span class="btn-accent"></span></button>
          <button class="start-btn secondary" type="button" :disabled="!canContinue" @click="enterGame('continue')"><span class="btn-text">继续游戏</span><span class="btn-border"></span><span class="placeholder-tag" :class="{ 'placeholder-tag--found': canContinue }">{{ canContinue ? 'FOUND SAVE' : 'NO DATA' }}</span></button>
          <button class="start-btn start-btn--compact" type="button" @click="emit('manage')"><span class="btn-text">自定义开场白</span><span class="btn-border"></span></button>
          <button class="start-btn start-btn--compact" type="button" :disabled="!fullscreen.supported" @click="emit('toggleFullscreen')"><span class="btn-text">{{ fullscreen.active ? '退出全屏' : '全屏模式' }}</span><span class="btn-border"></span></button>
        </template>
      </div>
      <div class="start-footer"><div class="footer-line">NEON ABYSS OS v2.7.8</div><div class="footer-copyright">© 2026 SHENG CHENG TECHNOLOGY. ALL RIGHTS RESERVED.</div></div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.start-screen{position:relative;z-index:2000;display:flex;align-items:center;justify-content:center;overflow:auto;width:100%;min-height:560px;background:#06060e;color:#e8e4f0;font-family:'Noto Sans SC','Microsoft YaHei',sans-serif;transition:opacity .3s,visibility .3s}.start-screen--fade-out{opacity:0;visibility:hidden;pointer-events:none}.start-bg-dynamic,.grid-overlay,.ambient-glow{position:absolute;inset:0}.start-bg-dynamic{z-index:1}.grid-overlay{background-image:linear-gradient(#1e1e3a 1px,transparent 1px),linear-gradient(90deg,#1e1e3a 1px,transparent 1px);background-position:center;background-size:50px 50px;opacity:.15;transform:perspective(500px) rotateX(60deg);animation:grid-scroll 20s linear infinite}.ambient-glow{background:radial-gradient(circle at 20% 30%,rgba(0,229,255,.08),transparent 50%),radial-gradient(circle at 80% 70%,rgba(168,85,247,.08),transparent 50%);filter:blur(60px)}.start-content{position:relative;z-index:10;display:flex;flex-direction:column;align-items:center;gap:24px;width:min(88vw,620px);padding:34px 18px 82px}.game-title{margin:0;text-align:center;font-family:Orbitron,system-ui,sans-serif}.title-main,.title-sub{display:block}.title-main{color:#fff;font-size:56px;font-weight:900;text-shadow:0 0 10px #00e5ff,0 0 24px #006e80}.title-sub{margin-top:8px;color:#c084fc;font-size:16px;letter-spacing:.4em;text-shadow:0 0 10px #a855f7}.start-divider{display:flex;align-items:center;gap:20px;width:min(100%,400px)}.line{flex:1;height:1px;background:linear-gradient(90deg,transparent,#2a2a50,transparent)}.diamond{width:6px;height:6px;background:#00e5ff;transform:rotate(45deg)}.start-menu{display:flex;flex-direction:column;gap:12px;width:min(360px,100%)}.start-error{color:#ff7185;text-align:center;overflow-wrap:anywhere}.start-btn{position:relative;min-height:50px;padding:14px 18px;overflow:hidden;border:0;background:transparent;color:#e8e4f0;cursor:pointer;font-family:Orbitron,system-ui,sans-serif;font-size:15px;font-weight:700}.start-btn:disabled{opacity:.5;cursor:not-allowed}.start-btn--compact{min-height:44px;color:#a09cb8;font-size:13px}.btn-text,.placeholder-tag,.btn-accent{position:relative;z-index:1}.btn-border{position:absolute;inset:0;border:1px solid #2a2a50;clip-path:polygon(10% 0,100% 0,100% 70%,90% 100%,0 100%,0 30%)}.primary .btn-border{border-color:#00e5ff;background:rgba(0,229,255,.04)}.btn-accent{position:absolute;top:0;right:20px;width:40px;height:2px;background:#00e5ff}.secondary{opacity:.7}.placeholder-tag{position:absolute;top:50%;right:15px;color:#5c5878;font-size:8px;transform:translateY(-50%)}.opening-picker{display:grid;gap:10px;padding:16px;border:1px solid #31505d;background:rgba(7,12,24,.96);text-align:left}.opening-picker h2{margin:0 0 4px;font-size:18px}.opening-choice{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid #252e43;background:#0b1020;cursor:pointer}.opening-choice input{margin-top:4px;accent-color:#00d9be}.opening-choice span{display:grid;gap:5px;min-width:0}.opening-choice small{color:#9aabc0;line-height:1.5;overflow-wrap:anywhere}.picker-actions{display:flex;justify-content:space-between;gap:12px}.start-footer{position:absolute;bottom:18px;color:#667080;text-align:center;font-family:monospace}.footer-line{margin-bottom:5px;font-size:11px}.footer-copyright{font-size:9px;opacity:.65}@keyframes grid-scroll{to{background-position:0 500px}}@media(max-width:720px){.start-screen{min-height:500px}.start-content{width:100%;padding:32px 16px 90px}.title-main{font-size:40px}.opening-choice{min-height:54px}}
</style>
