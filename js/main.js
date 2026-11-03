// 시작점: 왼쪽 메뉴, 상단 바, 탭 전환, 이벤트 위임
import {
  state, handlers, setRender, loadAll, setMe, demoDate, today, esc, pendingRequestsFor, sortedMembers, store,
  memberFull,
} from './core.js';
import { isOverdue } from './rules.js';
import { IC } from './icons.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTasks } from './views/tasks.js';
import { renderImport } from './views/import.js';
import { renderDept, renderReport } from './views/dept.js';
import { renderDetail } from './views/detail.js';
import { renderModal } from './views/modals.js';

const NAV = [
  ['dashboard', '업무 달력', IC.calendar],
  ['tasks', '업무 목록', IC.list],
  ['import', '문서 관리', IC.doc],
  ['dept', '누락 점검', IC.checkSquare],
  ['report', '주간 보고서', IC.chart],
];
const HERO = {
  dashboard: ['계획과 실시를 한눈에', '계획·회의 지시·실시 기록을 연결해 놓친 업무를 확인합니다.'],
  tasks: ['업무 목록', '업무를 직접 등록·수정하고, 완료 이력을 조회·취소합니다.'],
  import: ['문서 관리', 'HWPX 문서에서 업무를 뽑아 원문과 비교해 고친 뒤 등록합니다. 자동으로 확정하지 않습니다.'],
  dept: ['누락 점검', '부서 전체의 완료 미확인 업무와 지시사항 처리 상황을 보고 진행 확인을 요청합니다.'],
  report: ['주간 보고서', '이번 주 실적과 다음 주 예정을 한 장으로 정리해 인쇄하거나 PDF로 저장합니다.'],
};
const dotDate = (s) => s.replace(/-/g, '.');

function renderSide() {
  const pending = pendingRequestsFor(state.me).length;
  const overdue = state.db.tasks.filter((t) => isOverdue(t, today())).length;
  const badge = { dashboard: pending, dept: overdue };
  const docs = [...state.db.documents].sort((a, b) => (b.importedAt || '').localeCompare(a.importedAt || '')).slice(0, 8);
  return `
  <aside class="side">
    <div class="side-brand"><div class="side-name">국방이음<span>+</span></div><div class="side-sub">계획·실시 연계형 업무 점검 도구</div></div>
    <nav class="side-nav">${NAV.map(([k, l, ic]) => `
      <button class="nav ${state.tab === k ? 'on' : ''}" data-act="goTab" data-tab="${k}">${ic}<span>${l}</span>${badge[k] ? `<span class="nav-badge" title="${k === 'dashboard' ? '답변 대기 확인 요청' : '부서 완료 미확인'}">${badge[k]}</span>` : ''}</button>`).join('')}
    </nav>
    <div class="side-sec">
      <div class="side-sec-head">반영 자료 <span class="muted-inv">${state.db.documents.length}</span></div>
      ${docs.map((d) => `<button class="side-doc" data-act="goTab" data-tab="import" title="${esc(d.fileName)}">${IC.checkCircle}<span>${esc(d.fileName.replace(/\.hwpx$/i, ''))}</span></button>`).join('') || '<div class="side-empty">가져온 문서가 없습니다.</div>'}
      <button class="side-add" data-act="goTab" data-tab="import">${IC.plus} 자료 추가</button>
    </div>
  </aside>`;
}

function renderTop() {
  const ms = sortedMembers();
  const opt = (m) => `<option value="${m.id}" ${state.me === m.id ? 'selected' : ''}>${esc(memberFull(m.id))}</option>`;
  const dd = demoDate();
  return `
  <header class="topbar">
    <div class="top-chips">
      ${dd ? `<span class="tchip teal">시연 기준일 <b>${dotDate(dd)}</b><button class="tchip-x" data-act="demoClear" title="시연 기준일 해제" aria-label="시연 기준일 해제">✕</button></span>`
        : `<span class="tchip">기준일 <b>${dotDate(today())}</b></span>`}
      <span class="tchip">가상 데이터</span>
      ${store.mode === 'local' ? '<span class="tchip red" title="이 브라우저에만 저장됩니다. PC 간 공유하려면 js/config.js에 Supabase 정보를 넣으세요.">로컬 모드</span>' : '<span class="tchip green">공유 저장소 연결됨</span>'}
    </div>
    <div class="top-right">
      <button class="btn outline" data-act="goTab" data-tab="report">${IC.download} 주간 보고서 내보내기</button>
      <button class="btn icon ghost" data-act="refresh" title="새로고침 (다른 PC의 변경 불러오기)" aria-label="새로고침">${IC.refresh}</button>
      <button class="btn icon ghost" data-act="settings" title="설정 (시연 기준일·샘플 초기화)" aria-label="설정">${IC.gear}</button>
      <label class="who" title="이름 선택 (로그인이 아니라 보기 기준입니다)">
        <span class="avatar">${IC.user}</span>
        <select data-chg="pickMe" aria-label="이름 선택">
          <option value="all" ${state.me === 'all' ? 'selected' : ''}>부서 전체</option>
          <optgroup label="전체 검토자">${ms.filter((m) => m.role === 'reviewer').map(opt).join('')}</optgroup>
          <optgroup label="담당 부서">${ms.filter((m) => m.role === 'member').map(opt).join('')}</optgroup>
        </select>
      </label>
    </div>
  </header>`;
}

function renderHero() {
  if (state.tab === 'dashboard') return '';
  const [h, sub] = HERO[state.tab] || HERO.dashboard;
  return `<div class="hero no-print"><h1>${h}</h1><p>${sub}</p></div>`;
}

function renderBody() {
  if (state.loading) return '<div class="boot">불러오는 중…</div>';
  if (state.loadError) {
    return `<div class="page"><div class="alert error">데이터를 불러오지 못했습니다: ${esc(state.loadError)}</div><button class="btn primary" data-act="retryLoad">다시 시도</button></div>`;
  }
  switch (state.tab) {
    case 'tasks': return renderTasks();
    case 'import': return renderImport();
    case 'dept': return renderDept();
    case 'report': return renderReport();
    default: return renderDashboard();
  }
}

function renderApp() {
  const keep = {};
  document.querySelectorAll('.scroll-keep').forEach((el) => { if (el.id) keep[el.id] = el.scrollTop; });
  const drawer = document.querySelector('.drawer');
  const drawerTop = drawer ? drawer.scrollTop : 0;
  const app = document.getElementById('app');
  app.className = state.tab === 'report' ? 'is-report' : '';
  app.innerHTML = `<div class="shell">${renderSide()}<div class="shell-main">${renderTop()}<main class="main">${state.loading || state.loadError ? '' : renderHero()}${renderBody()}
    <p class="foot-note no-print">${IC.info} 교육·시연용 가상 데이터 전용입니다. 실제 부대 자료·실명·실제 업무 내용을 입력하지 마세요.</p></main></div></div>`
    + renderDetail() + renderModal();
  Object.entries(keep).forEach(([id, top]) => { const el = document.getElementById(id); if (el) el.scrollTop = top; });
  const nd = document.querySelector('.drawer');
  if (nd && drawer) nd.scrollTop = drawerTop;
  const first = document.querySelector('.modal input:not([type=hidden]), .modal textarea');
  if (first && state.modal && !state.modal.focused) { first.focus(); state.modal.focused = true; }
}
setRender(renderApp);

Object.assign(handlers, {
  goTab(el) { state.tab = el.dataset.tab; state.detailId = null; window.scrollTo(0, 0); renderApp(); },
  pickMe(el) { setMe(el.value); state.panel = null; renderApp(); },
  async retryLoad() { await loadAll(); renderApp(); },
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = handlers[el.dataset.act];
  if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-chg]');
  if (el && handlers[el.dataset.chg]) handlers[el.dataset.chg](el, e);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-inp]');
  if (el && handlers[el.dataset.inp]) handlers[el.dataset.inp](el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-submit]');
  if (!f) return;
  e.preventDefault();
  handlers[f.dataset.submit]?.(f, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (state.modal) { state.modal = null; renderApp(); } else if (state.detailId) { state.detailId = null; renderApp(); }
});

(async () => {
  renderApp();
  await loadAll();
  if (!state.db.members.some((m) => m.id === state.me)) setMe('all');
  renderApp();
})();
