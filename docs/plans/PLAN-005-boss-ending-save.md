# PLAN-005: 부서진 왕좌 보스·엔딩·저장

## 메타데이터

- 상태: `Ready`
- 생성일: 2026-07-29
- 최종 수정일: 2026-07-29
- 관련 브랜치: -
- 관련 이슈: -
- 관련 PR: -
- 관련 Goal Harness 항목: 현재 Q-012, Q-013, v2 W3 예정
- 선행 플랜: PLAN-003, PLAN-004
- 후속 플랜: PLAN-006

## 요청 배경

현재 `BossScene`은 일반 stage와 분리돼 있지만 새 수직 슬라이스의 연쇄 질주,
황금바람의 숲 문법과 custom presentation 계약을 아직 사용하지 않는다. ending은
54 stage와 162 crown 통계를 표시하므로 새 1-world 목표와 맞지 않는다. 기존 save
역시 world/node campaign 모델이다.

## 목표

왕관 질주의 고리, 적, 반사 결정과 boss seal을 모두 재조합하는 8~12분 3단계
보스전을 만들고, 수집 결과가 반영되는 ending과 versioned slice save를 완성한다.

## 사용자 관점 동작

- 세 landmark를 회복하면 지도에서 부서진 왕좌가 열린다.
- 보스는 각 단계마다 다른 cue와 player response를 요구한다.
- 패배하면 1초 안에 현재 phase 시작점에서 재도전한다.
- 승리 후 수집한 왕관 조각 수에 따라 ending의 시각과 짧은 후일담이 확장된다.
- ending에서 clear time, shard, secret와 mastery route 기록을 보고 다시 플레이할
  수 있다.

## 범위

### 포함

- “먹빛 파수관” 3-phase boss state machine과 encounter
- boss checkpoint, defeat/retry와 victory transition
- v2 slice save schema, normalization과 localStorage key
- standard/complete ending variant와 replay summary
- pause, settings, reduced motion/flash와 muted audio boss cue

### 제외

- 추가 boss, New Game+, achievement와 online leaderboard
- cloud save, account와 external telemetry
- v1 campaign save 자동 변환
- store CTA와 구매 전환 flow

## 완료 조건

- [ ] 보스는 정확히 3 phase, phase당 2 seal damage로 총 6 damage를 받는다.
- [ ] phase 1은 고리 추격, phase 2는 반사 결정, phase 3은 4연쇄와 붉은 공격 회피를
      요구한다.
- [ ] 하나의 입력 반복만으로 모든 attack을 해결하는 negative fixture가 실패한다.
- [ ] damage, phase threshold, defeat, retry와 victory가 중복·누락 없이 결정적이다.
- [ ] defeat/restart/shutdown 후 hazard, effect, listener와 time scale이 baseline으로
      복귀한다.
- [ ] save는 fresh, partial, complete, malformed와 future-version 상태에서 안전하게
      동작한다.
- [ ] shard 0~2는 standard ending, shard 3과 secret는 complete ending을 표시하지만
      둘 다 정상 clear로 기록한다.

## 현재 코드베이스 조사

### 관련 파일

- `src/game/scenes/BossScene.ts`: 기존 boss physics, health와 phase-like 진행
- `src/game/scenes/EndingScene.ts`: 54/162 campaign 통계와 기존 asset 연출
- `src/game/state/save.ts`, `store.ts`: Zod save normalization과 localStorage
- `src/game/events.ts`, `App.tsx`: HUD, pause, restart와 map return event
- `src/game/systems/FiniteEffectRegistry.ts`: effect lifetime cleanup
- `tests/save.test.ts`: malformed save와 crown invariant

### 재사용 가능한 요소

- scene lifecycle, pause/restart event
- Zod validation과 idempotent save update
- bounded effect registry
- audio crossfade와 React ending action

### 확인된 제약

- boss와 ending이 progression을 각각 쓰면 double completion 위험이 있다.
- save callback은 scene shutdown 뒤 실행돼도 상태를 변경하면 안 된다.
- red attack은 color 외 shape와 audio-independent cue를 가져야 한다.

## 구현 방향

Boss logic을 Phaser와 분리한 `BossEncounterMachine`으로 작성한다. machine은 phase,
health, attack, vulnerability, retry checkpoint와 terminal state를 소유하고 Scene은
spawn, movement, collision과 presentation command만 실행한다.

### Phase 계약

1. 바람의 추격: 이동하는 고리 2개를 연결해 뒤쪽 seal을 타격한다. sweeping wind는
   jump 또는 고리 높이 선택으로 피한다.
2. 깨진 거울: 보스가 armored 상태에서 projectile을 발사한다. 반사 결정을 향해
   질주해 projectile 방향을 바꾸고 seal을 노출한다.
3. 왕관 폭풍: red ground wave와 air ring route가 교대한다. 4연쇄를 성공하면
   final seal이 열리고 자유 질주로 마무리한다.

각 phase는 setup attack 한 번을 damage 없이 보여 준 뒤 실제 damage window를
연다.

## 구현 단계

### 1. Boss state machine

- 수정 예상 파일: 신규 boss system, pure tests
- 완료 기준: illegal transition, unreachable phase와 repeated terminal event가 없다.

### 2. Scene encounter와 presentation

- 수정 예상 파일: `BossScene.ts`, PLAN-003 asset/cue manifest
- 완료 기준: 모든 attack에 distinct telegraph, response와 recovery가 있다.

### 3. Slice save v2

- 수정 예상 파일: `save.ts`, store와 save tests
- 작업: 별도 key `crowntrail.slice.v2`, version, stage, shard, secret, best time,
  settings 저장
- 완료 기준: duplicate grant와 malformed inflation이 없다.

### 4. Ending과 replay summary

- 수정 예상 파일: `EndingScene.ts`, React ending panel
- 완료 기준: standard/complete variant와 다시 플레이 flow가 동작한다.

### 5. Lifecycle 통합

- 작업: pause, defeat, retry, victory, shutdown과 audio/time scale cleanup
- 완료 기준: 20회 retry 후 object/listener count가 baseline과 같다.

## 데이터 및 상태 흐름

`BossEncounterMachine → Scene command → collision result → machine resolve →
VictoryEvent → saveCompleteOnce → EndingScene/React summary` 순서다. save write는
victory event ID를 idempotency key로 사용한다.

## 인터페이스 변경

```ts
interface SliceSaveV2 {
  version: 2;
  currentStageId: SliceStageId;
  completedStageIds: SliceStageId[];
  collectedShardIds: ShardId[];
  discoveredSecretIds: SecretId[];
  bestClearMs?: number;
  settings: GameSettings;
}

type BossPhase = "wind-chase" | "broken-mirror" | "crown-storm";
type BossState =
  "intro" | "attacking" | "vulnerable" | "transition" | "defeated" | "shutdown";
```

## 예외 및 경계 조건

- victory와 player death가 같은 frame에 발생하면 victory를 우선하고 death를
  무시한다.
- phase transition 중 pause는 timer를 소비하지 않는다.
- future save version은 덮어쓰지 않고 safe fresh session과 경고를 사용한다.
- localStorage quota 또는 write failure는 플레이를 막지 않고 session memory와
  non-blocking warning으로 fallback한다.
- complete ending 조건은 secret가 없어도 shard 3개로 충족하며 secret는 후일담만
  확장한다.

## 성능 및 반응성

- boss hazard active cap 24, transient VFX cap 32
- retry input부터 player control까지 1초 이하
- phase transition cut은 reduced-motion 400ms, 기본 1200ms 이하

## 호환성 및 마이그레이션

v1 save key는 읽기 전용으로 보존한다. v2는 설정값만 안전하게 가져오고 world,
node, crown total은 변환하지 않는다.

## 테스트 계획

### 자동 테스트

- phase/attack transition, health와 damage bound
- one-response negative fixture
- simultaneous death/victory와 duplicate event
- save normalization, idempotency, future version과 quota fallback
- 20회 retry lifecycle baseline

### 통합 테스트

- 세 stage completion → boss unlock → defeat/retry → victory → ending
- standard와 complete ending fixture
- pause/settings/reduced motion/flash/muted audio matrix

### 수동 검증

- attack telegraph와 요구 response를 설명 없이 구분하는지 확인
- phase escalation과 victory feedback이 충분한지 확인
- ending이 수집 결과를 명확히 보상하는지 확인

### 회귀 검증

- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build`

## 위험 요소

| 위험                         | 영향 | 가능성 | 대응                                 |
| ---------------------------- | ---- | ------ | ------------------------------------ |
| 보스가 일반 질주 시험의 반복 | 높음 | 중간   | phase별 다른 target와 response 계약  |
| telegraph가 art에 묻힘       | 높음 | 중간   | silhouette/shape/audio 대체 cue 검증 |
| victory가 중복 저장됨        | 높음 | 낮음   | idempotency event ID와 pure machine  |
| save v2가 기존 진행을 파괴   | 높음 | 낮음   | 별도 key, v1 read-only               |

## 미확정 사항

없음.

## 진행 상황

- [ ] boss machine
- [ ] three phases
- [ ] save v2
- [ ] ending variants
- [ ] lifecycle와 tests

## 결정 기록

### 2026-07-29

- 결정: boss health는 6 seal damage, phase마다 2 damage로 고정한다.
- 이유: 8~12분 encounter에서 pattern 학습, 실행과 escalation을 명확히 나눈다.
- 대안: 연속 HP bar와 자유 damage.
- 영향: 모든 damage window와 retry checkpoint를 결정적으로 테스트할 수 있다.

## 실제 변경 파일

예정 상태.

## 테스트 결과

미실행.

## 결과

미구현.

## 후속 작업

PLAN-006에서 전체 브라우저 흐름, 성능, 접근성과 사용자 acceptance를 검증한다.
