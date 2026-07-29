import Phaser from "phaser";
import { GOLDENWIND_STAGES } from "../data/slice/goldenwind";
import type { SliceStageId } from "../data/slice/types";
import { GameEvent, gameEvents } from "../events";
import { loadSliceSave } from "../state/sliceSave";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";

const STAGES: SliceStageId[] = [
  "prologue",
  "windmill-hill",
  "sleeping-canopy",
  "ink-fortress",
];
const LANDMARKS: Record<SliceStageId, { x: number; y: number; color: number }> =
  {
    prologue: { x: 112, y: 255, color: 0xffdf70 },
    "windmill-hill": { x: 270, y: 174, color: 0xffc85a },
    "sleeping-canopy": { x: 430, y: 228, color: 0x76e0cf },
    "ink-fortress": { x: 560, y: 128, color: 0xd79bff },
  };

export class WorldMapScene extends Phaser.Scene {
  private stageIndex = 0;
  private marker!: Phaser.GameObjects.Container;
  private title!: Phaser.GameObjects.Text;
  private detail!: Phaser.GameObjects.Text;
  private enter?: Phaser.Input.Keyboard.Key;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private save = loadSliceSave();

  constructor() {
    super("WorldMap");
  }

  create(): void {
    this.save = loadSliceSave();
    this.stageIndex = Math.max(0, STAGES.indexOf(this.save.currentStageId));
    const store = useGameStore.getState();
    store.setMode("map");
    store.setHud(null);
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("map");

    this.add.image(320, 180, "goldenwind-background").setDisplaySize(640, 360);
    this.add.rectangle(320, 180, 640, 360, 0x152038, 0.34);
    this.drawRoute();
    this.drawLandmarks();
    this.marker = this.add.container(0, 0).setDepth(8);
    this.marker.add(
      this.add.circle(0, 0, 20, 0x16233b, 0.82).setStrokeStyle(3, 0xfff3ad),
    );
    this.marker.add(this.add.circle(0, 0, 9, 0xfff3ad, 1));
    this.add
      .text(24, 18, "GOLDENWIND FOREST", {
        color: "#fff9e9",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "25px",
        fontStyle: "900",
        stroke: "#1c2840",
        strokeThickness: 6,
      })
      .setDepth(10);
    this.title = this.add
      .text(320, 288, "", {
        align: "center",
        color: "#fff9e9",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "19px",
        fontStyle: "700",
        stroke: "#1c2840",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.detail = this.add
      .text(320, 322, "", {
        align: "center",
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "12px",
        backgroundColor: "#152038dd",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(10);
    this.updateSelection();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.enter = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    this.input.keyboard?.on("keydown-SPACE", this.launchCurrent, this);
    this.cameras.main.fadeIn(400, 10, 16, 29);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off("keydown-SPACE", this.launchCurrent, this);
    });
    gameEvents.emit(GameEvent.SceneReady, "WorldMap");
  }

  update(): void {
    if (this.enter && Phaser.Input.Keyboard.JustDown(this.enter))
      this.launchCurrent();
    if (this.cursors?.left && Phaser.Input.Keyboard.JustDown(this.cursors.left))
      this.select(-1);
    if (this.cursors?.up && Phaser.Input.Keyboard.JustDown(this.cursors.up))
      this.select(-1);
    if (
      this.cursors?.right &&
      Phaser.Input.Keyboard.JustDown(this.cursors.right)
    )
      this.select(1);
    if (this.cursors?.down && Phaser.Input.Keyboard.JustDown(this.cursors.down))
      this.select(1);
  }

  private drawRoute(): void {
    const g = this.add.graphics().setDepth(2);
    g.lineStyle(7, 0x203752, 0.9);
    for (let i = 0; i < STAGES.length - 1; i += 1) {
      const a = LANDMARKS[STAGES[i]];
      const b = LANDMARKS[STAGES[i + 1]];
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokePath();
    }
  }

  private drawLandmarks(): void {
    for (const stageId of STAGES) {
      const point = LANDMARKS[stageId];
      const complete = this.save.completedStageIds.includes(stageId);
      const g = this.add.graphics().setDepth(4);
      g.fillStyle(point.color, complete ? 1 : 0.72);
      g.fillCircle(point.x, point.y, complete ? 17 : 14);
      g.lineStyle(2, 0xfff8e5, 0.9);
      g.strokeCircle(point.x, point.y, 18);
      this.add
        .text(
          point.x,
          point.y + 26,
          GOLDENWIND_STAGES[stageId].landmarkId.toUpperCase(),
          {
            color: "#fff8e5",
            fontFamily: "Nunito Variable, sans-serif",
            fontSize: "10px",
            fontStyle: "900",
            stroke: "#1c2840",
            strokeThickness: 3,
          },
        )
        .setOrigin(0.5)
        .setDepth(5);
    }
  }

  private select(delta: number): void {
    this.stageIndex = Phaser.Math.Wrap(
      this.stageIndex + delta,
      0,
      STAGES.length,
    );
    this.updateSelection();
    audioDirector.playSfx("menu");
  }

  private updateSelection(): void {
    const stageId = STAGES[this.stageIndex];
    const point = LANDMARKS[stageId];
    this.marker?.setPosition(point.x, point.y);
    const stage = GOLDENWIND_STAGES[stageId];
    const completed = this.save.completedStageIds.includes(stageId);
    this.title?.setText(
      `${stage.title}  ·  ${completed ? "CLEARED" : "READY"}`,
    );
    this.detail?.setText(
      `${stage.expectedMinutes[0]}–${stage.expectedMinutes[1]} min  ·  Arrow keys select  ·  Enter plays`,
    );
  }

  private launchCurrent(): void {
    const stageId = STAGES[this.stageIndex];
    audioDirector.playSfx("menu");
    this.cameras.main.fadeOut(260, 8, 12, 24);
    this.time.delayedCall(280, () =>
      this.scene.start("GoldenwindLevel", { stageId }),
    );
  }
}
