// 화면 ① 업무 달력: 요약 띠 + 달력(월/주) + 이번 주 확인사항 (PRD §5 기능 2)
import {
  state, handlers, render, act, today, scopeTasks, esc, memberName, findTask, statusChip, dueText, docOf,
  statusSelect, pendingRequestsFor, completeTask, uncompleteTask, setStatus, describeResult, toast,
  pendingChanges, applyChange, holdChange,
} from '../core.js';
import { addDays, fmtK, fmtTime, lastDayOfMonth, mondayOf, pad, HOLIDAYS, dow, diffDays } from '../dates.js';
import {
  summary, panelGroups, weekRange, displayStatus, isOverdue, orderElapsed, ddayLabel, DISPLAY_LABEL, byDue,
} from '../rules.js';
import { IC, STATUS_IC } from '../icons.js';

const DOC_SHORT = { annual: '연간계획', weekly: '주간계획', eight: '8주예정', etc: '기타계획', logs: '실시사항', minutes: '회의록' };
const md = (s) => (s ? `${s.slice(5, 7)}.${s.slice(8, 10)}` : '');

// ISO 주차
function isoWeek(s) {
  const thu = addDays(mondayOf(s), 3);
  const jan4 = `${thu.slice(0, 4)}-01-04`;
  return Math.round(diffDays(mondayOf(thu), mondayOf(jan4)) / 7) + 1;
}

export function renderDashboard() {
  const T = today();
  const tasks = scopeTasks();
  const s = summary(tasks, T);
  const changes = pendingChanges(tasks);
  return `
  <div class="dash-grid">
    <section class="card cal-card">
      ${summaryStrip(s, changes)}
      ${calToolbar(T)}
      ${state.calView === 'week' ? renderWeek(tasks, T) : renderMonth(tasks, T)}
      <div class="legend">
        <span>${STATUS_IC.planned}<i class="c-plan">예정</i></span><span>${STATUS_IC.doing}<i class="c-doing">진행중</i></span>
        <span>${STATUS_IC.notstarted}<i class="c-ns">미착수</i></span><span>${STATUS_IC.done}<i class="c-done">완료</i></span>
        <span>${STATUS_IC.overdue}<i class="c-od">완료 미확인</i></span><span><b class="lg-change">변경안</b></span>
        <span><b class="lg-log">● 실시</b> 연결 안 된 실시 기록</span>
      </div>
      <p class="hint">마감일이 없는 지시사항과 일정 미정 업무는 달력에 그리지 않고 오른쪽에서 관리합니다. 날짜를 누르면 그날 업무만 봅니다.</p>
    </section>
    <aside class="card panel-card scroll-keep" id="panel">${renderPanel(tasks, T, s, changes)}</aside>
  </div>`;
}

function calToolbar(T) {
  const week = state.calView === 'week';
  let label;
  if (week) {
    const ws = state.calWeek || weekRange(T).ws;
    label = `${Number(ws.slice(5, 7))}월 ${isoWeek(ws)}주차 <small>${fmtK(ws)} ~ ${fmtK(addDays(ws, 6))}</small>`;
  } else {
    const [y, m] = (state.calMonth || T.slice(0, 7)).split('-').map(Number);
    label = `${y}년 ${m}월`;
  }
  return `
  <div class="cal-toolbar">
    <button class="btn icon sq" data-act="calMove" data-n="-1" aria-label="이전">${IC.chevL}</button>
    <button class="btn icon sq" data-act="calMove" data-n="1" aria-label="다음">${IC.chevR}</button>
    <h2 class="cal-title">${label}</h2>
    <button class="btn outline" data-act="calToday" title="기준일로 이동">기준일</button>
    <div class="seg" role="group" aria-label="달력 보기">
      <button class="${week ? '' : 'on'}" data-act="calView" data-v="month">월</button>
      <button class="${week ? 'on' : ''}" data-act="calView" data-v="week">주</button>
    </div>
    <span class="grow"></span>
    <span class="scope-label">${state.me === 'all' ? '부서 전체 기준' : `${esc(memberName(state.me))} 기준`}</span>
    <button class="btn teal" data-act="newTask">${IC.plus} 업무 추가</button>
  </div>`;
}

function summaryStrip(s, changes) {
  const on = (k) => (state.panel?.kind === 'card' && state.panel.key === k ? 'on' : '');
  const item = (key, ic, label, num, sub, cls) => `
    <button class="sum ${on(key)}" data-act="cardFilter" data-key="${key}" title="눌러서 해당 업무만 보기">
      <span class="sum-ic ${cls}">${ic}</span>
      <span class="sum-body"><span class="sum-label">${label}</span><span class="sum-sub">${sub}</span></span>
      <span class="sum-num ${cls}">${num}</span>
    </button>`;
  return `<div class="sum-strip">
    ${item('week', IC.clipboard, '이번 주 할 일', s.week.length, `일정 미정 ${s.undated.length}건`, 'c-plan')}
    ${item('done', STATUS_IC.done, '완료', s.done.length, '실시사항 연결 포함', 'c-done')}
    ${item('open', STATUS_IC.overdue, '미완료', s.open.length, `완료 미확인 ${s.openOverdue.length} · 미착수 ${s.openNotStarted.length}`, 'c-od')}
    ${item('next', IC.arrowR, '다음 주 반영', s.carry.length + s.fresh.length, `이월 ${s.carry.length} · 신규 ${s.fresh.length}`, 'c-doing')}
    ${item('change', IC.clock, '반영 대기', changes.length, '기한 변경안', 'c-ns')}
  </div>`;
}

// ── 달력 칸 내용 ──
function calEvents(tasks) {
  const map = {};
  const push = (date, ev) => { (map[date] ||= []).push(ev); };
  for (const t of tasks) {
    if (t.status === 'done') { if (t.completedAt) push(t.completedAt, { t }); } else if (t.dueDate) push(t.dueDate, { t });
    if (t.pendingChange && t.status !== 'done') push(t.pendingChange.dueDate, { t, change: true });
  }
  for (const l of state.db.daily_logs) {
    if (!l.taskId && (state.me === 'all' || l.assigneeId === state.me)) push(l.date, { log: l });
  }
  const rank = (e) => (e.log ? 3 : e.change ? 1 : 0);
  Object.values(map).forEach((list) => list.sort((a, b) => rank(a) - rank(b)));
  return map;
}

function chip(e, T, { full = false } = {}) {
  if (e.log) return `<div class="ev log" title="${esc(memberName(e.log.assigneeId) + ': ' + e.log.content)}">● 실시: ${esc(e.log.content)}</div>`;
  const t = e.t;
  const od = isOverdue(t, T);
  const ds = displayStatus(t, T);
  const key = e.change ? 'planned' : od ? 'overdue' : ds;
  const label = e.change ? '변경안' : od ? '완료 미확인' : DISPLAY_LABEL[ds];
  const who = t.assigneeId ? memberName(t.assigneeId) : '담당 미정';
  return `<div class="ev s-${key} ${e.change ? 'change' : ''}" data-act="openDetail" data-id="${t.id}" title="${esc(`${t.title} · ${who}${e.change ? ` · 기한 변경안 ${fmtK(t.dueDate)} → ${fmtK(t.pendingChange.dueDate)}` : ''}`)}">
    <div class="ev-st">${STATUS_IC[key]}<span>${label}</span></div>
    <div class="ev-t">${t.type === 'order' ? '<span class="star">★</span>' : ''}${esc(t.title)}</div>
    ${full ? `<div class="ev-who">${esc(who)}</div>` : ''}
  </div>`;
}

function dayCell(date, ym, T, events, { full = false, ws } = {}) {
  const evs = events[date] || [];
  const hol = HOLIDAYS[date];
  const sel = state.panel?.kind === 'date' && state.panel.date === date;
  const red = dow(date) === 0 || hol;
  const cls = ['cell', ym && date.slice(0, 7) !== ym ? 'other' : '', date === T ? 'today' : '', sel ? 'sel' : '', red ? 'sun' : dow(date) === 6 ? 'sat' : ''].join(' ');
  const showMonth = date.slice(8) === '01' || (ym && date === ws);
  const num = showMonth ? `${Number(date.slice(5, 7))}. ${Number(date.slice(8))}` : Number(date.slice(8));
  const limit = full ? 99 : 3;
  const hasChange = evs.some((e) => e.change);
  return `<div class="${cls}" data-act="pickDate" data-date="${date}">
    <div class="cell-head">
      ${dow(date) === 1 && date === weekRange(T).ws ? `<span class="wk">${isoWeek(date)}주차</span>` : ''}
      <span class="num">${num}</span>${hol ? `<span class="hol">${esc(hol)}</span>` : ''}
      ${hasChange ? '<span class="chg-tag">변경안</span>' : ''}
    </div>
    ${evs.slice(0, limit).map((e) => chip(e, T, { full })).join('')}
    ${evs.length > limit ? `<div class="ev-more">+${evs.length - limit}건</div>` : ''}
  </div>`;
}

function weekdayHead() {
  return `<div class="cal-row wd">${'월화수목금토일'.split('').map((c, i) => `<div class="${i === 6 ? 'sun' : i === 5 ? 'sat' : ''}">${c}</div>`).join('')}</div>`;
}

function renderMonth(tasks, T) {
  const ym = state.calMonth || T.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const start = mondayOf(`${ym}-01`);
  const end = addDays(mondayOf(`${ym}-${pad(lastDayOfMonth(y, m))}`), 6);
  const { ws } = weekRange(T);
  const events = calEvents(tasks);
  let rows = '';
  for (let wk = start; wk <= end; wk = addDays(wk, 7)) {
    let cells = '';
    for (let i = 0; i < 7; i++) cells += dayCell(addDays(wk, i), ym, T, events, { ws: start });
    rows += `<div class="cal-row ${wk === ws ? 'this-week' : ''}">${cells}</div>`;
  }
  return `<div class="cal">${weekdayHead()}${rows}</div>`;
}

function renderWeek(tasks, T) {
  const ws = state.calWeek || weekRange(T).ws;
  const events = calEvents(tasks);
  let cells = '';
  for (let i = 0; i < 7; i++) cells += dayCell(addDays(ws, i), null, T, events, { full: true });
  return `<div class="cal week">${weekdayHead()}<div class="cal-row ${ws === weekRange(T).ws ? 'this-week' : ''}">${cells}</div></div>`;
}

// ── 오른쪽 이번 주 확인사항 ──
export function taskItem(t, T) {
  const od = isOverdue(t, T);
  const ds = displayStatus(t, T);
  const meta = [];
  if (state.me === 'all' || t.assigneeId !== state.me) meta.push(esc(memberName(t.assigneeId) || '담당 미정'));
  if (t.type === 'order') {
    meta.push(`지시 후 <b class="dd">D+${orderElapsed(t, T) ?? '?'}</b>`);
    if (t.dueDate && t.status !== 'done') {
      const n = diffDays(t.dueDate, T);
      meta.push(n < 0 ? `<span class="badge red">마감 경과 ${ddayLabel(t.dueDate, T)}</span>`
        : n <= 3 ? `<span class="badge orange">마감 임박 ${ddayLabel(t.dueDate, T)}</span>` : `마감 ${md(t.dueDate)}`);
    }
  } else meta.push(dueText(t, T));
  if (t.status === 'done' && t.completedAt) meta.push(`완료 ${fmtK(t.completedAt)}`);
  const key = od ? 'overdue' : ds;
  return `
  <div class="ri s-${key}">
    <input type="checkbox" class="chk" data-act="toggleDone" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''} title="완료 체크" aria-label="완료 체크">
    <div class="ri-main" data-act="openDetail" data-id="${t.id}">
      <div class="ri-title">${t.type === 'order' ? '<span class="star">★</span>' : ''}${esc(t.title)}</div>
      <div class="ri-meta">${statusChip(t, T)} ${meta.join(' · ')}</div>
    </div>
    <div class="ri-tools">${statusSelect(t)}<button class="btn icon tiny-ic" data-act="noteModal" data-id="${t.id}" title="메모 추가" aria-label="메모 추가">${IC.pen}</button></div>
  </div>`;
}

function pcard(key, tone, icon, title, body, { count, collapsible = false, foot = '' } = {}) {
  const collapsed = collapsible && state.collapsed[key];
  return `<div class="pcard tone-${tone}">
    <div class="pcard-head" ${collapsible ? `data-act="toggleGroup" data-key="${key}"` : ''}>
      <span class="pcard-ic">${icon}</span><span class="pcard-title">${title}</span>
      ${count != null ? `<span class="pcard-cnt">${count}</span>` : ''}
      ${collapsible ? `<span class="pcard-chev ${collapsed ? '' : 'open'}">${IC.chevD}</span>` : ''}
    </div>
    ${collapsed ? '' : `<div class="pcard-body">${body}</div>${foot}`}
  </div>`;
}

function changeBlock(t) {
  const pc = t.pendingChange;
  const tags = [...new Set(pc.sources.map((s) => DOC_SHORT[docOf(s.documentId)?.docType] || '문서'))];
  return `<div class="chg">
    <div class="chg-title" data-act="openDetail" data-id="${t.id}">${t.type === 'order' ? '<span class="star">★</span>' : ''}${esc(t.title)} <small>${esc(memberName(t.assigneeId) || '담당 미정')}</small></div>
    <div class="chg-dates"><s>${md(pc.fromDue) || '없음'}</s>${IC.arrowR}<b>${md(pc.dueDate)}</b><span class="grow"></span>${tags.map((x) => `<span class="src-tag">${x}</span>`).join('')}</div>
    <div class="chg-ev">${pc.sources.map((s) => `<div><b>${DOC_SHORT[docOf(s.documentId)?.docType] || '문서'}:</b> ${esc(s.text)}</div>`).join('')}</div>
    <div class="chg-actions">
      <button class="btn teal block" data-act="applyChange" data-id="${t.id}">${IC.checkCircle} 변경 반영</button>
      <button class="btn outline" data-act="holdChange" data-id="${t.id}">${IC.pause} 보류</button>
    </div>
  </div>`;
}

function panelBack(title) {
  return `<div class="panel-head"><h2>${title}</h2><button class="btn outline small" data-act="panelReset">이번 주로 돌아가기</button></div>`;
}

function renderPanel(tasks, T, s, changes) {
  const p = state.panel;
  const list = (arr) => (arr.length ? arr.map((t) => taskItem(t, T)).join('') : '<div class="empty">해당 업무가 없습니다.</div>');
  if (p?.kind === 'card') {
    if (p.key === 'change') return panelBack(`반영 대기 <span class="pcard-cnt">${changes.length}</span>`) + (changes.map(changeBlock).join('') || '<div class="empty">반영 대기 중인 변경안이 없습니다.</div>');
    const map = { week: ['이번 주 할 일', s.week], done: ['이번 주 완료', s.done], open: ['이번 주 미완료', s.open], next: ['다음 주 반영', [...s.carry, ...s.fresh]] };
    const [title, arr] = map[p.key];
    return panelBack(`${title} <span class="pcard-cnt">${arr.length}</span>`) + list([...arr].sort(byDue));
  }
  if (p?.kind === 'date') {
    const dayTasks = tasks.filter((t) => (t.status === 'done' ? t.completedAt === p.date : t.dueDate === p.date));
    const logs = state.db.daily_logs.filter((l) => l.date === p.date && (state.me === 'all' || l.assigneeId === state.me));
    const plans = state.db.weekly_plans.filter((w) => w.plannedDate === p.date && (state.me === 'all' || w.assigneeId === state.me));
    return panelBack(`${fmtK(p.date)} 업무`)
      + pcard('d-tasks', 'plain', IC.calendar, '업무', list(dayTasks), { count: dayTasks.length })
      + pcard('d-logs', 'plain', IC.checkSquare, '일일 실시사항', logs.map((l) => `<div class="ri s-log"><div class="ri-main"><div class="ri-title">● ${esc(l.content)}</div><div class="ri-meta">${esc(memberName(l.assigneeId))} · ${l.taskId ? `연결: ${esc(findTask(l.taskId)?.title || '')}` : '연결된 업무 없음'}</div></div></div>`).join('') || '<div class="empty">없음</div>', { count: logs.length })
      + pcard('d-plans', 'plain', IC.clipboard, '주간 예정사항', plans.map((w) => `<div class="ri s-plan"><div class="ri-main"><div class="ri-title">${esc(w.content)}</div><div class="ri-meta">${esc(memberName(w.assigneeId))}</div></div></div>`).join('') || '<div class="empty">없음</div>', { count: plans.length });
  }

  const g = panelGroups(tasks, T);
  const reqs = pendingRequestsFor(state.me).sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
  const out = [];
  const empty = [];
  const add = (cond, html, name) => { if (cond) out.push(html()); else empty.push(name); };
  add(reqs.length, () => pcard('req', 'blue', IC.chat, state.me === 'all' ? '답변 대기 확인 요청' : '나에게 온 확인 요청', reqs.map((r) => {
    const t = findTask(r.taskId);
    return `<div class="req-row" data-act="openDetail" data-id="${r.taskId}"><div class="ri-title">${esc(r.content)}</div><div class="ri-meta">${esc(memberName(r.requesterId))} → ${esc(memberName(r.targetId))} · ${fmtTime(r.requestedAt)} · ${esc(t?.title || '(삭제된 업무)')}</div><span class="btn outline small">답변하기</span></div>`;
  }).join(''), { count: reqs.length }), '확인 요청');
  add(changes.length, () => pcard('change', 'orange', IC.warn, '기한 변경 반영 대기', changes.map(changeBlock).join(''), { count: changes.length }), '기한 변경');
  add(g.overdue.length, () => pcard('overdue', 'red', IC.alertCircle, '완료 확인 필요', list(g.overdue), {
    count: g.overdue.length,
    foot: `<div class="pcard-foot"><p>실시 기록에서 완료 근거를 찾지 못했습니다.</p><button class="btn teal block" data-act="goTab" data-tab="dept">${IC.search} 업무 확인</button></div>`,
  }), '완료 확인 필요');
  add(g.todayDue.length, () => pcard('today', 'plain', IC.clock, '오늘 마감', list(g.todayDue), { count: g.todayDue.length }), '오늘 마감');
  add(g.thisWeek.length, () => pcard('week', 'plain', IC.calendar, '이번 주 마감', list(g.thisWeek), { count: g.thisWeek.length }), '이번 주 마감');
  add(g.alerts.length, () => pcard('alerts', 'plain', IC.refresh, '알림 시점이 된 주기 업무', list(g.alerts), { count: g.alerts.length }), '알림 주기 업무');
  add(g.orders.length, () => pcard('orders', 'gold', IC.star, '미완료 지시사항', list(g.orders), { count: g.orders.length }), '지시사항');
  add(g.undated.length, () => pcard('undated', 'gray', IC.clock, `일정 미정 ${g.undated.length}건`, list(g.undated), { collapsible: true }), '일정 미정');
  add(g.others.length, () => pcard('others', 'gray', IC.list, `그 밖의 업무 ${g.others.length}건`, list(g.others), { collapsible: true }), '그 밖의 업무');
  return `<div class="panel-head"><h2>이번 주 확인사항</h2><span class="muted small">${fmtK(weekRange(T).ws)} ~ ${fmtK(weekRange(T).we)}</span></div>`
    + out.join('')
    + (empty.length ? `<p class="muted small">해당 없음: ${empty.join(' · ')}</p>` : '')
    + `<p class="panel-note">${IC.info} 완료 미확인은 미실시 확정이 아닙니다. 담당자가 확인 후 처리합니다.</p>`;
}

// ── 이벤트 ──
Object.assign(handlers, {
  cardFilter(el) {
    const key = el.dataset.key;
    state.panel = state.panel?.kind === 'card' && state.panel.key === key ? null : { kind: 'card', key };
    render();
  },
  pickDate(el) {
    const date = el.dataset.date;
    state.panel = state.panel?.kind === 'date' && state.panel.date === date ? null : { kind: 'date', date };
    render();
  },
  panelReset() { state.panel = null; render(); },
  calView(el) {
    state.calView = el.dataset.v;
    if (state.calView === 'week') {
      const ym = state.calMonth;
      const T = today();
      state.calWeek = ym && ym !== T.slice(0, 7) ? mondayOf(`${ym}-01`) : weekRange(T).ws;
    }
    render();
  },
  calMove(el) {
    const n = Number(el.dataset.n);
    if (state.calView === 'week') {
      state.calWeek = addDays(state.calWeek || weekRange(today()).ws, 7 * n);
      state.calMonth = state.calWeek.slice(0, 7);
    } else {
      const [y, m] = (state.calMonth || today().slice(0, 7)).split('-').map(Number);
      const t = y * 12 + (m - 1) + n;
      state.calMonth = `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
    }
    render();
  },
  calToday() { state.calMonth = today().slice(0, 7); state.calWeek = null; state.panel = null; render(); },
  toggleGroup(el) { const k = el.dataset.key; state.collapsed[k] = !state.collapsed[k]; render(); },
  openDetail(el) { state.detailId = el.dataset.id; render(); },
  toggleDone: act(async (el) => {
    const t = findTask(el.dataset.id);
    if (!t) return;
    if (t.status === 'done') {
      if (!confirm(`'${t.title}' 완료를 취소할까요?`)) return;
      const res = await uncompleteTask(t);
      toast(['완료를 취소했습니다.', describeResult(res)].join(' '));
    } else {
      const res = await completeTask(t);
      toast(['완료 처리했습니다.', describeResult(res)].join(' '), 'ok');
    }
  }),
  setStatus: act(async (el) => {
    const t = findTask(el.dataset.id);
    if (!t) return;
    // 진행중으로 바꾸려면 진행 내용을 적어야 한다 (모달에서 저장)
    if (el.value === 'doing') { state.modal = { kind: 'progress', taskId: t.id }; return; }
    if (t.status === 'done' && !confirm(`'${t.title}' 완료를 취소하고 상태를 바꿀까요?`)) return;
    const res = await setStatus(t, el.value);
    if (el.value !== 'done' && t.status === 'done') {
      // 완료 취소 후 원하는 상태로 맞춘다
      const cur = findTask(t.id);
      if (cur && cur.status !== el.value) await setStatus(cur, el.value);
    }
    toast(['상태를 바꿨습니다.', describeResult(res)].join(' '), 'ok');
  }),
  applyChange: act(async (el) => {
    const t = findTask(el.dataset.id);
    if (!t?.pendingChange || !confirm(`'${t.title}' 마감일을 ${fmtK(t.dueDate) || '없음'} → ${fmtK(t.pendingChange.dueDate)}로 바꿀까요?`)) return;
    await applyChange(t);
    toast('기한 변경을 반영했습니다. 메모에 기록을 남겼습니다.', 'ok');
  }),
  holdChange: act(async (el) => {
    const t = findTask(el.dataset.id);
    if (!t?.pendingChange) return;
    await holdChange(t);
    toast('변경안을 보류했습니다. 현재 마감일을 유지합니다.');
  }),
});
