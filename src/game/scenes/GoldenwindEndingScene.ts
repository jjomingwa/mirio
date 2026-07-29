import Phaser from "phaser";
import { GameEvent, gameEvents } from "../events";
import { useGameStore } from "../state/store";

export class GoldenwindEndingScene extends Phaser.Scene {
  constructor() {
    super("GoldenwindEnding");
  }

  create(): void {
    useGameStore.getState().setMode("ending");
    useGameStore.getState().setHud(null);
    this.add.image(320, 180, "goldenwind-background").setDisplaySize(640, 360);
    this.add.rectangle(320, 180, 640, 360, 0x151b33, 0.28);
    this.add
      .text(320, 54, "THE GOLDENWIND CROWN", {
        align: "center",
        color: "#fff3ad",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "32px",
        fontStyle: "900",
        stroke: "#34254f",
        strokeThickness: 7,
      })
      .setOrigin(0.5);
    this.add
      .sprite(320, 162, "sunny", "gem/gem-1")
      .setScale(2.6)
      .play("crown-shine");
    this.add
      .text(320, 250, "The forest is safe. The next trail is yours to write.", {
        align: "center",
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "16px",
        backgroundColor: "#152038dd",
        padding: { x: 14, y: 8 },
      })
      .setOrigin(0.5);
    this.add
      .text(320, 316, "Press Enter to return to the map", {
        align: "center",
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "13px",
      })
      .setOrigin(0.5);
    this.input.keyboard?.on("keydown-ENTER", this.returnToMap, this);
    this.input.keyboard?.on("keydown-SPACE", this.returnToMap, this);
    gameEvents.on(GameEvent.ReturnToMap, this.returnToMap, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown-ENTER", this.returnToMap, this);
      this.input.keyboard?.off("keydown-SPACE", this.returnToMap, this);
      gameEvents.off(GameEvent.ReturnToMap, this.returnToMap, this);
    });
    gameEvents.emit(GameEvent.SceneReady, "GoldenwindEnding");
  }

  private returnToMap(): void {
    this.scene.start("WorldMap");
  }
}
