import Phaser from "phaser";
import { GameEvent, gameEvents } from "../events";
import { loadSliceSave, writeSliceSave } from "../state/sliceSave";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";
import {
  advanceBossEncounter,
  createBossEncounterState,
  type BossState,
} from "../systems/BossEncounterMachine";
import {
  advanceCrownRush,
  createCrownRushState,
  notifyTargetHit,
  type CrownRushState,
  type RushTarget,
} from "../systems/CrownRush";
import { InputController } from "../systems/InputController";

export class GoldenwindBossScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite;
  private controller!: InputController;
  private seals!: Phaser.GameObjects.Sprite[];
  private rush: CrownRushState = createCrownRushState();
  private boss: BossState = createBossEncounterState();
  private statusText!: Phaser.GameObjects.Text;
  private complete = false;

  constructor() {
    super("GoldenwindBoss");
  }

  create(): void {
    const store = useGameStore.getState();
    store.setMode("boss");
    store.setHud(null);
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("boss");
    this.physics.world.setBounds(0, 0, 960, 360);
    this.add.image(480, 180, "goldenwind-background").setDisplaySize(960, 360);
    this.add.rectangle(480, 180, 960, 360, 0x241b3b, 0.5);
    this.add
      .text(480, 26, "INK FORTRESS  /  THE CROWN WARDEN", {
        align: "center",
        color: "#fff3d1",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "22px",
        fontStyle: "900",
        stroke: "#291d44",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.add
      .text(480, 70, "Rush the violet seals while the Warden opens a lane.", {
        align: "center",
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "13px",
        backgroundColor: "#1d1831dd",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(20);
    this.add
      .circle(760, 160, 82, 0x241a39, 0.9)
      .setStrokeStyle(5, 0xd79bff)
      .setDepth(4);
    this.add
      .sprite(760, 155, "vespera-fly-0")
      .setScale(0.8)
      .setTint(0xd79bff)
      .setDepth(5);
    this.seals = [300, 470, 640].map((x, index) => {
      const seal = this.add
        .sprite(x, 200 - (index % 2) * 55, "sunny", "gem/gem-4")
        .setScale(1.5)
        .setTint(0xd79bff)
        .setDepth(8);
      seal.setData("sealIndex", index).setData("enabled", true);
      seal.play("crown-shine");
      return seal;
    });
    this.player = this.physics.add
      .sprite(120, 260, "sunny", "player/idle/player-idle-1")
      .setScale(1.2)
      .setCollideWorldBounds(true)
      .setDepth(10);
    this.controller = new InputController(this);
    this.boss = advanceBossEncounter(this.boss, { type: "START" }).state;
    this.statusText = this.add
      .text(18, 320, "", {
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "13px",
        backgroundColor: "#1d1831e8",
        padding: { x: 8, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(20);
    this.updateStatus();
    this.cameras.main.setBounds(0, 0, 960, 360);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08, -100, 20);
    this.cameras.main.fadeIn(420, 12, 12, 28);
    gameEvents.emit(GameEvent.SceneReady, "GoldenwindBoss");
  }

  update(time: number): void {
    if (this.complete) return;
    const input = this.controller.read();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const step = advanceCrownRush(this.rush, input, {
      now: time,
      playerX: this.player.x,
      playerY: this.player.y,
      grounded: body.blocked.down,
      targets: this.collectTargets(),
      aimAssistEnabled: true,
    });
    this.rush = step.state;
    if (this.rush.phase === "rushing")
      body.setVelocity(this.rush.rushDirX * 480, this.rush.rushDirY * 480);
    else {
      body.setVelocityX(input.moveX * 180);
      if (input.jumpPressed && body.blocked.down) body.setVelocityY(-430);
    }
    this.player.play(
      body.blocked.down
        ? input.moveX
          ? "player-run"
          : "player-idle"
        : "player-jump",
      true,
    );
    for (const seal of this.seals) {
      if (!seal.getData("enabled")) continue;
      if (
        Phaser.Math.Distance.Between(
          this.player.x,
          this.player.y,
          seal.x,
          seal.y,
        ) < 28 &&
        this.rush.phase === "rushing"
      )
        this.hitSeal(seal);
    }
    this.updateStatus();
  }

  private collectTargets(): RushTarget[] {
    return this.seals.map((seal, index) => ({
      id: `seal-${index}`,
      kind: "boss-seal",
      x: seal.x,
      y: seal.y,
      recharge: false,
      enabled: Boolean(seal.getData("enabled")),
    }));
  }

  private hitSeal(seal: Phaser.GameObjects.Sprite): void {
    const index = seal.getData("sealIndex") as number;
    const target = this.collectTargets()[index];
    this.rush = notifyTargetHit(this.rush, target, this.time.now).state;
    seal.setData("enabled", false).setAlpha(0.2);
    this.boss = advanceBossEncounter(this.boss, { type: "HIT_SEAL" }).state;
    if (this.boss.status === "defeated") this.finish();
  }

  private updateStatus(): void {
    this.statusText?.setText(
      `Warden HP ${this.boss.health}/6  ·  ${this.boss.phase}  ·  ${this.boss.telegraph ?? "Keep moving"}`,
    );
  }

  private finish(): void {
    this.complete = true;
    const save = loadSliceSave();
    writeSliceSave({
      ...save,
      completedStageIds: Array.from(
        new Set([...save.completedStageIds, "ink-fortress"]),
      ),
      currentStageId: "ink-fortress",
    });
    this.statusText.setText(
      "The Crown Warden falls. Press Enter to claim the crown.",
    );
    this.input.keyboard?.once("keydown-ENTER", () =>
      this.scene.start("GoldenwindEnding"),
    );
    this.time.delayedCall(1300, () => this.scene.start("GoldenwindEnding"));
  }
}
