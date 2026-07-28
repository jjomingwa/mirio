import Phaser from "phaser";
import { GameEvent, gameEvents } from "../events";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";

export class EndingScene extends Phaser.Scene {
  private back?: Phaser.GameObjects.TileSprite;
  private middle?: Phaser.GameObjects.TileSprite;
  private canLeave = false;

  constructor() {
    super("Ending");
  }

  create(): void {
    const store = useGameStore.getState();
    store.setMode("ending");
    store.setHud(null);
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("finale", 1100);

    this.back = this.add
      .tileSprite(240, 135, 480, 270, "bg-meadow-back")
      .setTint(0xffd6a0);
    this.middle = this.add
      .tileSprite(240, 175, 480, 188, "bg-meadow-mid")
      .setTint(0xffe4bb);
    this.add.image(380, 224, "props", "house").setOrigin(0.5, 1).setScale(1.35);
    const player = this.add
      .sprite(112, 211, "sunny", "player/idle/player-idle-1")
      .setScale(1.2)
      .play("player-idle");
    const crown = this.add
      .sprite(240, 112, "sunny", "gem/gem-1")
      .setScale(2)
      .play("crown-shine")
      .setAlpha(0);

    const headline = this.add
      .text(240, 30, "THE CROWNTRAIL SHINES AGAIN", {
        color: "#fff6c7",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "24px",
        fontStyle: "900",
        stroke: "#48334f",
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const stats = this.add
      .text(
        240,
        164,
        `클리어 ${store.save.clearedNodeIds.length}/54   ·   왕관 조각 ${store.save.totalCrowns}/162   ·   비밀 출구 ${store.save.secretExitNodeIds.length}`,
        {
          align: "center",
          backgroundColor: "#202c43d9",
          color: "#ffffff",
          fontFamily: "Noto Sans KR Variable, sans-serif",
          fontSize: "11px",
          padding: { x: 12, y: 7 },
        },
      )
      .setOrigin(0.5)
      .setAlpha(0);

    this.cameras.main.fadeIn(850, 20, 22, 36);
    this.tweens.add({
      targets: player,
      x: 205,
      duration: store.save.settings.reducedMotion ? 500 : 1900,
      ease: "Sine.easeInOut",
      onStart: () => player.play("player-run"),
      onComplete: () => player.play("player-idle"),
    });
    this.time.delayedCall(
      store.save.settings.reducedMotion ? 550 : 1750,
      () => {
        this.tweens.add({
          targets: crown,
          alpha: 1,
          y: 94,
          duration: 850,
          ease: "Back.easeOut",
        });
        this.createFireworks();
      },
    );
    this.time.delayedCall(
      store.save.settings.reducedMotion ? 900 : 2800,
      () => {
        this.tweens.add({
          targets: [headline, stats],
          alpha: 1,
          duration: 650,
        });
        this.canLeave = true;
      },
    );

    this.input.keyboard?.on("keydown-ENTER", this.returnToMap, this);
    this.input.keyboard?.on("keydown-SPACE", this.returnToMap, this);
    gameEvents.on(GameEvent.ReturnToMap, this.returnToMap, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    gameEvents.emit(GameEvent.SceneReady, "Ending");
  }

  update(): void {
    if (this.back) this.back.tilePositionX += 0.05;
    if (this.middle) this.middle.tilePositionX += 0.13;
  }

  private createFireworks(): void {
    if (useGameStore.getState().save.settings.reducedFlash) return;
    const colors = [0xffd66b, 0x87e8c2, 0xff8da3, 0xbba8ff];
    for (let burst = 0; burst < 4; burst += 1) {
      const centerX = 72 + burst * 112;
      const centerY = 72 + (burst % 2) * 36;
      for (let ray = 0; ray < 10; ray += 1) {
        const angle = (ray / 10) * Math.PI * 2;
        const spark = this.add.circle(
          centerX,
          centerY,
          2,
          colors[burst] ?? 0xffffff,
          1,
        );
        this.tweens.add({
          targets: spark,
          x: centerX + Math.cos(angle) * 36,
          y: centerY + Math.sin(angle) * 28,
          alpha: 0,
          delay: burst * 180,
          duration: 750,
          ease: "Quad.easeOut",
          onComplete: () => spark.destroy(),
        });
      }
    }
  }

  private returnToMap(): void {
    if (!this.canLeave) return;
    this.cameras.main.fadeOut(350, 8, 12, 24);
    this.time.delayedCall(370, () => this.scene.start("WorldMap"));
  }

  private shutdown(): void {
    this.input.keyboard?.off("keydown-ENTER", this.returnToMap, this);
    this.input.keyboard?.off("keydown-SPACE", this.returnToMap, this);
    gameEvents.off(GameEvent.ReturnToMap, this.returnToMap, this);
  }
}
