import { useEffect, useState } from "react";
import { GameCanvas } from "./game/GameCanvas";
import { GameEvent, gameEvents, type TouchAction } from "./game/events";
import { audioDirector } from "./game/systems/AudioDirector";
import { useGameStore } from "./game/state/store";
import type { GameSettings } from "./game/state/save";

export function App() {
  const save = useGameStore((state) => state.save);
  const mode = useGameStore((state) => state.mode);
  const started = useGameStore((state) => state.started);
  const paused = useGameStore((state) => state.paused);
  const settingsOpen = useGameStore((state) => state.settingsOpen);
  const toast = useGameStore((state) => state.toast);
  const hud = useGameStore((state) => state.hud);
  const start = useGameStore((state) => state.start);
  const setSettingsOpen = useGameStore((state) => state.setSettingsOpen);
  const setToast = useGameStore((state) => state.setToast);
  const setSettings = useGameStore((state) => state.setSettings);
  const resetProgress = useGameStore((state) => state.resetProgress);
  const [creditsOpen, setCreditsOpen] = useState(false);

  useEffect(() => {
    audioDirector.applySettings(save.settings);
  }, [save.settings]);

  useEffect(() => {
    const onToast = (message: string) => setToast(message);
    gameEvents.on(GameEvent.Toast, onToast);
    return () => {
      gameEvents.off(GameEvent.Toast, onToast);
    };
  }, [setToast]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 1700);
    return () => window.clearTimeout(timer);
  }, [toast, setToast]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (creditsOpen) {
        setCreditsOpen(false);
        return;
      }
      if (!started || mode === "intro" || mode === "title") return;
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      gameEvents.emit(paused ? GameEvent.Resume : GameEvent.Pause);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [creditsOpen, mode, paused, settingsOpen, setSettingsOpen, started]);

  const begin = () => {
    void audioDirector.unlock();
    audioDirector.applySettings(save.settings);
    start();
    gameEvents.emit(GameEvent.Start);
  };

  const openSettings = () => {
    if ((mode === "course" || mode === "boss") && !paused)
      gameEvents.emit(GameEvent.Pause);
    setCreditsOpen(false);
    setSettingsOpen(true);
  };

  const openCredits = () => {
    if ((mode === "course" || mode === "boss") && !paused)
      gameEvents.emit(GameEvent.Pause);
    setSettingsOpen(false);
    setCreditsOpen(true);
  };

  const changeSetting = <K extends keyof GameSettings>(
    key: K,
    value: GameSettings[K],
  ) => {
    const next = { ...save.settings, [key]: value };
    setSettings(next);
    audioDirector.applySettings(next);
    gameEvents.emit(GameEvent.SettingsChanged, next);
  };

  const isPlaying = mode === "course" || mode === "boss";
  const progress = Math.round((save.clearedNodeIds.length / 54) * 100);

  return (
    <main className="app-shell">
      <section className="game-frame">
        <GameCanvas />

        {!started && (
          <div className="title-overlay ui-layer">
            <div className="title-panel">
              <p className="eyebrow">A PIXEL ADVENTURE</p>
              <h1 aria-label="CROWNTRAIL KINGDOM">
                <span>CROWNTRAIL</span>
                <span>KINGDOM</span>
              </h1>
              <p className="title-copy">
                왕관 조각을 되찾고, 갈라지는 여덟 길의 끝에서 마지막 포효와
                맞서세요.
              </p>
              {save.clearedNodeIds.length > 0 && (
                <div className="continue-summary">
                  <span>진행도 {progress}%</span>
                  <span>왕관 {save.totalCrowns}/162</span>
                  <span>비밀 {save.secretExitNodeIds.length}</span>
                </div>
              )}
              <div className="title-actions">
                <button className="primary-button" onClick={begin}>
                  {save.clearedNodeIds.length > 0
                    ? "모험 계속하기"
                    : "새 모험 시작"}
                </button>
                <button className="text-button" onClick={openSettings}>
                  설정
                </button>
                <button className="text-button" onClick={openCredits}>
                  크레딧
                </button>
              </div>
              <p className="control-note">키보드 · 게임패드 · 터치 지원</p>
            </div>
          </div>
        )}

        {started && mode === "map" && (
          <div className="map-progress ui-layer" aria-live="polite">
            <span>클리어 {save.clearedNodeIds.length}/54</span>
            <span>왕관 {save.totalCrowns}/162</span>
            <button onClick={openSettings}>설정</button>
          </div>
        )}

        {started && isPlaying && hud && (
          <div className="hud-layer ui-layer" aria-live="polite">
            <div className="hud-bar">
              <div className="hud-stage">
                <strong>{hud.stageLabel}</strong>
                <span>{hud.stageTitle}</span>
              </div>
              <div className="hud-stat">
                <span>LIFE</span>
                <strong>{hud.lives}</strong>
              </div>
              <div className="hud-stat">
                <span>COIN</span>
                <strong>{hud.coins}</strong>
              </div>
              <div className="hud-stat">
                <span>CROWN</span>
                <strong>{hud.crowns}/3</strong>
              </div>
              <div className="hud-stat">
                <span>TIME</span>
                <strong data-testid="hud-time">{hud.time}</strong>
              </div>
              <button
                className="pause-button"
                onClick={() => gameEvents.emit(GameEvent.Pause)}
                aria-label="일시정지"
              >
                Ⅱ
              </button>
            </div>
            {hud.bossHealth !== undefined && (
              <div
                className="boss-meter"
                aria-label={`보스 체력 ${Math.round(hud.bossHealth * 100)}%`}
              >
                <span style={{ width: `${hud.bossHealth * 100}%` }} />
              </div>
            )}
          </div>
        )}

        {paused && !settingsOpen && (
          <div className="modal-scrim ui-layer">
            <section
              className="pause-panel"
              role="dialog"
              aria-modal="true"
              aria-label="일시정지 메뉴"
            >
              <p className="eyebrow">PAUSED</p>
              <h2>잠시 숨 고르기</h2>
              <button
                className="primary-button"
                onClick={() => gameEvents.emit(GameEvent.Resume)}
              >
                계속하기
              </button>
              <button onClick={() => gameEvents.emit(GameEvent.Restart)}>
                코스 다시 시작
              </button>
              <button onClick={() => gameEvents.emit(GameEvent.ReturnToMap)}>
                월드맵으로
              </button>
              <button onClick={openSettings}>설정</button>
              <button onClick={openCredits}>크레딧</button>
            </section>
          </div>
        )}

        {settingsOpen && (
          <div className="modal-scrim ui-layer">
            <section
              className="settings-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="settings-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">OPTIONS</p>
                  <h2 id="settings-title">게임 설정</h2>
                </div>
                <button
                  className="close-button"
                  onClick={() => setSettingsOpen(false)}
                  aria-label="설정 닫기"
                >
                  ×
                </button>
              </div>
              <label className="range-row">
                <span>음악</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={save.settings.musicVolume}
                  onChange={(event) =>
                    changeSetting("musicVolume", Number(event.target.value))
                  }
                />
                <output>{Math.round(save.settings.musicVolume * 100)}</output>
              </label>
              <label className="range-row">
                <span>효과음</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={save.settings.sfxVolume}
                  onChange={(event) =>
                    changeSetting("sfxVolume", Number(event.target.value))
                  }
                />
                <output>{Math.round(save.settings.sfxVolume * 100)}</output>
              </label>
              <Toggle
                label="화면 흔들림"
                checked={save.settings.screenShake}
                onChange={(value) => changeSetting("screenShake", value)}
              />
              <Toggle
                label="움직임 줄이기"
                checked={save.settings.reducedMotion}
                onChange={(value) => changeSetting("reducedMotion", value)}
              />
              <Toggle
                label="강한 플래시 줄이기"
                checked={save.settings.reducedFlash}
                onChange={(value) => changeSetting("reducedFlash", value)}
              />
              <Toggle
                label="터치 조작 표시"
                checked={save.settings.touchControls}
                onChange={(value) => changeSetting("touchControls", value)}
              />
              <div className="settings-footer">
                <button
                  className="danger-button"
                  onClick={() => {
                    resetProgress();
                    window.location.reload();
                  }}
                >
                  진행 데이터 초기화
                </button>
                <button
                  className="primary-button"
                  onClick={() => setSettingsOpen(false)}
                >
                  완료
                </button>
              </div>
            </section>
          </div>
        )}

        {creditsOpen && (
          <div className="modal-scrim ui-layer">
            <section
              className="credits-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby="credits-title"
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">CREDITS</p>
                  <h2 id="credits-title">만든 이와 오픈 에셋</h2>
                </div>
                <button
                  className="close-button"
                  onClick={() => setCreditsOpen(false)}
                  aria-label="크레딧 닫기"
                >
                  ×
                </button>
              </div>
              <div className="credits-copy">
                <p>
                  게임 디자인 · 프로그래밍 · 고유 세계관: Crowntrail Kingdom 팀
                </p>
                <h3>그래픽</h3>
                <p>
                  Sunny Land, Sunny Land Forest, Sideview Fantasy — Luis Zuno /
                  Ansimuz
                </p>
                <h3>음악</h3>
                <p>Sunny Land 테마 — Pascal Belisle</p>
                <p>Exploration, Going Up — Luis Zuno / Ansimuz</p>
                <h3>효과음</h3>
                <p>Sound effects for platformer — Listener</p>
                <p className="credits-note">
                  전체 출처·라이선스·파일별 해시는 배포 문서와 함께 제공합니다.
                </p>
              </div>
              <button
                className="primary-button"
                onClick={() => setCreditsOpen(false)}
              >
                돌아가기
              </button>
            </section>
          </div>
        )}

        {started && isPlaying && save.settings.touchControls && !paused && (
          <TouchControls />
        )}

        {started && mode === "ending" && (
          <div className="ending-actions ui-layer">
            <button
              className="primary-button"
              onClick={() => gameEvents.emit(GameEvent.ReturnToMap)}
            >
              월드맵으로 돌아가기
            </button>
          </div>
        )}

        {toast && (
          <div className="toast ui-layer" role="status">
            {toast}
          </div>
        )}
      </section>
    </main>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span />
      </span>
    </label>
  );
}

function TouchControls() {
  const bind = (action: TouchAction) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      gameEvents.emit(GameEvent.TouchInput, { action, pressed: true });
    },
    onPointerUp: () =>
      gameEvents.emit(GameEvent.TouchInput, { action, pressed: false }),
    onPointerCancel: () =>
      gameEvents.emit(GameEvent.TouchInput, { action, pressed: false }),
  });

  return (
    <div className="touch-layer ui-layer" aria-label="터치 조작">
      <div className="touch-dpad">
        <button {...bind("left")} aria-label="왼쪽">
          ←
        </button>
        <button {...bind("down")} aria-label="아래">
          ↓
        </button>
        <button {...bind("right")} aria-label="오른쪽">
          →
        </button>
      </div>
      <div className="touch-actions">
        <button className="run-touch" {...bind("run")} aria-label="달리기">
          X
        </button>
        <button className="jump-touch" {...bind("jump")} aria-label="점프">
          A
        </button>
      </div>
    </div>
  );
}
