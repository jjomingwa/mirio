# 기술·경험 조사 기록

## 엔진 선택

Phaser 4.2.0을 사용한다. 2026-06-19 공개된 최신 안정판이며, 새 WebGL 렌더러·필터·조명·Stencil·Mesh2D와 런타임 FPS 제한을 제공한다. PixiJS 단독 구성보다 장면, 입력, 카메라, Arcade Physics, 로더를 통합해 횡스크롤 게임의 실패 지점을 줄인다. Godot은 좋은 대안이지만 현재 결과물이 브라우저에서 즉시 실행되어야 하고 React UI와 결합해야 하므로 이 프로젝트에서는 Phaser가 더 적합하다.

공식 React TypeScript 템플릿의 이벤트 브리지 구조를 따르되, 게임의 프레임 단위 상태는 React로 보내지 않는다. Phaser는 렌더링·물리·입력을 소유하고 React는 메뉴·HUD·접근성만 담당한다.

## 라이브러리 책임

- Phaser 4.2: 장면, WebGL 렌더링, Arcade Physics, 카메라, 입력, 애니메이션
- React 19: 타이틀, HUD, 일시정지, 설정, 터치 컨트롤
- Howler 2: 사용자 제스처 잠금 해제, 음악 크로스페이드, SFX 풀과 음량 버스
- Zod 4: 월드 그래프와 저장 데이터의 런타임 검증
- Zustand 5: 낮은 빈도로 바뀌는 HUD·설정 상태
- Vite 8/TypeScript 6: 모듈 번들, 엄격한 타입 검사, 정적 자산 배포
- Vitest/Playwright: 데이터 불변식과 실제 브라우저 진행 흐름 검증

## 벤치마크에서 가져온 구조

직접 복제 대신 다음 경험 원리를 채택한다.

1. 초반 코스는 이동·점프·밟기를 안전하게 가르친다.
2. 코스 클리어가 월드맵의 다음 한 칸을 연다.
3. 눈에 보이는 갈림길과 발견해야 하는 비밀 출구가 함께 존재한다.
4. 월드 2의 출구 선택이 월드 3/4로, 월드 5의 출구 선택이 월드 6/7로 이어진다.
5. 중간 보스는 기존 기술을 시험하고, 최종 보스는 이전 패턴을 조합한다.

## 시각·음향 원칙

- 16px 계열의 수제 픽셀아트만 사용하며 nearest-neighbor 정수 배율을 유지한다.
- 3~5겹 패럴랙스, 전경 실루엣, 날씨 입자, 색보정을 월드별로 다르게 구성한다.
- 브라우저 기본 `<audio controls>` UI나 오실레이터로 만든 임시 BGM을 사용하지 않는다.
- 음악은 실제 녹음된 OGG 루프, 효과음은 실제 WAV 샘플을 Howler로 재생한다.
- 화면 흔들림과 강한 플래시는 설정에서 줄이거나 끌 수 있다.

## 1차 출처

- Phaser 4.2.0: https://phaser.io/news/2026/06/phaser-v4-2-0-released
- Phaser React TypeScript template: https://github.com/phaserjs/template-react-ts
- Phaser Arcade Physics: https://docs.phaser.io/phaser/concepts/physics/arcade
- Howler: https://howlerjs.com/
- Zod: https://zod.dev/
- Sunny Land: https://opengameart.org/content/sunny-land-2d-pixel-art-pack
- Sideview Fantasy collection: https://opengameart.org/content/sideview-fantasy-patreon-collection
