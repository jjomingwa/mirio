import Phaser from "phaser";
import { GOLDENWIND_STAGES } from "../data/slice/goldenwind";
import type { AuthoredSliceStage, SliceStageId } from "../data/slice/types";
import { GameEvent, gameEvents } from "../events";
import { loadSliceSave, writeSliceSave } from "../state/sliceSave";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";
import {
  advanceCrownRush,
  createCrownRushState,
  notifyTargetHit,
  type CrownRushState,
  type RushTarget,
} from "../systems/CrownRush";
import { InputController } from "../systems/InputController";

interface SceneData {
  stageId: SliceStageId;
}

export class GoldenwindLevelScene extends Phaser.Scene {
  private stage!: AuthoredSliceStage;
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private enemies!: Phaser.Physics.Arcade.StaticGroup;
  private targets!: Phaser.Physics.Arcade.StaticGroup;
  private controller!: InputController;
  private rush: CrownRushState = createCrownRushState();
  private targetRefs = new Map<string, Phaser.GameObjects.GameObject>();
  private startTime = 0;
  private completed = false;
  private label!: Phaser.GameObjects.Text;

  constructor() {
    super("GoldenwindLevel");
  }

  init(data: SceneData): void {
    this.stage = GOLDENWIND_STAGES[data.stageId ?? "prologue"];
    this.rush = createCrownRushState();
    this.targetRefs.clear();
    this.completed = false;
  }

  create(): void {
    const store = useGameStore.getState();
    store.setMode("course");
    store.setHud(null);
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("course");
    this.startTime = this.time.now;

    const width = this.stage.exit.x + 220;
    this.physics.world.setBounds(0, 0, width, 360);
    this.add
      .image(width / 2, 180, "goldenwind-background")
      .setDisplaySize(width, 360);
    this.add.rectangle(width / 2, 180, width, 360, 0x17243a, 0.3);
    this.add
      .text(20, 16, `GOLDENWIND  /  ${this.stage.title}`, {
        color: "#fff8e5",
        fontFamily: "Nunito Variable, sans-serif",
        fontSize: "18px",
        fontStyle: "900",
        stroke: "#1b263b",
        strokeThickness: 4,
      })
      .setScrollFactor(0)
      .setDepth(20);
    this.label = this.add
      .text(20, 48, "Arrow keys move · Space jumps · Shift/X Crown Rush", {
        color: "#fff8e5",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "12px",
        backgroundColor: "#152038cc",
        padding: { x: 8, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(20);

    this.platforms = this.physics.add.staticGroup();
    this.enemies = this.physics.add.staticGroup();
    this.targets = this.physics.add.staticGroup();
    for (const section of this.stage.sections) {
      for (const geometry of section.geometry) {
        const platform = this.platforms.create(
          geometry.x + geometry.width / 2,
          geometry.y + 12,
          "sunny",
          "player/idle/player-idle-1",
        ) as Phaser.Physics.Arcade.Sprite;
        platform.setDisplaySize(geometry.width, 24).refreshBody();
        platform.setTint(geometry.oneWay ? 0xb495d6 : 0x5ca68f);
      }
      for (const encounter of section.encounters)
        this.createEncounter(encounter.x, encounter.y, encounter.type);
      for (const target of section.rushTargets) this.createTarget(target);
    }
    this.createPlayer();
    this.controller = new InputController(this);
    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      const id = (enemy as Phaser.GameObjects.GameObject).getData("rushId") as
        string | undefined;
      if (id) this.hitRushTarget(id);
      (enemy as Phaser.Physics.Arcade.Sprite)
        .setVisible(false)
        .setActive(false);
    });
    this.physics.add.overlap(this.player, this.targets, (_player, target) => {
      const id = (target as Phaser.GameObjects.GameObject).getData("rushId") as
        string | undefined;
      if (id) this.hitRushTarget(id);
    });
    this.cameras.main.setBounds(0, 0, width, 360);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, -170, 30);
    this.cameras.main.fadeIn(350, 8, 12, 24);
    gameEvents.on(GameEvent.ReturnToMap, this.returnToMap, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      gameEvents.off(GameEvent.ReturnToMap, this.returnToMap, this),
    );
    gameEvents.emit(GameEvent.SceneReady, "GoldenwindLevel");
  }

  update(time: number): void {
    if (this.completed) return;
    const input = this.controller.read();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;
    const targets = this.collectTargets();
    const step = advanceCrownRush(this.rush, input, {
      now: time,
      playerX: this.player.x,
      playerY: this.player.y,
      grounded,
      targets,
      aimAssistEnabled: true,
    });
    this.rush = step.state;
    if (this.rush.phase === "rushing") {
      body.setVelocity(this.rush.rushDirX * 480, this.rush.rushDirY * 480);
      this.player.setTint(0xffd45e);
    } else {
      body.setVelocityX(input.moveX * (input.run ? 230 : 165));
      if (input.jumpPressed && grounded) body.setVelocityY(-450);
      if (input.moveX !== 0) this.player.setFlipX(input.moveX < 0);
      this.player.clearTint();
    }
    this.player.play(
      grounded ? (input.moveX ? "player-run" : "player-idle") : "player-jump",
      true,
    );
    this.label.setText(
      this.rush.phase === "aiming"
        ? "Release Shift/X to launch · target lock active"
        : "Arrow keys move · Space jumps · Shift/X Crown Rush",
    );
    if (this.player.x >= this.stage.exit.x) this.completeStage();
    if (this.player.y > 390) this.respawn();
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(
      this.stage.entry.x,
      this.stage.entry.y - 28,
      "sunny",
      "player/idle/player-idle-1",
    );
    this.player.setScale(1.15).setCollideWorldBounds(true).setDepth(12);
    this.player.setBounce(0.05);
  }

  private createEncounter(x: number, y: number, type: string): void {
    const frame =
      type === "frog" ? "frog/idle/frog-idle-1" : "opossum/opossum-1";
    const enemy = this.enemies.create(
      x,
      y - 22,
      "sunny",
      frame,
    ) as Phaser.Physics.Arcade.Sprite;
    enemy.setScale(0.9).setData("rushId", `enemy-${x}-${y}`).refreshBody();
    enemy.setTint(type === "ghost" ? 0xbca9ff : 0xff9a72);
  }

  private createTarget(target: {
    id: string;
    kind: string;
    x: number;
    y: number;
  }): void {
    const texture = target.kind === "crystal" ? "gem/gem-1" : "gem/gem-3";
    const sprite = this.targets.create(
      target.x,
      target.y,
      "sunny",
      texture,
    ) as Phaser.Physics.Arcade.Sprite;
    sprite
      .setScale(0.9)
      .setData("rushId", target.id)
      .setTint(target.kind === "boss-seal" ? 0xd79bff : 0xffdf70)
      .refreshBody();
    sprite.play("crown-shine");
    this.targetRefs.set(target.id, sprite);
  }

  private collectTargets(): RushTarget[] {
    const targets: RushTarget[] = [];
    for (const section of this.stage.sections) {
      for (const target of section.rushTargets) {
        const object = this.targetRefs.get(target.id);
        targets.push({ ...target, enabled: Boolean(object?.active) });
      }
      for (const encounter of section.encounters) {
        const id = `enemy-${encounter.x}-${encounter.y}`;
        const object = this.enemies
          .getChildren()
          .find((item) => item.getData("rushId") === id);
        targets.push({
          id,
          kind: "enemy",
          x: encounter.x,
          y: encounter.y - 22,
          recharge: false,
          enabled: Boolean(object?.active),
        });
      }
    }
    return targets;
  }

  private hitRushTarget(id: string): void {
    const target = this.collectTargets().find((item) => item.id === id);
    if (!target) return;
    const step = notifyTargetHit(this.rush, target, this.time.now);
    this.rush = step.state;
    const object =
      this.targetRefs.get(id) ??
      this.enemies.getChildren().find((item) => item.getData("rushId") === id);
    if (object && !target.recharge) {
      object.setActive(false);
      (
        object as unknown as { setVisible: (visible: boolean) => void }
      ).setVisible(false);
    }
    if (target.recharge && object)
      this.tweens.add({
        targets: object,
        alpha: 0.25,
        duration: 150,
        yoyo: true,
      });
  }

  private respawn(): void {
    this.player.setPosition(this.stage.entry.x, this.stage.entry.y - 28);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.rush = createCrownRushState();
  }

  private completeStage(): void {
    this.completed = true;
    const save = loadSliceSave();
    const completedStageIds = Array.from(
      new Set([...save.completedStageIds, this.stage.id]),
    );
    const next = this.stage.exit.targetStageId;
    writeSliceSave({
      ...save,
      completedStageIds,
      currentStageId: next === "boss-throne" ? this.stage.id : next,
      bestClearMs: Math.min(
        save.bestClearMs ?? Infinity,
        this.time.now - this.startTime,
      ),
    });
    this.label.setText("Stage clear! Press Enter to return to the map.");
    this.input.keyboard?.once("keydown-ENTER", this.returnToMap, this);
    this.time.delayedCall(900, () => {
      if (this.stage.exit.targetStageId === "boss-throne")
        this.scene.start("GoldenwindBoss");
      else this.returnToMap();
    });
  }

  private returnToMap(): void {
    if (!this.scene.isActive("GoldenwindLevel")) return;
    this.scene.start("WorldMap");
  }
}
