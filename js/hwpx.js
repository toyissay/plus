// HWPX 읽기: 브라우저 안에서 ZIP을 풀고 섹션 XML에서 문단과 표를 꺼낸다 (PRD §9.1).
// 외부 라이브러리 없이 브라우저 내장 DecompressionStream('deflate-raw')을 쓴다.

async function inflateRaw(data) {
  if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 최신 Chrome/Edge를 쓰세요.');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function readZip(buf) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('HWPX(압축) 구조가 아닙니다. 한글에서 "HWPX"로 저장한 파일인지 확인하세요. (HWP·PDF는 지원하지 않습니다)');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder('utf-8');
  const entries = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('압축 목록이 손상되었습니다.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true);
    const xlen = dv.getUint16(p + 30, true);
    const clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    entries[dec.decode(u8.subarray(p + 46, p + 46 + nlen))] = { method, csize, off };
    p += 46 + nlen + xlen + clen;
  }
  return {
    names: Object.keys(entries),
    async text(name) {
      const e = entries[name];
      if (!e) return null;
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return dec.decode(data);
      if (e.method === 8) return dec.decode(await inflateRaw(data));
      throw new Error('지원하지 않는 압축 방식입니다.');
    },
  };
}

const kids = (el, name) => [...el.children].filter((c) => c.localName === name);

// 문단 글자 (안쪽 표는 제외)
function paraText(p) {
  let s = '';
  const walk = (n) => {
    for (const c of n.children) {
      const ln = c.localName;
      if (ln === 'tbl') continue;
      if (ln === 't') s += c.textContent;
      else if (ln === 'tab' || ln === 'lineBreak') s += ' ';
      else walk(c);
    }
  };
  walk(p);
  return s.replace(/\s+/g, ' ').trim();
}

// 다른 표 안에 들어있지 않은 표만 찾는다
function topTables(el) {
  const out = [];
  const walk = (n) => { for (const c of n.children) { if (c.localName === 'tbl') out.push(c); else walk(c); } };
  walk(el);
  return out;
}

function parseTable(tbl) {
  const grid = [];
  const set = (r, c, v) => { (grid[r] ||= [])[c] = v; };
  kids(tbl, 'tr').forEach((tr, ri) => {
    let ci = 0;
    for (const tc of kids(tr, 'tc')) {
      const addr = kids(tc, 'cellAddr')[0];
      const span = kids(tc, 'cellSpan')[0];
      let r = ri;
      let c;
      if (addr) { c = Number(addr.getAttribute('colAddr')); r = Number(addr.getAttribute('rowAddr')); } else {
        while (grid[r]?.[ci] != null) ci++;
        c = ci;
      }
      const rs = Number(span?.getAttribute('rowSpan') || 1);
      const cs = Number(span?.getAttribute('colSpan') || 1);
      const sub = kids(tc, 'subList')[0] || tc;
      const text = kids(sub, 'p').map(paraText).filter(Boolean).join(' ');
      // 병합 셀은 가려진 칸에도 같은 값을 채워 행 단위로 읽을 수 있게 한다
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) set(r + i, c + j, text);
      ci = c + cs;
    }
  });
  const width = Math.max(0, ...grid.map((r) => (r ? r.length : 0)));
  return grid.filter(Boolean).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
}

// 결과: [{kind:'para', index, text}, {kind:'table', index, rows:[[...]]}]
export async function parseHwpx(buf) {
  const zip = readZip(buf);
  const sections = zip.names.filter((n) => /^Contents\/section\d+\.xml$/i.test(n))
    .sort((a, b) => Number(a.match(/(\d+)\.xml$/i)[1]) - Number(b.match(/(\d+)\.xml$/i)[1]));
  if (!sections.length) throw new Error('HWPX 본문(Contents/section*.xml)을 찾지 못했습니다.');
  const blocks = [];
  let pi = 0;
  let ti = 0;
  for (const name of sections) {
    const xml = await zip.text(name);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error(`${name} XML을 읽지 못했습니다.`);
    for (const p of kids(doc.documentElement, 'p')) {
      const text = paraText(p);
      if (text) blocks.push({ kind: 'para', index: pi++, text });
      for (const tbl of topTables(p)) blocks.push({ kind: 'table', index: ti++, rows: parseTable(tbl) });
    }
  }
  return blocks;
}

export async function sha256(buf) {
  if (!globalThis.crypto?.subtle) {
    // http 비보안 환경 대비 간단한 대체 식별값
    let h = 0;
    new Uint8Array(buf).forEach((b) => { h = (h * 31 + b) >>> 0; });
    return `len${buf.byteLength}-${h.toString(16)}`;
  }
  const d = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
