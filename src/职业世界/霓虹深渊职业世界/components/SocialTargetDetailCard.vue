<script setup lang="ts">
import type { GameState } from '../schema';

type SocialTargetDetail = GameState['攻略目标'][string] & {
  name: string;
  roast?: string;
};

const props = defineProps<{
  target: SocialTargetDetail;
}>();

const favorPercent = computed(() => Math.min(Math.max(Math.round(props.target.好感度 / 3000 * 100), 0), 100));
const excitementPercent = computed(() => Math.min(Math.max(props.target.兴奋值, 0), 100));
</script>

<template>
  <article class="social-detail-card">
    <header class="profile-hero">
      <div class="avatar-mark">{{ props.target.name.slice(0, 1) }}</div>
      <div class="profile-title">
        <p>攻略档案</p>
        <h3>{{ props.target.name }}</h3>
        <span>{{ props.target.基础信息.身份 }}</span>
      </div>
      <strong class="level-badge">{{ props.target.好感度等级 }}</strong>
    </header>

    <section class="meter-panel">
      <div class="meter-row">
        <span>好感 {{ props.target.好感度 }}</span>
        <strong>{{ favorPercent }}%</strong>
      </div>
      <div class="meter"><span :style="{ width: `${favorPercent}%` }"></span></div>
      <div class="meter-row excitement">
        <span>兴奋 {{ props.target.兴奋值 }}%</span>
        <strong>{{ props.target.阴茎状态 }}</strong>
      </div>
      <div class="meter meter--hot"><span :style="{ width: `${excitementPercent}%` }"></span></div>
    </section>

    <div class="dossier-grid">
      <section class="dossier-card">
        <h4>基础信息</h4>
        <dl>
          <div><dt>年龄</dt><dd>{{ props.target.基础信息.年龄 }}</dd></div>
          <div><dt>种族</dt><dd>{{ props.target.基础信息.种族 }}</dd></div>
          <div><dt>身份</dt><dd>{{ props.target.基础信息.身份 }}</dd></div>
        </dl>
      </section>

      <section class="dossier-card">
        <h4>职业档案</h4>
        <dl>
          <div><dt>职业</dt><dd>{{ props.target.职业信息.职业名称 }}</dd></div>
          <div><dt>派系</dt><dd>{{ props.target.职业信息.派系 }}</dd></div>
          <div><dt>天赋</dt><dd>{{ props.target.职业信息.天赋 }}</dd></div>
          <div><dt>境界</dt><dd>{{ props.target.职业信息.境界 }}</dd></div>
        </dl>
      </section>

      <section class="dossier-card dossier-card--wide">
        <h4>实时状态</h4>
        <dl>
          <div><dt>位置</dt><dd>{{ props.target.当前位置 }}</dd></div>
          <div><dt>心情</dt><dd>{{ props.target.心情 }}</dd></div>
        </dl>
        <blockquote>“{{ props.target.心里想法 }}”</blockquote>
      </section>

      <section class="dossier-card dossier-card--wide">
        <h4>衣物状态</h4>
        <div class="clothes-grid">
          <div><span>上装</span><strong>{{ props.target.衣物状态.衣服 }}</strong></div>
          <div><span>下装</span><strong>{{ props.target.衣物状态.裤子 }}</strong></div>
          <div><span>内裤</span><strong>{{ props.target.衣物状态.内裤 }}</strong></div>
          <div><span>鞋履</span><strong>{{ props.target.衣物状态.鞋子 }}</strong></div>
          <div><span>配饰</span><strong>{{ props.target.衣物状态.配饰1 }}</strong></div>
        </div>
      </section>
    </div>

    <p v-if="props.target.roast" class="system-roast">{{ props.target.roast }}</p>
  </article>
</template>

<style scoped lang="scss">
.social-detail-card {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.profile-hero,
.meter-panel,
.dossier-card,
.system-roast {
  border: 1px solid rgba(118, 244, 255, 0.12);
  border-radius: 12px;
  background: rgba(8, 12, 28, 0.74);
}

.profile-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px;
  background:
    radial-gradient(circle at 0% 0%, rgba(0, 229, 255, 0.18), transparent 34%),
    radial-gradient(circle at 90% 0%, rgba(168, 85, 247, 0.18), transparent 36%),
    rgba(8, 12, 28, 0.82);
}

.avatar-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgba(0, 229, 255, 0.28);
  border-radius: 12px;
  background: rgba(0, 229, 255, 0.1);
  color: #76f4ff;
  font-size: 20px;
  font-weight: 800;
}

.profile-title p,
.profile-title h3,
.profile-title span,
h4,
dl,
blockquote,
.system-roast {
  margin: 0;
}

.profile-title p {
  color: #8b95b4;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.profile-title h3 {
  margin-top: 2px;
  color: #eef2ff;
  font-size: 18px;
}

.profile-title span {
  display: block;
  margin-top: 3px;
  color: #aeb7d1;
  font-size: 12px;
}

.level-badge {
  border-radius: 999px;
  background: rgba(168, 85, 247, 0.16);
  color: #d8a0ff;
  padding: 5px 9px;
  font-size: 11px;
}

.meter-panel {
  padding: 10px 11px;
}

.meter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: #8b95b4;
  font-size: 11px;
}

.meter-row strong {
  color: #eef2ff;
}

.meter-row.excitement {
  margin-top: 8px;
}

.meter {
  height: 6px;
  margin-top: 5px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}

.meter span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #00e5ff, #a855f7);
}

.meter--hot span {
  background: linear-gradient(90deg, #ff8c9d, #ffb74d);
}

.dossier-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dossier-card {
  padding: 10px 11px;
}

.dossier-card--wide {
  grid-column: 1 / -1;
}

h4 {
  margin-bottom: 7px;
  color: #76f4ff;
  font-size: 12px;
  letter-spacing: 0.04em;
}

dl {
  display: grid;
  gap: 6px;
}

dl div,
.clothes-grid div {
  display: grid;
  gap: 2px;
}

dt,
.clothes-grid span {
  color: #8b95b4;
  font-size: 11px;
}

dd,
.clothes-grid strong {
  color: #eef2ff;
  font-size: 13px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

blockquote {
  margin-top: 8px;
  border-left: 2px solid rgba(0, 229, 255, 0.34);
  padding-left: 10px;
  color: #dbe3ff;
  font-size: 12px;
  line-height: 1.55;
}

.clothes-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.system-roast {
  padding: 9px 11px;
  color: #d8a0ff;
  font-size: 12px;
  line-height: 1.55;
  background: rgba(168, 85, 247, 0.08);
}

@media (max-width: 640px) {
  .profile-hero,
  .dossier-grid,
  .clothes-grid {
    grid-template-columns: 1fr;
  }

  .level-badge {
    justify-self: start;
  }

  .profile-title h3,
  .profile-title span,
  .meter-row,
  dd,
  blockquote,
  .system-roast {
    overflow-wrap: anywhere;
  }
}
</style>
