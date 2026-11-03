// 첫 화면: 이번 주. 요약 숫자 + 요일별 예정·실시 + 먼저 확인할 것.
// 전체 달력은 [업무 달력] 탭(dashboard.js)에서 본다.
import { state, today, scopeTasks, esc, memberName, findTask, pendingChanges, kindTag } from '../core.js';
import { addDays, fmtK, HOLIDAYS, dow, weekLabel } from '../dates.js';
import { summary, weekRange, byDue } from '../rules.js';
import { IC } from '../icons.js';
import { summaryStrip, renderPanel, taskItem, kindLegend } from './dashboard.js';

const DOW = '일월화수목금토';

export function renderHome() {
  const T = today();
  const tasks = scopeTasks();
  const s = summary(tasks, T);
  const changes = pendingChanges(tasks);
  const { ws, we } = weekRange(T);
  const mine = (x) => state.me === 'all' || x.assigneeId === state.me;
  const logs = state.db.daily_logs.filter((l) => l.date >= ws && l.date <= we && mine(l));
  const plans = state.db.weekly_plans.filter((p) => p.plannedDate >= ws && p.plannedDate <= we && mine(p));

  let days = '';
  let total = { plan: 0, log: 0 };
  for (let i = 0; i < 7; i++) {
    const date = addDays(ws, i);
    // 예정: 그날 마감인 업무(완료된 것은 완료일 기준) + 업무로 등록되지 않은 주간 예정사항
    const dayTasks = tasks.filter((t) => (t.status === 'done' ? t.completedAt === date : t.dueDate === date)).sort(byDue);
    const titles = new Set(dayTasks.map((t) => t.title));
    const dayPlans = plans.filter((p) => p.plannedDate === date && !titles.has(p.content));
    const dayLogs = logs.filter((l) => l.date === date);
    total.plan += dayTasks.length + dayPlans.length;
    total.log += dayLogs.length;
    const hol = HOLIDAYS[date];
    const cls = ['day', date === T ? 'today' : '', date < T ? 'past' : '', dow(date) === 0 || hol ? 'sun' : dow(date) === 6 ? 'sat' : ''].join(' ');
    const planHtml = dayTasks.map((t) => taskItem(t, T)).join('')
      + dayPlans.map((p) => `<div class="ri s-plan kb-plan"><div class="ri-main"><div class="ri-title"><span class="kind k-plan">예정</span>${esc(p.content)}</div><div class="ri-meta">${esc(memberName(p.assigneeId) || '담당 미정')} · 주간 예정사항</div></div></div>`).join('');
    const logHtml = dayLogs.map((l) => {
      const t = l.taskId && findTask(l.taskId);
      const done = l.result === '완료';
      return `<div class="log-row ${done ? 'done' : ''}" ${t ? `data-act="openDetail" data-id="${t.id}"` : ''}>
        <span class="log-res">${done ? '완료' : '진행'}</span>
        <div><div class="log-text">${esc(l.content)}</div>
        <div class="ri-meta">${esc(memberName(l.assigneeId) || '')} · ${t ? `→ ${kindTag(t)}${esc(t.title)}` : '연결된 업무 없음'}</div></div>
      </div>`;
    }).join('');
    days += `<section class="${cls}">
      <div class="day-head"><b>${Number(date.slice(5, 7))}.${Number(date.slice(8))}.</b><span>(${DOW[dow(date)]})</span>${date === T ? '<span class="today-tag">오늘</span>' : ''}${hol ? `<span class="hol">${esc(hol)}</span>` : ''}</div>
      <div class="day-cols">
        <div class="day-col"><div class="col-label">${IC.clipboard} 예정</div>${planHtml || '<div class="empty small">없음</div>'}</div>
        <div class="day-col"><div class="col-label">${IC.checkSquare} 실시</div>${logHtml || '<div class="empty small">없음</div>'}</div>
      </div>
    </section>`;
  }

  return `
  <div class="dash-grid">
    <section class="card home-card">
      ${summaryStrip(s, changes)}
      <div class="home-head">
        <h2 class="cal-title">이번 주 <small>${weekLabel(ws)} · ${fmtK(ws)} ~ ${fmtK(we)}</small></h2>
        <span class="grow"></span>
        <span class="scope-label">${state.me === 'all' ? '부서 전체 기준' : `${esc(memberName(state.me))} 기준`} · 예정 ${total.plan} · 실시 ${total.log}</span>
        <button class="btn outline" data-act="goTab" data-tab="dashboard">${IC.calendar} 전체 달력</button>
        <button class="btn teal" data-act="newTask">${IC.plus} 업무 추가</button>
      </div>
      ${kindLegend({ plan: true })}
      <div class="week-days">${days}</div>
      <p class="hint">예정은 그날 마감인 업무(완료된 업무는 완료일)와 주간 예정사항, 실시는 그날 들어온 실시사항입니다. 마감 없는 지시사항·일정 미정 업무는 오른쪽에서 관리합니다.</p>
    </section>
    <aside class="card panel-card scroll-keep" id="panel">${renderPanel(tasks, T, s, changes, { home: true })}</aside>
  </div>`;
}
