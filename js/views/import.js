// 화면 ③ 문서 가져오기·검토 (PRD §6 화면 ③)
import {
  state, handlers, render, act, today, esc, options, memberOptions, memberName, memberFull, findTask,
  toast,
} from '../core.js';
import { applyImport, ctx } from '../importer.js';
import { fmtK, isISO } from '../dates.js';
import { TYPE_LABEL, CYCLE_LABEL, byDue, logResult } from '../rules.js';
import { parseHwpx, sha256 } from '../hwpx.js';
import { DOC_TYPES, DOC_USE, guessMeta, extractItems, manualItem, suggest } from '../extract.js';

const ACTIONS = {
  task: { new: '신규 등록', link: '기존 업무에 연결', exclude: '제외' },
  plan: { new: '신규 등록 + 예정사항', link: '기존 업무 연결 + 예정사항', planonly: '주간 예정사항으로만', exclude: '제외' },
  log: { complete: '완료 근거로 승인 (업무 완료)', progress: '진행 기록으로 연결 (업무 진행중)', logonly: '실시 기록만 (연결 안 함)', exclude: '제외' },
};

export function renderImport() {
  const s = state.imp;
  return `<div class="page">
    ${!s || s.step === 'upload' ? uploadStep(s) : s.step === 'review' ? reviewStep(s) : doneStep(s)}
  </div>`;
}

function uploadStep(s) {
  const recent = [...state.db.documents].sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || '')).slice(0, 8);
  return `
  <div class="box pad">
    <h3>1. 올리기</h3>
    <label class="drop">
      <input type="file" accept=".hwpx" data-chg="impFile">
      <span>HWPX 파일 선택 <span class="muted">(한글에서 HWPX로 저장한 파일. HWP·PDF·스캔본은 지원하지 않습니다)</span></span>
    </label>
    ${s?.error ? `<div class="alert error">${esc(s.error)}</div>` : ''}
    ${s?.blocks ? metaForm(s) : ''}
  </div>
  <div class="box pad">
    <h3>지원 문서와 쓰는 곳</h3>
    <table class="tbl compact"><tbody>${Object.entries(DOC_TYPES).map(([k, v]) => `<tr><td>${v}</td><td class="muted">${DOC_USE[k]}</td></tr>`).join('')}</tbody></table>
    <p class="hint">샘플 파일은 samples/hwpx 폴더에 있습니다. 예정사항은 표, 실시사항은 "○ 10.30.(금) 운용과: 내용" 같은 서술형 문장, 회의록은 "□ 사단장 지시사항" 아래 번호 목록 양식을 읽습니다.</p>
  </div>
  ${recent.length ? `<div class="box pad"><h3>가져온 문서</h3><table class="tbl compact"><thead><tr><th>파일</th><th>종류</th><th>대상 기간</th><th>등록</th><th></th></tr></thead><tbody>
    ${recent.map((d) => `<tr><td>${esc(d.fileName)}</td><td>${esc(DOC_TYPES[d.docType] || '')}</td><td>${fmtK(d.periodFrom)} ~ ${fmtK(d.periodTo)}</td><td class="muted">${esc(memberName(d.importedBy))}</td>
      <td class="nowrap"><button class="btn tiny" data-act="docDownload" data-id="${d.id}" title="${d.hasFile ? '원본 HWPX 내려받기' : '반영된 내용을 정리한 HWPX 내려받기'}">${d.hasFile ? '원본 받기' : '정리본 받기'}</button></td></tr>`).join('')}
  </tbody></table></div>` : ''}`;
}

function metaForm(s) {
  const nP = s.blocks.filter((b) => b.kind === 'para').length;
  const nT = s.blocks.filter((b) => b.kind === 'table').length;
  return `
  <div class="file-info">📄 <b>${esc(s.fileName)}</b> <span class="muted">${Math.round(s.size / 1024)}KB · 문단 ${nP}개 · 표 ${nT}개</span></div>
  ${s.dupDoc ? `<div class="alert warn">⚠ 같은 파일을 이미 가져왔습니다 (${esc(s.dupDoc.fileName)}, ${fmtK((s.dupDoc.importedAt || '').slice(0, 10))}). 중복 등록을 막기 위해 다시 가져올 수 없습니다.</div>` : ''}
  ${!nP && !nT ? '<div class="alert warn">문서에서 글자를 찾지 못했습니다. 빈 문서이거나 지원하지 않는 양식입니다.</div>' : ''}
  <form class="form" data-submit="impExtract">
    <div class="row">
      <label>문서 종류 *<select name="docType">${options(DOC_TYPES, s.meta.docType)}</select></label>
      <label>작성일 *<input type="date" name="writtenDate" value="${esc(s.meta.writtenDate || '')}" required></label>
      <label>대상 기간 시작<input type="date" name="periodFrom" value="${esc(s.meta.periodFrom || '')}"></label>
      <label>대상 기간 끝<input type="date" name="periodTo" value="${esc(s.meta.periodTo || '')}"></label>
    </div>
    <p class="hint">파일 이름과 첫 문단으로 추정한 값입니다. 다르면 고친 뒤 [항목 뽑기]를 누르세요. 날짜에 연도가 없으면 대상 기간에 가까운 연도로 읽습니다.</p>
    <div class="form-actions"><button class="btn primary" ${s.dupDoc ? 'disabled' : ''}>항목 뽑기</button></div>
  </form>`;
}

function rowStatus(it) {
  const out = [];
  if (it.suggested) out.push('<span class="badge blue">추천</span>');
  if (it.kind !== 'log' && !it.startDate && !it.dueDate && it.type !== 'order') out.push('<span class="badge gray">일정 미정</span>');
  if (it.kind === 'log') out.push(it.result === '완료' ? '<span class="badge green">완료 기록</span>' : '<span class="badge gray">진행 기록</span>');
  if (it.kind === 'log' && !it.date) out.push('<span class="badge red">날짜 없음</span>');
  if (!it.assigneeId) out.push('<span class="badge gray">담당 미정</span>');
  if (it.candidates?.some((c) => c.warn)) out.push('<span class="badge orange">후속 조치 주의</span>');
  if (it.manual) out.push('<span class="badge">직접 추가</span>');
  const linked = it.action === 'link' && findTask(it.linkTaskId);
  if (linked && linked.dueDate && it.dueDate && !it.dueIsRange && linked.dueDate !== it.dueDate && linked.status !== 'done') {
    out.push(`<span class="badge orange" title="실행하면 기한 변경 반영 대기로 올라갑니다">기한 변경안 ${fmtK(linked.dueDate)}→${fmtK(it.dueDate)}</span>`);
  }
  return out.join(' ');
}

function reviewStep(s) {
  const items = s.items;
  const cnt = (a) => items.filter((i) => i.action === a).length;
  const rows = items.map((it, i) => {
    const sel = i === s.sel ? 'sel' : '';
    const acts = ACTIONS[it.kind];
    const actSel = `<select data-chg="impEdit" data-i="${i}" data-f="action">${options(acts, it.action)}</select>`;
    const linked = it.linkTaskId ? findTask(it.linkTaskId) : null;
    const linkCell = (it.action === 'link' || it.action === 'complete' || it.action === 'progress')
      ? `<div class="small ${linked ? '' : 'red'}">→ ${linked ? esc(linked.title) : '오른쪽에서 연결할 업무를 고르세요'}</div>` : '';
    if (it.kind === 'log') {
      return `<tr class="${sel} ${it.action === 'exclude' ? 'excluded' : ''}" data-act="impSel" data-i="${i}">
        <td>${i + 1}</td><td>${actSel}${linkCell}</td>
        <td><input type="date" value="${esc(it.date || '')}" data-chg="impEdit" data-i="${i}" data-f="date"></td>
        <td><select data-chg="impEdit" data-i="${i}" data-f="assigneeId">${memberOptions(it.assigneeId)}</select></td>
        <td><input value="${esc(it.content)}" data-chg="impEdit" data-i="${i}" data-f="content"></td>
        <td>${rowStatus(it)}</td></tr>`;
    }
    return `<tr class="${sel} ${it.action === 'exclude' ? 'excluded' : ''}" data-act="impSel" data-i="${i}">
      <td>${i + 1}</td><td>${actSel}${linkCell}</td>
      <td><input value="${esc(it.title)}" data-chg="impEdit" data-i="${i}" data-f="title"></td>
      <td><select data-chg="impEdit" data-i="${i}" data-f="type">${options(TYPE_LABEL, it.type)}</select>
        ${it.type === 'cycle' ? `<select data-chg="impEdit" data-i="${i}" data-f="cycle">${options(CYCLE_LABEL, it.cycle || 'monthly')}</select>` : ''}</td>
      <td><select data-chg="impEdit" data-i="${i}" data-f="assigneeId">${memberOptions(it.assigneeId)}</select></td>
      <td><input type="date" value="${esc(it.startDate || '')}" data-chg="impEdit" data-i="${i}" data-f="startDate"></td>
      <td><input type="date" value="${esc(it.dueDate || '')}" data-chg="impEdit" data-i="${i}" data-f="dueDate"></td>
      <td>${rowStatus(it)}</td></tr>`;
  }).join('');
  const isLog = s.meta.docType === 'logs';
  const head = isLog
    ? '<th>#</th><th>처리 방법</th><th>실시 일자</th><th>담당자</th><th>내용</th><th>표시</th>'
    : '<th>#</th><th>처리 방법</th><th>업무명</th><th>구분</th><th>담당자</th><th>시작일</th><th>마감일</th><th>표시</th>';
  return `
  <div class="review-bar box pad">
    <div><b>${esc(s.fileName)}</b> · ${esc(DOC_TYPES[s.meta.docType])} · 작성 ${fmtK(s.meta.writtenDate)} · 대상 ${fmtK(s.meta.periodFrom)} ~ ${fmtK(s.meta.periodTo)}</div>
    <div class="muted">뽑은 항목 ${items.length}건 — ${isLog ? `완료 근거 ${cnt('complete')} · 진행 기록 ${cnt('progress')} · 실시 기록만 ${cnt('logonly')}` : `신규 ${cnt('new')} · 연결 ${cnt('link')}${cnt('planonly') ? ` · 예정사항만 ${cnt('planonly')}` : ''}`} · 제외 ${cnt('exclude')}</div>
    <div class="grow"></div>
    <button class="btn" data-act="impBack">처음으로</button>
    <button class="btn primary" data-act="impRun">처리 실행</button>
  </div>
  ${s.error ? `<div class="alert error">${esc(s.error)}</div>` : ''}
  ${!items.length ? '<div class="alert warn">규칙으로 뽑아낸 항목이 없습니다. 오른쪽 원문에서 [+ 항목으로]를 눌러 직접 추가할 수 있습니다.</div>' : ''}
  <div class="review-grid">
    <div class="box table-wrap scroll-keep" id="impTable"><table class="tbl review"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="box pad side-pane scroll-keep" id="impSide">${sidePane(s)}</div>
  </div>`;
}

// 후보를 직접 고를 때: "완료" 기록이고 결과보고 경고가 없으면 완료, 아니면 진행 기록
function logPickAction(it) {
  const c = (it.candidates || []).find((x) => x.taskId === it.linkTaskId);
  return it.result === '완료' && !c?.warn ? 'complete' : 'progress';
}

function sidePane(s) {
  const it = s.items[s.sel];
  const tabs = `<div class="tabs-inline"><button class="tab-btn ${s.side !== 'raw' ? 'on' : ''}" data-act="impSide" data-v="item">선택한 항목</button><button class="tab-btn ${s.side === 'raw' ? 'on' : ''}" data-act="impSide" data-v="raw">원문 전체</button></div>`;
  if (s.side === 'raw') {
    return tabs + `<p class="hint">규칙으로 뽑지 못한 내용도 여기서 [+ 항목으로]를 눌러 직접 추가할 수 있습니다.</p>` + s.blocks.map((b) => (b.kind === 'para'
      ? `<div class="raw-line"><span class="muted">${b.index + 1}문단</span> ${esc(b.text)} <button class="btn tiny" data-act="impAddRaw" data-text="${esc(b.text)}" data-loc="${b.index + 1}번째 문단">+ 항목으로</button></div>`
      : `<div class="raw-table"><div class="muted">표${b.index + 1}</div><table class="tbl compact">${b.rows.map((r, ri) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}<td><button class="btn tiny" data-act="impAddRaw" data-text="${esc(r.join(' | '))}" data-loc="표${b.index + 1} ${ri + 1}행">+</button></td></tr>`).join('')}</table></div>`)).join('');
  }
  if (!it) return tabs + '<div class="muted">왼쪽에서 항목을 고르세요.</div>';
  const pick = it.kind === 'log' ? logPickAction(it) : 'link';
  const cands = (it.candidates || []).map((c) => {
    const t = findTask(c.taskId);
    if (!t) return '';
    return `<div class="cand ${c.warn ? 'warn' : ''} ${it.linkTaskId === t.id ? 'on' : ''}">
      <button class="btn small ${it.linkTaskId === t.id ? 'primary' : ''}" data-act="impPick" data-id="${t.id}">${it.linkTaskId === t.id ? '선택됨' : (pick === 'complete' ? '이 업무 완료로' : pick === 'progress' ? '이 업무 진행중으로' : '이 업무에 연결')}</button>
      <span><b>${esc(t.title)}</b> <span class="muted">${esc(memberFull(t.assigneeId) || '담당 미정')} · ${t.dueDate ? fmtK(t.dueDate) + ' 마감' : '마감 없음'} · ${t.status === 'done' ? '완료됨 · ' : ''}유사도 ${Math.round(c.score * 100)}%</span></span>
      ${c.warn ? `<div class="warn-text">⚠ ${esc(c.warn)}</div>` : ''}</div>`;
  }).join('');
  const pool = state.db.tasks.filter((t) => it.kind !== 'log' || t.status !== 'done').sort(byDue);
  return tabs + `
    <h4>원문 <span class="muted">(${esc(it.location)})</span></h4>
    <blockquote>${esc(it.raw)}</blockquote>
    ${it.type === 'order' ? `<div class="row">
      <label>지시일자<input type="date" value="${esc(it.orderDate || '')}" data-chg="impEdit" data-i="${s.sel}" data-f="orderDate"></label>
      <label>지시자<input value="${esc(it.orderedBy || '')}" data-chg="impEdit" data-i="${s.sel}" data-f="orderedBy"></label></div>` : ''}
    <h4>기존 업무와의 연결 후보</h4>
    <p class="hint">날짜·업무명이 비슷한 업무입니다. 자동으로 합치지 않습니다. ${it.kind === 'log' ? `"완료"라고 적힌 기록만 완료 근거가 되고, 그 밖의 조치 기록은 업무를 진행중으로 바꿉니다. (이 기록: <b>${esc(it.result || '진행')}</b>)` :'같은 업무가 여러 문서에 나오면 연결해서 한 건으로 관리합니다.'}</p>
    ${cands || '<div class="muted">비슷한 업무가 없습니다.</div>'}
    <label class="small">다른 업무 직접 고르기
      <select data-chg="impPickSel"><option value="">— 선택 —</option>${pool.map((t) => `<option value="${t.id}" ${it.linkTaskId === t.id ? 'selected' : ''}>${esc(t.title)} (${esc(memberName(t.assigneeId) || '미정')}${t.dueDate ? ', ' + fmtK(t.dueDate) : ''})</option>`).join('')}</select>
    </label>
    ${it.linkTaskId ? `<button class="btn small" data-act="impUnpick">연결 선택 해제</button>` : ''}`;
}

function doneStep(s) {
  const r = s.result;
  return `
  <div class="box pad">
    <h3>처리 결과</h3>
    <div class="cards small">
      <div class="stat"><span class="stat-label">신규 등록</span><span class="stat-num">${r.created}</span></div>
      <div class="stat"><span class="stat-label">기존 업무 연결</span><span class="stat-num">${r.linked}</span></div>
      <div class="stat c-done"><span class="stat-label">완료 처리</span><span class="stat-num">${r.completed}</span></div>
      ${r.progressed ? `<div class="stat"><span class="stat-label">진행 기록 연결</span><span class="stat-num">${r.progressed}</span></div>` : ''}
      <div class="stat"><span class="stat-label">제외</span><span class="stat-num">${r.excluded}</span></div>
      <div class="stat"><span class="stat-label">일정 미정</span><span class="stat-num">${r.undated}</span></div>
      ${r.logs ? `<div class="stat"><span class="stat-label">실시 기록 저장</span><span class="stat-num">${r.logs}</span></div>` : ''}
      ${r.plans ? `<div class="stat"><span class="stat-label">주간 예정사항</span><span class="stat-num">${r.plans}</span></div>` : ''}
    </div>
    ${r.nexts ? `<p>주기 업무 ${r.nexts}건의 다음 회차를 자동 생성했습니다.</p>` : ''}
    ${r.changes ? `<div class="alert warn">기존 업무와 마감일이 다른 항목 ${r.changes}건은 바로 바꾸지 않고 <b>기한 변경 반영 대기</b>로 올렸습니다. 업무 달력 오른쪽에서 근거를 보고 반영하거나 보류하세요.</div>` : ''}
    ${r.noAssignee ? `<div class="alert warn">담당자가 정해지지 않은 업무 ${r.noAssignee}건이 있습니다. 업무 관리에서 담당자를 정하세요.</div>` : ''}
    <div class="form-actions"><button class="btn" data-act="impBack">다른 문서 가져오기</button><button class="btn primary" data-act="goTab" data-tab="dashboard">대시보드로</button></div>
  </div>`;
}

// ── 이벤트 ──
Object.assign(handlers, {
  impFile: async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    state.imp = { step: 'upload', fileName: file.name, size: file.size };
    try {
      if (!/\.hwpx$/i.test(file.name)) throw new Error('HWPX 파일만 지원합니다. 한글에서 [다른 이름으로 저장] → HWPX 형식으로 저장한 뒤 올리세요.');
      const buf = await file.arrayBuffer();
      const hash = await sha256(buf);
      const blocks = await parseHwpx(buf);
      state.imp = {
        ...state.imp, buf, hash, blocks, meta: guessMeta(file.name, blocks, today()),
        dupDoc: state.db.documents.find((d) => d.hash && d.hash === hash) || null,
      };
    } catch (e) {
      state.imp.error = `파일을 읽지 못했습니다: ${e.message}`;
    }
    render();
  },
  impExtract(form) {
    const s = state.imp;
    const meta = {
      docType: form.docType.value, writtenDate: form.writtenDate.value,
      periodFrom: form.periodFrom.value || null, periodTo: form.periodTo.value || null,
    };
    if (!isISO(meta.writtenDate)) { s.error = '작성일을 입력하세요.'; render(); return; }
    s.meta = meta;
    s.items = extractItems(s.blocks, meta, ctx());
    s.sel = 0;
    s.side = s.items.length ? 'item' : 'raw';
    s.step = 'review';
    s.error = null;
    render();
  },
  impBack() { state.imp = null; render(); },
  impSel(el, e) {
    if (e.target.closest('input,select,button')) { if (state.imp.sel !== Number(el.dataset.i)) { state.imp.sel = Number(el.dataset.i); state.imp.side = 'item'; document.getElementById('impSide').innerHTML = sidePane(state.imp); markSel(); } return; }
    state.imp.sel = Number(el.dataset.i);
    state.imp.side = 'item';
    render();
  },
  impSide(el) { state.imp.side = el.dataset.v; render(); },
  impEdit(el) {
    const it = state.imp.items[Number(el.dataset.i)];
    const f = el.dataset.f;
    it[f] = el.value || null;
    if (f === 'type' && it.type === 'cycle' && !it.cycle) it.cycle = 'monthly';
    if (f === 'type' && it.type === 'order' && !it.orderDate) it.orderDate = state.imp.meta.writtenDate;
    if (f === 'action' && (it.action === 'new' || it.action === 'logonly' || it.action === 'planonly' || it.action === 'exclude')) { /* 연결 선택은 유지해 두되 실행 시 쓰지 않는다 */ }
    if (['title', 'content', 'dueDate', 'date', 'assigneeId'].includes(f)) {
      const keep = { action: it.action, linkTaskId: it.linkTaskId };
      if (it.kind === 'log' && f === 'content') it.result = logResult(it.content);
      suggest(it, ctx());
      Object.assign(it, keep);
      if (it.kind === 'log' && f === 'content' && (it.action === 'complete' || it.action === 'progress')) it.action = logPickAction(it);
    }
    it.suggested = false;
    render();
  },
  impPick(el) {
    const it = state.imp.items[state.imp.sel];
    it.linkTaskId = el.dataset.id;
    it.action = it.kind === 'log' ? logPickAction(it) : 'link';
    it.suggested = false;
    render();
  },
  impPickSel(el) {
    if (!el.value) return;
    handlers.impPick({ dataset: { id: el.value } });
  },
  impUnpick() {
    const it = state.imp.items[state.imp.sel];
    it.linkTaskId = null;
    it.action = it.kind === 'log' ? 'logonly' : 'new';
    render();
  },
  impAddRaw(el) {
    const s = state.imp;
    s.items.push({ ...manualItem(el.dataset.text, el.dataset.loc, s.meta, ctx()), key: s.items.length });
    s.sel = s.items.length - 1;
    s.side = 'item';
    toast('항목을 추가했습니다. 왼쪽 표에서 내용을 고치세요.');
    render();
  },
  impRun: act(async () => {
    const s = state.imp;
    const errs = [];
    s.items.forEach((it, i) => {
      if (it.action === 'exclude') return;
      if ((it.action === 'link' || it.action === 'complete' || it.action === 'progress') && !findTask(it.linkTaskId)) errs.push(`${i + 1}행: 연결할 업무를 고르세요.`);
      if (it.kind === 'log' && !isISO(it.date)) errs.push(`${i + 1}행: 실시 일자를 입력하세요.`);
      if (it.kind === 'log' && !it.content) errs.push(`${i + 1}행: 내용이 비어 있습니다.`);
      if (it.kind !== 'log' && !it.title) errs.push(`${i + 1}행: 업무명이 비어 있습니다.`);
      if (it.kind !== 'log' && it.action === 'new' && it.type === 'order' && !isISO(it.orderDate)) errs.push(`${i + 1}행: 지시일자가 필요합니다.`);
      if (it.kind === 'plan' && it.action !== 'exclude' && !isISO(it.dueDate || it.startDate)) errs.push(`${i + 1}행: 주간 예정사항에는 날짜가 필요합니다.`);
    });
    if (errs.length) { s.error = errs.slice(0, 6).join(' / ') + (errs.length > 6 ? ` 외 ${errs.length - 6}건` : ''); return; }
    const n = (a) => s.items.filter((i) => i.action === a).length;
    if (!confirm(`처리할까요?\n신규 ${n('new')} · 연결 ${n('link')} · 완료 근거 ${n('complete')} · 진행 기록 ${n('progress')} · 실시 기록 ${n('logonly')} · 예정사항만 ${n('planonly')} · 제외 ${n('exclude')}`)) return;
    if (state.db.documents.some((d) => d.hash && d.hash === s.hash)) { s.error = '이미 가져온 파일입니다.'; return; }

    const { r } = await applyImport(s);
    s.step = 'done';
    s.result = r;
    toast('문서 처리를 마쳤습니다.', 'ok');
  }),
});

function markSel() {
  document.querySelectorAll('#impTable tr[data-i]').forEach((tr) => tr.classList.toggle('sel', Number(tr.dataset.i) === state.imp.sel));
}
