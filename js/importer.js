// 문서 가져오기 처리 (화면 ③의 [처리 실행]과 [샘플 초기화]가 같이 쓴다).
import { state, today, findTask, saveRec, newTask, linkLog, proposeChange, saveDocFile, meId, completeTask } from './core.js';
import { mondayOf } from './dates.js';
import { parseHwpx, sha256 } from './hwpx.js';
import { guessMeta, extractItems } from './extract.js';

// 샘플 초기화 때 가져오는 순서: 계획 문서 → 회의록(지시사항) → 실시사항(지난주 → 이번 주, 완료·진행 근거)
export const SAMPLE_FILES = [
  '01_연간_부대운영계획.hwpx',
  '04_기타_업무계획.hwpx',
  '06_주간업무_회의록.hwpx',
  '지휘관지시사항관리.hwpx',
  '02_주간_부대운영계획.hwpx',
  '03_향후8주_주간예정사항.hwpx',
  '05_지난1주일_실시사항.hwpx',
  '07_금주_일일실시사항.hwpx',
];

export const ctx = () => ({ members: state.db.members, tasks: state.db.tasks, today: today() });

// items의 처리 방법(action)대로 저장한다. 처리 결과 건수를 돌려준다.
export async function applyImport({ fileName, hash, buf, blocks, meta, items }) {
  // 문서를 먼저 저장해서 근거가 문서를 가리키게 한다
  let doc = await saveRec('documents', {
    fileName, docType: meta.docType, writtenDate: meta.writtenDate, periodFrom: meta.periodFrom,
    periodTo: meta.periodTo, hash, importedAt: new Date().toISOString(), importedBy: meId(),
    extractedText: blocks.map((b) => (b.kind === 'para' ? b.text : b.rows.map((r) => r.join(' | ')).join('\n'))).join('\n').slice(0, 30000),
  });
  // 원본 HWPX를 보관해 두면 [반영 자료]에서 그대로 내려받을 수 있다 (5MB 이하)
  if (await saveDocFile(doc, buf)) doc = await saveRec('documents', { ...doc, hasFile: true, size: buf.byteLength });
  const r = { created: 0, linked: 0, completed: 0, progressed: 0, excluded: 0, undated: 0, logs: 0, plans: 0, nexts: 0, noAssignee: 0, changes: 0 };
  const relation = meta.docType === 'minutes' ? 'order' : meta.docType === 'logs' ? 'log' : 'plan';
  for (const it of items) {
    if (it.action === 'exclude') { r.excluded++; continue; }
    if (it.kind === 'log') {
      const log = await saveRec('daily_logs', {
        date: it.date, assigneeId: it.assigneeId || null, content: it.content,
        // 사람이 고른 처리 방법이 결과를 정한다 (완료 근거 → 완료, 진행 기록 → 진행)
        result: it.action === 'complete' ? '완료' : it.action === 'progress' ? '진행' : (it.result || ''), taskId: null,
        documentId: doc.id, location: it.location, raw: it.raw,
      });
      r.logs++;
      if (it.action === 'complete' || it.action === 'progress') {
        const res = await linkLog(log, it.linkTaskId);
        if (it.action === 'complete') r.completed++; else r.progressed++;
        if (res.next) r.nexts++;
      }
      continue;
    }
    let task = null;
    if (it.action === 'new') {
      task = await saveRec('tasks', newTask({
        title: it.title, type: it.type, cycle: it.type === 'cycle' ? (it.cycle || 'monthly') : null,
        assigneeId: it.assigneeId || null, startDate: it.startDate || null, dueDate: it.dueDate || null,
        orderDate: it.type === 'order' ? it.orderDate : null, orderedBy: it.type === 'order' ? (it.orderedBy || null) : null,
      }));
      r.created++;
      if (!task.startDate && !task.dueDate && task.type !== 'order') r.undated++;
      if (!task.assigneeId) r.noAssignee++;
    } else if (it.action === 'link') {
      const cur = findTask(it.linkTaskId);
      // 기존 업무에 비어 있는 칸만 채운다
      const dueDate = cur.dueDate || it.dueDate || null;
      let startDate = cur.startDate || it.startDate || null;
      if (startDate && dueDate && startDate > dueDate) startDate = cur.startDate || null; // 문서 기간이 기존 마감보다 늦으면 채우지 않는다
      task = await saveRec('tasks', { ...cur, assigneeId: cur.assigneeId || it.assigneeId || null, dueDate, startDate });
      r.linked++;
      // 문서의 마감일이 기존과 다르면 바로 바꾸지 않고 "기한 변경 반영 대기"로 남긴다
      if (cur.dueDate && it.dueDate && !it.dueIsRange && it.dueDate !== cur.dueDate && cur.status !== 'done') {
        task = await proposeChange(task, { dueDate: it.dueDate, documentId: doc.id, location: it.location, text: it.raw });
        r.changes++;
      }
    }
    if (task && (it.docStatus || it.actionText)) task = await applyDocStatus(task, it, meta, r);
    if (task) await saveRec('task_evidence', { taskId: task.id, documentId: doc.id, location: it.location, text: it.raw, relation });
    if (it.kind === 'plan') {
      const date = it.dueDate || it.startDate;
      await saveRec('weekly_plans', { weekStart: mondayOf(date), plannedDate: date, assigneeId: it.assigneeId || null, content: it.title, documentId: doc.id });
      r.plans++;
    }
  }
  return { doc, r };
}

// 지시사항 관리대장의 완료여부·조치사항을 업무에 반영한다.
// 완료 → 대장 작성일로 완료, 진행 → 미착수였다면 진행중(진행 내용 메모를 반드시 남김), 조치사항 → 진행 내용 메모.
async function applyDocStatus(task, it, meta, r) {
  const note = (text) => ({ date: meta.writtenDate, at: new Date().toISOString(), authorId: meId(), text, kind: 'progress' });
  const notes = [...(task.notes || [])];
  if (it.actionText && !notes.some((n) => n.text.includes(it.actionText))) notes.push(note(`조치사항(관리대장): ${it.actionText}`));
  if (it.docStatus === 'done' && task.status !== 'done') {
    const saved = await saveRec('tasks', { ...task, notes });
    const res = await completeTask(saved, { date: meta.writtenDate, method: 'doc' });
    r.completed++;
    return res.task;
  }
  if (it.docStatus === 'doing' && task.status === 'todo') {
    if (!it.actionText) notes.push(note('지시사항 관리대장에 "진행"으로 기록됨'));
    r.progressed++;
    return saveRec('tasks', { ...task, notes, status: 'doing', startedMethod: 'doc' });
  }
  return notes.length !== (task.notes || []).length ? saveRec('tasks', { ...task, notes }) : task;
}

// 샘플 HWPX 한 개를 사람이 검토 없이 추천값 그대로 가져온다.
export async function importSampleFile(name, base = 'samples/hwpx/') {
  let buf;
  const embedded = globalThis.__SAMPLES__?.[name]; // 로컬판(파일 하나)은 샘플을 base64로 품고 있다
  if (embedded) {
    const bin = atob(embedded);
    buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    buf = buf.buffer;
  } else {
    const res = await fetch(base + encodeURIComponent(name), { cache: 'no-store' });
    if (!res.ok) throw new Error(`샘플 파일을 읽지 못했습니다: ${name} (${res.status})`);
    buf = await res.arrayBuffer();
  }
  const blocks = await parseHwpx(buf);
  const meta = guessMeta(name, blocks, today());
  const items = extractItems(blocks, meta, ctx());
  const out = await applyImport({ fileName: name, hash: await sha256(buf), buf, blocks, meta, items });
  return { ...out, items };
}
