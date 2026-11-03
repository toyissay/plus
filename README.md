# 국방이음+ — 계획·실시 연계형 업무 점검 도구 (MVP)

계획 문서와 실시 기록을 한 달력에 이어 붙여, 주기 업무와 지휘관 지시사항이 끝날 때까지 놓치지 않게 하는 공유 업무 보드입니다.
- 배포 주소: https://kookbang-eum-plus.vercel.app (main에 push하면 Vercel이 자동 배포)

**교육·시연용 가상 데이터만 사용합니다.** 실제 부대 자료·실명·실제 업무 내용을 넣지 마세요.

## 구성
- 빌드 없는 정적 웹앱입니다 (HTML + CSS + JS 모듈). npm·CDN·외부 라이브러리를 쓰지 않습니다.
  - HWPX 압축 해제: 브라우저 내장 `DecompressionStream`
  - Supabase: 라이브러리 없이 REST(PostgREST)를 `fetch`로 직접 호출
- 화면 코드는 `js/store.js`의 `store.list / get / save / remove`만 씁니다. 군 업무망으로 옮길 때 이 파일의 adapter만 바꾸면 됩니다.

```
index.html            진입점
css/app.css           화면 스타일 (인쇄용 포함)
js/config.js          Supabase 주소·anon 키 (비우면 로컬 모드)
js/store.js           저장 계층 (local / supabase)
js/rules.js           업무 규칙 §7 (상태 판정, 알림 시점, 다음 회차, 숫자, 연결 후보)
js/core.js            상태와 데이터 변경 작업 (완료·완료 취소·실시사항 연결·확인 요청)
js/hwpx.js            HWPX 읽기 (ZIP → section XML → 문단·표, 병합 셀 처리)
js/extract.js         문서 종류별 추출 규칙
js/seed.js            구성원·확인 요청 (나머지 샘플 데이터는 samples/hwpx 를 가져와 만든다)
js/importer.js        문서 가져오기 처리 (화면 ③과 샘플 초기화가 같이 씀)
js/hwpxWrite.js       HWPX 만들기 (원본 없는 자료의 정리본)
js/views/*.js         화면 ①~⑤, 상세 패널, 모달
supabase/schema.sql   Supabase 테이블·정책
samples/              샘플 HWPX 생성 스크립트, 생성된 HWPX, 정답표
serve.ps1             로컬 확인용 서버 (Node/Python 불필요)
```

## 로컬에서 실행
```bash
powershell -ExecutionPolicy Bypass -File serve.ps1
```
브라우저에서 http://localhost:5173 을 엽니다. `js/config.js`가 비어 있으면 **로컬 모드**(이 브라우저에만 저장)로 동작하고 상단에 빨간 띠가 보입니다.

## Supabase 연결 (PC 간 공유)
1. Supabase에서 새 프로젝트를 만든다 (무료 요금제).
2. SQL Editor에서 `supabase/schema.sql`을 실행한다.
3. Project Settings → API에서 **Project URL**과 **anon public 키**를 복사해 `js/config.js`에 넣는다.
   - service_role 키는 절대 넣지 않는다.
4. 처음 접속하면 데이터가 비어 있으므로 샘플 데이터가 자동으로 들어간다 (샘플 HWPX 8개를 가져와 만든다).
- 가져온 HWPX 원본(5MB 이하)은 `document_files` 테이블에 보관되어, 왼쪽 [반영 자료]를 누르면 원본을 내려받는다. 원본이 없는 초기 샘플 자료는 반영된 업무·실시사항을 표로 정리한 HWPX(`js/hwpxWrite.js`로 생성)를 내려받는다.

## Vercel 배포
빌드 단계가 없는 정적 사이트입니다.
1. 이 폴더를 GitHub 저장소에 올린다 (웹에서 파일 업로드 가능).
2. Vercel → Add New Project → 저장소 선택 → Framework Preset **Other**, Build Command 비움, Output Directory 비움(루트) → Deploy.
3. 받은 공개 URL을 서로 다른 네트워크의 두 PC에서 열어, 한쪽에서 바꾼 내용이 ⟳ 새로고침 후 다른 쪽에 보이는지 확인한다.

> 로그인이 없으므로 공개 URL을 아는 누구나 데이터를 보고 바꿀 수 있습니다. 가상 데이터만 쓰세요.

## 샘플 HWPX
- `samples/hwpx/`에 8개(연간·주간·8주·기타 계획, 지난주·금주 실시사항, 회의록, 지휘관 지시사항 관리대장)가 있습니다. `지휘관지시사항관리.hwpx`는 한글에서 직접 만든 파일이라 생성 스크립트가 다시 만들지 않습니다.
- 내용을 고치려면 `samples/sample-docs.json`을 수정한 뒤 다시 만듭니다.
```bash
powershell -ExecutionPolicy Bypass -File samples\make_samples.ps1
```
- 기대 결과는 `samples/정답표.md`에 있습니다 (시연 기준일 2026-11-03, 샘플 초기화 직후 기준).
- 이 샘플은 이 도구의 읽기 규칙에 맞춘 최소 구조 HWPX입니다. 한글 2024에서 열리는 것을 확인했습니다. 실제 한글에서 만든 파일로 바꿀 때는 같은 표 머리글(업무명·담당·시작일·마감일·주기 등)과 문장 양식을 지키면 됩니다.

## 시연 순서 예시
1. ⚙ 설정 → 시연 기준일 2026-11-03 → [샘플 초기화]
2. 이름 "운용과" → 첫 화면(이번 주): 요일별 예정·실시를 보고, 나에게 온 확인 요청에 답변하고, 상태 메뉴에서 진행중을 골라 진행 내용을 적는다
3. 이름 "지휘관" → 왼쪽 [반영 자료]에서 `05_지난1주일_실시사항` 원본을 내려받아 보고, 업무 상세의 출처·실시사항과 비교한다
   (문서 가져오기 검토 화면을 보이려면 샘플을 고쳐 다시 만든 파일이나 새 HWPX를 올린다)
4. 부서 현황: 완료 미확인 업무에 [확인 요청] → [주간 보고서] → 인쇄
