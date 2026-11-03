// 업무 규칙 (PRD §7). 화면과 무관한 순수 함수만 둔다.
import { addDays, addMonths, diffDays, mondayOf, pad } from './dates.js';

export const TYPE_LABEL = { cycle: '주기', order: '지시사항', adhoc: '수시' };
export const CYCLE_LABEL = { annual: '연간', quarterly: '분기', monthly: '월간', weekly: '주간' };
export const STATUS_LABEL = { todo: '미착수', doing: '진행중', done: '완료' };
export const DISPLAY_LABEL = { done: '완료', doing: '진행중', notstarted: '미착수', planned: '예정' };
export const DISPLAY_ICON = { done: '✓', doing: '▶', notstarted: '!', planned: '○' };
export const METHOD_LABEL = { manual: '직접 체크', log: '실시사항 연결' };

// §7.6 화면 표시 상태. 날짜 자동 판정은 예정/미착수에만 적용한다.
export function displayStatus(t, T) {
  if (t.status === 'done') return 'done';
  if (t.status === 'doing') return 'doing';
  return t.startDate && t.startDate <= T ? 'notstarted' : 'planned';
}

// §7.4 마감일 < 기준일 이고 완료가 아니면 완료 미확인 (마감 당일은 제외)
export const isOverdue = (t, T) => t.status !== 'done' && !!t.dueDate && t.dueDate < T;
export const isUndated = (t) => t.type !== 'order' && !t.startDate && !t.dueDate;
export const orderElapsed = (t, T) => (t.orderDate ? diffDays(T, t.orderDate) : null);

export function ddayLabel(due, T) {
  if (!due) return '';
  const n = diffDays(due, T);
  return n > 0 ? `D-${n}` : n === 0 ? 'D-day' : `D+${-n}`;
}

// §7.1 주기 업무 알림 시점
export function alertDate(t) {
  if (t.type !== 'cycle' || !t.dueDate) return null;
  const [y, m] = t.dueDate.split('-').map(Number);
  switch (t.cycle) {
    case 'annual': return `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`;
    case 'quarterly': return addMonths(t.dueDate, -1);
    case 'monthly': return addDays(t.dueDate, -14);
    case 'weekly': return mondayOf(t.dueDate);
    default: return null;
  }
}

// §7.3 다음 회차 날짜
const SHIFT = {
  weekly: (d) => addDays(d, 7),
  monthly: (d) => addMonths(d, 1),
  quarterly: (d) => addMonths(d, 3),
  annual: (d) => addMonths(d, 12),
};
export function nextDates(t) {
  const shift = SHIFT[t.cycle];
  if (!shift) return { dueDate: null, startDate: null };
  const dueDate = t.dueDate ? shift(t.dueDate) : null;
  let startDate = null;
  if (t.startDate && t.dueDate) startDate = addDays(dueDate, -diffDays(t.dueDate, t.startDate));
  else if (t.startDate) startDate = shift(t.startDate);
  return { dueDate, startDate };
}

export function weekRange(T) {
  const ws = mondayOf(T);
  return { ws, we: addDays(ws, 6), nws: addDays(ws, 7), nwe: addDays(ws, 13) };
}
const inRange = (d, a, b) => !!d && d >= a && d <= b;
export const byDue = (a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title);

// §7.7 대시보드 요약 숫자
export function summary(tasks, T) {
  const { ws, we, nws, nwe } = weekRange(T);
  const week = tasks.filter((t) => inRange(t.dueDate, ws, we));
  const done = week.filter((t) => t.status === 'done');
  const open = week.filter((t) => t.status !== 'done');
  const openOverdue = open.filter((t) => isOverdue(t, T));
  const openNotStarted = open.filter((t) => !isOverdue(t, T) && displayStatus(t, T) === 'notstarted');
  const carry = tasks.filter((t) => isOverdue(t, T));
  const fresh = tasks.filter((t) => t.status !== 'done' && inRange(t.dueDate, nws, nwe));
  const undated = tasks.filter((t) => t.status !== 'done' && !t.dueDate);
  return { week, done, open, openOverdue, openNotStarted, carry, fresh, undated };
}

// §5 기능 2-3 이번 주 확인 사항 묶음 (0번 확인 요청은 화면에서 따로 만든다)
export function panelGroups(tasks, T) {
  const { we } = weekRange(T);
  const open = tasks.filter((t) => t.status !== 'done');
  const used = new Set();
  const take = (list) => { list.forEach((t) => used.add(t.id)); return list; };
  const orders = take(open.filter((t) => t.type === 'order')
    .sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || '')));
  const rest = open.filter((t) => t.type !== 'order');
  const free = () => rest.filter((t) => !used.has(t.id));
  const overdue = take(free().filter((t) => isOverdue(t, T)).sort(byDue));
  const todayDue = take(free().filter((t) => t.dueDate === T).sort(byDue));
  const thisWeek = take(free().filter((t) => t.dueDate && t.dueDate > T && t.dueDate <= we).sort(byDue));
  const alerts = take(free().filter((t) => t.type === 'cycle' && alertDate(t) && alertDate(t) <= T).sort(byDue));
  const undated = take(free().filter(isUndated));
  const others = free().sort(byDue);
  return { overdue, todayDue, thisWeek, alerts, orders, undated, others };
}

// §7.10 부서 현황 요약
export function deptSummary(tasks, T) {
  const { ws, we } = weekRange(T);
  const overdue = tasks.filter((t) => isOverdue(t, T)).sort(byDue);
  const people = new Set(overdue.map((t) => t.assigneeId || '-')).size;
  const orders = tasks.filter((t) => t.type === 'order');
  const openOrders = orders.filter((t) => t.status !== 'done')
    .sort((a, b) => (a.orderDate || '9999').localeCompare(b.orderDate || '9999'));
  const maxElapsed = openOrders.reduce((mx, t) => Math.max(mx, orderElapsed(t, T) ?? 0), 0);
  const week = tasks.filter((t) => inRange(t.dueDate, ws, we));
  const weekDone = week.filter((t) => t.status === 'done').length;
  const rate = week.length ? Math.floor((weekDone / week.length) * 100) : null;
  return { overdue, people, openOrders, doneOrders: orders.length - openOrders.length, maxElapsed, week, weekDone, rate };
}

// ── 실시사항·문서 항목 ↔ 업무 연결 후보 (§7.8). 규칙 기반, 자동으로 합치지 않는다. ──
export const normTitle = (s) => (s || '').replace(/\([^)]*\)/g, ' ').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase();
function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}
export function similarity(taskTitle, text) {
  const a = bigrams(normTitle(taskTitle));
  const b = bigrams(normTitle(text));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  return Math.max((2 * inter) / (a.size + b.size), (inter / a.size) * 0.9);
}

const REPORT_RE = /(보고|제출|결과)/;
const EXEC_RE = /(점검|실시|설치|교육|훈련|정비|확인|측정)/;
// 설치·점검과 결과보고처럼 후속 조치가 따로 있는 업무는 하나로 합치지 않도록 경고한다.
export function followUpWarning(taskTitle, text) {
  const body = (text || '').replace(/\([^)]*\)/g, ' ');
  const taskIsReport = REPORT_RE.test(taskTitle);
  const textIsReport = REPORT_RE.test(body);
  if (taskIsReport && !textIsReport) return '이 업무는 결과 보고·제출이 따로 있는 업무입니다. 실시 기록만으로 완료 처리하지 마세요.';
  if (!taskIsReport && textIsReport && EXEC_RE.test(taskTitle)) return '문서 항목은 결과 보고이고 기존 업무는 실시 업무입니다. 서로 다른 업무일 수 있습니다.';
  return null;
}
export const isProgressText = (s) => /(작성\s*중|진행\s*중|준비\s*중|검토\s*중|추진\s*중|취합\s*중|협의|예정|일부|착수|초안|진행)/.test(s || '');
export const isCompletionText = (s) => /(완료|제출|보고함)/.test(s || '');
// 실시사항 결과: "완료·제출·보고함"이 있고 진행 표현(초안·작성 중·예정 등)이 없을 때만 완료, 그 밖의 조치 기록은 진행.
export const logResult = (s) => (isCompletionText(s) && !isProgressText(s) ? '완료' : '진행');

export function findCandidates({ text, date, assigneeId }, pool, T, limit = 3) {
  const out = [];
  for (const t of pool) {
    const sim = similarity(t.title, text);
    if (sim < 0.35) continue;
    let score = sim;
    if (assigneeId && t.assigneeId === assigneeId) score += 0.1;
    if (date && t.dueDate && Math.abs(diffDays(date, t.dueDate)) <= 3) score += 0.1;
    out.push({ taskId: t.id, score: Math.min(1, score), warn: followUpWarning(t.title, text) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
