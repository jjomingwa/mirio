# PLAN-003: 오리지널 아트·UI·오디오 재구축

## 메타데이터

- 상태: `Ready`
- 생성일: 2026-07-29
- 최종 수정일: 2026-07-29
- 관련 브랜치: -
- 관련 이슈: -
- 관련 PR: -
- 관련 Goal Harness 항목: 현재 Q-014, Q-006, v2 W4 예정
- 선행 플랜: PLAN-001, PLAN-002
- 후속 플랜: PLAN-004, PLAN-005

## 요청 배경

현재 화면은 여러 공개 에셋 팩, Phaser bitmap-scale text, 단순 도형 node와 tint를
한 장면에서 혼용한다. 같은 background와 sprite를 색만 바꿔 여러 world에
재사용하므로 한 화면 안에서도 픽셀 밀도, 광원, 색과 UI 언어가 일치하지 않는다.
사용자는 최종 화면 에셋의 전면 교체를 선택했다.

## 목표

640×360 동화풍 16비트 화면을 기준으로 타이틀, 지도, 플레이, 보스의 네 key screen을
먼저 확정하고 주인공, 적, 환경, UI, VFX와 audio를 하나의 identity bible과
asset manifest로 제작한다.

## 사용자 관점 동작

- 타이틀부터 엔딩까지 같은 왕관 문양, gold trail과 ink corruption 언어가 반복된다.
- 정상 요소와 위험 요소, 질주 표적과 배경 장식이 실루엣만으로 구분된다.
- 한국어 UI는 확대된 pixel text가 아니라 브라우저 해상도에서 선명하게 표시된다.
- action의 준비, lock, 성공, 실패를 color 외에 shape, motion과 sound로도 구분한다.

## 범위

### 포함

- art/narrative/audio identity bible
- runtime 화면에 사용되는 custom visual asset 전체
- 타이틀 logo와 React DOM UI component/style
- 탐험, 성채와 보스에서 공유하는 musical motif와 SFX family
- source, 생성 방식, 수정 이력과 hash를 기록하는 asset manifest

### 제외

- stage collision과 encounter logic
- storefront capsule, trailer와 marketing copy
- 8개 world용 asset production
- 기존 third-party asset의 상업 clearance 주장

## 완료 조건

- [ ] 타이틀, 동화 지도, 일반 플레이와 보스 key screen 4장이 같은 palette, pixel
      density, silhouette와 lighting rule을 만족한다.
- [ ] 최종 runtime path에서 Sunny Land와 Sideview Fantasy visual key를 참조하지
      않는다.
- [ ] 모든 신규 asset은 source와 runtime 파일, 제작 방식, 수정자, hash가 연결된다.
- [ ] player, enemy, target, hazard와 interactable이 grayscale silhouette에서도
      구분된다.
- [ ] 중요한 상태는 color, motion 또는 audio 한 채널에만 의존하지 않는다.
- [ ] 1280×720, 1920×1080과 narrow desktop viewport에서 UI text가 겹치거나
      bitmap blur가 발생하지 않는다.

## 현재 코드베이스 조사

### 관련 파일

- `src/game/scenes/BootScene.ts`: 여러 asset pack과 background key load
- `src/game/scenes/IntroScene.ts`, `WorldMapScene.ts`, `EndingScene.ts`: Phaser text와
  기존 background/sprite 조합
- `src/App.tsx`, `src/styles.css`: title, HUD, modal, settings와 touch overlay
- `src/game/systems/AudioDirector.ts`: music bus, SFX cooldown과 crossfade
- `public/assets/`: 기존 공개 visual/audio pack과 license
- `THIRD_PARTY_ASSETS.md`, `.goal/assets.json`: asset source 추적 자료

### 재사용 가능한 요소

- React UI와 Phaser event bus 경계
- Howler volume bus와 music crossfade
- Noto Sans KR Variable의 한국어 가독성
- reduced motion, reduced flash와 volume setting

### 확인된 제약

- custom asset이 완성되기 전 기존 asset은 reference로만 남기고 최종 화면에
  혼합하지 않는다.
- AI image generation을 사용할 경우 생성 결과를 그대로 sprite로 투입하지 않고
  pixel grid, silhouette, animation과 license/source 기록을 수작업 검수한다.
- 폰트 license와 생성 asset provenance는 manifest에 남긴다.

## 구현 방향

먼저 네 key screen을 고정하고 그 화면에 없는 asset은 대량 생산하지 않는다.
identity bible의 핵심 문장은 “따뜻한 금빛 동화가 먹빛 균열에 침식되고, 여우가
움직일 때만 왕관의 빛이 길을 만든다”로 고정한다.

### 시각 규칙

- internal canvas: 640×360, nearest-neighbor, 32px tile grid
- player height: 약 48px, common enemy 32~~44px, boss 112~~144px
- normal palette: cream, amber, warm green, teal
- corruption palette: ink violet, desaturated blue, cold magenta
- gameplay outline: foreground darkest value, target gold rim, red hazard double-chevron
- camera: 플레이 중 과도한 zoom 금지, hit 순간 2~4px shake 상한

### 최소 asset set

- player: idle, run, rise, fall, aim, rush, rebound, hurt, defeat
- enemies: ground guard, flying scout, crystal shell
- targets: ring, reflector crystal, boss seal
- environment: grass/stone/wood/corruption tile, landmark 4종, parallax 3층, foreground prop
- VFX: aim cone, target lock, gold trail, rebound burst, damage, checkpoint, corruption clear
- UI: logo, frame corners, button states, stage card, HUD icon, collection icon

## 구현 단계

### 1. Identity bible과 key screen

- 수정 예상 파일: `docs/art/`, four key-screen artifacts
- 작업: palette, silhouette, motif, lighting, typography, motion과 audio cue 확정
- 완료 기준: 네 화면을 서로 다른 게임의 asset으로 오인할 요소가 없다.

### 2. Asset manifest와 runtime namespace

- 작업: `crowntrail-v2/*` key와 source/runtime/hash manifest 도입
- 완료 기준: 신규 scene은 manifest에 없는 asset key를 load할 수 없다.
- 검증: missing, duplicate, orphan과 legacy reference test

### 3. Character·environment·VFX production

- 수정 예상 파일: `public/assets/crowntrail-v2/`, `BootScene.ts`
- 완료 기준: PLAN-002 fixture를 legacy visual 없이 플레이할 수 있다.

### 4. DOM UI 재구축

- 수정 예상 파일: `src/App.tsx`, `src/styles.css`, UI component
- 작업: title, HUD, stage focus card, pause/settings/ending을 native-resolution DOM으로
  통일
- 완료 기준: canvas scale과 무관하게 typography가 선명하다.

### 5. Audio motif와 cue 연결

- 작업: exploration/fortress/boss music state와 action SFX family 구현
- 완료 기준: muted audio에서도 visual cue가 유지되고, audio만 들어도 action
  상태를 구분할 수 있다.

## 데이터 및 상태 흐름

`identity bible → asset manifest → Boot preload → scene cue ID → Phaser visual/audio
adapter 또는 React UI` 순서다. Scene은 raw 파일 경로 대신 semantic cue ID를
사용한다.

## 인터페이스 변경

- `VisualCueId`, `AudioCueId`, `AssetManifestEntry` 도입
- `GameEvent`에 stage focus, rush state와 accessibility cue event 추가
- Phaser text로 그리던 world/stage 제목과 control hint를 React state로 이동
- final scene은 `crowntrail-v2` namespace 외 visual asset을 금지

## 예외 및 경계 조건

- reduced-motion에서는 slow zoom, afterimage와 large parallax를 제거하고 static
  target arc를 표시한다.
- reduced-flash에서는 full-screen white flash 대신 outline pulse를 사용한다.
- muted audio에서는 lock, recharge와 boss warning에 시각·텍스트 대체 cue가 있다.
- narrow viewport에서는 HUD 정보를 숨기지 않고 compact layout으로 재배치한다.

## 성능 및 반응성

- spritesheet는 scene별 atlas로 나누고 최초 load에 사용하지 않는 boss sheet는
  지연 load한다.
- 단일 texture 4096×4096 초과 금지, alpha overdraw가 큰 full-screen layer는
  동시에 3개 이하로 제한한다.
- DOM animation은 transform과 opacity 위주로 제한한다.

## 호환성 및 마이그레이션

legacy asset은 기존 코드 보존을 위해 삭제하지 않지만 v2 runtime에서는 참조하지
않는다. 기존 credits는 legacy section과 v2 custom production section으로
분리한다.

## 테스트 계획

### 자동 테스트

- manifest schema, file existence, hash, duplicate/orphan key
- v2 scene의 legacy asset reference scan
- cue accessibility channel validator
- React UI layout과 focus contract

### 통합 테스트

- four key screen screenshot at 1280×720 and 1920×1080
- reduced motion/flash, muted audio와 narrow viewport matrix
- scene transition 후 atlas와 audio state cleanup

### 수동 검증

- 사용자가 네 key screen을 먼저 확인한 뒤 asset production 확대
- silhouette, target readability, Korean typography와 motion intensity 확인

### 회귀 검증

- `npm run format:check`
- `npm run lint`
- `npm test`
- `npm run build`

## 위험 요소

| 위험                                      | 영향 | 가능성 | 대응                                        |
| ----------------------------------------- | ---- | ------ | ------------------------------------------- |
| key screen 없이 asset을 대량 생산         | 높음 | 중간   | 네 화면 승인 전 production 금지             |
| 생성 asset 간 style drift                 | 높음 | 높음   | palette/grid/silhouette bible과 수작업 pass |
| DOM UI와 canvas가 서로 다른 게임처럼 보임 | 높음 | 중간   | 같은 motif, spacing과 state token 사용      |
| asset 용량으로 초기 load 지연             | 중간 | 중간   | scene atlas 분리와 lazy load                |

## 미확정 사항

없음.

## 진행 상황

- [ ] identity bible
- [ ] four key screens
- [ ] manifest와 namespace
- [ ] runtime visual assets
- [ ] DOM UI
- [ ] audio와 accessibility variants

## 결정 기록

### 2026-07-29

- 결정: 보이는 runtime asset은 전면 custom 제작하고 기존 공개 pack과 혼합하지 않는다.
- 이유: 현재 품질 문제는 개별 asset보다 서로 다른 시각 문법의 혼용에서 발생한다.
- 대안: 주인공과 UI만 custom 제작.
- 영향: 제작량을 통제하기 위해 한 world와 boss만 범위에 포함한다.

## 실제 변경 파일

예정 상태.

## 테스트 결과

미실행.

## 결과

미구현.

## 후속 작업

PLAN-004와 PLAN-005는 이 cue contract와 runtime namespace만 사용한다.
