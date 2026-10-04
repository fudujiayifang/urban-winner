<script setup lang="ts">
import { computed } from 'vue';
import type { NpcProfileState } from '../schema';
import SocialAvatar from './SocialAvatar.vue';
import { useGameStore } from '../store/game';

type NpcProfileDetail = Partial<NpcProfileState> & {
  name: string;
};

const props = defineProps<{
  profile: NpcProfileDetail;
}>();

const gameStore = useGameStore();
const favorPercent = computed(() => Math.min(Math.max(Math.round((props.profile.好感度 ?? 0) / 3000 * 100), 0), 100));
const avatar = computed(() => gameStore.getSocialAvatar(props.profile.name));

const stageLabel = computed(() => props.profile.认知阶段 || '待识别');
const sourceLabel = computed(() => props.profile.最近来源 || '待补充');
const relationLabel = computed(() => props.profile.关系 || '普通');
const moodLabel = computed(() => props.profile.心情 || '未知');
const locationLabel = computed(() => props.profile.当前位置 || '未知');
const statusLabel = computed(() => props.profile.当前状态 || '可互动');
const thoughtLabel = computed(() => props.profile.心里想法 || '暂时还没有更明确的档案线索。');
const firstSeenLabel = computed(() => props.profile.首次发现时间 || '未记录');
const updatedAtLabel = computed(() => props.profile.最后更新时间 || '未更新');
const identityLabel = computed(() => props.profile.身份 || '未知');
const ageLabel = computed(() => props.profile.年龄 || '未知');
const raceLabel = computed(() => props.profile.种族 || '未知');
const personalityLabel = computed(() => props.profile.性格 || '未知');
const appearanceLabel = computed(() => props.profile.外貌 || '暂无');
const outfitLabel = computed(() => props.profile.衣着 || '暂无');
const noteLabel = computed(() => props.profile.备注 || '暂无');
</script>

<template>
  <article class="social-detail-card">
    <header class="profile-hero">
      <SocialAvatar
        :name="props.profile.name"
        :avatar="avatar"
        size="md"
        shape="rounded"
      />
      <div class="profile-title">
        <p>NPC档案</p>
        <h3>{{ props.profile.name }}</h3>
        <span>最近来源：{{ sourceLabel }}</span>
      </div>
      <strong class="level-badge">{{ stageLabel }}</strong>
    </header>

    <section class="meter-panel">
      <div class="meter-row">
        <span>好感 {{ props.profile.好感度 ?? 0 }}</span>
        <strong>{{ favorPercent }}%</strong>
      </div>
      <div class="meter"><span :style="{ width: `${favorPercent}%` }"></span></div>
      <div class="meter-row mood-row">
        <span>{{ moodLabel }} · {{ locationLabel }}</span>
        <strong>{{ statusLabel }}</strong>
      </div>
    </section>

    <div class="dossier-grid">
      <section class="dossier-card">
        <h4>头部信息</h4>
        <dl>
          <div><dt>认知阶段</dt><dd>{{ stageLabel }}</dd></div>
          <div><dt>最近来源</dt><dd>{{ sourceLabel }}</dd></div>
          <div><dt>首次发现</dt><dd>{{ firstSeenLabel }}</dd></div>
          <div><dt>最后更新</dt><dd>{{ updatedAtLabel }}</dd></div>
        </dl>
      </section>

      <section class="dossier-card">
        <h4>基础资料</h4>
        <dl>
          <div><dt>身份</dt><dd>{{ identityLabel }}</dd></div>
          <div><dt>年龄</dt><dd>{{ ageLabel }}</dd></div>
          <div><dt>种族</dt><dd>{{ raceLabel }}</dd></div>
          <div><dt>性格</dt><dd>{{ personalityLabel }}</dd></div>
          <div><dt>关系</dt><dd>{{ relationLabel }}</dd></div>
        </dl>
      </section>

      <section class="dossier-card">
        <h4>当前状态</h4>
        <dl>
          <div><dt>心情</dt><dd>{{ moodLabel }}</dd></div>
          <div><dt>位置</dt><dd>{{ locationLabel }}</dd></div>
          <div><dt>当前状态</dt><dd>{{ statusLabel }}</dd></div>
          <div><dt>好感度</dt><dd>{{ props.profile.好感度 ?? 0 }}</dd></div>
        </dl>
      </section>

      <section class="dossier-card dossier-card--wide">
        <h4>长期记录</h4>
        <dl>
          <div><dt>外貌</dt><dd>{{ appearanceLabel }}</dd></div>
          <div><dt>衣着</dt><dd>{{ outfitLabel }}</dd></div>
          <div><dt>备注</dt><dd>{{ noteLabel }}</dd></div>
        </dl>
        <blockquote>“{{ thoughtLabel }}”</blockquote>
      </section>
    </div>
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
.dossier-card {
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

.profile-title p,
.profile-title h3,
.profile-title span,
h4,
dl,
blockquote {
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

.mood-row {
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

dl div {
  display: grid;
  gap: 2px;
}

dt {
  color: #8b95b4;
  font-size: 11px;
}

dd {
  margin: 0;
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

@media (max-width: 640px) {
  .dossier-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
