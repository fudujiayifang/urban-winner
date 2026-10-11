<script setup lang="ts">
import CollapsibleSection from './CollapsibleSection.vue';
import {
  formatDisplayDateWithWeekday,
  formatGameDateParts,
  getWeekdayIndex,
  parseGameDateParts,
} from '../services/game-date';
import { useGameStore } from '../store/game';

const gameStore = useGameStore();
const checkin = computed(() => gameStore.data.零七系统.签到);
const milestones = [7, 15, 30] as const;
const weekdayLabels = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

const currentDate = computed(() => parseGameDateParts(gameStore.data.零七系统.日期));
const monthTitle = computed(() => `${currentDate.value.year} 年 ${String(currentDate.value.month).padStart(2, '0')} 月`);
const currentDateTimeLabel = computed(() => `${formatDisplayDateWithWeekday(gameStore.data.零七系统.日期)} ${gameStore.data.零七系统.时间}`);
const rewardRecordsByDate = computed(() => new Map(checkin.value.奖励记录.map(record => [record.日期, record])));
const calendarCells = computed(() => {
  const { year, month, day: currentDay } = currentDate.value;
  const daysInMonth = new Date(year, month, 0).getDate();
  const leadingEmptyCells = getWeekdayIndex(formatGameDateParts(year, month, 1));
  const totalCells = Math.ceil((leadingEmptyCells + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, index) => {
    const dayNumber = index - leadingEmptyCells + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return { key: `empty-${index}`, empty: true as const };
    }

    const dateKey = formatGameDateParts(year, month, dayNumber);
    const rewardRecord = rewardRecordsByDate.value.get(dateKey);
    const isToday = dayNumber === currentDay;
    const isSigned = Boolean(rewardRecord);
    const isFuture = dayNumber > currentDay;
    const milestoneDay = rewardRecord ? milestones.includes(rewardRecord.日序号 as (typeof milestones)[number]) : false;

    return {
      key: dateKey,
      empty: false as const,
      day: dayNumber,
      dateKey,
      rewardRecord,
      isToday,
      isSigned,
      isFuture,
      isMilestone: milestoneDay,
    };
  });
});

const latestRewardRecords = computed(() => [...checkin.value.奖励记录].reverse().slice(0, 8));

function summarizeItems(record: { 获得物品: Array<{ 名称: string; 数量: number }> }): string {
  return record.获得物品.map(item => `${item.名称} x${item.数量}`).join('、');
}

function handleCheckin(): void {
  gameStore.applyCheckin();
}
</script>

<template>
  <div class="workspace-stack">
    <CollapsibleSection title="签到状态" subtitle="每日登录与里程碑奖励">
      <div class="summary-grid">
        <div class="summary-card"><span>今日状态</span><strong>{{ checkin.今日已签到 ? '已签到' : '未签到' }}</strong></div>
        <div class="summary-card"><span>连续天数</span><strong>{{ checkin.连续天数 }}</strong></div>
        <div class="summary-card"><span>当前系统积分</span><strong>{{ gameStore.data.零七系统.积分 }}</strong></div>
      </div>
      <button class="checkin-button" type="button" :disabled="checkin.今日已签到" @click="handleCheckin">
        {{ checkin.今日已签到 ? '今日已领取' : '立即签到' }}
      </button>
    </CollapsibleSection>

    <CollapsibleSection title="签到月历" :subtitle="`${monthTitle} · 固定补给 + 日常随机物品`">
      <div class="calendar-legend">
        <span class="legend-chip legend-chip--signed">已签到</span>
        <span class="legend-chip legend-chip--today">今日</span>
        <span class="legend-chip legend-chip--milestone">里程碑</span>
        <span class="legend-chip">未签到</span>
      </div>

      <div class="calendar-month-title">
        <strong>{{ monthTitle }}</strong>
        <span>{{ currentDateTimeLabel }}</span>
      </div>

      <div class="calendar-scroll-area">
        <div class="calendar-weekdays">
          <span v-for="weekday in weekdayLabels" :key="weekday">{{ weekday }}</span>
        </div>

        <div class="calendar-grid">
          <article
            v-for="cell in calendarCells"
            :key="cell.key"
            class="calendar-cell"
            :class="{
              'calendar-cell--empty': cell.empty,
              'calendar-cell--signed': !cell.empty && cell.isSigned,
              'calendar-cell--today': !cell.empty && cell.isToday,
              'calendar-cell--future': !cell.empty && cell.isFuture,
              'calendar-cell--milestone': !cell.empty && cell.isMilestone,
            }"
          >
            <template v-if="!cell.empty">
              <div class="calendar-cell__top">
                <span class="calendar-cell__day">{{ cell.day }}</span>
                <span v-if="cell.isMilestone" class="calendar-cell__badge">★</span>
              </div>
              <strong>{{ cell.isSigned ? '已签到' : cell.isToday ? '今日' : cell.isFuture ? '未到达' : '未签到' }}</strong>
              <div v-if="cell.rewardRecord" class="calendar-reward">
                <span>+{{ cell.rewardRecord.获得积分 }} 系统积分</span>
                <small v-for="item in cell.rewardRecord.获得物品" :key="`${cell.dateKey}-${item.名称}`">
                  {{ item.名称 }} x{{ item.数量 }}
                </small>
              </div>
              <p v-else-if="cell.isToday && !checkin.今日已签到">点击上方按钮领取今日奖励。</p>
            </template>
          </article>
        </div>
      </div>
    </CollapsibleSection>

    <CollapsibleSection title="签到奖品记录" subtitle="最近获得的积分、固定物品和随机物品">
      <div v-if="latestRewardRecords.length" class="reward-record-list">
        <article v-for="record in latestRewardRecords" :key="`${record.日期}-${record.日序号}`" class="reward-record-card">
          <div>
            <strong>{{ record.日期 }}</strong>
            <span>第 {{ record.日序号 }} 次签到 · +{{ record.获得积分 }} 系统积分</span>
          </div>
          <p>{{ summarizeItems(record) }}</p>
        </article>
      </div>
      <p v-else class="empty-copy">暂时还没有签到奖品记录。</p>
    </CollapsibleSection>

    <CollapsibleSection title="连续奖励" subtitle="达到节点即可领取额外奖励（第一版为展示）">
      <div class="milestone-grid">
        <article v-for="milestone in milestones" :key="milestone" class="milestone-card" :class="{ 'milestone-card--active': checkin.连续天数 >= milestone }">
          <h4>第 {{ milestone }} 天</h4>
          <p>{{ checkin.连续天数 >= milestone ? '当前节点已达成。' : '解锁阶段奖励与额外积分。' }}</p>
        </article>
      </div>
    </CollapsibleSection>
  </div>
</template>

<style scoped lang="scss">
.workspace-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.summary-grid,
.milestone-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.summary-card,
.milestone-card,
.reward-record-card {
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  padding: 14px;
}

.summary-card span,
.empty-copy {
  color: #8b95b4;
  font-size: 12px;
}

.summary-card strong,
.milestone-card h4 {
  display: block;
  margin-top: 8px;
  color: #eef2ff;
}

.checkin-button {
  margin-top: 14px;
  border: 1px solid rgba(0, 229, 255, 0.24);
  border-radius: 8px;
  background: rgba(0, 229, 255, 0.08);
  color: #76f4ff;
  cursor: pointer;
  padding: 10px 14px;
}

.checkin-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.calendar-legend {
  margin-bottom: 12px;
}

.calendar-month-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: #dbe3ff;
}

.calendar-month-title strong {
  color: #eef2ff;
  font-size: 18px;
}

.calendar-month-title span {
  color: #8b95b4;
  font-size: 12px;
}

.legend-chip,
.calendar-weekdays span {
  border-radius: 999px;
  padding: 6px 8px;
  text-align: center;
  font-size: 12px;
}

.legend-chip {
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #dbe3ff;
  background: rgba(255, 255, 255, 0.04);
}

.legend-chip--signed {
  border-color: rgba(34, 197, 94, 0.22);
  background: rgba(34, 197, 94, 0.12);
}

.legend-chip--today {
  border-color: rgba(0, 229, 255, 0.24);
  background: rgba(0, 229, 255, 0.12);
}

.legend-chip--milestone {
  border-color: rgba(168, 85, 247, 0.24);
  background: rgba(168, 85, 247, 0.12);
}

.calendar-weekdays {
  margin-bottom: 10px;
}

.calendar-scroll-area {
  width: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 4px;
}

.calendar-weekdays,
.calendar-grid {
  min-width: 700px;
}

.calendar-weekdays span {
  color: #8b95b4;
  background: rgba(255, 255, 255, 0.02);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.calendar-cell {
  min-height: 124px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.calendar-cell strong {
  color: #eef2ff;
  font-size: 14px;
}

.calendar-cell p,
.milestone-card p,
.reward-record-card p {
  margin: 0;
  color: #aeb7d1;
  line-height: 1.5;
  font-size: 12px;
}

.calendar-cell__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.calendar-cell__day {
  color: #dbe3ff;
  font-size: 16px;
  font-weight: 700;
}

.calendar-cell__badge {
  color: #d8b4fe;
  font-size: 14px;
}

.calendar-reward {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.calendar-reward span {
  color: #76f4ff;
  font-size: 12px;
}

.calendar-reward small {
  color: #dbe3ff;
  font-size: 11px;
}

.calendar-cell--empty {
  opacity: 0.25;
  background: rgba(255, 255, 255, 0.015);
}

.calendar-cell--signed {
  border-color: rgba(34, 197, 94, 0.24);
  background: rgba(34, 197, 94, 0.1);
}

.calendar-cell--today {
  border-color: rgba(0, 229, 255, 0.3);
  background: rgba(0, 229, 255, 0.1);
  box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.1) inset;
}

.calendar-cell--future {
  opacity: 0.72;
}

.calendar-cell--milestone {
  box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.14) inset;
}

.reward-record-list {
  display: grid;
  gap: 10px;
}

.reward-record-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.reward-record-card strong,
.reward-record-card span {
  display: block;
}

.reward-record-card strong {
  color: #eef2ff;
}

.reward-record-card span {
  margin-top: 4px;
  color: #8b95b4;
  font-size: 12px;
}

.reward-record-card p {
  max-width: 360px;
  text-align: right;
}

.milestone-card--active {
  border-color: rgba(168, 85, 247, 0.24);
  background: rgba(168, 85, 247, 0.08);
}

@media (max-width: 640px) {
  .calendar-month-title,
  .reward-record-card {
    flex-direction: column;
  }

  .reward-record-card p {
    text-align: left;
  }
}
</style>
