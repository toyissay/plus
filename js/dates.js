// 날짜는 모두 'YYYY-MM-DD' 문자열(Asia/Seoul 날짜 단위)로 다룬다 (PRD §7.5).
const DAY = 86400000;
export const pad = (n) => String(n).padStart(2, '0');

export function realToday() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  }
}

export const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
export function parseD(s) { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }
const fmtMs = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => fmtMs(parseD(s) + n * DAY);
export const diffDays = (a, b) => Math.round((parseD(a) - parseD(b)) / DAY); // a - b
export const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1~12
export const dow = (s) => new Date(parseD(s)).getUTCDay(); // 0=일
export const mondayOf = (s) => addDays(s, -((dow(s) + 6) % 7));

export function makeDate(y, m, d) {
  if (!(m >= 1 && m <= 12) || !(d >= 1 && d <= lastDayOfMonth(y, m))) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 월말 마감은 다음 회차도 월말로 맞춘다 (11/30 → 12/31 → 1/31 → 2/28)
export function addMonths(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const isLast = d === lastDayOfMonth(y, m);
  const t = m - 1 + n;
  const ny = y + Math.floor(t / 12);
  const nm = ((t % 12) + 12) % 12 + 1;
  const nd = isLast ? lastDayOfMonth(ny, nm) : Math.min(d, lastDayOfMonth(ny, nm));
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

let refYear = Number(realToday().slice(0, 4));
export function setRefYear(y) { refYear = Number(y); }

const WD = '일월화수목금토';
export function fmtK(s, { year } = {}) {
  if (!isISO(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  const showYear = year ?? y !== refYear;
  return `${showYear ? y + '.' : ''}${m}.${d}.(${WD[dow(s)]})`;
}
export function fmtTime(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
  } catch { return iso.slice(0, 16).replace('T', ' '); }
}

// 공휴일: 공휴일 API를 쓰지 않고 코드에 직접 넣는다 (PRD §9.1). 2026~2027년.
export const HOLIDAYS = {
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절', '2026-03-02': '대체공휴일', '2026-05-05': '어린이날', '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일', '2026-06-03': '지방선거일', '2026-06-06': '현충일', '2026-08-15': '광복절',
  '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절', '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '성탄절',
  '2027-01-01': '신정', '2027-02-05': '설날 연휴', '2027-02-06': '설날', '2027-02-07': '설날 연휴',
  '2027-02-08': '대체공휴일', '2027-03-01': '삼일절', '2027-05-05': '어린이날', '2027-05-13': '부처님오신날',
  '2027-06-06': '현충일', '2027-08-15': '광복절', '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴',
  '2027-09-15': '추석', '2027-09-16': '추석 연휴', '2027-10-03': '개천절', '2027-10-04': '대체공휴일',
  '2027-10-09': '한글날', '2027-10-11': '대체공휴일', '2027-12-25': '성탄절', '2027-12-27': '대체공휴일',
};
