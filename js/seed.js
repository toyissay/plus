// 교육·시연용 가상 샘플 (PRD §12). 실제 부대명·실명·실제 업무 내용이 아니다.
// 업무·실시사항·예정사항은 모두 samples/hwpx 의 샘플 문서 6개를 가져와 만든다 (core.js resetSample).
// 여기에는 문서로 들어오지 않는 것만 둔다: 구성원, 가져온 뒤 오간 진행 확인 요청.
import { addDays } from './dates.js';

export function buildSeed(T) {
  const at = (date, hh = '09:00') => new Date(`${date}T${hh}:00+09:00`).toISOString();

  // 구성원은 사람이 아니라 직위·부서 단위다. 전체 검토자 2, 담당 부서 7.
  const members = [
    ['m1', '지휘관', 'reviewer'],
    ['m2', '계획 운용과장', 'reviewer'],
    ['u1', '운용과', 'member'],
    ['u2', '군수과', 'member'],
    ['u3', '인사과', 'member'],
    ['u4', '1중대', 'member'],
    ['u5', '2중대', 'member'],
    ['u6', '3중대', 'member'],
    ['u7', '본부중대', 'member'],
  ].map(([id, name, role], i) => ({ id, name, rank: '', position: '', role, order: i }));

  // 진행 확인 요청 (대기 2건, 답변 완료 1건). 가져온 업무를 이름으로 찾아 붙인다.
  const REQUESTS = [
    { title: '월간 안전점검 결과 보고', requesterId: 'm1', content: '월간 안전점검 결과 보고, 진행 상황 알려주세요.', requestedAt: at(addDays(T, -1), '17:10') },
    { title: '분기 동원자원 현황 보고', requesterId: 'm1', content: '분기 동원자원 현황 보고 일정 확인 바랍니다.', requestedAt: at(addDays(T, -3), '10:00'),
      answer: '자료 취합 마무리 중이며 이번 주 목요일까지 보고 예정입니다.', answeredAt: at(addDays(T, -2), '14:30') },
    { title: '월간 시설 안전점검', requesterId: 'm2', content: '시설 안전점검 일정과 점검 대상 확인 부탁합니다.', requestedAt: at(T, '08:40') },
  ];
  const requests = (tasks) => REQUESTS.map((q, i) => {
    const t = tasks.find((x) => x.title === q.title && x.status !== 'done') || tasks.find((x) => x.title === q.title);
    if (!t) return null;
    return {
      id: `cr-${i + 1}`, taskId: t.id, requesterId: q.requesterId, targetId: t.assigneeId, content: q.content, requestedAt: q.requestedAt,
      answer: q.answer || null, answeredAt: q.answeredAt || null, answeredBy: q.answer ? t.assigneeId : null, state: q.answer ? 'answered' : 'pending',
    };
  }).filter(Boolean);

  return { members, requests };
}
