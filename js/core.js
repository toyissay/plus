// 앱 상태, 데이터 변경 작업, 화면 공통 도우미.
import { store, TABLES, FILE_TABLE, stamp } from './store.js';
import { realToday, setRefYear, fmtK, isISO, diffDays } from './dates.js';
import {
  nextDates, displayStatus, isOverdue, ddayLabel,
  DISPLAY_LABEL, DISPLAY_ICON, TYPE_LABEL, CYCLE_LABEL, STATUS_LABEL,
} from './rules.js';
import { buildSeed } from './seed.js';
import { buildHwpx } from './hwpxWrite.js';

export { store, TABLES };

const LS_ME = 'tracker.me';
const LS_DEMO = 'tracker.demoDate';
export function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function lsSet(k, v) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* 저장 불가 환경이면 무시 */ }
}

export const state = {
  db: Object.fromEntries(TABLES.map((t) => [t, []])),
  me: lsGet(LS_ME) || 'all',
  tab: 'home', // 첫 화면은 이번 주. 전체 달력은 'dashboard'
  calMonth: null,
  panel: null, // {kind:'card', key} | {kind:'date', date}
  detailId: null,
  modal: null,
  loading: true,
  loadError: null,
  imp: null,
  mgmt: { view: 'open', type: '', assignee: '', status: '', from: '', to: '' },
  deptWeek: null,
  reportWeek: null, // 주간 보고서에서 고른 주 (월요일). null이면 기준일이 속한 주
  orders: { view: 'open', assignee: '' }, // 지시사항 추적 화면 보기 조건

  collapsed: { undated: true, others: true },
};

export const handlers = {};
let renderFn = () => {};
export function setRender(fn) { renderFn = fn; }
export function render() { renderFn(); }

// ── 기준일 (§7.12 시연 기준일은 브라우저에만 저장) ──
export function demoDate() { const v = lsGet(LS_DEMO); return isISO(v) ? v : null; }
export function setDemoDate(v) { lsSet(LS_DEMO, v || null); setRefYear(today().slice(0, 4)); }
export function today() { return demoDate() || realToday(); }
setRefYear(today().slice(0, 4));

export function setMe(id) { state.me = id || 'all'; lsSet(LS_ME, state.me); }
export const meId = () => (state.me === 'all' ? null : state.me);

// ── 알림 (화면 전체를 다시 그리지 않도록 별도 영역에 그린다) ──
let toasts = [];
function drawToasts() {
  const box = document.getElementById('toasts');
  if (box) box.innerHTML = toasts.map((t) => `<div class="toast ${t.kind}">${esc(t.msg)}</div>`).join('');
}
export function toast(msg, kind = 'info', ms = 3800) {
  const id = Math.random();
  toasts.push({ id, msg, kind });
  drawToasts();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); drawToasts(); }, ms);
}

// 저장 작업 감싸기: 실패하면 안내하고 저장소에서 다시 읽어 화면과 저장소를 맞춘다.
export function act(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (e) {
      console.error(e);
      toast(`저장 실패: ${e.message}`, 'error', 7000);
      try { await reloadAll(); } catch { /* 이미 안내함 */ }
    }
    render();
  };
}

// ── 불러오기 ──
export async function reloadAll() {
  const res = await Promise.all(TABLES.map((t) => store.list(t)));
  TABLES.forEach((t, i) => { state.db[t] = res[i]; });
}
export async function loadAll() {
  state.loading = true;
  try {
    await reloadAll();
    if (!state.db.members.length) await resetSample();
    state.loadError = null;
  } catch (e) {
    console.error(e);
    state.loadError = e.message;
  }
  state.loading = false;
}
// 샘플 초기화: 구성원만 넣은 빈 상태에서 samples/hwpx 의 샘플 6개를 추천값 그대로 가져와 데이터를 만든다.
// 가져오는 동안에는 저장을 화면 상태에만 모아 두었다가(defer), 끝나면 저장소를 비우고 한 번에 올린다.
// dryRun이면 저장소에 쓰지 않고 결과만 돌려준다 (확인용).
let defer = null;
export async function resetSample({ dryRun = false } = {}) {
  const T = today();
  const seed = buildSeed(T);
  state.db = Object.fromEntries(TABLES.map((t) => [t, []]));
  state.db.members = seed.members.map(stamp);
  defer = { files: [] };
  let files;
  const log = [];
  try {
    const { importSampleFile, SAMPLE_FILES } = await import('./importer.js');
    for (const f of SAMPLE_FILES) {
      const { r, items } = await importSampleFile(f);
      log.push({ file: f, r, items });
    }
    for (const req of seed.requests(state.db.tasks)) await saveRec('check_requests', req);
  } catch (e) {
    defer = null;
    await reloadAll();
    throw e;
  }
  files = defer.files;
  defer = null;
  if (dryRun) return { db: state.db, files, log };
  for (const t of TABLES) {
    await store.clear(t);
    await store.saveMany(t, state.db[t]);
  }
  try {
    await store.clear(FILE_TABLE);
    for (const f of files) await store.save(FILE_TABLE, f);
  } catch (e) { console.warn('원본 파일을 보관하지 못했습니다', e); }
  await reloadAll();
  return { log };
}

// ── 백업·옮기기 (로컬판: 저장소가 이 PC 브라우저뿐이라 파일로 내보내고 가져온다) ──
export async function exportBackup() {
  const tables = {};
  for (const t of TABLES) tables[t] = await store.list(t);
  const files = await store.list(FILE_TABLE).catch(() => []);
  const data = { app: 'kookbang-eum-plus', version: 1, exportedAt: new Date().toISOString(), tables, files };
  const name = `국방이음plus_백업_${today()}.json`;
  saveBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), name);
  return { name, counts: Object.fromEntries(TABLES.map((t) => [t, tables[t].length])), files: files.length };
}
// 백업 파일로 이 PC의 데이터를 통째로 바꾼다
export async function importBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('백업 파일(JSON)을 읽지 못했습니다.'); }
  if (data?.app !== 'kookbang-eum-plus' || !data.tables) throw new Error('국방이음+ 백업 파일이 아닙니다.');
  for (const t of TABLES) { await store.clear(t); await store.saveMany(t, data.tables[t] || []); }
  await store.clear(FILE_TABLE);
  let skipped = 0;
  for (const f of data.files || []) { try { await store.save(FILE_TABLE, f); } catch { skipped++; } }
  await reloadAll();
  return { tasks: state.db.tasks.length, docs: state.db.documents.length, skipped };
}
// 실제 업무용 시작: 구성원만 남기고 업무·문서·실시사항·요청·원본을 모두 지운다
export async function startEmpty() {
  const members = state.db.members.length ? state.db.members : buildSeed(today()).members.map(stamp);
  for (const t of TABLES) { await store.clear(t); if (t === 'members') await store.saveMany(t, members); }
  await store.clear(FILE_TABLE);
  await reloadAll();
}

// ── 반영 자료 원본 보관·내려받기 ──
export const MAX_FILE = 5 * 1024 * 1024;
function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
// 원본 저장은 실패해도 가져오기를 막지 않는다. 성공 여부를 돌려준다.
export async function saveDocFile(doc, buf) {
  if (!buf || buf.byteLength > MAX_FILE) return false;
  const rec = { id: doc.id, fileName: doc.fileName, size: buf.byteLength, b64: toB64(buf) };
  if (defer) { defer.files.push(rec); return true; }
  try {
    await store.save(FILE_TABLE, rec);
    return true;
  } catch (e) {
    console.warn('원본 파일 저장 실패', e);
    return false;
  }
}
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
// 원본이 있으면 HWPX 원본을, 없으면(초기 샘플 등) 이 문서에서 반영된 내용을 정리한 HWPX를 만들어 내려받는다.
export async function downloadDoc(id) {
  const d = docOf(id);
  if (!d) return;
  if (d.hasFile) {
    const f = await store.get(FILE_TABLE, id);
    if (f?.b64) {
      const bin = atob(f.b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      saveBlob(new Blob([bytes], { type: 'application/hwp+zip' }), d.fileName);
      return 'file';
    }
  }
  const name = d.fileName.replace(/\.hwpx$/i, '');
  saveBlob(buildHwpx(name, docSummaryBlocks(d)), `${name} (반영 내용).hwpx`);
  return 'summary';
}
export function docSummaryBlocks(d) {
  const B = [];
  const fk = (v) => fmtK(v) || '-';
  B.push({ p: `${d.fileName.replace(/\.hwpx$/i, '')} - 반영 내용`, style: 'title' });
  B.push({ p: `작성일 ${fk(d.writtenDate)} / 대상 기간 ${fk(d.periodFrom)} ~ ${fk(d.periodTo)} / 등록 ${d.importedAt ? fk(d.importedAt.slice(0, 10)) : '초기 샘플'}` });
  B.push({ p: '※ 교육·시연용 가상 데이터. 원본 파일이 보관되지 않은 자료라 이 도구에 반영된 내용을 정리했습니다.' });
  const ev = state.db.task_evidence.filter((e) => e.documentId === d.id);
  if (ev.length) {
    B.push({ p: '' }, { p: `□ 연결된 업무 (${ev.length}건)`, style: 'head' });
    B.push({ table: [['업무', '담당', '상태', '마감', '원문'], ...ev.map((e) => { const t = findTask(e.taskId); return [t ? t.title : '(삭제된 업무)', t ? memberName(t.assigneeId) || '미정' : '', t ? STATUS_LABEL[t.status] || t.status : '', t?.dueDate ? fmtK(t.dueDate) : '-', e.text || '']; })] });
  }
  const logs = state.db.daily_logs.filter((l) => l.documentId === d.id);
  if (logs.length) {
    B.push({ p: '' }, { p: `□ 실시사항 (${logs.length}건)`, style: 'head' });
    B.push({ table: [['일자', '담당', '내용', '결과', '연결된 업무'], ...logs.map((l) => [fmtK(l.date), memberName(l.assigneeId) || '', l.content, l.result || '-', (l.taskId && findTask(l.taskId)?.title) || '-'])] });
  }
  const plans = state.db.weekly_plans.filter((p) => p.documentId === d.id);
  if (plans.length) {
    B.push({ p: '' }, { p: `□ 주간 예정사항 (${plans.length}건)`, style: 'head' });
    B.push({ table: [['일자', '담당', '내용'], ...plans.map((p) => [fmtK(p.plannedDate), memberName(p.assigneeId) || '', p.content])] });
  }
  if (d.extractedText) {
    B.push({ p: '' }, { p: '□ 원문 텍스트', style: 'head' });
    d.extractedText.split('\n').forEach((line) => B.push({ p: line }));
  }
  return B;
}

// ── 조회 도우미 ──
export const findTask = (id) => state.db.tasks.find((t) => t.id === id);
export const member = (id) => state.db.members.find((m) => m.id === id);
export const memberName = (id) => member(id)?.name || '';
export const memberFull = (id) => { const m = member(id); return m ? [m.name, m.rank].filter(Boolean).join(' ') : ''; };
export const docOf = (id) => state.db.documents.find((d) => d.id === id);
export const evidenceOf = (taskId) => state.db.task_evidence.filter((e) => e.taskId === taskId);
export const logsOf = (taskId) => state.db.daily_logs.filter((l) => l.taskId === taskId);
// 지시사항 추적: 마지막 조치 = 메모(진행 내용·조치사항)와 연결된 실시사항 중 가장 늦은 것
export function lastAction(t) {
  const list = [
    ...(t.notes || []).map((n) => ({ date: n.date, text: n.text, by: n.authorId })),
    ...logsOf(t.id).map((l) => ({ date: l.date, text: l.content, by: l.assigneeId })),
  ].filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date));
  return list[list.length - 1] || null;
}
// 미결 지시사항이 조치 없이 지난 날수 (마지막 조치가 없으면 지시일부터). 이 값 이상이면 "조치 없음"으로 표시한다.
export const STALE_DAYS = 7;
export function staleDays(t, T) {
  if (t.status === 'done') return null;
  const base = lastAction(t)?.date || t.orderDate || (t.createdAt || '').slice(0, 10);
  return isISO(base) ? diffDays(T, base) : null;
}
export const requestsOf = (taskId) => state.db.check_requests.filter((r) => r.taskId === taskId)
  .sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || ''));
export const scopeTasks = () => (state.me === 'all' ? state.db.tasks : state.db.tasks.filter((t) => t.assigneeId === state.me));
export const pendingRequestsFor = (me) => state.db.check_requests
  .filter((r) => r.state === 'pending' && (me === 'all' || r.targetId === me));
export const sortedMembers = () => [...state.db.members].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

// §7.4 실시사항 문서의 대상 기간 밖에 있는 업무
export function outOfLogPeriod(t) {
  if (!t.dueDate) return false;
  const docs = state.db.documents.filter((d) => d.docType === 'logs' && d.periodFrom && d.periodTo);
  return !docs.some((d) => t.dueDate >= d.periodFrom && t.dueDate <= d.periodTo);
}

// ── 저장 ──
export async function saveRec(table, rec) {
  const saved = defer ? stamp(rec) : await store.save(table, rec);
  const list = state.db[table];
  const i = list.findIndex((x) => x.id === saved.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  return saved;
}
export async function removeRec(table, id) {
  if (!defer) await store.remove(table, id);
  state.db[table] = state.db[table].filter((x) => x.id !== id);
}

export function newTask(fields) {
  return {
    title: '', type: 'adhoc', cycle: null, startDate: null, dueDate: null, orderDate: null, orderedBy: null,
    assigneeId: null, status: 'todo', notes: [], completedAt: null, completedMethod: null, completedBy: null,
    prevStatus: null, prevTaskId: null, autoGenerated: false, ...fields,
  };
}

// 완료 처리. 주기 업무면 다음 회차를 만든다 (§7.3).
export async function completeTask(t, { date = today(), method = 'manual' } = {}) {
  const prevStatus = t.status === 'done' ? (t.prevStatus || 'todo') : t.status;
  const task = await saveRec('tasks', {
    ...t, status: 'done', completedAt: date, completedMethod: method, completedBy: meId(), prevStatus,
  });
  let next = null;
  if (t.type === 'cycle' && t.cycle && t.dueDate && !state.db.tasks.some((x) => x.prevTaskId === t.id)) {
    next = await saveRec('tasks', newTask({
      title: t.title, type: 'cycle', cycle: t.cycle, assigneeId: t.assigneeId,
      ...nextDates(t), prevTaskId: t.id, autoGenerated: true,
    }));
  }
  return { task, next };
}

// §7.9 완료 취소
export async function uncompleteTask(t) {
  const task = await saveRec('tasks', {
    ...t, status: t.prevStatus && t.prevStatus !== 'done' ? t.prevStatus : 'todo',
    completedAt: null, completedMethod: null, completedBy: null,
  });
  // 완료 근거였던 실시사항만 연결을 푼다. 진행 기록은 그대로 둔다.
  for (const log of logsOf(t.id).filter(isDoneLog)) await saveRec('daily_logs', { ...log, taskId: null });
  const next = state.db.tasks.find((x) => x.prevTaskId === t.id);
  const out = { task };
  if (next) {
    const untouched = next.status === 'todo' && !(next.notes || []).length && !requestsOf(next.id).length;
    if (untouched) { await deleteTask(next); out.removedNext = next; } else out.keptNext = next;
  }
  return out;
}

export async function setStatus(t, status) {
  if (status === t.status) return {};
  if (status === 'done') return completeTask(t);
  if (t.status === 'done') return uncompleteTask(t);
  return { task: await saveRec('tasks', { ...t, status }) };
}

// 직접 진행중으로 바꿀 때는 진행 내용(메모)을 반드시 남긴다.
export async function startProgress(t, text) {
  if (!text) throw new Error('진행 내용을 입력하세요.');
  let res = { wasDoing: t.status === 'doing' };
  if (t.status === 'done') { res = await uncompleteTask(t); t = findTask(t.id); }
  const note = { date: today(), at: new Date().toISOString(), authorId: meId(), text, kind: 'progress' };
  const task = await saveRec('tasks', { ...t, status: 'doing', startedMethod: t.startedMethod || 'note', notes: [...(t.notes || []), note] });
  return { ...res, task };
}

export async function deleteTask(t) {
  for (const e of evidenceOf(t.id)) await removeRec('task_evidence', e.id);
  for (const l of logsOf(t.id)) await saveRec('daily_logs', { ...l, taskId: null });
  for (const r of requestsOf(t.id)) await removeRec('check_requests', r.id);
  for (const n of state.db.tasks.filter((x) => x.prevTaskId === t.id)) await saveRec('tasks', { ...n, prevTaskId: null });
  await removeRec('tasks', t.id);
}

export async function addNote(t, text) {
  const notes = [...(t.notes || []), { date: today(), at: new Date().toISOString(), authorId: meId(), text }];
  return saveRec('tasks', { ...t, notes });
}

// §7.8 실시사항 ↔ 업무 연결. 결과가 "완료"인 기록은 그 업무를 실시 일자로 완료 처리하고,
// "진행" 기록은 미착수 업무를 진행중으로 바꾼다 (완료로 만들지 않는다).
export const isDoneLog = (log) => log.result === '완료';
export async function linkLog(log, taskId) {
  if (log.taskId && log.taskId !== taskId) log = (await unlinkLog(log)).log;
  const saved = await saveRec('daily_logs', { ...log, taskId });
  const t = findTask(taskId);
  let res = {};
  if (t && isDoneLog(saved) && t.status !== 'done') res = await completeTask(t, { date: log.date, method: 'log' });
  else if (t && !isDoneLog(saved) && t.status === 'todo') res = { task: await saveRec('tasks', { ...t, status: 'doing', startedMethod: 'log' }), started: true };
  if (t && log.documentId && !evidenceOf(t.id).some((e) => e.documentId === log.documentId && e.relation === 'log')) {
    await saveRec('task_evidence', { taskId: t.id, documentId: log.documentId, location: log.location || '', text: log.raw || log.content, relation: 'log' });
  }
  return { log: saved, ...res };
}
export async function unlinkLog(log) {
  const t = findTask(log.taskId);
  const saved = await saveRec('daily_logs', { ...log, taskId: null });
  let res = {};
  const left = t ? logsOf(t.id) : [];
  if (t && t.status === 'done' && t.completedMethod === 'log' && !left.some(isDoneLog)) res = await uncompleteTask(t);
  else if (t && t.status === 'doing' && t.startedMethod === 'log' && !left.length) res = { task: await saveRec('tasks', { ...t, status: 'todo', startedMethod: null }), stopped: true };
  return { log: saved, ...res };
}
export async function deleteLog(log) {
  if (log.taskId) await unlinkLog(log);
  await removeRec('daily_logs', log.id);
}

// 기한 변경 반영 대기: 문서마다 마감일이 다르면 바로 바꾸지 않고 변경안으로 남겨 사람이 반영한다.
export async function proposeChange(t, { dueDate, documentId, location, text }) {
  const cur = t.pendingChange && t.pendingChange.dueDate === dueDate ? t.pendingChange : { dueDate, fromDue: t.dueDate, sources: [], proposedAt: new Date().toISOString() };
  const sources = [...cur.sources.filter((s) => s.documentId !== documentId), { documentId, location, text }];
  return saveRec('tasks', { ...t, pendingChange: { ...cur, sources } });
}
export async function applyChange(t) {
  const pc = t.pendingChange;
  if (!pc) return t;
  const shift = t.startDate && t.dueDate ? Math.round((Date.parse(pc.dueDate) - Date.parse(t.dueDate)) / 86400000) : 0;
  const startDate = t.startDate && shift ? new Date(Date.parse(t.startDate) + shift * 86400000).toISOString().slice(0, 10) : t.startDate;
  const note = { date: today(), at: new Date().toISOString(), authorId: meId(), text: `기한 변경 반영: ${fmtK(pc.fromDue) || '없음'} → ${fmtK(pc.dueDate)}` };
  return saveRec('tasks', { ...t, dueDate: pc.dueDate, startDate: startDate && startDate > pc.dueDate ? pc.dueDate : startDate, pendingChange: null, notes: [...(t.notes || []), note] });
}
export async function holdChange(t) {
  const pc = t.pendingChange;
  if (!pc) return t;
  const note = { date: today(), at: new Date().toISOString(), authorId: meId(), text: `기한 변경안 보류: ${fmtK(pc.dueDate)} (현재 마감 ${fmtK(t.dueDate)} 유지)` };
  return saveRec('tasks', { ...t, pendingChange: null, notes: [...(t.notes || []), note] });
}
export const pendingChanges = (tasks) => tasks.filter((t) => t.pendingChange && t.status !== 'done');

// §7.11 진행 확인 요청·답변
export async function sendRequest(t, content) {
  return saveRec('check_requests', {
    taskId: t.id, requesterId: state.me, targetId: t.assigneeId, content,
    requestedAt: new Date().toISOString(), answer: null, answeredAt: null, answeredBy: null, state: 'pending',
  });
}
// 답변만 남긴다. 업무 상태는 바꾸지 않는다 (진행중은 진행 내용·진행 기록으로만).
export async function answerRequest(req, answer) {
  return saveRec('check_requests', { ...req, answer, answeredAt: new Date().toISOString(), answeredBy: meId(), state: 'answered' });
}
export async function closeRequest(req) {
  return saveRec('check_requests', { ...req, state: 'closed', closedAt: new Date().toISOString() });
}

// 결과 알림 문구 (다음 회차 생성·삭제 안내)
export function describeResult(res) {
  const out = [];
  if (res?.started) out.push('업무를 진행중으로 바꿨습니다.');
  if (res?.stopped) out.push('진행 기록이 없어져 업무를 미착수로 되돌렸습니다.');
  if (res?.next) out.push(`다음 회차(${fmtK(res.next.dueDate)} 마감)를 자동 생성했습니다.`);
  if (res?.removedNext) out.push('자동 생성했던 다음 회차를 함께 지웠습니다.');
  if (res?.keptNext) out.push('다음 회차는 이미 손댄 상태라 남겨 두었습니다. 필요하면 직접 지우세요.');
  return out.join(' ');
}

// ── 화면 도우미 ──
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function options(map, sel, { empty } = {}) {
  const head = empty != null ? `<option value="">${esc(empty)}</option>` : '';
  return head + Object.entries(map).map(([v, l]) => `<option value="${esc(v)}" ${v === (sel ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('');
}
export function memberOptions(sel, empty = '— 담당자 미정 —') {
  const ms = sortedMembers();
  const grp = (role, label) => {
    const list = ms.filter((m) => m.role === role);
    return list.length ? `<optgroup label="${label}">${list.map((m) => `<option value="${m.id}" ${m.id === sel ? 'selected' : ''}>${esc(memberFull(m.id))}</option>`).join('')}</optgroup>` : '';
  };
  return (empty != null ? `<option value="">${esc(empty)}</option>` : '') + grp('reviewer', '전체 검토자') + grp('member', '담당 부서');
}
export function statusChip(t, T) {
  const ds = displayStatus(t, T);
  let h = `<span class="chip st-${ds}">${DISPLAY_ICON[ds]} ${DISPLAY_LABEL[ds]}</span>`;
  if (isOverdue(t, T)) h += ` <span class="chip warn">⚠ 완료 미확인</span>`;
  return h;
}
// 업무 구분 꼬리표 (달력 칩·주간 보고서). 주기 업무는 주기별로, 지시사항·수시 업무는 따로 표시한다.
export const KINDS = [['order', '지시'], ['annual', '연간'], ['quarterly', '분기'], ['monthly', '월간'], ['weekly', '주간'], ['adhoc', '수시']];
export const KIND_LABEL = Object.fromEntries(KINDS);
export const kindOf = (t) => (t.type === 'order' ? 'order' : t.type === 'cycle' ? (t.cycle || 'monthly') : 'adhoc');
export const kindTag = (t) => `<span class="kind k-${kindOf(t)}">${KIND_LABEL[kindOf(t)]}</span>`;

export function typeTag(t) {
  if (t.type === 'cycle') return `<span class="tag type-cycle">${CYCLE_LABEL[t.cycle] || ''} 주기</span>`;
  if (t.type === 'order') return `<span class="tag type-order">★ 지시사항</span>`;
  return `<span class="tag type-adhoc">${TYPE_LABEL[t.type] || '수시'}</span>`;
}
export function dueText(t, T) {
  if (!t.dueDate) return t.type === 'order' ? '마감 없음' : (t.startDate ? `시작 ${fmtK(t.startDate)}` : '일정 미정');
  return `${fmtK(t.dueDate)} <b class="dd ${t.status !== 'done' && t.dueDate < T ? 'late' : ''}">${t.status === 'done' ? '' : ddayLabel(t.dueDate, T)}</b>`;
}
export function statusSelect(t, act = 'setStatus') {
  return `<select class="mini" data-chg="${act}" data-id="${t.id}" title="상태 변경">${options(STATUS_LABEL, t.status)}</select>`;
}
export function needName() {
  if (state.me !== 'all') return false;
  toast('상단 이름 선택에서 본인 이름을 먼저 고르세요. (요청·답변에 이름이 남습니다)', 'warn', 5000);
  return true;
}
