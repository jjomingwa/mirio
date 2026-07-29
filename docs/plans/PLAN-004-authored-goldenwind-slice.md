# PLAN-004: 황금바람의 숲 수작업 월드

## 메타데이터

- 상태: `Ready`
- 생성일: 2026-07-29
- 최종 수정일: 2026-07-29
- 관련 브랜치: -
- 관련 이슈: -
- 관련 PR: -
- 관련 Goal Harness 항목: 현재 Q-011, Q-013, v2 W3 예정
- 선행 플랜: PLAN-002, PLAN-003
- 후속 플랜: PLAN-005, PLAN-006

## 요청 배경

현재 54개 stage는 seed, pace와 difficulty를 입력받는 `CourseBuilder`가 유사한
platform, enemy와 hazard 구성을 생성한다. world identity는 주로 palette,
background와 enemy type 차이에 의존한다. 새 목표는 한 world 안에서 setup,
development, twist, payoff가 명확한 50~70분 authored slice다.

## 목표

“황금바람의 숲” 한 지역을 프롤로그, 세 playable stage, 움직이는 동화 지도와
boss 진입까지 수작업으로 구성한다. 왕관 질주가 각 구간에서 새 용도를 얻고,
안전한 main route와 숙련자용 optional route가 함께 존재해야 한다.

## 사용자 관점 동작

1. 짧은 playable prologue에서 왕관의 심장과 여우 전령의 관계를 본다.
2. 바람개비 언덕에서 자유 질주와 첫 고리를 배운다.
3. 지도에서 잠든 수관이 깨어나는 모습을 확인한다.
4. 잠든 수관에서 아래쪽 안전 route와 위쪽 chain route를 선택한다.
5. 먹빛 성채에서 적, 결정과 장치를 결합한 encounter를 통과한다.
6. 세 landmark가 회복된 뒤 부서진 왕좌와 boss가 열린다.

## 범위

### 포함

- 2분 이하 playable prologue
- 바람개비 언덕, 잠든 수관, 먹빛 성채 authored stage
- landmark 기반 움직이는 동화 지도
- checkpoint, crown shard 3개, secret room 1개, mastery shortcut 1개
- stage progression과 boss unlock

### 제외

- boss encounter 내부
- 여덟 world와 54 stage conversion
- procedural variation 또는 random seed replay
- 대규모 inventory, skill tree와 economy

## 완료 조건

- [ ] first-run 예상 시간이 prologue 포함 boss 직전 35~50분이다.
- [ ] 각 stage는 setup, safe practice, development, twist, optional discovery와
      payoff beat를 하나 이상 포함한다.
- [ ] 같은 왕관 질주가 각 stage에서 서로 다른 결정에 사용된다.
- [ ] main route는 chain mastery 없이 완료할 수 있고 optional route는 3~4 chain을
      요구한다.
- [ ] circle node와 straight line으로 구성된 기존 map UI가 v2 흐름에 나타나지 않는다.
- [ ] 모든 required checkpoint, stage exit, secret와 boss unlock이 deterministic
      graph test를 통과한다.

## 현재 코드베이스 조사

### 관련 파일

- `src/game/systems/CourseBuilder.ts`: seed 기반 platform/enemy/pickup/hazard 생성
- `src/game/data/worlds.ts`, `types.ts`: 8 world, node graph와 stage pace
- `src/game/scenes/WorldMapScene.ts`: circle node, line path와 Q/E world 전환
- `src/game/scenes/LevelScene.ts`: layout rendering, enemy, pickup, checkpoint와 goal
- `src/game/data/routing.ts`: stage kind에 따른 scene 선택
- `tests/course-builder.test.ts`, `tests/worlds.test.ts`: generator와 graph invariant

### 재사용 가능한 요소

- Scene routing, checkpoint와 completion event
- save normalization과 node unlock의 기본 원리
- platform, enemy, pickup, hazard의 렌더 어댑터
- deterministic graph/unit test 구조

### 확인된 제약

- 기존 generator와 54-stage data는 삭제하지 않고 v1 legacy로 격리한다.
- authored data는 물리 좌표와 presentation cue를 분리해야 한다.
- stage 완료는 중복 호출돼도 progression을 두 번 적용하지 않아야 한다.

## 구현 방향

stage를 section 단위 TypeScript data로 작성한다. 각 section은 player purpose,
entry/exit, checkpoint, geometry, rush target, encounter, secret, camera와 cue를
명시한다. validator는 beat 순서, reachability, target reference와 progression
boundary를 검사한다.

### 콘텐츠 계약

| 구간          | 핵심 학습             | 필수 결정              | 선택 요소                 |
| ------------- | --------------------- | ---------------------- | ------------------------- |
| 프롤로그      | 이동과 왕관 연결      | 먹빛을 피해 shard 획득 | 없음                      |
| 바람개비 언덕 | 자유 질주, 고리 1~2개 | 안전한 착지 위치       | shard 1                   |
| 잠든 수관     | 3연쇄와 반사 결정     | 아래 안전길/위 지름길  | secret room, shard 2      |
| 먹빛 성채     | 적 돌파와 장치 해제   | 공격/회피 target 선택  | mastery shortcut, shard 3 |

### 지도 계약

- 네 landmark는 풍차, 거목, 성채와 왕좌다.
- 완료한 landmark는 corruption animation이 제거되고 ambient animation이 켜진다.
- 현재 위치는 여우 sprite와 gold trail로 표시한다.
- focus card는 stage 이름, 한 줄 목적과 수집 상태만 표시한다.
- locked landmark는 원형 node가 아니라 실제 가려진 지형으로 표현한다.

## 구현 단계

### 1. Authored stage schema와 validator

- 수정 예상 파일: `src/game/data/slice/`, schema와 tests
- 완료 기준: 잘못된 beat order, target reference, checkpoint와 graph가 거부된다.

### 2. LevelScene의 data-driven section adapter

- 작업: generator output 대신 authored section을 spawn/cleanup
- 완료 기준: section retry가 이전 object와 listener를 남기지 않는다.

### 3. 세 stage 제작

- 작업: 콘텐츠 계약 순서대로 greybox → final asset/cue 연결
- 완료 기준: main/optional route가 completion과 save에서 구분된다.

### 4. 동화 지도 재구축

- 수정 예상 파일: `WorldMapScene.ts`, React focus panel, slice world data
- 완료 기준: landmark와 progression animation만으로 다음 목적지가 읽힌다.

### 5. progression 통합

- 작업: stage complete, shard, secret, shortcut와 boss unlock 연결
- 완료 기준: reload/restart 후 legitimate progress만 유지된다.

## 데이터 및 상태 흐름

`AuthoredSliceStage → validator → LevelScene section loader → completion event →
slice save → map landmark state → next stage route` 순서다. 선택 수집은 main
completion과 분리해 저장한다.

## 인터페이스 변경

```ts
interface AuthoredSliceStage {
  id: SliceStageId;
  landmarkId: LandmarkId;
  sections: SliceSection[];
  entry: Point;
  exit: StageExit;
  expectedMinutes: [number, number];
}

interface SliceSection {
  id: string;
  purpose:
    "setup" | "practice" | "development" | "twist" | "discovery" | "payoff";
  checkpoint?: Point;
  geometry: GeometryRef[];
  rushTargets: RushTargetRef[];
  encounters: EncounterRef[];
  cues: CueRef[];
}
```

`WorldDefinition`과 `StageNode`는 legacy namespace에 남고 v2 scene은
`SliceWorldDefinition`과 `LandmarkDefinition`을 사용한다.

## 예외 및 경계 조건

- optional route 실패는 main checkpoint로 복귀하며 수집 상태를 잘못 지급하지 않는다.
- stage 완료와 exit animation 중 pause/restart를 누르면 한 번만 상태 전이한다.
- locked landmark에 pointer/keyboard focus가 가도 이유와 필요한 stage를 표시한다.
- secret를 찾지 않아도 boss와 ending에 도달할 수 있다.

## 성능 및 반응성

- section boundary에서 이전 offscreen object를 정리한다.
- 현재·인접 section만 physics body를 활성화한다.
- map landmark animation은 동시에 4개 이하이며 reduced-motion variant를 가진다.

## 호환성 및 마이그레이션

v1 world graph와 save는 legacy로 보존한다. v2는 별도 progression key를 사용하므로
54-stage node를 landmark로 자동 변환하지 않는다.

## 테스트 계획

### 자동 테스트

- stage schema, beat sequence와 reference integrity
- main/optional route reachability
- checkpoint, duplicate completion, secret와 boss unlock
- section cleanup object/listener baseline

### 통합 테스트

- prologue → 세 stage → boss unlock 전체 flow
- keyboard/gamepad map navigation
- reload at fresh, partial, complete와 malformed save state

### 수동 검증

- 첫 stage에서 text wall 없이 질주 용도를 이해하는지 확인
- map에서 다음 목적지와 완료 결과를 읽을 수 있는지 확인
- safe route와 mastery route가 실제로 다른 결정을 만드는지 확인

### 회귀 검증

- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build`

## 위험 요소

| 위험                              | 영향 | 가능성 | 대응                                        |
| --------------------------------- | ---- | ------ | ------------------------------------------- |
| authored data가 새 generator가 됨 | 높음 | 중간   | section별 목적과 고정 geometry를 명시       |
| 질주만 반복해 pacing이 단조로움   | 높음 | 중간   | 안전 이동, 선택, encounter와 회복 beat 교차 |
| optional route가 사실상 필수가 됨 | 중간 | 중간   | main-route-only completion fixture          |
| map이 다시 node diagram처럼 보임  | 높음 | 낮음   | landmark art와 world-state animation만 사용 |

## 미확정 사항

없음.

## 진행 상황

- [ ] schema와 validator
- [ ] section adapter
- [ ] 세 stage
- [ ] animated map
- [ ] progression과 tests

## 결정 기록

### 2026-07-29

- 결정: 절차 생성 대신 고정 authored section으로 수직 슬라이스를 만든다.
- 이유: palette, seed와 난이도만 다른 콘텐츠로는 world identity와 pacing을
  증명할 수 없다.
- 대안: 기존 CourseBuilder에 template와 biome modifier 추가.
- 영향: 콘텐츠 수는 줄지만 각 화면과 encounter의 의도를 직접 통제한다.

## 실제 변경 파일

예정 상태.

## 테스트 결과

미실행.

## 결과

미구현.

## 후속 작업

PLAN-005에서 같은 target와 cue 문법을 사용하는 boss, ending과 save를 완성한다.
