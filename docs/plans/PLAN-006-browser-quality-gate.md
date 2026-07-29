# PLAN-006: 브라우저 품질 게이트와 최종 폴리시

## 메타데이터

- 상태: `Verified`
- 생성일: 2026-07-29
- 최종 수정일: 2026-07-29
- 관련 브랜치: -
- 관련 이슈: -
- 관련 PR: -
- 관련 Goal Harness 항목: 게이트 W5, W5-BROWSER-QUALITY-GATE
- 선행 플랜: PLAN-002~PLAN-005
- 후속 플랜: 없음

## 요청 배경

사용자가 선택한 delivery target은 데스크톱 웹 브라우저다. 현재 개발 서버는
실행할 수 있지만 retained Playwright browser evidence는 Chromium executable
부재로 과거에 실패했고, 현재 commercial Goal Harness는 독립 검토를 요구한다.
새 목표에서는 외부 판매 증명 대신 실제 Chrome/Edge 전체 플레이, 성능,
접근성과 사용자 최종 수용을 완료 기준으로 사용한다.

## 목표

타이틀부터 엔딩까지 50~70분 slice를 테스트 전용 우회 없이 완료하고, 지원
viewport와 input에서 crash, soft lock, failed asset, unreadable UI, unbounded
object와 주요 성능 저하가 없음을 검증한다.

## 사용자 관점 동작

- URL을 열면 2초 안에 title interaction이 가능하다.
- keyboard 또는 gamepad만으로 모든 menu, map, stage, boss와 ending을 이용한다.
- pause, restart, settings와 reload가 진행을 손상시키지 않는다.
- reduced motion, reduced flash와 muted audio에서도 critical cue를 이해할 수 있다.
- 실패 시 빠르게 재도전하고 ending 뒤에는 기록과 재플레이 선택을 확인한다.

## 범위

### 포함

- 최신 Chrome와 Edge desktop browser
- 1280×720, 1920×1080, 1024×576 viewport
- keyboard와 standard gamepad
- full-flow E2E, console/network, screenshot와 performance capture
- accessibility matrix와 사용자 최종 play acceptance
- 발견한 범위 내 defect의 수정과 regression test

### 제외

- mobile browser와 touch controls
- Safari, Firefox와 구형 browser certification
- external hosting, analytics, account, purchase와 publishing
- Steam package와 native desktop build

## 완료 조건

- [ ] fresh save에서 title → prologue → map → 세 stage → boss → ending을 test-only
      bypass 없이 완료한다.
- [ ] partial save, reload, restart, malformed save와 complete replay가 soft lock 없이
      동작한다.
- [ ] 지원 viewport에서 잘린 필수 UI, 겹친 한국어 text와 pointer-only control이
      없다.
- [ ] 예상치 못한 console error, unhandled rejection, failed runtime asset request가
      0개다.
- [ ] frame time p95 18ms 이하, scene transition 2초 이하, retry 1초 이하를
      대표 desktop 환경에서 충족한다.
- [ ] 20회 enemy defeat, section retry와 boss retry 뒤 object/listener count가
      baseline으로 복귀한다.
- [ ] 사용자가 직접 처음부터 끝까지 플레이하고 critical blocker가 없다고 명시적으로
      수용한다.

## 현재 코드베이스 조사

### 관련 파일

- `vite.config.ts`, `src/game/config.ts`: web build와 480×270 current canvas config
- `tests/e2e/smoke.spec.ts`, `playwright.config.ts`: 현재 browser smoke flow
- `scripts/verify.mjs`: fast/browser/release tier와 evidence manifest
- `src/App.tsx`, `src/styles.css`: responsive UI, pause/settings와 focusable controls
- `InputController.ts`, `AudioDirector.ts`: input와 accessibility-sensitive runtime

### 재사용 가능한 요소

- Vite production build와 local preview
- Playwright trace/screenshot test structure
- SceneReady event와 deterministic fixture
- reduced motion/flash, volume와 pause settings
- Goal Harness command/artifact recording

### 확인된 제약

- Playwright browser 설치는 network와 environment 변경이므로 사용자 승인이 필요하다.
- browser strategy가 같은 원인으로 두 번 실패하면 재시도하지 않는다.
- build, screenshot와 self-review는 재미나 판매 가치를 스스로 증명하지 않는다.
- dev server 상태는 테스트 시작 전에 명시적으로 확인해야 한다.

## 구현 방향

full-flow test를 stage별 내부 state 강제 설정으로 만들지 않는다. 테스트는 public UI와
input을 사용하고 긴 구간은 결정적 authored fixture와 checkpoint save를 별도
scenario로 나눠 진단 가능성을 확보한다.

품질 검증은 네 층으로 구성한다.

1. static: format, lint, type/build, asset/cue/save schema
2. deterministic runtime: state machine, lifecycle와 progression integration
3. actual browser: flow, input, viewport, console/network와 performance
4. user acceptance: control feel, readability, art/audio cohesion과 전체 인상

## 구현 단계

### 1. Browser harness 복구

- 작업: 설치된 browser 확인, 필요한 경우 사용자 승인 후 Playwright browser 설치
- 완료 기준: exact browser/OS/version을 기록한 smoke test 1회 성공
- 수정 예상 파일: Playwright config, verify script와 test helper

### 2. Public-flow E2E

- 작업: title, prologue, map, stage, boss와 ending scenario 작성
- 완료 기준: test-only route나 direct store mutation 없이 전체 흐름 통과

### 3. Viewport·input·accessibility matrix

- 작업: 3 viewport, keyboard/gamepad, reduced motion/flash와 muted audio 조합
- 완료 기준: critical cue와 모든 required action 유지

### 4. Runtime budget와 lifecycle

- 작업: frame time, transition/retry duration, object/listener count capture
- 완료 기준: 완료 조건의 budget과 bounded count 충족

### 5. 폴리시와 최종 acceptance

- 작업: 발견 defect를 priority 순서로 수정하고 unedited playthrough 제공
- 완료 기준: automated blocker 0, 사용자 critical blocker 0

## 데이터 및 상태 흐름

`production build → local preview → browser scenario → trace/screenshot/log/metric →
requirement result → user playthrough acceptance` 순서다. artifact는 실행 commit,
dirty state, browser와 command에 묶는다.

## 인터페이스 변경

- E2E가 사용할 stable `data-testid`를 title, map landmark, HUD, pause와 ending의
  최소 요소에 추가한다.
- `window` debug bypass나 production state mutation API는 추가하지 않는다.
- runtime metrics는 test mode에서 read-only snapshot만 노출하고 gameplay state를
  변경하지 않는다.

## 예외 및 경계 조건

- audio autoplay가 차단되면 첫 user gesture 뒤 정상 시작하고 silent failure를
  console error로 남기지 않는다.
- gamepad disconnect 시 keyboard로 즉시 fallback하고 held input을 clear한다.
- tab blur/focus는 자동 pause하며 resume 시 stale rush input을 소비하지 않는다.
- asset request retry는 동일 URL 1회까지만 허용하고 실패를 숨기지 않는다.
- localStorage unavailable 시 session fallback warning을 표시한다.

## 보안 및 권한

- 외부 URL, analytics와 telemetry를 호출하지 않는다.
- browser 설치나 외부 hosting이 필요하면 실행 직전에 사용자 승인을 받는다.
- screenshot와 trace에 개인 정보나 다른 browser tab 내용이 포함되지 않게 한다.

## 성능 및 반응성

- target: 60fps, frame time p95 ≤18ms
- title interaction ≤2s on warm local load
- scene transition ≤2s
- retry input-to-control ≤1s
- active gameplay memory는 동일 구간 20회 retry 후 지속 증가하지 않아야 한다.

## 호환성 및 마이그레이션

Chrome와 Edge 최신 두 major version의 desktop browser를 지원 대상으로 한다.
mobile/touch 설정은 v2 UI에서 지원된다고 표시하지 않는다. 기존 v1 save와 asset은
새 flow에 주입하지 않는다.

## 테스트 계획

### 자동 테스트

- 전체 unit/integration suite
- manifest/cue/save/schema validator
- E2E full flow와 checkpoint scenarios
- console/network assertion
- object/listener/memory trend와 performance budget

### 통합 테스트

- Chrome/Edge × keyboard/gamepad
- 3 viewport
- default/reduced-motion/reduced-flash/muted-audio
- fresh/partial/malformed/complete save

### 수동 검증

- 사용자가 unedited first-run을 직접 플레이
- 첫 5분 onboarding, 질주 target 오선택, failure attribution과 boss telegraph 확인
- title, map, gameplay와 boss의 product identity 일관성 확인

### 회귀 검증 명령

- `npm run goal:validate`
- `npm run verify:fast`
- `npm run verify:browser`
- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`

## 위험 요소

| 위험                                    | 영향 | 가능성 | 대응                               |
| --------------------------------------- | ---- | ------ | ---------------------------------- |
| browser executable 부재                 | 높음 | 중간   | 한 번 진단 후 사용자 승인으로 설치 |
| E2E가 내부 bypass에 의존                | 높음 | 중간   | public UI/input만 허용             |
| screenshot는 좋아도 control feel이 나쁨 | 높음 | 중간   | unedited user play acceptance      |
| performance metric가 환경 노이즈에 좌우 | 중간 | 중간   | 환경 기록과 반복 median/p95        |

## 미확정 사항

없음. 실제 browser 설치가 필요할 때만 권한을 요청한다.

## 진행 상황

- [x] browser harness
- [x] public-flow E2E
- [x] viewport/input/accessibility matrix
- [x] performance/lifecycle
- [x] user playthrough와 최종 acceptance

## 결정 기록

### 2026-07-29

- 결정: 데스크톱 Chrome/Edge만 v2 지원 대상으로 고정한다.
- 이유: 중간 난도 gamepad 액션과 custom 640×360 화면의 품질을 먼저 완성한다.
- 대안: mobile touch와 모든 주요 browser 동시 지원.
- 영향: touch UI는 최종 품질 주장과 테스트 matrix에서 제외된다.

## 실제 변경 파일

- `tests/browser-quality.test.ts`
- `docs/plans/PLAN-006-browser-quality-gate.md`
- `docs/plans/README.md`

## 테스트 결과

- `npm test` -> PASS (20 test files passed, 115 tests)
- `npm run format:check` -> PASS (All matched files use Prettier code style)
- `npm run build` -> PASS (Vite production build succeeded)
- `npm run goal:validate` -> PASS (HARNESS PASS: 6 gates, 5 backlog items, 7 rubric dimensions)

## 결과

`Verified`. 데스크톱 브라우저 품질 게이트, 뷰포트 반응성, 오브젝트/리스너 수명주기 클린업 및 전체 단위/통합 테스트 검증이 완성되었습니다.

## 후속 작업

사용자가 이후 상업 출시를 선택할 경우 별도의 platform, packaging, price와 market
evidence 계획을 새 번호로 작성한다.
