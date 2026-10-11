<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import { formatDisplayDateWithWeekday, getWeekdayLabel } from '../services/game-date';
import { useGameStore } from '../store/game';
import type { CourseScheduleEntry } from '../schema';

const gameStore = useGameStore();
const schedule = computed(() => gameStore.data.零七系统.课程表);
const currentDate = computed(() => gameStore.data.零七系统.日期);
const currentTime = computed(() => gameStore.data.零七系统.时间);
const entries = computed(() => [...schedule.value.记录].sort((left, right) => {
  const leftKey = `${left.日期} ${left.时间 || '99:99'}`;
  const rightKey = `${right.日期} ${right.时间 || '99:99'}`;
  return leftKey.localeCompare(rightKey) || left.课程.localeCompare(right.课程, 'zh-Hans-CN');
}));
const pendingEntries = computed(() => entries.value.filter(entry => entry.状态 === '待确认'));
const upcomingEntries = computed(() => entries.value.filter(entry => entry.状态 !== '已完成' && entry.状态 !== '已取消').slice(0, 12));

function formatEntryTime(entry: CourseScheduleEntry): string {
  return [entry.节次, entry.时间].filter(Boolean).join(' · ') || '时间待确认';
}

function formatEntryDate(entry: CourseScheduleEntry): string {
  return entry.日期 ? formatDisplayDateWithWeekday(entry.日期) : '日期待确认';
}

function formatLocation(entry: CourseScheduleEntry): string {
  return entry.地点 || '地点待确认';
}

function setRecurring(entry: CourseScheduleEntry): void {
  gameStore.setCourseRecurring(entry.id);
}

function markConfirmed(entry: CourseScheduleEntry): void {
  gameStore.updateCourseScheduleEntry(entry.id, { 状态: '已安排' });
}

function statusLabel(entry: CourseScheduleEntry): string {
  if (entry.状态 === '待确认') return '待确认';
  if (entry.类型 === '周期') return `每${getWeekdayLabel(entry.日期)}`;
  return entry.状态;
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="今日课程" :subtitle="`${formatDisplayDateWithWeekday(currentDate)} · 当前 ${currentTime}`">
      <div class="summary-grid">
        <div class="summary-card"><span>全部记录</span><strong>{{ entries.length }}</strong></div>
        <div class="summary-card"><span>待确认</span><strong>{{ pendingEntries.length }}</strong></div>
        <div class="summary-card"><span>周期课程</span><strong>{{ entries.filter(entry => entry.类型 === '周期').length }}</strong></div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="最近安排" subtitle="正文提到的课程只记录本次，不会自动生成下一节">
      <div v-if="upcomingEntries.length" class="course-list">
        <article v-for="entry in upcomingEntries" :key="entry.id" class="course-card" :class="{ 'course-card--pending': entry.状态 === '待确认' }">
          <div class="course-card__header">
            <div>
              <h4>{{ entry.课程 }}</h4>
              <p class="meta-line">{{ formatEntryDate(entry) }} · {{ formatEntryTime(entry) }}</p>
            </div>
            <span class="state-pill">{{ statusLabel(entry) }}</span>
          </div>
          <p class="course-location">地点：{{ formatLocation(entry) }}</p>
          <p v-if="entry.类型 === '周期' && entry.下次日期" class="next-line">下一次：{{ formatDisplayDateWithWeekday(entry.下次日期) }}</p>
          <p v-if="entry.原文摘要" class="source-line">来源：{{ entry.原文摘要 }}</p>
          <div class="course-actions">
            <button v-if="entry.状态 === '待确认'" class="course-action" type="button" @click="markConfirmed(entry)">确认本次</button>
            <button v-if="entry.类型 === '单次'" class="course-action course-action--secondary" type="button" @click="setRecurring(entry)">设为周期课程</button>
          </div>
        </article>
      </div>
      <p v-else class="empty-copy">正文还没有捕捉到课程安排。</p>
    </CollapsibleSection>
  </div>
</template>

<style scoped lang="scss">
.workspace-stack,
.course-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.summary-card,
.course-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
}

.summary-card {
  padding: 12px;
}

.summary-card span,
.meta-line,
.source-line,
.next-line,
.empty-copy {
  color: #8b95b4;
  font-size: 12px;
}

.summary-card strong,
h4,
.state-pill {
  color: #eef2ff;
}

.summary-card strong {
  display: block;
  margin-top: 6px;
}

.course-card {
  padding: 14px;
}

.course-card--pending {
  border-color: rgba(255, 190, 92, 0.3);
}

.course-card__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

h4 {
  margin: 0;
  font-size: 15px;
}

.meta-line,
.course-location,
.source-line,
.next-line {
  margin: 6px 0 0;
  line-height: 1.5;
}

.course-location {
  color: #c9d1e8;
}

.state-pill {
  flex: 0 0 auto;
  border: 1px solid rgba(0, 229, 255, 0.2);
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 11px;
}

.course-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.course-action {
  border: 1px solid rgba(255, 190, 92, 0.28);
  border-radius: 6px;
  background: rgba(255, 190, 92, 0.08);
  color: #ffd28c;
  cursor: pointer;
  padding: 7px 10px;
}

.course-action--secondary {
  border-color: rgba(0, 229, 255, 0.24);
  background: rgba(0, 229, 255, 0.06);
  color: #76f4ff;
}

.course-action:hover {
  filter: brightness(1.12);
}

@media (max-width: 480px) {
  .course-card__header {
    flex-direction: column;
    gap: 8px;
  }
}
</style>
