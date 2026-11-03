// 지휘관 지시사항 추적 관리 대장. 지시사항은 대부분 마감이 없어 달력 날짜로는 놓치기 쉽다.
// 그래서 "지시 후 며칠째 미결인가(D+n)"와 "마지막 조치가 언제였나"로 관리한다.
import {
  state, handlers, render, today, esc, memberName, statusChip, newTask,
  lastAction, staleDays, STALE_DAYS,
} from '../core.js';
import { fmtK, diffDays } from '../dates.js';
import { orderElapsed, weekRange } from '../rules.js';
import { IC } from '../icons.js';

const WARN = 7;   // 지시 후 경과 D+7 이상: 주의
const ALERT = 14; // D+14 이상: 경고

export function renderOrders() {
  const T = today();
  const o = state.orders;
  const mine = (t) => (state.me === 'all' || t.assigneeId === state.me) && (!o.assignee || t.assigneeId === o.assignee);
  const all = state.db.tasks.filter((t) => t.type === 'order' && mine(t));
  const open = all.filter((t) => t.status !== 'done').sort((a, b) => (a.orderDate || '9999').localeCompare(b.orderDate || '9999'));
  const done = all.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  const { ws, we } = weekRange(T);
  const cnt = {
    open: open.length,
    alert: open.filter((t) => (orderElapsed(t, T) ?? 0) >= ALERT).length,
    stale: open.filter((t) => (staleDays(t, T) ?? 0) >= STALE_DAYS).length,
    doneWeek: done.filter((t) => t.completedAt >= ws && t.completedAt <= we).length,
  };
  const dd = (t) => {
    const n = orderElapsed(t, T);
    if (n == null) return '-';
    return `<span class="dd-badge ${n >= ALERT ? 'red' : n >= WARN ? 'orange' : ''}">D+${n}</span>`;
  };
  const actionCell = (t) => {
    const a = lastAction(t);
    const s = staleDays(t, T);
    const stale = s != null && s >= STALE_DAYS ? `<span class="badge red">조치 없음 ${s}일</span> ` : '';
    return a ? `${stale}<div class="oa-text">${esc(a.text)}</div><div class="muted small">${fmtK(a.date)}${a.by ? ` · ${esc(memberName(a.by))}` : ''}</div>`
      : `${stale}<span class="muted">조치 기록 없음</span>`;
  };
  const dueCell = (t) => {
    if (!t.dueDate) return '<span class="muted">없음</span>';
    const n = diffDays(t.dueDate, T);
    return `${fmtK(t.dueDate)}${n < 0 && t.status !== 'done' ? ' <span class="badge red">경과</span>' : ''}`;
  };
  const openRows = open.map((t) => `<tr>
      <td class="nowrap">${fmtK(t.orderDate) || '-'}</td>
      <td class="nowrap">${esc(t.orderedBy || '-')}</td>
      <td class="o-title" data-act="openDetail" data-id="${t.id}">${esc(t.title)}</td>
      <td class="nowrap">${esc(memberName(t.assigneeId) || '담당 미정')}</td>
      <td class="nowrap">${dd(t)}</td>
      <td class="nowrap">${dueCell(t)}</td>
      <td class="nowrap">${statusChip(t, T)}</td>
      <td class="o-action">${actionCell(t)}</td>
      <td class="nowrap o-btns">
        <button class="btn small" data-act="orderAction" data-id="${t.id}">조치 입력</button>
        <button class="btn small ok" data-act="toggleDone" data-id="${t.id}">완료</button>
        <button class="btn small outline" data-act="requestModal" data-id="${t.id}">확인 요청</button>
      </td></tr>`).join('');
  const doneRows = done.map((t) => `<tr>
      <td class="nowrap">${fmtK(t.orderDate) || '-'}</td>
      <td class="nowrap">${esc(t.orderedBy || '-')}</td>
      <td class="o-title" data-act="openDetail" data-id="${t.id}">${esc(t.title)}</td>
      <td class="nowrap">${esc(memberName(t.assigneeId) || '담당 미정')}</td>
      <td class="nowrap">${fmtK(t.completedAt)}</td>
      <td class="nowrap">${t.orderDate && t.completedAt ? `${diffDays(t.completedAt, t.orderDate)}일` : '-'}</td>
      <td class="o-action">${(() => { const a = lastAction(t); return a ? `<div class="oa-text">${esc(a.text)}</div>` : '<span class="muted">-</span>'; })()}</td>
      <td class="nowrap"><button class="btn small" data-act="toggleDone" data-id="${t.id}">완료 취소</button></td></tr>`).join('');
  const assignees = state.db.members.filter((m) => all.some((t) => t.assigneeId === m.id) || o.assignee === m.id);

  return `<div class="page orders">
    <div class="sum-strip o-sum">
      ${[['미결 지시사항', cnt.open, 'c-plan', ''], [`D+${ALERT} 이상`, cnt.alert, 'c-od', '지시 후 2주 넘게 미결'], [`조치 없음 ${STALE_DAYS}일+`, cnt.stale, 'c-ns', '최근 조치 기록이 없음'], ['이번 주 완료', cnt.doneWeek, 'c-done', '']]
        .map(([l, n, c, sub]) => `<div class="sum"><span class="sum-body"><span class="sum-label">${l}</span><span class="sum-sub">${sub}</span></span><span class="sum-num ${c}">${n}</span></div>`).join('')}
    </div>
    <div class="box pad">
      <div class="o-toolbar">
        <div class="seg" role="group" aria-label="보기">
          <button class="${o.view === 'open' ? 'on' : ''}" data-act="orderView" data-v="open">미결 ${open.length}</button>
          <button class="${o.view === 'done' ? 'on' : ''}" data-act="orderView" data-v="done">완료 ${done.length}</button>
        </div>
        ${state.me === 'all' ? `<label class="small">담당 <select data-chg="orderAssignee"><option value="">전체</option>${assignees.map((m) => `<option value="${m.id}" ${o.assignee === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>` : `<span class="scope-label">${esc(memberName(state.me))} 기준</span>`}
        <span class="grow"></span>
        <button class="btn teal" data-act="newOrder">${IC.plus} 지시사항 추가</button>
      </div>
      <div class="table-wrap"><table class="tbl o-tbl">
        ${o.view === 'open'
          ? `<thead><tr><th>지시일</th><th>지시자</th><th>지시 내용</th><th>담당</th><th>경과</th><th>마감</th><th>상태</th><th>최근 조치</th><th></th></tr></thead><tbody>${openRows || '<tr><td colspan="9" class="empty">미결 지시사항이 없습니다.</td></tr>'}</tbody>`
          : `<thead><tr><th>지시일</th><th>지시자</th><th>지시 내용</th><th>담당</th><th>완료일</th><th>소요</th><th>최근 조치</th><th></th></tr></thead><tbody>${doneRows || '<tr><td colspan="8" class="empty">완료된 지시사항이 없습니다.</td></tr>'}</tbody>`}
      </table></div>
      <p class="hint">오래된 지시부터 보여 줍니다. 경과는 지시일부터 센 날수이며 D+${WARN} 주황, D+${ALERT} 빨강입니다. 메모·진행 내용·연결된 실시사항이 ${STALE_DAYS}일 넘게 없으면 "조치 없음"으로 표시합니다. 미결 지시사항은 완료될 때까지 이번 주 화면의 "먼저 확인할 것"에도 계속 나옵니다.</p>
    </div>
  </div>`;
}

Object.assign(handlers, {
  orderView(el) { state.orders.view = el.dataset.v; render(); },
  orderAssignee(el) { state.orders.assignee = el.value; render(); },
  // 조치 입력: 진행 내용을 적으면 메모로 남고 미착수였다면 진행중이 된다 (modals.js progress)
  orderAction(el) { state.modal = { kind: 'progress', taskId: el.dataset.id }; render(); },
  newOrder() {
    state.modal = { kind: 'task', draft: newTask({ type: 'order', orderDate: today(), orderedBy: '지휘관', assigneeId: state.me === 'all' ? null : state.me }) };
    render();
  },
});
