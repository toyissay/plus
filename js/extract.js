// 문서 → 업무 후보 추출 (PRD §5 기능 1-1). 합의한 샘플 양식에 맞춘 규칙이며, 결과는 항상 사람이 검토한다.
import { makeDate, mondayOf, addDays, diffDays, isISO } from './dates.js';
import { findCandidates, logResult } from './rules.js';

export const DOC_TYPES = {
  annual: '연간 부대운영계획', weekly: '주간 부대운영계획', eight: '향후 8주 주간 예정사항',
  etc: '기타 업무 계획', logs: '지난 1주일 실시사항', minutes: '회의록', orderlog: '지휘관 지시사항 관리대장',
};
export const DOC_USE = {
  annual: '연간·분기·월간 주기 업무 후보', weekly: '이번 주 업무와 주간 예정사항', eight: '다가오는 업무와 준비 업무 후보',
  etc: '수시 업무 후보', logs: '일일 실시사항 + 완료 근거', minutes: '지휘관 지시사항 후보',
  orderlog: '지시사항 + 대장의 완료여부·조치사항 반영',
};

// ── 날짜 읽기 ──
function inferYear(m, d, ref) {
  const y = Number(ref.slice(0, 4));
  let best = null;
  for (const cy of [y - 1, y, y + 1]) {
    const v = makeDate(cy, m, d);
    if (v && (!best || Math.abs(diffDays(v, ref)) < Math.abs(diffDays(best, ref)))) best = v;
  }
  return best;
}
const FULL_RE = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?/g;
// 연도를 두 자리로 쓴 날짜: "26.10.31." → 2026-10-31 (세 마디가 모두 있을 때만)
const YY_RE = /(?<![\d.])(\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})(?!\d)\s*\.?/g;
const MD_RE = /(?<![\d.])(\d{1,2})\s*(?:\.|\/|월)\s*(\d{1,2})(?!\d)\s*[.일]?/g;
export function parseDates(text, ref) {
  const found = [];
  const mask = (re, fn) => (s) => s.replace(re, (m, ...g) => {
    const off = g[g.length - 2];
    const v = fn(...g);
    if (!v) return m;
    found.push({ v, i: off });
    return ' '.repeat(m.length);
  });
  const masked = mask(YY_RE, (y, mo, d) => makeDate(2000 + +y, +mo, +d))(
    mask(FULL_RE, (y, mo, d) => makeDate(+y, +mo, +d))(text || ''));
  masked.replace(MD_RE, (m, mo, d, off) => {
    const v = inferYear(+mo, +d, ref);
    if (v) found.push({ v, i: off });
    return m;
  });
  return found.sort((a, b) => a.i - b.i).map((x) => x.v);
}
const hasRange = (s) => /[~∼〜]|부터/.test(s || '');
const DATE_TOKEN_RE = /(\d{4}\s*[.\-/년]\s*)?\d{1,2}\s*(\.|\/|월)\s*\d{1,2}\s*[.일]?\s*(\([월화수목금토일]\))?/g;
const stripDates = (s) => (s || '').replace(DATE_TOKEN_RE, ' ').replace(/[~∼〜]/g, ' ');

// ── 사람·제목 정리 ──
const RANKS = ['대령', '중령', '소령', '대위', '중위', '소위', '준위', '원사', '상사', '중사', '하사', '주무관'];
export function matchMember(text, members) {
  if (!text) return null;
  // 긴 이름부터 맞춘다 ("계획 운용과장" 안의 "운용과"를 잘못 잡지 않도록)
  const hit = [...members].sort((a, b) => b.name.length - a.name.length).find((m) => text.includes(m.name));
  return hit ? hit.id : null;
}
function stripMember(text, members) {
  let s = text;
  for (const m of members) s = s.replace(new RegExp(`${m.name}\\s*(${RANKS.join('|')})?`, 'g'), ' ');
  return s;
}
const BULLET_RE = /^[\s○●◦•·\-–—▪■□◆◇※*▶]+/;
const NUM_RE = /^\(?\d{1,2}[.)]\s+/;
export function cleanTitle(s) {
  return (s || '')
    .replace(BULLET_RE, '').replace(NUM_RE, '')
    .replace(/\(([^)]*(담당|기한|까지|~|∼)[^)]*)\)/g, ' ')
    .replace(/[~∼]\s*(\d{4}\s*\.\s*)?\d{1,2}\s*[./]\s*\d{1,2}\s*\.?/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
export function cycleOf(text) {
  const s = text || '';
  if (/연간|매년|연\s*1회/.test(s)) return 'annual';
  if (/분기/.test(s)) return 'quarterly';
  if (/월간|매월|월\s*1회/.test(s)) return 'monthly';
  if (/주간|매주/.test(s)) return 'weekly';
  return null;
}

// ── 문서 종류·작성일·대상 기간 추정 (사용자가 확인·수정한다) ──
export function guessDocType(fileName, blocks) {
  const head = [fileName, ...blocks.filter((b) => b.kind === 'para').slice(0, 3).map((b) => b.text)].join(' ');
  if (/지시\s*사항\s*(관리|대장|추적)|관리\s*대장/.test(head)) return 'orderlog';
  if (/회의록/.test(head)) return 'minutes';
  if (/실시\s*사항|실시\s*결과|실적\s*보고/.test(head)) return 'logs';
  if (/8\s*주|향후/.test(head)) return 'eight';
  if (/주간\s*(부대)?\s*운영|주간\s*계획/.test(head)) return 'weekly';
  if (/연간/.test(head)) return 'annual';
  return 'etc';
}
export function guessMeta(fileName, blocks, today) {
  const docType = guessDocType(fileName, blocks);
  const paras = blocks.filter((b) => b.kind === 'para').slice(0, 8);
  let writtenDate = null;
  for (const p of paras) {
    if (/(작성|일\s*시|일\s*자|회의)/.test(p.text)) { const d = parseDates(p.text, today)[0]; if (d) { writtenDate = d; break; } }
  }
  if (!writtenDate) for (const p of paras) { const m = p.text.match(FULL_RE); if (m) { writtenDate = parseDates(m[0], today)[0]; break; } }
  // 관리대장은 작성일이 따로 없는 경우가 많다 → 표에 적힌 가장 늦은 날짜(마지막으로 적은 날)
  if (!writtenDate && docType === 'orderlog') {
    const ds = blocks.filter((b) => b.kind === 'table').flatMap((b) => b.rows.flat()).flatMap((c) => parseDates(c, today)).sort();
    writtenDate = ds[ds.length - 1] || null;
  }
  writtenDate ||= today;
  let periodFrom = null;
  let periodTo = null;
  for (const p of paras) {
    const ds = parseDates(p.text, writtenDate);
    if (ds.length >= 2 && hasRange(p.text)) { [periodFrom, periodTo] = [ds[0], ds[ds.length - 1]]; break; }
  }
  if (!periodFrom) {
    const yearHit = [fileName, ...paras.map((p) => p.text)].join(' ').match(/(20\d{2})\s*년/);
    if (docType === 'annual') {
      const y = yearHit ? yearHit[1] : writtenDate.slice(0, 4);
      [periodFrom, periodTo] = [`${y}-01-01`, `${y}-12-31`];
    } else if (docType === 'weekly') {
      periodFrom = mondayOf(addDays(writtenDate, 3)); periodTo = addDays(periodFrom, 6);
    } else if (docType === 'eight') {
      periodFrom = mondayOf(addDays(writtenDate, 3)); periodTo = addDays(periodFrom, 55);
    } else if (docType === 'logs') {
      periodTo = addDays(mondayOf(writtenDate), -1); periodFrom = addDays(periodTo, -6);
    } else if (docType === 'minutes') {
      periodFrom = writtenDate; periodTo = writtenDate;
    }
  }
  return { docType, writtenDate, periodFrom, periodTo };
}

// 연도 추정 기준: 대상 기간 가운데 → 작성일
function refDate(meta) {
  if (isISO(meta.periodFrom) && isISO(meta.periodTo)) return addDays(meta.periodFrom, Math.floor(diffDays(meta.periodTo, meta.periodFrom) / 2));
  return meta.writtenDate;
}

// ── 표 머리글 → 열 의미 ── (순서 중요: 앞에서 먼저 잡힌 의미가 우선)
const COLS = [
  ['orderDate', ['지시일자', '지시일']], ['orderedBy', ['지시자', '지시관']], ['cycle', ['주기']], ['week', ['주차']],
  ['assignee', ['담당자', '담당관', '담당', '실무자', '처리자']], ['start', ['시작일', '시작', '착수일', '착수']],
  ['status', ['완료여부', '진행상태', '처리상태', '상태']], ['action', ['조치사항', '조치내용', '조치결과', '조치']],
  ['due', ['마감일', '마감', '기한', '완료일', '완료예정', '예정일', '일자', '날짜', '일시', '기간']],
  ['result', ['결과', '실적']], ['note', ['비고']], ['kind', ['구분', '유형']],
  ['title', ['업무명', '업무내용', '예정사항', '실시사항', '실시내용', '지시내용', '내용', '업무', '과제', '항목', '지시사항']],
];
function mapHeader(row) {
  const map = {};
  row.forEach((cell, ci) => {
    const c = (cell || '').replace(/\s+/g, '');
    if (!c || c.length > 10) return;
    for (const [k, keys] of COLS) {
      if (map[k] != null) continue;
      if (keys.some((key) => c === key || c.includes(key))) { map[k] = ci; break; }
    }
  });
  return map;
}

function fromTable(tb, meta, ctx, kind, ref) {
  let h = -1;
  let map = {};
  for (let r = 0; r < Math.min(3, tb.rows.length); r++) {
    const m = mapHeader(tb.rows[r]);
    if (Object.keys(m).length >= 2 && (m.title != null || m.due != null)) { h = r; map = m; break; }
  }
  if (h < 0) return [];
  const out = [];
  for (let r = h + 1; r < tb.rows.length; r++) {
    const row = tb.rows[r];
    const cell = (k) => (map[k] != null ? (row[map[k]] || '').trim() : '');
    let title = cell('title');
    if (map.title == null) title = [...row].sort((a, b) => b.length - a.length)[0] || '';
    title = cleanTitle(title);
    if (!title || title === tb.rows[h][map.title]) continue;
    const rowText = row.join(' | ');
    const location = `표${tb.index + 1} ${r + 1}행`;
    const assigneeId = matchMember(cell('assignee'), ctx.members) || matchMember(rowText, ctx.members);
    const dueCell = cell('due');
    const dueDates = parseDates(dueCell, ref);
    let startDate = parseDates(cell('start'), ref)[0] || null;
    let dueDate = null;
    // 기간(11.9.~11.13.)으로만 적힌 행은 마감일이 아니라 예정 주간이다 → 기한 변경안을 만들지 않는다
    const dueIsRange = dueDates.length >= 2 && hasRange(dueCell);
    if (dueIsRange) { startDate ||= dueDates[0]; dueDate = dueDates[dueDates.length - 1]; } else dueDate = dueDates[0] || null;

    if (kind === 'log') {
      out.push({ kind: 'log', date: dueDate || startDate, assigneeId, content: title, result: logResult(`${cell('result') || ''} ${title}`), location, raw: rowText });
      continue;
    }
    // 지시사항 관리대장: "일자"는 지시일이고 마감은 보통 없다. 완료여부·조치사항을 함께 넘긴다.
    if (meta.docType === 'orderlog') {
      const st = cell('status').replace(/\s+/g, '');
      out.push({
        kind, type: 'order', cycle: null, title, assigneeId, startDate: null,
        dueDate: map.orderDate != null ? dueDate : null, dueIsRange: false,
        orderDate: parseDates(cell('orderDate') || dueCell, ref)[0] || meta.writtenDate,
        orderedBy: cell('orderedBy') || '지휘관',
        docStatus: /완료|종결|조치완료/.test(st) ? 'done' : st ? 'doing' : null,
        actionText: cell('action') || null,
        location, raw: rowText,
      });
      continue;
    }
    const cycle = cycleOf(cell('cycle') || cell('kind')) || cycleOf(title);
    let type = 'adhoc';
    if (meta.docType === 'minutes') type = 'order';
    // 업무명에 "주간·월간"이 들어 있다고 주기 업무로 단정하지 않는다: 연간 계획이거나 주기 열이 있을 때만
    else if (cycle && (meta.docType === 'annual' || cell('cycle'))) type = 'cycle';
    out.push({
      kind, type, cycle: type === 'cycle' ? cycle : null, title, assigneeId, startDate, dueDate, dueIsRange,
      orderDate: type === 'order' ? (parseDates(cell('orderDate'), ref)[0] || meta.writtenDate) : null,
      orderedBy: type === 'order' ? (cell('orderedBy') || null) : null,
      location, raw: rowText,
    });
  }
  return out;
}

// 실시사항 문장: "○ 10.30.(금) 군수과: 주간 차량 운행 실적 정리 완료"
function logsFromParas(paras, meta, ctx, ref) {
  const out = [];
  let cur = null;
  for (const p of paras) {
    const text = p.text.trim();
    const dates = parseDates(text, ref);
    const mid = matchMember(text, ctx.members);
    const bullet = BULLET_RE.test(text) || NUM_RE.test(text);
    const rest = stripDates(text).replace(BULLET_RE, '').replace(/[()\s:.\-]/g, '');
    if (dates.length && !mid && rest.length <= 4) { cur = dates[0]; continue; } // 날짜만 있는 소제목
    if (!mid && !bullet) continue;
    const m = mid && ctx.members.find((x) => x.id === mid);
    const colon = text.indexOf(':', m ? text.indexOf(m.name) : 0);
    let content = colon >= 0 ? text.slice(colon + 1) : stripMember(stripDates(text), ctx.members);
    content = content.replace(BULLET_RE, '').replace(/\s+/g, ' ').trim();
    if (!content) continue;
    out.push({
      kind: 'log', date: dates[0] || cur, assigneeId: mid, content,
      result: logResult(content),
      location: `${p.index + 1}번째 문단`, raw: text,
    });
  }
  return out;
}

// 회의록: "□ 사단장 지시사항" 아래 "1. 동계 안전대책 수립 보고 (담당: 1중대, ~11.15.)"
function ordersFromParas(paras, meta, ctx, ref) {
  const out = [];
  let orderDate = meta.writtenDate;
  let orderer = null;
  let inOrders = false;
  for (const p of paras) {
    const text = p.text.trim();
    if (/^(일\s*시|회의\s*일[시자]|일\s*자)\s*[:：]/.test(text)) { const d = parseDates(text, ref)[0]; if (d) orderDate = d; continue; }
    const isHeader = /^[□■◆◇◎▣]/.test(text) || (/지시\s*사항\s*$/.test(text) && text.length < 30);
    if (isHeader) {
      inOrders = /지시/.test(text);
      orderer = inOrders ? (text.replace(/^[□■◆◇◎▣\s]+/, '').replace(/(의)?\s*지시\s*사항.*$/, '').trim() || null) : null;
      continue;
    }
    if (!inOrders || !(BULLET_RE.test(text) || NUM_RE.test(text))) continue;
    const dates = parseDates(text, ref);
    out.push({
      kind: 'task', type: 'order', cycle: null, title: cleanTitle(text), assigneeId: matchMember(text, ctx.members),
      startDate: null, dueDate: dates.length ? dates[dates.length - 1] : null, orderDate, orderedBy: orderer,
      location: `${p.index + 1}번째 문단`, raw: text,
    });
  }
  return out;
}

// 표가 없는 기타 계획: 글머리표 문단을 업무 후보로
function tasksFromParas(paras, meta, ctx, kind, ref) {
  return paras.filter((p) => BULLET_RE.test(p.text) || NUM_RE.test(p.text)).map((p) => {
    const ds = parseDates(p.text, ref);
    const range = ds.length >= 2 && hasRange(p.text);
    const title = cleanTitle(stripDates(p.text).replace(/\s+/g, ' '));
    const cycle = meta.docType === 'annual' ? cycleOf(title) : null;
    return {
      kind, type: cycle ? 'cycle' : 'adhoc', cycle, title, assigneeId: matchMember(p.text, ctx.members),
      startDate: range ? ds[0] : null, dueDate: range ? ds[ds.length - 1] : (ds[0] || null),
      location: `${p.index + 1}번째 문단`, raw: p.text,
    };
  }).filter((x) => x.title);
}

// 연결 후보와 기본 처리 방법(추천)을 붙인다. 실행은 사람이 [처리 실행]을 눌러야만 된다.
export function suggest(it, ctx) {
  it.suggested = false;
  if (it.kind === 'log') {
    it.candidates = findCandidates({ text: it.content, date: it.date, assigneeId: it.assigneeId }, ctx.tasks.filter((t) => t.status !== 'done'), ctx.today);
    const best = it.candidates[0];
    // 관련 업무가 있으면 연결한다. "완료" 기록이면 완료, 아니면(또는 결과보고 경고가 있으면) 진행중으로.
    const ok = best && best.score >= 0.6;
    it.action = !ok ? 'logonly' : it.result === '완료' && !best.warn ? 'complete' : 'progress';
    it.linkTaskId = ok ? best.taskId : null;
    it.suggested = !!ok;
  } else {
    it.candidates = findCandidates({ text: it.title, date: it.dueDate, assigneeId: it.assigneeId }, ctx.tasks, ctx.today);
    const best = it.candidates[0];
    const ok = best && best.score >= 0.75 && !best.warn;
    it.action = ok ? 'link' : 'new';
    it.linkTaskId = ok ? best.taskId : null;
    it.suggested = !!ok;
  }
  return it;
}

export function extractItems(blocks, meta, ctx) {
  const ref = refDate(meta) || ctx.today;
  const kind = meta.docType === 'logs' ? 'log' : (meta.docType === 'weekly' || meta.docType === 'eight') ? 'plan' : 'task';
  const tables = blocks.filter((b) => b.kind === 'table');
  const paras = blocks.filter((b) => b.kind === 'para');
  const items = [];
  for (const tb of tables) items.push(...fromTable(tb, meta, ctx, kind, ref));
  if (meta.docType === 'logs') items.push(...logsFromParas(paras, meta, ctx, ref));
  else if (meta.docType === 'minutes') items.push(...ordersFromParas(paras, meta, ctx, ref));
  else if (!tables.length) items.push(...tasksFromParas(paras, meta, ctx, kind, ref));
  return items.map((it, i) => suggest({ ...it, key: i }, ctx));
}

// 원문에서 손으로 항목을 추가할 때
export function manualItem(text, location, meta, ctx) {
  const ref = refDate(meta) || ctx.today;
  const kind = meta.docType === 'logs' ? 'log' : (meta.docType === 'weekly' || meta.docType === 'eight') ? 'plan' : 'task';
  const ds = parseDates(text, ref);
  const assigneeId = matchMember(text, ctx.members);
  if (kind === 'log') return suggest({ kind, date: ds[0] || null, assigneeId, content: cleanTitle(stripMember(stripDates(text), ctx.members)), result: logResult(text), location, raw: text, manual: true }, ctx);
  const type = meta.docType === 'minutes' ? 'order' : 'adhoc';
  return suggest({
    kind, type, cycle: null, title: cleanTitle(stripDates(text)), assigneeId, startDate: null, dueDate: ds[ds.length - 1] || null,
    orderDate: type === 'order' ? meta.writtenDate : null, orderedBy: null, location, raw: text, manual: true,
  }, ctx);
}
