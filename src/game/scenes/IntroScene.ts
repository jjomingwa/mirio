import Phaser from "phaser";
import { GameEvent, gameEvents } from "../events";
import { audioDirector } from "../systems/AudioDirector";
import { useGameStore } from "../state/store";

export class IntroScene extends Phaser.Scene {
  private back?: Phaser.GameObjects.TileSprite;
  private middle?: Phaser.GameObjects.TileSprite;
  private player?: Phaser.GameObjects.Sprite;
  private crown?: Phaser.GameObjects.Sprite;
  private warden?: Phaser.GameObjects.Image;
  private story?: Phaser.GameObjects.Text;
  private begun = false;
  private leaving = false;

  constructor() {
    super("Intro");
  }

  create(): void {
    this.back = this.add.tileSprite(240, 135, 480, 270, "bg-meadow-back");
    this.middle = this.add.tileSprite(240, 176, 480, 188, "bg-meadow-mid");
    this.player = this.add
      .sprite(-36, 209, "sunny", "player/idle/player-idle-1")
      .setScale(1.25);
    this.player.play("player-idle");
    this.crown = this.add.sprite(244, 120, "sunny", "gem/gem-1").setScale(1.35);
    this.crown.play("crown-shine");
    this.warden = this.add
      .image(550, 106, "warden-idle-0")
      .setScale(0.55)
      .setFlipX(true);

    this.add
      .text(240, 40, "CROWNTRAIL\nKINGDOM", {
        align: "center",
        color: "#fff7d6",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "36px",
        fontStyle: "900",
        lineSpacing: -9,
        stroke: "#492f4f",
        strokeThickness: 7,
      })
      .setOrigin(0.5, 0)
      .setShadow(0, 5, "#1b263b", 0, true, true);

    this.story = this.add
      .text(240, 244, "", {
        align: "center",
        backgroundColor: "#172033d9",
        color: "#ffffff",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "12px",
        padding: { x: 12, y: 7 },
      })
      .setOrigin(0.5);

    this.cameras.main.fadeIn(650, 12, 20, 37);
    if (useGameStore.getState().started)
      this.time.delayedCall(0, this.beginOpening, [], this);
    else gameEvents.once(GameEvent.Start, this.beginOpening, this);
    this.input.keyboard?.on("keydown-SPACE", this.skipOpening, this);
    this.input.keyboard?.on("keydown-ENTER", this.skipOpening, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    gameEvents.emit(GameEvent.SceneReady, "Intro");
  }

  update(): void {
    if (this.back) this.back.tilePositionX += 0.08;
    if (this.middle) this.middle.tilePositionX += 0.2;
  }

  private beginOpening(): void {
    if (this.begun) return;
    this.begun = true;
    const store = useGameStore.getState();
    store.setMode("intro");
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("intro", 900);
    this.story?.setText("햇살 축제가 시작되던 아침…");

    this.tweens.add({
      targets: this.player,
      x: 176,
      duration: store.save.settings.reducedMotion ? 500 : 1900,
      ease: "Sine.easeInOut",
      onStart: () => this.player?.play("player-run"),
      onComplete: () => this.player?.play("player-idle"),
    });

    this.time.delayedCall(
      store.save.settings.reducedMotion ? 600 : 1750,
      () => {
        this.story?.setText("베스페라의 파수꾼이 왕관의 심장을 낚아챘다!");
        this.tweens.add({
          targets: this.warden,
          x: 286,
          y: 104,
          duration: store.save.settings.reducedMotion ? 350 : 900,
          ease: "Cubic.easeOut",
        });
        this.tweens.add({
          targets: this.crown,
          x: 302,
          y: 104,
          scale: 0.8,
          duration: store.save.settings.reducedMotion ? 350 : 900,
          ease: "Cubic.easeIn",
        });
      },
    );

    this.time.delayedCall(
      store.save.settings.reducedMotion ? 1200 : 3150,
      () => {
        this.story?.setText("여덟 길에 흩어진 왕관 조각을 되찾아라.");
        this.tweens.add({
          targets: [this.warden, this.crown],
          x: -170,
          y: 60,
          duration: store.save.settings.reducedMotion ? 500 : 1300,
          ease: "Cubic.easeIn",
        });
      },
    );

    this.time.delayedCall(store.save.settings.reducedMotion ? 2200 : 6100, () =>
      this.goToMap(),
    );
  }

  private skipOpening(): void {
    if (this.begun) this.goToMap();
  }

  private goToMap(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(450, 9, 15, 28);
    this.time.delayedCall(470, () => this.scene.start("WorldMap"));
  }

  private shutdown(): void {
    gameEvents.off(GameEvent.Start, this.beginOpening, this);
    this.input.keyboard?.off("keydown-SPACE", this.skipOpening, this);
    this.input.keyboard?.off("keydown-ENTER", this.skipOpening, this);
  }
}
