// 화면 ④ 부서 현황 + 화면 ⑤ 주간 보고서 (PRD §5 기능 3, §6)
import {
  state, handlers, render, act, today, esc, memberName, findTask, statusChip, docOf, kindTag,
  evidenceOf, outOfLogPeriod, linkLog, unlinkLog, deleteLog, removeRec, toast, describeResult, requestsOf,
} from '../core.js';
import { addDays, fmtK, fmtTime, diffDays, weekLabel } from '../dates.js';
import { deptSummary, weekRange, orderElapsed, displayStatus, isOverdue, byDue, findCandidates, STATUS_LABEL } from '../rules.js';

const REQ_STATE = { pending: '답변 대기', answered: '답변 완료', closed: '처리 완료' };

export function renderDept() {
  const T = today();
  const all = state.db.tasks;
  const s = deptSummary(all, T);
  const sources = (t) => {
    const docs = [...new Set(evidenceOf(t.id).map((e) => docOf(e.documentId)?.fileName).filter(Boolean))];
    return docs.length ? docs.map(esc).join('<br>') : '<span class="muted">직접 등록</span>';
  };
  const pendingReq = (t) => requestsOf(t.id).some((r) => r.state === 'pending');
  const reqBtn = (t) => (pendingReq(t) ? '<span class="badge gray">요청 대기중</span>' : `<button class="btn small" data-act="requestModal" data-id="${t.id}">확인 요청</button>`);
  const lastNote = (t) => { const n = (t.notes || []).at(-1); return n ? esc(n.text) : '<span class="muted">—</span>'; };
  const reqs = [...state.db.check_requests].sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
  const dw = state.deptWeek || weekRange(T).ws;
  const dwe = addDays(dw, 6);
  const plans = state.db.weekly_plans.filter((p) => p.plannedDate >= dw && p.plannedDate <= dwe).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const logs = state.db.daily_logs.filter((l) => l.date >= dw && l.date <= dwe).sort((a, b) => a.date.localeCompare(b.date));
  const linkPool = all.filter((t) => t.status !== 'done').sort(byDue);

  return `<div class="page">
    <div class="page-head"><span class="muted">항상 부서 전체 기준 · 기준일 ${fmtK(T, { year: true })}</span><span class="grow"></span>
      <button class="btn primary" data-act="goTab" data-tab="report">🖨 주간 보고서</button></div>

    <div class="cards">
      <div class="stat c-open"><span class="stat-label">부서 완료 미확인</span><span class="stat-num">${s.overdue.length}</span><span class="stat-sub">담당자 ${s.overdue.length ? s.people : 0}명</span></div>
      <div class="stat"><span class="stat-label">미완료 지휘관 지시사항</span><span class="stat-num">${s.openOrders.length}</span><span class="stat-sub">최장 D+${s.maxElapsed}</span></div>
      <div class="stat c-done"><span class="stat-label">이번 주 부서 완료율</span><span class="stat-num">${s.rate == null ? '—' : s.rate + '%'}</span><span class="stat-sub">${s.weekDone} / ${s.week.length}건</span></div>
    </div>

    <div class="two-col">
      <section class="box pad">
        <h3>⚠ 완료 미확인 업무 <span class="cnt">${s.overdue.length}</span></h3>
        <p class="hint">실시 기록에 없다는 것은 실시하지 않았다는 확정이 아닙니다. 담당자에게 진행 확인을 요청하세요.</p>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>업무명</th><th>담당자</th><th>마감일</th><th>경과</th><th>근거 문서</th><th></th></tr></thead>
          <tbody>${s.overdue.map((t) => `<tr>
            <td><a href="#" data-act="openDetail" data-id="${t.id}">${t.type === 'order' ? '★ ' : ''}${esc(t.title)}</a> ${statusChip(t, T).replace(/<span class="chip warn">.*?<\/span>/, '')}
              ${outOfLogPeriod(t) ? '<span class="chip gray">실시자료 기간 밖</span>' : ''}</td>
            <td>${esc(memberName(t.assigneeId)) || '<span class="muted">미정</span>'}</td>
            <td class="nowrap">${fmtK(t.dueDate)}</td>
            <td class="nowrap"><b class="dd late">${diffDays(T, t.dueDate)}일</b></td>
            <td class="small">${sources(t)}</td>
            <td>${reqBtn(t)}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">완료 미확인 업무가 없습니다.</td></tr>'}</tbody>
        </table></div>
      </section>

      <section class="box pad">
        <h3>★ 지휘관 지시사항 현황 <span class="muted small">미완료 ${s.openOrders.length} · 완료 ${s.doneOrders}</span></h3>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>지시 내용</th><th>지시일자</th><th>경과</th><th>담당자</th><th>상태</th><th>최근 메모</th><th></th></tr></thead>
          <tbody>${s.openOrders.map((t) => `<tr>
            <td><a href="#" data-act="openDetail" data-id="${t.id}">${esc(t.title)}</a>${t.orderedBy ? ` <span class="muted small">(${esc(t.orderedBy)})</span>` : ''}</td>
            <td class="nowrap">${fmtK(t.orderDate)}</td>
            <td class="nowrap"><b class="dd">D+${orderElapsed(t, T)}</b></td>
            <td>${esc(memberName(t.assigneeId)) || '<span class="muted">미정</span>'}</td>
            <td>${statusChip(t, T)}</td>
            <td class="small">${lastNote(t)}</td>
            <td>${reqBtn(t)}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">미완료 지시사항이 없습니다.</td></tr>'}</tbody>
        </table></div>
      </section>
    </div>

    <section class="box pad">
      <h3>확인 요청 현황 <span class="cnt">${reqs.length}</span></h3>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>업무</th><th>요청자 → 대상</th><th>요청 내용</th><th>보낸 시각</th><th>상태</th><th>답변</th><th></th></tr></thead>
        <tbody>${reqs.map((r) => {
          const t = findTask(r.taskId);
          return `<tr class="${r.state === 'answered' ? 'hl' : ''}">
            <td>${t ? `<a href="#" data-act="openDetail" data-id="${t.id}">${esc(t.title)}</a>` : '<span class="muted">(삭제된 업무)</span>'}</td>
            <td class="nowrap">${esc(memberName(r.requesterId))} → ${esc(memberName(r.targetId))}</td>
            <td>${esc(r.content)}</td>
            <td class="nowrap">${fmtTime(r.requestedAt)}</td>
            <td><span class="badge ${r.state === 'pending' ? 'orange' : r.state === 'answered' ? 'blue' : 'gray'}">${REQ_STATE[r.state]}</span></td>
            <td>${r.answer ? `${esc(r.answer)} <span class="muted small">${fmtTime(r.answeredAt)}</span>` : '<span class="muted">—</span>'}</td>
            <td>${r.state === 'answered' ? `<button class="btn small" data-act="closeReq" data-rid="${r.id}">처리 완료</button>` : ''}</td></tr>`;
        }).join('') || '<tr><td colspan="7" class="empty">보낸 확인 요청이 없습니다.</td></tr>'}</tbody>
      </table></div>
    </section>

    <section class="box pad">
      <div class="sec-head"><h3>주간·일일 종합</h3>
        <div class="cal-nav"><button class="btn icon" data-act="deptWeek" data-n="-7" aria-label="이전 주">‹</button>
        <b>${fmtK(dw)} ~ ${fmtK(dwe)}</b><button class="btn icon" data-act="deptWeek" data-n="7" aria-label="다음 주">›</button>
        <button class="btn small" data-act="deptWeek" data-n="0">이번 주</button></div></div>
      <div class="two-col">
        <div>
          <div class="sec-head"><h4>주간 예정사항 <span class="cnt">${plans.length}</span></h4><button class="btn small" data-act="planModal">+ 추가</button></div>
          <div class="table-wrap"><table class="tbl compact"><thead><tr><th>일자</th><th>담당</th><th>내용</th><th></th></tr></thead><tbody>
          ${plans.map((p) => `<tr><td class="nowrap">${fmtK(p.plannedDate)}</td><td>${esc(memberName(p.assigneeId))}</td><td>${esc(p.content)}${p.documentId ? ' <span class="muted" title="문서에서 가져옴">📄</span>' : ''}</td>
            <td class="nowrap"><button class="btn tiny" data-act="planModal" data-id="${p.id}">수정</button> <button class="btn tiny danger" data-act="planDelete" data-id="${p.id}">삭제</button></td></tr>`).join('') || '<tr><td colspan="4" class="empty">없음</td></tr>'}
          </tbody></table></div>
        </div>
        <div>
          <div class="sec-head"><h4>일일 실시사항 <span class="cnt">${logs.length}</span></h4><button class="btn small" data-act="logModal">+ 추가</button></div>
          <div class="table-wrap"><table class="tbl compact"><thead><tr><th>일자</th><th>담당</th><th>내용</th><th>결과</th><th>연결된 업무</th><th></th></tr></thead><tbody>
          ${logs.map((l) => {
            const cands = findCandidates({ text: l.content, date: l.date, assigneeId: l.assigneeId }, linkPool, T).map((c) => c.taskId);
            const linked = l.taskId ? findTask(l.taskId) : null;
            const pool = [...(linked ? [linked] : []), ...linkPool.filter((t) => t.id !== l.taskId)];
            pool.sort((a, b) => (cands.includes(b.id) ? 1 : 0) - (cands.includes(a.id) ? 1 : 0));
            return `<tr><td class="nowrap">${fmtK(l.date)}</td><td>${esc(memberName(l.assigneeId))}</td><td>${esc(l.content)}</td><td>${esc(l.result || '')}</td>
            <td><select class="mini wide" data-chg="logLinkSel" data-id="${l.id}"><option value="">— 연결 안 함 —</option>
              ${pool.map((t) => `<option value="${t.id}" ${t.id === l.taskId ? 'selected' : ''}>${cands.includes(t.id) ? '★ ' : ''}${esc(t.title)} (${esc(memberName(t.assigneeId) || '미정')})</option>`).join('')}</select></td>
            <td class="nowrap"><button class="btn tiny" data-act="logModal" data-id="${l.id}">수정</button> <button class="btn tiny danger" data-act="logDelete" data-id="${l.id}">삭제</button></td></tr>`;
          }).join('') || '<tr><td colspan="6" class="empty">없음</td></tr>'}
          </tbody></table></div>
          <p class="hint">★는 날짜·업무명이 비슷한 연결 후보입니다. 결과가 "완료"인 기록을 연결하면 그 업무가 실시 일자로 완료되고, "진행" 기록을 연결하면 진행중이 됩니다.</p>
        </div>
      </div>
    </section>
  </div>`;
}

// ── 화면 ⑤ 주간 보고서 (인쇄용) ──
export function renderReport() {
  const T = today();
  // 보고 주간: 기본은 기준일이 속한 주. 지난 주를 고르면 그 주 말일 기준으로 완료 미확인을 본다.
  const { ws, we, nws, nwe } = weekRange(state.reportWeek || T);
  const R = we < T ? addDays(we, 1) : T;
  const all = state.db.tasks;
  const week = all.filter((t) => t.dueDate && t.dueDate >= ws && t.dueDate <= we);
  const doneThisWeek = all.filter((t) => t.status === 'done' && ((t.completedAt >= ws && t.completedAt <= we) || week.includes(t)));
  const overdue = all.filter((t) => isOverdue(t, R)).sort(byDue);
  const doing = all.filter((t) => t.status === 'doing' && !isOverdue(t, R) && ((t.dueDate && t.dueDate <= we) || t.type === 'order')).sort(byDue);
  const notStarted = week.filter((t) => t.status === 'todo' && !isOverdue(t, R)).sort(byDue);
  const thisWeek = ws === weekRange(T).ws;
  const nextTasks = all.filter((t) => t.status !== 'done' && t.dueDate >= nws && t.dueDate <= nwe).sort(byDue);
  const nextPlans = state.db.weekly_plans.filter((p) => p.plannedDate >= nws && p.plannedDate <= nwe).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  const list = (rows, cols) => (rows.length ? `<table class="tbl print-tbl"><thead><tr>${cols.map((c) => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${c[1](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p class="muted">해당 없음</p>');
  const title = (t) => `${kindTag(t)}${esc(t.title)}`;
  const who = (t) => esc(memberName(t.assigneeId) || '미정');
  return `<div class="page report">
    <div class="no-print report-bar"><button class="btn" data-act="goTab" data-tab="dept">← 누락 점검</button>
      <span class="week-pick">
        <button class="btn icon sq" data-act="reportWeek" data-n="-7" aria-label="이전 주">‹</button>
        <b>${weekLabel(ws)}</b>
        <button class="btn icon sq" data-act="reportWeek" data-n="7" aria-label="다음 주">›</button>
        <input type="date" value="${ws}" data-chg="reportWeekDate" title="날짜를 고르면 그 날짜가 속한 주로 이동">
        ${thisWeek ? '' : '<button class="btn small" data-act="reportWeek" data-n="0">이번 주</button>'}
      </span>
      <span class="grow"></span><span class="muted">브라우저 인쇄 창에서 "PDF로 저장"도 할 수 있습니다.</span><button class="btn primary" data-act="print">🖨 인쇄</button></div>
    <div class="sheet">
      <h1>주간 업무 보고</h1>
      <p class="sheet-sub">${weekLabel(ws)} · ${fmtK(ws, { year: true })} ~ ${fmtK(we)} · 기준일 ${fmtK(T)} · 계획부서</p>
      <div class="sheet-sum">완료 ${doneThisWeek.length} · 진행중 ${doing.length} · 미착수 ${notStarted.length} · <b>완료 미확인 ${overdue.length}</b> · 다음 주 예정 ${nextTasks.length + nextPlans.length}</div>
      ${R !== T ? `<p class="muted">※ 지난 주 보고서입니다. 완료 미확인은 ${fmtK(we)} 기준으로, 업무 상태는 현재 상태로 표시합니다.</p>` : ''}
      <h3>1. ${thisWeek ? '이번 주' : '해당 주'} 완료</h3>
      ${list(doneThisWeek, [['업무', title], ['담당', who], ['완료일', (t) => fmtK(t.completedAt)], ['방법', (t) => (t.completedMethod === 'log' ? '실시사항' : t.completedMethod === 'doc' ? '관리대장' : '직접')]])}
      <h3>2. 진행중</h3>
      ${list(doing, [['업무', title], ['담당', who], ['마감', (t) => fmtK(t.dueDate) || '—'], ['최근 메모', (t) => esc((t.notes || []).at(-1)?.text || '')]])}
      <h3>3. 미착수 (${thisWeek ? '이번 주' : '해당 주'} 마감)</h3>
      ${list(notStarted, [['업무', title], ['담당', who], ['마감', (t) => fmtK(t.dueDate)], ['상태', (t) => (displayStatus(t, R) === 'notstarted' ? '미착수' : '예정')]])}
      <h3>4. 완료 미확인 (마감 경과)</h3>
      ${list(overdue, [['업무', title], ['담당', who], ['마감', (t) => fmtK(t.dueDate)], ['경과', (t) => `${diffDays(R, t.dueDate)}일`], ['상태', (t) => STATUS_LABEL[t.status]]])}
      <h3>5. 다음 주 예정 (${fmtK(nws)} ~ ${fmtK(nwe)})</h3>
      ${list(nextTasks, [['업무', title], ['담당', who], ['마감', (t) => fmtK(t.dueDate)]])}
      ${nextPlans.length ? `<h4>주간 예정사항</h4>${list(nextPlans, [['일자', (p) => fmtK(p.plannedDate)], ['담당', (p) => esc(memberName(p.assigneeId))], ['내용', (p) => esc(p.content)]])}` : ''}
      <p class="sheet-foot">※ 교육·시연용 가상 데이터. "완료 미확인"은 실시 기록에서 완료를 확인하지 못한 업무이며, 미실시를 뜻하지 않습니다.</p>
    </div>
  </div>`;
}

Object.assign(handlers, {
  deptWeek(el) {
    const n = Number(el.dataset.n);
    state.deptWeek = n === 0 ? null : addDays(state.deptWeek || weekRange(today()).ws, n);
    render();
  },
  print() { window.print(); },
  reportWeek(el) {
    const n = Number(el.dataset.n);
    state.reportWeek = n === 0 ? null : addDays(weekRange(state.reportWeek || today()).ws, n);
    render();
  },
  reportWeekDate(el) {
    if (!el.value) return;
    state.reportWeek = weekRange(el.value).ws;
    render();
  },
  planDelete: act(async (el) => {
    if (!confirm('이 주간 예정사항을 삭제할까요?')) return;
    await removeRec('weekly_plans', el.dataset.id);
    toast('삭제했습니다.');
  }),
  logDelete: act(async (el) => {
    const log = state.db.daily_logs.find((l) => l.id === el.dataset.id);
    if (!log || !confirm(`이 실시사항을 삭제할까요?${log.taskId ? '\n연결된 업무는 완료 전 상태로 돌아갑니다.' : ''}`)) return;
    await deleteLog(log);
    toast('삭제했습니다.');
  }),
  logLinkSel: act(async (el) => {
    const log = state.db.daily_logs.find((l) => l.id === el.dataset.id);
    const taskId = el.value || null;
    if (!log) return;
    if (!taskId) {
      if (!confirm('연결을 풀까요? 이 실시사항으로 완료된 업무는 완료 전 상태로 돌아갑니다.')) return;
      const res = await unlinkLog(log);
      toast(['연결을 풀었습니다.', describeResult(res)].join(' '));
      return;
    }
    const t = findTask(taskId);
    const done = log.result === '완료';
    if (!confirm(done ? `'${t.title}' 업무를 ${fmtK(log.date)} 실시로 완료 처리합니다. 맞습니까?` : `'${t.title}' 업무에 진행 기록으로 연결합니다. (완료 처리하지 않음) 맞습니까?`)) { render(); return; }
    const res = await linkLog(log, taskId);
    toast([done ? `'${t.title}' 완료 처리했습니다.` : `'${t.title}'에 진행 기록으로 연결했습니다.`, describeResult(res)].join(' '), 'ok');
  }),
});
