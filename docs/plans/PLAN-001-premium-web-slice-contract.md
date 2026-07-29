# PLAN-001: 프리미엄 웹 수직 슬라이스 목표 계약

## 메타데이터

- 상태: `Ready`
- 생성일: 2026-07-29
- 최종 수정일: 2026-07-29
- 관련 브랜치: -
- 관련 이슈: -
- 관련 PR: -
- 관련 Goal Harness 항목: 현재 전체 계약, Q-006, Q-010~Q-014
- 선행 플랜: 없음
- 후속 플랜: PLAN-002~PLAN-006

## 요청 배경

사용자는 현재 게임 화면을 판매 가능한 품질로 볼 수 없다고 판단했고, 기존 계획을
폐기한 뒤 다음 방향을 승인했다.

- 최신 데스크톱 웹 브라우저에서 실행되는 50~70분 수직 슬라이스
- 중간 난도의 액션 플랫폼 게임
- 왕관 질주를 이동, 전투, 탐험에 공통으로 사용하는 고유 핵심 동작
- 화면에 보이는 기존 공개 에셋의 전면 교체
- 공식 출시, 가격, 구매 전환율보다 사용자가 직접 플레이할 수 있는 완성도 우선

확인된 저장소 상태는 이 방향과 아직 일치하지 않는다. 현재 `.goal/goal.json`은
USD 20 이상 상업 출시와 Steam 구매 전환율을 목표로 하며 스토어, 운영체제와
audience가 `NEEDS_USER_DECISION`이다. Q-010은 활성 상태지만 제한된 프로토타입과
독립 검토를 요구한다. 새 계획은 이 계약을 조용히 무시하지 않고 먼저 원자적으로
교체해야 한다.

## 목표

Goal Harness의 유일한 활성 목표를 “프리미엄 데스크톱 웹 수직 슬라이스”로
변경하고 이후 구현 플랜과 backlog가 같은 범위, 완료 조건과 검증 방식을 사용하게
한다.

## 사용자 관점 동작

이 플랜 자체는 게임 동작을 바꾸지 않는다. 완료 후 자동 작업 큐는 상업 퍼널이나
54스테이지 확장이 아니라 사용자가 브라우저에서 처음부터 보스와 엔딩까지 직접
플레이할 수 있는 수직 슬라이스 구현을 선택한다.

## 범위

### 포함

- 현재 상업 계약 v1의 변경 전 원문과 상태를 역사 자료로 보존
- Goal Harness 목표, gate, rubric, backlog, schema와 playbook의 v2 정합화
- `AGENTS.md`의 실행 루프와 완료 정의를 새 목표에 맞게 갱신
- 기존 Q-010 구현을 폐기하지 않고 “질주 v1 프로토타입”으로 기록
- PLAN-002~PLAN-006과 대응하는 실행 가능한 backlog 항목 생성

### 제외

- 게임, 아트, 오디오와 UI 런타임 구현
- Steam, 가격, 구매 전환율 또는 외부 cohort 검증
- 기존 evidence를 새 목표의 PASS 증거로 재사용
- 기존 사용자 코드 변경이나 저장 데이터 삭제

## 완료 조건

- [ ] 변경 전 v1 계약이 읽기 전용 archive에 그대로 보존되고 canonical source로
      사용되지 않는다.
- [ ] canonical 목표가 데스크톱 웹, Chrome/Edge, 키보드/게임패드, 중간 난도 액션
      사용자와 50~70분 수직 슬라이스를 명시한다.
- [ ] 가격, Steam, 구매 전환율과 day-14 audit이 새 목표의 완료 조건에서 제거된다.
- [ ] 새 gate와 rubric의 모든 ID, dependency와 schema reference가 유효하다.
- [ ] 새 backlog에 정확히 하나 이하의 active item이 있고 PLAN-002부터 순서대로
      선택할 수 있다.
- [ ] `npm run goal:validate`, `npm run goal:status`, `npm run goal:next`가 새 계약을
      서로 모순 없이 출력한다.
- [ ] 사용자 acceptance와 자동 증거의 역할이 구분되며 자동 테스트만으로
      “재미”나 “판매 가치”를 PASS로 만들지 않는다.

## 현재 코드베이스 조사

### 관련 구조와 파일

- `AGENTS.md`: 현재 상업 목표, 독립 검토와 번호 플랜 운영 규칙
- `.goal/goal.json`: Steam 후보와 USD 가격·전환 계약
- `.goal/gates.json`, `.goal/rubric.json`: G0~G6와 USD 24.99 품질 기준
- `.goal/backlog.json`: Q-010 active, Q-006과 Q-011~Q-014 ready
- `.goal/PLAYBOOK.md`: 상업 증거와 서명된 독립 검토 중심의 실행 절차
- `scripts/goal.mjs`, `scripts/validate-goal.mjs`: canonical 계약 검증과 상태 전이

### 재사용 가능한 요소

- PASS, FAIL, UNKNOWN truth model
- 단일 active item과 dependency 기반 선택
- 명령 결과, dirty state와 artifact hash 기록
- format, lint, unit, build와 browser 검증 tier

### 확인된 제약

- canonical 계약 파일이 서로 다르면 구현을 시작할 수 없다.
- 기존 dirty worktree 변경은 이 플랜의 산출물이 아니므로 보존한다.
- `NOTE.md`는 읽거나 사용하지 않는다.
- 사용자 수용은 제품 방향을 확정하지만 재미와 상품성을 객관적으로 증명한 것으로
  기록하지 않는다.

## 구현 방향

현재 계약을 부분 수정해 상업 gate를 빈 상태로 남기지 않는다. 변경 전 v1을
`.goal/archive/commercial-v1/`에 보존하고 canonical 문서를 version 2의 웹
수직 슬라이스 계약으로 교체한다.

새 gate는 다음 책임으로 고정한다.

1. `W0`: 목표와 지원 환경 정합성
2. `W1`: 재현 가능한 build, save와 asset 무결성
3. `W2`: 왕관 질주 조작감과 상태 정확성
4. `W3`: 수작업 월드, 탐험과 보스 진행
5. `W4`: 아트, UI, 오디오와 접근성 응집성
6. `W5`: 실제 브라우저 전체 흐름과 사용자 최종 수용

전체 상태는 W0~W4의 자동 요구사항과 W5의 사용자 최종 수용이 충족됐을 때만
완료된다. 별도 독립 검토는 필수 gate에서 제거하고 후속 상업 출시를 다시 선택할
경우 새 계약으로 재도입한다.

## 구현 단계

### 1. v1 계약 보존

- 작업 내용: 현재 canonical 목표 문서와 관련 schema를 변경 전 상태 그대로
  archive하고 archive가 런타임 source로 선택되지 않게 한다.
- 수정 예상 파일: `.goal/archive/commercial-v1/`, archive README
- 완료 판단 기준: hash와 원본 경로 목록이 기록된다.
- 검증 방법: 원본과 archive의 SHA-256 비교

### 2. v2 canonical 계약 작성

- 작업 내용: 목표, gate, rubric, backlog, schema와 playbook을 새 책임으로
  교체한다.
- 수정 예상 파일: `.goal/*.json`, `.goal/schemas/`, `.goal/PLAYBOOK.md`
- 완료 판단 기준: 모든 문서가 같은 플랫폼, audience, 범위와 완료 정의를 가진다.
- 검증 방법: schema와 relational validation

### 3. 실행 규칙과 CLI 정합화

- 작업 내용: `AGENTS.md`, validator, status와 next selection을 v2 계약에 맞춘다.
- 수정 예상 파일: `AGENTS.md`, `scripts/goal.mjs`,
  `scripts/validate-goal.mjs`, 관련 테스트
- 완료 판단 기준: commercial-only field 없이 validate/status/next가 동작한다.
- 검증 방법: CLI regression test와 실제 명령 실행

### 4. 구현 플랜 backlog 연결

- 작업 내용: PLAN-002~PLAN-006을 순서가 고정된 backlog item으로 등록한다.
- 완료 판단 기준: 질주 → 표현 → 월드 → 보스/저장 → 전체 검증 순서를 우회할 수
  없다.
- 검증 방법: dependency fixture와 `npm run goal:next`

## 데이터 및 상태 흐름

`사용자 승인 계획 → v2 goal → gate/rubric → backlog item → goal CLI 선택 →
구현 플랜` 순서다. v1 evidence는 archive에서 열람할 수 있지만 v2 상태 계산에는
입력되지 않는다.

## 인터페이스 변경

- `goal.json` version을 2로 올리고 `delivery_target`,
  `experience_contract`, `acceptance_authority`를 도입한다.
- `price_policy`, `conversion_contract`, `day_14_audit`은 canonical v2에서 제거한다.
- gate ID는 `W0`~~`W5`를 사용하며 이전 G0~~G6 evidence와 혼합하지 않는다.
- `goal status`는 구현 증거 상태와 사용자 acceptance 상태를 별도 줄로 출력한다.

## 예외 및 경계 조건

- archive 실패 또는 schema 불일치는 canonical 문서 교체 전에 작업을 중단한다.
- 기존 Q-010 코드와 테스트는 삭제하지 않고 PLAN-002 baseline으로 분류한다.
- 사용자 acceptance가 없으면 기능 검증이 성공해도 전체 상태는 `UNKNOWN`이다.
- 새 목표는 판매 가격이나 전환율을 암시하지 않는다.

## 보안 및 권한

외부 계정, 네트워크와 배포를 사용하지 않는다. archive와 canonical 파일은
workspace 안에서만 변경한다.

## 테스트 계획

### 자동 테스트

- v1/v2 schema 분리
- 중복 ID, 끊어진 dependency와 stale evidence 거부
- active item 0~1개 invariant
- commercial-only field가 status를 오염시키지 않는지 검증

### 통합 및 회귀 검증

- `npm run goal:validate`
- `npm run goal:status`
- `npm run goal:next`
- `npm test`
- `npm run format:check`

### 수동 검증

- 출력 문구가 가격, Steam 또는 구매 전환을 현재 목표로 주장하지 않는지 확인
- PLAN-002~PLAN-006과 backlog scope를 항목별 대조

## 위험 요소

| 위험                                   | 영향 | 가능성 | 대응                                   |
| -------------------------------------- | ---- | ------ | -------------------------------------- |
| v1 evidence가 v2 PASS로 잘못 승계됨    | 높음 | 중간   | version과 gate namespace를 완전히 분리 |
| AGENTS와 `.goal`이 다른 절차를 설명함  | 높음 | 중간   | 같은 변경에서 원자적으로 수정·검증     |
| harness 작업이 게임 개발보다 커짐      | 중간 | 중간   | v2에 필요한 최소 필드와 명령만 유지    |
| 사용자 acceptance가 자동 PASS로 기록됨 | 높음 | 낮음   | 명시적 사용자 기록 없이는 UNKNOWN      |

## 미확정 사항

없음. 이 계획 묶음을 기반으로 문서를 만들라는 최신 요청을 계획 승인으로 해석한다.

## 진행 상황

- [ ] v1 archive
- [ ] v2 계약과 schema
- [ ] AGENTS와 CLI 정합화
- [ ] backlog 연결
- [ ] 검증과 사용자 확인

## 결정 기록

### 2026-07-29

- 결정: 상업 목표를 부분 수정하지 않고 version 2 웹 수직 슬라이스 계약으로
  교체한다.
- 이유: 현재 가격·Steam·conversion 완료 정의와 사용자가 승인한 웹 플레이 목표는
  동시에 canonical일 수 없다.
- 대안: 상업 계약을 유지한 채 G1~G4만 진행.
- 영향: 상업 출시는 향후 별도 목표 재설정 없이는 주장하거나 실행하지 않는다.

## 실제 변경 파일

예정 상태. 구현 시 실제 파일로 갱신한다.

## 테스트 결과

미실행.

## 결과

미구현.

## 후속 작업

PLAN-002에서 왕관 질주 v2 상태 머신과 회색 상자 fixture를 구현한다.
