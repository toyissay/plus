// 저장 계층. 화면 코드는 Supabase를 직접 부르지 않고 이 store만 쓴다 (PRD §8.2).
// 군 업무망으로 옮길 때는 adapter 하나만 내부 서버용으로 바꾸면 된다.
import { CONFIG } from './config.js';

export const TABLES = ['members', 'documents', 'tasks', 'task_evidence', 'weekly_plans', 'daily_logs', 'check_requests'];
// 원본 파일(base64)은 크기가 커서 처음에 모두 읽지 않고, 내려받을 때만 store.get으로 읽는다.
export const FILE_TABLE = 'document_files';

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function localAdapter() {
  const KEY = 'tracker.db.v3'; // v3: 구성원을 지휘관·과·중대 단위로 변경
  const load = () => {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  };
  const persist = (db) => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (e) { throw new Error('브라우저 저장 공간에 쓸 수 없습니다 (' + e.message + ')'); }
  };
  // 원본 파일은 크기가 커서 업무 데이터와 한 덩어리로 두지 않고 파일마다 따로 저장한다
  // (가득 차도 업무 저장은 계속되도록).
  const FK = 'tracker.file.';
  const fileKeys = () => Object.keys(localStorage).filter((k) => k.startsWith(FK));
  const files = {
    async list() { return fileKeys().map((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }).filter(Boolean); },
    async get(id) { try { return JSON.parse(localStorage.getItem(FK + id)); } catch { return null; } },
    async save(rec) {
      try { localStorage.setItem(FK + rec.id, JSON.stringify(rec)); } catch (e) { throw new Error('브라우저 저장 공간이 부족해 원본 파일을 보관하지 못했습니다 (' + e.message + ')'); }
      return rec;
    },
    async remove(id) { localStorage.removeItem(FK + id); },
    async clear() { fileKeys().forEach((k) => localStorage.removeItem(k)); },
  };
  return {
    mode: 'local',
    async list(t) { return t === FILE_TABLE ? files.list() : Object.values(load()[t] || {}); },
    async get(t, id) { return t === FILE_TABLE ? files.get(id) : (load()[t] || {})[id] || null; },
    async save(t, rec) { if (t === FILE_TABLE) return files.save(rec); const db = load(); (db[t] ||= {})[rec.id] = rec; persist(db); return rec; },
    async saveMany(t, recs) { if (t === FILE_TABLE) { for (const r of recs) await files.save(r); return; } const db = load(); db[t] ||= {}; recs.forEach((r) => { db[t][r.id] = r; }); persist(db); },
    async remove(t, id) { if (t === FILE_TABLE) return files.remove(id); const db = load(); if (db[t]) delete db[t][id]; persist(db); },
    async clear(t) { if (t === FILE_TABLE) return files.clear(); const db = load(); db[t] = {}; persist(db); },
  };
}

// Supabase REST(PostgREST)를 fetch로 직접 호출한다. 각 테이블은 (id text, data jsonb) 구조. supabase/schema.sql 참고.
function supabaseAdapter(url, key) {
  const base = url.replace(/\/+$/, '') + '/rest/v1/';
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  async function req(path, opts = {}) {
    let res;
    try {
      res = await fetch(base + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    } catch (e) {
      throw new Error('공유 저장소에 연결할 수 없습니다 (네트워크 확인)');
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`공유 저장소 오류 ${res.status} ${txt.slice(0, 160)}`);
    }
    const txt = await res.text();
    return txt ? JSON.parse(txt) : null;
  }
  const row = (r) => ({ id: r.id, data: r, updated_at: new Date().toISOString() });
  const upsert = (t, rows) => req(`${t}?on_conflict=id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  return {
    mode: 'supabase',
    async list(t) {
      const out = [];
      const page = 1000;
      for (let from = 0; ; from += page) {
        const rows = await req(`${t}?select=id,data&order=id&limit=${page}&offset=${from}`);
        out.push(...rows.map((r) => ({ ...r.data, id: r.id })));
        if (rows.length < page) break;
      }
      return out;
    },
    async get(t, id) {
      const rows = await req(`${t}?select=id,data&id=eq.${encodeURIComponent(id)}`);
      return rows[0] ? { ...rows[0].data, id: rows[0].id } : null;
    },
    async save(t, rec) { await upsert(t, [row(rec)]); return rec; },
    async saveMany(t, recs) {
      for (let i = 0; i < recs.length; i += 500) await upsert(t, recs.slice(i, i + 500).map(row));
    },
    async remove(t, id) { await req(`${t}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); },
    async clear(t) { await req(`${t}?id=not.is.null`, { method: 'DELETE' }); },
  };
}

const adapter = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey
  ? supabaseAdapter(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey)
  : localAdapter();

export function stamp(rec) {
  const now = new Date().toISOString();
  return { ...rec, id: rec.id || uid(), createdAt: rec.createdAt || now, updatedAt: now };
}

export const store = {
  mode: adapter.mode,
  async list(table, filter) {
    const rows = await adapter.list(table);
    if (!filter) return rows;
    return rows.filter((r) => Object.entries(filter).every(([k, v]) => r[k] === v));
  },
  get: (table, id) => adapter.get(table, id),
  save: (table, data) => adapter.save(table, stamp(data)),
  saveMany: (table, list) => adapter.saveMany(table, list.map(stamp)),
  remove: (table, id) => adapter.remove(table, id),
  clear: (table) => adapter.clear(table),
};
