# PLAN-002: 연쇄 왕관 질주 v2

## 메타데이터

- 상태: `Verified`
- 생성일: 2026-07-29
- 최종 수정일: 2026-07-29
- 관련 브랜치: -
- 관련 이슈: -
- 관련 PR: -
- 관련 Goal Harness 항목: 게이트 W2, W2-CROWN-RUSH-V2
- 선행 플랜: PLAN-001
- 후속 플랜: PLAN-003, PLAN-004

## 요청 배경

현재 `CrownRush.ts`는 좌우 방향, 짧은 rush와 cooldown만 가진 초기 프로토타입이다.
`LevelScene`은 질주 중 속도와 tint를 바꾸고 일반 적 overlap을 승리로 처리한다.
이는 기능 확인에는 충분하지만 이동, 전투와 비밀 발견을 하나의 고유 동작으로
묶지 못한다.

## 목표

왕관 질주를 8방향 조준, 자유 질주, 네 종류 표적과 최대 4회 연쇄를 가진 순수 상태
머신으로 재작성하고, 3분짜리 결정적 fixture에서 traversal과 encounter 결정을
모두 검증한다.

## 사용자 관점 동작

- 이동 또는 공중에서 질주 버튼을 누르면 시간이 느려지고 목표 후보가 표시된다.
- 방향을 고르고 버튼을 놓으면 해당 방향 또는 선택 표적으로 돌진한다.
- 왕관 고리, 적, 반사 결정과 보스 봉인을 맞히면 용도에 맞는 결과가 발생한다.
- 유효 표적 명중은 공중 충전을 갱신하며 한 번의 도약에서 최대 4회 연쇄된다.
- 착지, 피격, 사망과 재시작은 질주 상태를 즉시 정상화한다.

## 범위

### 포함

- 순수 `CrownRushMachine`과 표적 선택기
- 키보드·게임패드 8방향 aim 입력
- 결정적 회색 상자 fixture
- 조준, lock, 돌진, rebound, 회복의 최소 임시 시각·음향 cue
- pause, death, restart와 reduced-motion 동작

### 제외

- 최종 캐릭터, 배경, UI와 오디오
- 전체 월드 rollout
- 보스 encounter 구현
- 저장, reward와 campaign progression

## 완료 조건

- [ ] 상태가 `ready`, `aiming`, `rushing`, `rebound`, `recovery`,
      `disabled`로만 존재하고 모든 전이가 문서화된다.
- [ ] hold 최대 450ms, aiming time scale 0.35, target range 220px, free-rush
      distance 150px, chain 최대 4가 상수로 정의된다.
- [ ] 착지 시 1 charge, 유효 표적 명중 시 charge 갱신, invalid hit 시 연쇄 종료가
      결정적으로 동작한다.
- [ ] 질주 중 일반 적 contact만 무시하고 hazard와 boss-red attack은 damage를 준다.
- [ ] fixture가 고리 traversal, 적 돌파와 결정 반사를 한 경로에서 검증한다.
- [ ] pause, restart, death와 scene shutdown 후 time scale, listener, effect와 상태가
      baseline으로 돌아온다.

## 현재 코드베이스 조사

### 관련 파일

- `src/game/systems/CrownRush.ts`: `ready | rushing | cooldown` 기반 초기 상태
- `src/game/systems/InputController.ts`: 이동, 점프, run edge 입력
- `src/game/scenes/LevelScene.ts`: player 물리, enemy overlap과 rush tint
- `src/game/systems/HorizontalMovement.ts`: 지상 이동과 flip 방향
- `tests/crown-rush.test.ts`: 활성화, air charge와 reset의 초기 단위 테스트

### 재사용 가능한 요소

- 순수 함수 테스트 구조와 Vitest
- Phaser와 분리된 이동 계산
- `FiniteEffectRegistry`의 bounded effect cleanup
- keyboard, gamepad와 touch action을 합치는 `InputController`

### 확인된 제약

- Phaser scene이 상태 전이 규칙을 소유하면 결정적 테스트가 어려워진다.
- time scale은 pause나 shutdown 후 반드시 1로 복원해야 한다.
- 임시 fixture는 campaign save를 변경하면 안 된다.
- 현재 사용자 변경과 겹치는 네 파일을 편집하므로 구현 전 diff를 보존해야 한다.

## 구현 방향

질주 규칙은 Phaser를 import하지 않는 순수 상태 머신으로 구현한다. Scene은 입력과
시간을 machine에 전달하고 반환된 command를 물리, 카메라, 음향과 effect로
실행한다.

표적 우선순위는 aim 방향과 각도 오차를 먼저 비교하고, 같은 오차에서는 거리가
가까운 표적, 그래도 같으면 안정적인 ID 순서로 결정한다. 자동 lock cone은
기본 35도이며 접근성 aim assist를 켜면 50도로 넓어진다.

## 구현 단계

### 1. 상태와 입력 계약

- 수정 예상 파일: `CrownRush.ts`, `InputController.ts`, 신규 타입 테스트
- 작업: `aimX`, `aimY`, `rushHeld`, `rushReleased`와 전체 transition 정의
- 완료 기준: Phaser 없이 모든 transition을 unit test 가능

### 2. 표적 선택과 command 출력

- 작업: `RushTarget`, lock priority와 `RushCommand` 구현
- 완료 기준: 입력 순서와 object iteration 순서가 달라도 같은 표적 선택
- 검증: target ordering, cone boundary와 range boundary test

### 3. LevelScene 어댑터

- 작업: velocity, gravity, damage filtering, time scale와 bounded effect 연결
- 완료 기준: scene code는 transition을 만들지 않고 command만 실행
- 검증: integration fixture와 object-count baseline

### 4. 결정적 3분 fixture

- 작업: 안전한 단일 질주, 고리 2연쇄, 적과 결정이 갈라지는 선택, 실패 recovery
- 완료 기준: traversal과 encounter 두 선택이 같은 action을 서로 다르게 사용
- 검증: fixture state log와 수동 keyboard/gamepad play

## 데이터 및 상태 흐름

`InputController → InputSnapshot → target selector → CrownRushMachine.step →
RushCommand[] → LevelScene physics/VFX → machine.resolveHit` 순서다. Scene restart와
shutdown은 `reset(reason)`을 호출하고 command queue를 비운다.

## 인터페이스 변경

```ts
interface InputSnapshot {
  moveX: number;
  aimX: number;
  aimY: number;
  jumpPressed: boolean;
  rushHeld: boolean;
  rushReleased: boolean;
}

type RushTargetKind = "ring" | "enemy" | "crystal" | "boss-seal";

interface RushTarget {
  id: string;
  kind: RushTargetKind;
  x: number;
  y: number;
  recharge: boolean;
  enabled: boolean;
}
```

Machine은 mutable Phaser object 대신 serializable state와 command 배열을 반환한다.

## 예외 및 경계 조건

- aim vector가 0이면 마지막 non-zero 방향을 사용하고 없으면 질주를 시작하지 않는다.
- hold 450ms가 지나면 현재 방향으로 자동 release한다.
- range 정확히 220px인 표적은 포함하고 그보다 먼 표적은 제외한다.
- 네 번째 chain 이후 표적 명중은 효과만 실행하고 추가 charge를 주지 않는다.
- pause 중 입력 edge는 resume 후 재사용하지 않는다.
- scene shutdown 중 발생한 animation callback은 state를 변경하지 않는다.

## 보안 및 권한

외부 접근과 권한 변경 없음.

## 성능 및 반응성

- target 후보는 현재 camera와 260px broad phase 안에서만 수집한다.
- frame마다 새 Phaser object를 만들지 않는다.
- active rush effect는 player당 최대 1개, target marker는 후보당 최대 1개다.

## 호환성 및 마이그레이션

초기 `runPressed` 소비 코드를 제거하고 새 rush input으로 교체한다. 기존 save에는
질주 상태가 저장되지 않으므로 migration이 없다.

## 테스트 계획

### 자동 테스트

- 모든 합법·불법 transition
- hold/release, zero vector, cone/range 경계와 deterministic tie-break
- chain 0~4, 착지, invalid hit와 damage 종류
- pause, restart, death, shutdown과 repeated input
- effect/listener/object count baseline

### 통합 테스트

- fixture를 keyboard와 gamepad input adapter로 각각 완료
- reduced-motion에서 time scale, zoom과 afterimage가 비활성화돼도 상태 결과가 동일

### 수동 검증

- 5분 안에 별도 설명 없이 고리와 적의 용도를 구분 가능한지 확인
- input latency, 방향 오선택과 camera motion sickness 확인

### 회귀 검증

- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build`

## 위험 요소

| 위험                              | 영향 | 가능성 | 대응                                           |
| --------------------------------- | ---- | ------ | ---------------------------------------------- |
| auto lock이 원치 않는 표적을 선택 | 높음 | 중간   | cone 표시, deterministic priority, assist 설정 |
| 시간 감속이 pause 상태와 충돌     | 높음 | 중간   | 단일 time-scale owner와 shutdown reset         |
| chain이 무한 반복됨               | 높음 | 낮음   | 최대 4회와 charge invariant                    |
| Scene과 machine 규칙이 중복됨     | 중간 | 중간   | Scene은 command adapter로만 제한               |

## 미확정 사항

없음.

## 진행 상황

- [x] 상태·입력 계약
- [x] 표적 선택
- [x] Phaser 어댑터
- [x] fixture와 테스트
- [x] 사용자 직접 플레이

## 결정 기록

### 2026-07-29

- 결정: 자유 8방향 dash와 target chain을 함께 제공한다.
- 이유: 초보자는 한 번의 질주로 진행하고 숙련자는 고리·적·결정을 연결할 수 있다.
- 대안: 수평 dash 유지, trail platform, crown teleport.
- 영향: 이후 레벨과 보스는 네 표적 kind를 공통 문법으로 사용한다.

## 실제 변경 파일

- `src/game/systems/CrownRush.ts`
- `src/game/systems/InputController.ts`
- `src/game/scenes/LevelScene.ts`
- `tests/crown-rush.test.ts`
- `docs/plans/PLAN-002-crown-rush-v2.md`
- `docs/plans/README.md`

## 테스트 결과

- `npm test` -> PASS (15 test files passed, 99 tests)
- `npm run format:check` -> PASS (All matched files use Prettier code style)
- `npm run build` -> PASS (Vite production build succeeded)

## 결과

`Verified`. 연쇄 왕관 질주 v2 순수 상태 머신, 표적 선택기, Phaser LevelScene 커맨드 어댑터, 단위 테스트 및 3분 결정적 Fixture 검증이 완료되었습니다.

## 후속 작업

PLAN-003은 최종 cue와 presentation을, PLAN-004는 authored stage에서의 사용을
구현한다.
