// 모달: 업무 등록·수정, 메모, 확인 요청, 실시사항·예정사항 입력, 설정
import {
  state, handlers, render, act, today, esc, options, memberOptions, findTask, memberFull, saveRec, newTask,
  addNote, sendRequest, linkLog, unlinkLog, toast, describeResult, needName, demoDate, setDemoDate,
  resetSample, reloadAll, store,
} from '../core.js';
import { fmtK, isISO, mondayOf, realToday } from '../dates.js';
import { TYPE_LABEL, CYCLE_LABEL, STATUS_LABEL, findCandidates, byDue } from '../rules.js';

const wrap = (title, body, cls = '') => `
  <div class="modal-back" data-act="closeModal"></div>
  <div class="modal ${cls}" role="dialog" aria-label="${esc(title)}">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="btn icon" data-act="closeModal" aria-label="닫기">✕</button></div>
    ${state.modal.error ? `<div class="alert error">${esc(state.modal.error)}</div>` : ''}
    ${body}
  </div>`;

export function renderModal() {
  const m = state.modal;
  if (!m) return '';
  switch (m.kind) {
    case 'task': return taskForm(m);
    case 'note': return wrap('메모 추가', `
      <p class="muted">${esc(findTask(m.taskId)?.title)}</p>
      <form class="form" data-submit="noteSave"><textarea name="text" rows="3" required placeholder="진행 내용"></textarea>
      <div class="form-actions"><button type="button" class="btn" data-act="closeModal">취소</button><button class="btn primary">추가</button></div></form>`);
    case 'request': {
      const t = findTask(m.taskId);
      return wrap('진행 확인 요청', `
      <form class="form" data-submit="requestSave">
        <div class="kv"><dt>업무</dt><dd>${esc(t?.title)}</dd></div>
        <div class="kv"><dt>대상</dt><dd>${esc(memberFull(t?.assigneeId)) || '<span class="muted">담당자 없음</span>'}</dd></div>
        <div class="kv"><dt>요청자</dt><dd>${esc(memberFull(state.me))}</dd></div>
        <label>요청 내용<textarea name="content" rows="3" required>${esc(t?.title)}, 진행 상황 알려주세요.</textarea></label>
        <div class="form-actions"><button type="button" class="btn" data-act="closeModal">취소</button><button class="btn primary">요청 보내기</button></div>
      </form>`);
    }
    case 'log': return logForm(m);
    case 'plan': return planForm(m);
    case 'settings': return settingsForm();
    default: return '';
  }
}

// ── 업무 등록·수정 (§7.2) ──
function taskForm(m) {
  const d = m.draft;
  const isDone = d.status === 'done';
  const statusMap = isDone ? STATUS_LABEL : { todo: '미착수', doing: '진행중' };
  return wrap(d.id ? '업무 수정' : '업무 추가', `
  <form class="form" data-submit="taskSave" id="taskForm">
    <label>업무명 *<input name="title" value="${esc(d.title)}" required autocomplete="off"></label>
    <div class="row">
      <label>구분 *<select name="type" data-chg="taskFormType">${options(TYPE_LABEL, d.type)}</select></label>
      ${d.type === 'cycle' ? `<label>주기 *<select name="cycle">${options(CYCLE_LABEL, d.cycle || 'monthly')}</select></label>` : ''}
      <label>담당자<select name="assigneeId">${memberOptions(d.assigneeId)}</select></label>
    </div>
    ${d.type === 'order' ? `
    <div class="row">
      <label>지시일자 *<input type="date" name="orderDate" value="${esc(d.orderDate || today())}" required></label>
      <label>지시자<input name="orderedBy" value="${esc(d.orderedBy || '')}" placeholder="예: 사단장"></label>
    </div>` : ''}
    <div class="row">
      <label>시작일<input type="date" name="startDate" value="${esc(d.startDate || '')}"></label>
      <label>마감일<input type="date" name="dueDate" value="${esc(d.dueDate || '')}"></label>
      <label>상태<select name="status" ${isDone ? 'disabled' : ''}>${options(statusMap, d.status || 'todo')}</select></label>
    </div>
    <p class="hint">${d.type === 'order' ? '마감일이 없는 지시사항은 지시 후 경과일(D+n)로 관리합니다.' : d.type === 'cycle' ? '완료하면 다음 회차가 자동으로 만들어집니다. 마감일이 없으면 일정 미정으로 두고, 다음 회차는 마감일을 정한 뒤부터 만들어집니다.' : '시작일·마감일을 모두 비우면 "일정 미정"으로 등록됩니다.'}
    ${isDone ? ' 완료된 업무의 상태는 완료 이력의 [완료 취소]로 바꿉니다.' : ''}</p>
    <div class="form-actions"><button type="button" class="btn" data-act="closeModal">취소</button><button class="btn primary">저장</button></div>
  </form>`);
}

function readTaskForm(form, draft) {
  const f = new FormData(form);
  const v = (k) => (f.get(k) ?? '').toString().trim();
  const out = { ...draft, title: v('title'), type: v('type') || draft.type, assigneeId: v('assigneeId') || null };
  if (form.cycle) out.cycle = v('cycle');
  if (form.orderDate) out.orderDate = v('orderDate') || null;
  if (form.orderedBy) out.orderedBy = v('orderedBy') || null;
  out.startDate = v('startDate') || null;
  out.dueDate = v('dueDate') || null;
  if (form.status && !form.status.disabled) out.status = v('status') || 'todo';
  return out;
}

function validateTask(t) {
  if (!t.title) return '업무명을 입력하세요.';
  if (t.type === 'cycle' && !t.cycle) return '주기를 고르세요.';
  if (t.type === 'cycle' && !t.dueDate && t.startDate) return '주기 업무는 마감일이 필요합니다 (다음 회차 계산 기준). 일정 미정이면 시작일도 비우세요.';
  if (t.type === 'order' && !t.orderDate) return '지시일자를 입력하세요 (D+n 계산 기준).';
  if (t.startDate && t.dueDate && t.startDate > t.dueDate) return '시작일이 마감일보다 늦습니다.';
  if ((t.dueDate || t.startDate) && !t.assigneeId) return '담당자를 고르세요. (일정 미정 업무만 담당자 없이 등록할 수 있습니다)';
  return null;
}

// ── 실시사항 입력 (연결 후보 추천, §7.8) ──
function logForm(m) {
  const d = m.draft;
  const T = today();
  const pool = state.db.tasks.filter((t) => t.status !== 'done' || t.id === d.taskId).sort(byDue);
  return wrap(d.id ? '일일 실시사항 수정' : '일일 실시사항 추가', `
  <form class="form" data-submit="logSave" id="logForm">
    <div class="row">
      <label>실시 일자 *<input type="date" name="date" value="${esc(d.date || T)}" required data-inp="logCands"></label>
      <label>담당자<select name="assigneeId" data-chg="logCands">${memberOptions(d.assigneeId)}</select></label>
    </div>
    <label>실시 내용 *<input name="content" value="${esc(d.content || '')}" required autocomplete="off" data-inp="logCands" placeholder="예: 월간 예산 집행 실적 보고 제출"></label>
    <label>결과<input name="result" value="${esc(d.result || '')}" placeholder="예: 완료 / 진행"></label>
    <label>연결된 업무 (선택하면 그 업무를 실시 일자로 완료 처리)
      <select name="taskId" id="logTaskSel"><option value="">— 연결 안 함 (● 실시로만 표시) —</option>
      ${pool.map((t) => `<option value="${t.id}" ${t.id === d.taskId ? 'selected' : ''}>${esc(t.title)} (${esc(memberFull(t.assigneeId) || '담당 미정')}${t.dueDate ? ', ' + fmtK(t.dueDate) : ''})</option>`).join('')}
      </select></label>
    <div id="logCandBox">${logCandHtml(d)}</div>
    <p class="hint">진행 과정만 적은 기록은 연결하지 마세요. "점검 실시" 기록으로 "결과 보고" 업무를 완료 처리하지 않습니다.</p>
    <div class="form-actions"><button type="button" class="btn" data-act="closeModal">취소</button><button class="btn primary">저장</button></div>
  </form>`, 'wide');
}
function logCandHtml(d) {
  if (!d.content || d.content.length < 2) return '';
  const pool = state.db.tasks.filter((t) => t.status !== 'done');
  const cands = findCandidates({ text: d.content, date: d.date, assigneeId: d.assigneeId }, pool, today());
  if (!cands.length) return '<div class="muted small">비슷한 업무가 없습니다.</div>';
  return `<div class="cands"><div class="muted small">연결 후보 (자동 연결하지 않습니다 — 맞는 것만 고르세요)</div>${cands.map((c) => {
    const t = state.db.tasks.find((x) => x.id === c.taskId);
    return `<div class="cand ${c.warn ? 'warn' : ''}"><button type="button" class="btn small" data-act="logPick" data-id="${t.id}">선택</button>
      <span>${esc(t.title)} <span class="muted">${esc(memberFull(t.assigneeId))} · ${fmtK(t.dueDate) || '마감 없음'} · 유사도 ${Math.round(c.score * 100)}%</span></span>
      ${c.warn ? `<div class="warn-text">⚠ ${esc(c.warn)}</div>` : ''}</div>`;
  }).join('')}</div>`;
}

function planForm(m) {
  const d = m.draft;
  return wrap(d.id ? '주간 예정사항 수정' : '주간 예정사항 추가', `
  <form class="form" data-submit="planSave">
    <div class="row">
      <label>예정 일자 *<input type="date" name="plannedDate" value="${esc(d.plannedDate || today())}" required></label>
      <label>담당자<select name="assigneeId">${memberOptions(d.assigneeId)}</select></label>
    </div>
    <label>내용 *<input name="content" value="${esc(d.content || '')}" required autocomplete="off"></label>
    <div class="form-actions"><button type="button" class="btn" data-act="closeModal">취소</button><button class="btn primary">저장</button></div>
  </form>`);
}

function settingsForm() {
  const dd = demoDate();
  return wrap('설정', `
  <section class="sec">
    <h4>시연 기준일</h4>
    <p class="hint">"오늘" 대신 쓸 날짜입니다. 모든 판정과 숫자가 이 날짜 기준으로 바뀝니다. 이 브라우저에만 저장되어 다른 사람에게 영향을 주지 않습니다.</p>
    <form class="inline-form" data-submit="demoSave">
      <input type="date" name="date" value="${esc(dd || realToday())}" required>
      <button class="btn primary small">적용</button>
      ${dd ? '<button type="button" class="btn small" data-act="demoClear">해제</button>' : ''}
    </form>
    <p class="muted small">실제 오늘: ${fmtK(realToday(), { year: true })}${dd ? ` · 현재 기준일: ${fmtK(dd, { year: true })}` : ''}</p>
  </section>
  <section class="sec">
    <h4>저장소</h4>
    <p>${store.mode === 'supabase' ? '✅ 공유 저장소(Supabase)에 연결되어 있습니다. 다른 PC에서도 새로고침하면 같은 데이터가 보입니다.' : '⚠ 로컬 모드: 이 브라우저에만 저장됩니다. PC 간 공유하려면 js/config.js에 Supabase 주소와 anon 키를 넣으세요.'}</p>
  </section>
  <section class="sec">
    <h4>샘플 초기화</h4>
    <p class="hint">모든 데이터를 지우고 가상 시연 데이터로 되돌립니다. 샘플 날짜는 현재 기준일(${fmtK(today(), { year: true })})에 맞춰 다시 배치됩니다. ${store.mode === 'supabase' ? '<b>공유 저장소의 데이터가 모두 바뀌어 다른 사용자에게도 반영됩니다.</b>' : ''}</p>
    <button class="btn danger" data-act="resetSample">샘플 초기화</button>
  </section>`);
}

// ── 이벤트 ──
Object.assign(handlers, {
  closeModal() { state.modal = null; render(); },
  newTask() {
    state.modal = { kind: 'task', draft: newTask({ assigneeId: state.me === 'all' ? null : state.me, type: 'adhoc' }) };
    render();
  },
  editTask(el) {
    const t = findTask(el.dataset.id);
    if (t) { state.modal = { kind: 'task', draft: { ...t } }; render(); }
  },
  taskFormType(el) {
    const form = el.form;
    state.modal.draft = readTaskForm(form, state.modal.draft);
    if (state.modal.draft.type === 'cycle' && !state.modal.draft.cycle) state.modal.draft.cycle = 'monthly';
    render();
  },
  taskSave: act(async (form) => {
    const draft = readTaskForm(form, state.modal.draft);
    if (draft.type !== 'cycle') draft.cycle = null;
    if (draft.type !== 'order') { draft.orderDate = null; draft.orderedBy = null; }
    const err = validateTask(draft);
    if (err) { state.modal.draft = draft; state.modal.error = err; return; }
    const saved = await saveRec('tasks', draft);
    toast(draft.id ? '수정했습니다.' : `'${saved.title}' 업무를 등록했습니다.`, 'ok');
    state.modal = null;
  }),
  noteModal(el) { state.modal = { kind: 'note', taskId: el.dataset.id }; render(); },
  noteSave: act(async (form) => {
    await addNote(findTask(state.modal.taskId), form.text.value.trim());
    state.modal = null;
    toast('메모를 추가했습니다.', 'ok');
  }),
  requestModal(el) {
    if (needName()) return;
    const t = findTask(el.dataset.id);
    if (!t?.assigneeId) { toast('담당자가 없는 업무에는 확인 요청을 보낼 수 없습니다. 먼저 담당자를 정하세요.', 'warn'); return; }
    state.modal = { kind: 'request', taskId: t.id };
    render();
  },
  requestSave: act(async (form) => {
    const t = findTask(state.modal.taskId);
    await sendRequest(t, form.content.value.trim());
    state.modal = null;
    toast(`${memberFull(t.assigneeId)}에게 확인 요청을 보냈습니다.`, 'ok');
  }),
  logModal(el) {
    const log = el?.dataset?.id ? state.db.daily_logs.find((l) => l.id === el.dataset.id) : null;
    state.modal = { kind: 'log', draft: log ? { ...log } : { date: today(), assigneeId: state.me === 'all' ? null : state.me, content: '', result: '', taskId: null } };
    render();
  },
  logCands(el) {
    const form = el.form;
    const d = { ...state.modal.draft, date: form.date.value, assigneeId: form.assigneeId.value || null, content: form.content.value.trim() };
    state.modal.draft = { ...state.modal.draft, ...d };
    document.getElementById('logCandBox').innerHTML = logCandHtml(d);
  },
  logPick(el) {
    const sel = document.getElementById('logTaskSel');
    if (sel) sel.value = el.dataset.id;
  },
  logSave: act(async (form) => {
    const d = state.modal.draft;
    const rec = {
      ...d, date: form.date.value, assigneeId: form.assigneeId.value || null, content: form.content.value.trim(),
      result: form.result.value.trim(),
    };
    const taskId = form.taskId.value || null;
    if (!isISO(rec.date) || !rec.content) { state.modal.error = '실시 일자와 내용을 입력하세요.'; return; }
    const prevTaskId = d.id ? state.db.daily_logs.find((l) => l.id === d.id)?.taskId : null;
    let log = await saveRec('daily_logs', { ...rec, taskId: prevTaskId || null });
    let msg = '실시사항을 저장했습니다.';
    if (prevTaskId && prevTaskId !== taskId) { const r = await unlinkLog(log); log = r.log; msg += ' ' + describeResult(r); }
    if (taskId && taskId !== prevTaskId) {
      const t = findTask(taskId);
      const r = await linkLog(log, taskId);
      msg += ` '${t.title}' 업무를 완료 처리했습니다. ${describeResult(r)}`;
    }
    state.modal = null;
    toast(msg, 'ok');
  }),
  planModal(el) {
    const p = el?.dataset?.id ? state.db.weekly_plans.find((x) => x.id === el.dataset.id) : null;
    state.modal = { kind: 'plan', draft: p ? { ...p } : { plannedDate: today(), assigneeId: state.me === 'all' ? null : state.me, content: '' } };
    render();
  },
  planSave: act(async (form) => {
    const plannedDate = form.plannedDate.value;
    await saveRec('weekly_plans', {
      ...state.modal.draft, plannedDate, weekStart: mondayOf(plannedDate),
      assigneeId: form.assigneeId.value || null, content: form.content.value.trim(),
    });
    state.modal = null;
    toast('주간 예정사항을 저장했습니다.', 'ok');
  }),
  settings() { state.modal = { kind: 'settings' }; render(); },
  demoSave(form) {
    setDemoDate(form.date.value);
    state.calMonth = null; state.panel = null; state.modal = null;
    toast(`시연 기준일을 ${fmtK(form.date.value, { year: true })}로 정했습니다.`, 'ok');
    render();
  },
  demoClear() {
    setDemoDate(null);
    state.calMonth = null; state.panel = null; state.modal = null;
    toast('시연 기준일을 해제했습니다. 실제 오늘 날짜 기준으로 계산합니다.');
    render();
  },
  resetSample: act(async () => {
    if (!confirm('모든 데이터를 지우고 샘플 데이터로 되돌릴까요? 되돌릴 수 없습니다.')) return;
    await resetSample();
    state.modal = null; state.detailId = null; state.panel = null; state.imp = null;
    toast('샘플 데이터로 초기화했습니다.', 'ok');
  }),
  refresh: act(async () => {
    await reloadAll();
    toast('최신 데이터를 다시 불러왔습니다.');
  }),
});
