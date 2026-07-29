import Phaser from "phaser";
import { GameEvent, gameEvents } from "../events";
import { audioDirector } from "../systems/AudioDirector";
import { useGameStore } from "../state/store";

export class IntroScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Sprite;
  private story?: Phaser.GameObjects.Text;
  private begun = false;
  private leaving = false;

  constructor() {
    super("Intro");
  }

  create(): void {
    this.add.image(320, 180, "goldenwind-background").setDisplaySize(640, 360);
    this.add.rectangle(320, 180, 640, 360, 0x111a2f, 0.24);
    this.add
      .text(320, 42, "CROWNTRAIL\nKINGDOM", {
        align: "center",
        color: "#fff7d6",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "48px",
        fontStyle: "900",
        lineSpacing: -10,
        stroke: "#34254f",
        strokeThickness: 8,
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 6, "#10182d", 0, true, true);
    this.player = this.add
      .sprite(-40, 285, "sunny", "player/idle/player-idle-1")
      .setScale(1.5)
      .play("player-idle");
    this.add
      .text(320, 237, "A hand-crafted rush through the Goldenwind Forest", {
        align: "center",
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "16px",
        stroke: "#1b263b",
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.story = this.add
      .text(320, 318, "Press Enter or Space to begin", {
        align: "center",
        backgroundColor: "#152038dd",
        color: "#ffffff",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "14px",
        padding: { x: 16, y: 8 },
      })
      .setOrigin(0.5);

    this.cameras.main.fadeIn(500, 12, 20, 37);
    if (useGameStore.getState().started)
      this.time.delayedCall(0, this.beginOpening, [], this);
    else gameEvents.once(GameEvent.Start, this.beginOpening, this);
    this.input.keyboard?.on("keydown-SPACE", this.skipOpening, this);
    this.input.keyboard?.on("keydown-ENTER", this.skipOpening, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    gameEvents.emit(GameEvent.SceneReady, "Intro");
  }

  private beginOpening(): void {
    if (this.begun) return;
    this.begun = true;
    const store = useGameStore.getState();
    store.setMode("intro");
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("intro", 700);
    this.story?.setText("The crown has vanished. Follow the wind.");
    this.tweens.add({
      targets: this.player,
      x: 170,
      duration: store.save.settings.reducedMotion ? 400 : 1300,
      ease: "Sine.easeInOut",
      onStart: () => this.player?.play("player-run"),
      onComplete: () => this.player?.play("player-idle"),
    });
    this.time.delayedCall(
      store.save.settings.reducedMotion ? 650 : 1500,
      () => {
        this.story?.setText("Master the Crown Rush and reclaim Goldenwind.");
      },
    );
    this.time.delayedCall(store.save.settings.reducedMotion ? 1100 : 2600, () =>
      this.goToMap(),
    );
  }

  private skipOpening(): void {
    if (this.begun) this.goToMap();
  }

  private goToMap(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(300, 9, 15, 28);
    this.time.delayedCall(320, () => this.scene.start("WorldMap"));
  }

  private shutdown(): void {
    gameEvents.off(GameEvent.Start, this.beginOpening, this);
    this.input.keyboard?.off("keydown-SPACE", this.skipOpening, this);
    this.input.keyboard?.off("keydown-ENTER", this.skipOpening, this);
  }
}
