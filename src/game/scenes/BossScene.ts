import Phaser from "phaser";
import { getCompletionSceneForStage } from "../data/routing";
import { getNode, getWorld } from "../data/worlds";
import type { StageNode } from "../data/types";
import { GameEvent, gameEvents } from "../events";
import { CROWN_PIECE_INDEXES } from "../state/save";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";
import { InputController } from "../systems/InputController";
import { planHorizontalMovement } from "../systems/HorizontalMovement";

interface SceneData {
  nodeId: string;
}

export class BossScene extends Phaser.Scene {
  private stage!: StageNode;
  private player!: Phaser.Physics.Arcade.Sprite;
  private boss!: Phaser.Physics.Arcade.Image;
  private arena!: Phaser.Physics.Arcade.StaticGroup;
  private projectiles!: Phaser.Physics.Arcade.Group;
  private controller!: InputController;
  private isFinal = false;
  private bossHealth = 3;
  private bossMaxHealth = 3;
  private bossInvulnerableUntil = 0;
  private playerInvulnerableUntil = 0;
  private playerHealth = 2;
  private nextAttack = 0;
  private frameIndex = 0;
  private elapsedMs = 0;
  private lastGroundedMs = -Infinity;
  private jumpBufferedMs = -Infinity;
  private completing = false;
  private paused = false;

  constructor() {
    super("Boss");
  }

  init(data: SceneData): void {
    this.stage = getNode(data.nodeId);
    this.isFinal = this.stage.kind === "final";
    const world = getWorld(this.stage.worldId);
    this.bossMaxHealth = this.isFinal
      ? 9
      : 3 + Math.floor((world.number - 1) / 2);
    this.bossHealth = this.bossMaxHealth;
    this.bossInvulnerableUntil = 0;
    this.playerInvulnerableUntil = 0;
    this.playerHealth = 2;
    this.nextAttack = 0;
    this.frameIndex = 0;
    this.elapsedMs = 0;
    this.lastGroundedMs = -Infinity;
    this.jumpBufferedMs = -Infinity;
    this.completing = false;
    this.paused = false;
  }

  create(): void {
    const store = useGameStore.getState();
    this.physics.world.resume();
    this.anims.resumeAll();
    store.setPaused(false);
    store.setMode("boss");
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("boss", 450);
    this.physics.world.setBounds(0, 0, 480, 270);

    this.createBackdrop();
    this.arena = this.physics.add.staticGroup();
    const floor = this.add
      .tileSprite(
        240,
        239,
        480,
        28,
        "props",
        this.isFinal ? "block-big" : "block",
      )
      .setDepth(5)
      .setTint(this.isFinal ? 0xff9c63 : 0xffffff);
    this.arena.add(floor);
    (floor.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();

    this.player = this.physics.add.sprite(
      72,
      188,
      "sunny",
      "player/idle/player-idle-1",
    );
    this.player
      .setScale(1.06)
      .setDepth(20)
      .setCollideWorldBounds(true)
      .play("player-idle");
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody
      .setSize(15, 24)
      .setOffset(8, 7)
      .setDragX(1450)
      .setMaxVelocity(220, 760);

    this.boss = this.physics.add.image(
      this.isFinal ? 370 : 355,
      this.isFinal ? 114 : 185,
      this.isFinal ? "vespera-fly-0" : "warden-idle-0",
    );
    this.boss.setDepth(18).setFlipX(true).setCollideWorldBounds(true);
    this.boss.setDisplaySize(this.isFinal ? 154 : 96, this.isFinal ? 104 : 68);
    const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
    bossBody
      .setSize(this.isFinal ? 116 : 70, this.isFinal ? 70 : 48)
      .setOffset(this.isFinal ? 18 : 13, this.isFinal ? 20 : 12);
    bossBody.setAllowGravity(!this.isFinal).setImmovable(false).setBounce(0.5);
    bossBody.setVelocityX(this.isFinal ? -65 : -56);

    this.projectiles = this.physics.add.group({ allowGravity: false });
    this.controller = new InputController(this);
    this.physics.add.collider(this.player, this.arena);
    this.physics.add.collider(this.boss, this.arena);
    this.physics.add.overlap(this.player, this.boss, () =>
      this.onBossContact(),
    );
    this.physics.add.overlap(
      this.player,
      this.projectiles,
      (_player, projectile) => {
        const shot = projectile as Phaser.Physics.Arcade.Image;
        shot.disableBody(true, true);
        this.damagePlayer();
      },
    );

    this.add
      .text(
        240,
        17,
        this.isFinal
          ? "VESPERA · CROWN DEVOURER"
          : `CROWN WARDEN · ROUND ${getWorld(this.stage.worldId).number}`,
        {
          color: "#fff1d2",
          fontFamily: "Nunito Variable, sans-serif",
          fontSize: "14px",
          fontStyle: "900",
          stroke: "#351e35",
          strokeThickness: 5,
        },
      )
      .setOrigin(0.5)
      .setDepth(50);

    this.cameras.main.fadeIn(420, 18, 12, 25);
    gameEvents.on(GameEvent.Pause, this.pauseGame, this);
    gameEvents.on(GameEvent.Resume, this.resumeGame, this);
    gameEvents.on(GameEvent.Restart, this.restartStage, this);
    gameEvents.on(GameEvent.ReturnToMap, this.returnToMap, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    gameEvents.emit(GameEvent.SceneReady, "Boss");
    this.updateHud();
  }

  update(time: number, delta: number): void {
    if (this.completing || this.paused) return;
    this.elapsedMs += delta;
    this.updatePlayer(time);
    this.updateBoss(time, delta);
    this.cleanupProjectiles();
    if (this.player.y > 300) this.damagePlayer(true);
    if (this.elapsedMs % 180 < delta) this.updateHud();
  }

  private createBackdrop(): void {
    if (this.isFinal) {
      this.add
        .image(240, 135, "bg-lava-back")
        .setDisplaySize(480, 270)
        .setDepth(-20);
      this.add
        .image(240, 160, "bg-lava-mid")
        .setDisplaySize(480, 220)
        .setDepth(-10);
      this.add.rectangle(240, 135, 480, 270, 0x2b1022, 0.3).setDepth(-5);
    } else {
      this.add
        .image(240, 135, "bg-mist-back")
        .setDisplaySize(480, 270)
        .setTint(0x9f8ba5)
        .setDepth(-20);
      this.add
        .image(240, 160, "bg-mist-trees")
        .setDisplaySize(480, 230)
        .setAlpha(0.8)
        .setDepth(-10);
      this.add.rectangle(240, 135, 480, 270, 0x361f47, 0.26).setDepth(-5);
    }
  }

  private updatePlayer(time: number): void {
    const input = this.controller.read();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;
    if (grounded) this.lastGroundedMs = time;
    if (input.jumpPressed) this.jumpBufferedMs = time;

    const direction: -1 | 0 | 1 =
      input.left === input.right ? 0 : input.left ? -1 : 1;
    const motion = planHorizontalMovement(
      direction,
      body.velocity.x,
      grounded,
      input.run,
    );
    body
      .setVelocityX(motion.velocityX)
      .setAccelerationX(motion.accelerationX)
      .setDragX(motion.dragX)
      .setMaxVelocity(motion.maxSpeed, 760);
    if (direction !== 0) this.player.setFlipX(direction < 0);

    if (
      time - this.lastGroundedMs <= 110 &&
      time - this.jumpBufferedMs <= 125
    ) {
      body.setVelocityY(-482);
      this.lastGroundedMs = -Infinity;
      this.jumpBufferedMs = -Infinity;
      audioDirector.playSfx("jump", 80);
    }
    if (!input.jumpHeld && body.velocity.y < -190) body.setVelocityY(-190);
    if (input.down && body.velocity.y > 0)
      body.setVelocityY(body.velocity.y + 26);

    if (!grounded) this.player.play("player-jump", true);
    else if (Math.abs(body.velocity.x) > 18)
      this.player.play("player-run", true);
    else this.player.play("player-idle", true);
  }

  private updateBoss(time: number, delta: number): void {
    const body = this.boss.body as Phaser.Physics.Arcade.Body;
    this.frameIndex = Math.floor(time / (this.isFinal ? 95 : 125));
    this.boss.setTexture(
      this.isFinal
        ? `vespera-fly-${this.frameIndex % 9}`
        : `warden-idle-${this.frameIndex % 6}`,
    );

    if (this.isFinal) {
      const phase =
        1 +
        Math.floor(
          ((this.bossMaxHealth - this.bossHealth) / this.bossMaxHealth) * 3,
        );
      this.boss.y = 92 + Math.sin(time / 420) * (28 + phase * 5);
      body.setVelocityX(
        this.boss.x < 98
          ? 72 + phase * 9
          : this.boss.x > 410
            ? -72 - phase * 9
            : body.velocity.x,
      );
      if (time >= this.nextAttack) {
        this.nextAttack = time + Math.max(720, 1550 - phase * 180);
        this.fireAimedBurst(phase + 1, 118 + phase * 16);
        if (phase >= 3) {
          this.tweens.add({
            targets: this.boss,
            y: 185,
            duration: 430,
            yoyo: true,
            ease: "Cubic.easeIn",
          });
        }
      }
    } else {
      if (body.blocked.left || body.blocked.right) {
        body.setVelocityX(body.blocked.left ? 62 : -62);
        this.boss.setFlipX(body.velocity.x < 0);
      }
      if (time >= this.nextAttack && body.blocked.down) {
        const phase =
          this.bossHealth <= Math.ceil(this.bossMaxHealth / 2) ? 2 : 1;
        this.nextAttack = time + (phase === 2 ? 1050 : 1450);
        body.setVelocity(
          this.player.x < this.boss.x ? -90 : 90,
          -385 - phase * 25,
        );
        if (phase === 2 || Math.floor(time / 1000) % 2 === 0)
          this.fireAimedBurst(phase, 112);
      }
    }

    if (this.bossInvulnerableUntil > time && Math.floor(time / 80) % 2 === 0)
      this.boss.setAlpha(0.45);
    else this.boss.setAlpha(1);
    void delta;
  }

  private fireAimedBurst(count: number, speed: number): void {
    audioDirector.playSfx("fire", 100);
    for (let index = 0; index < count; index += 1) {
      const projectile = this.projectiles.create(
        this.boss.x + (this.boss.flipX ? -36 : 36),
        this.boss.y,
        "sunny",
        "cherry/cherry-1",
      ) as Phaser.Physics.Arcade.Image;
      projectile.setTint(0xff743d).setScale(this.isFinal ? 0.9 : 0.72);
      const angle = Phaser.Math.Angle.Between(
        projectile.x,
        projectile.y,
        this.player.x,
        this.player.y - 8,
      );
      const spread = (index - (count - 1) / 2) * 0.18;
      const projectileBody = projectile.body as Phaser.Physics.Arcade.Body;
      this.physics.velocityFromRotation(
        angle + spread,
        speed,
        projectileBody.velocity,
      );
      projectile.setData("bornAt", this.time.now);
    }
  }

  private onBossContact(): void {
    if (this.completing) return;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const bossBody = this.boss.body as Phaser.Physics.Arcade.Body;
    const stomp =
      playerBody.velocity.y > 90 && playerBody.bottom <= bossBody.center.y + 12;
    if (stomp && this.time.now >= this.bossInvulnerableUntil) {
      this.bossHealth -= 1;
      this.bossInvulnerableUntil = this.time.now + 720;
      playerBody.setVelocityY(-340);
      audioDirector.playSfx("bossHit", 140);
      if (useGameStore.getState().save.settings.screenShake)
        this.cameras.main.shake(110, 0.006);
      this.updateHud();
      if (this.bossHealth <= 0) this.defeatBoss();
    } else if (!stomp) {
      this.damagePlayer(false);
    }
  }

  private damagePlayer(fatal = false): void {
    if (this.completing || this.time.now < this.playerInvulnerableUntil) return;
    if (!fatal && this.playerHealth > 1) {
      this.playerHealth -= 1;
      this.playerInvulnerableUntil = this.time.now + 1300;
      this.player.setTint(0xff8d8d);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(
        this.player.x < this.boss.x ? -180 : 180,
        -270,
      );
      audioDirector.playSfx("hurt", 200);
      this.time.delayedCall(1300, () => this.player.clearTint());
      return;
    }

    this.playerHealth = 2;
    this.playerInvulnerableUntil = this.time.now + 1500;
    useGameStore.getState().loseLife();
    audioDirector.playSfx("hurt", 220);
    this.cameras.main.fadeOut(160, 28, 15, 30);
    this.time.delayedCall(190, () => {
      this.player.setPosition(70, 185).clearTint();
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.cameras.main.fadeIn(190, 28, 15, 30);
      this.updateHud();
    });
  }

  private cleanupProjectiles(): void {
    for (const member of this.projectiles.getChildren()) {
      const projectile = member as Phaser.Physics.Arcade.Image;
      if (
        projectile.active &&
        (projectile.x < -30 ||
          projectile.x > 510 ||
          projectile.y < -30 ||
          projectile.y > 300 ||
          this.time.now - Number(projectile.getData("bornAt")) > 6000)
      ) {
        projectile.disableBody(true, true);
      }
    }
  }

  private defeatBoss(): void {
    if (this.completing) return;
    this.completing = true;
    this.boss.disableBody(true, false);
    audioDirector.playSfx("clear", 500);
    this.tweens.add({
      targets: this.boss,
      alpha: 0,
      angle: 18,
      y: this.boss.y - 40,
      duration: 900,
      ease: "Cubic.easeOut",
    });
    useGameStore.getState().finishStage(this.stage.id, {
      exit: "normal",
      crowns: [...CROWN_PIECE_INDEXES],
      elapsedSeconds: Math.max(1, this.elapsedMs / 1000),
      coins: 0,
    });
    this.add
      .text(
        240,
        112,
        this.isFinal ? "THE CROWN IS FREE!" : "WARDEN DEFEATED!",
        {
          color: "#fff2a8",
          fontFamily: "Nunito Variable, sans-serif",
          fontSize: "25px",
          fontStyle: "900",
          stroke: "#33213f",
          strokeThickness: 7,
        },
      )
      .setOrigin(0.5)
      .setDepth(100);
    this.time.delayedCall(1700, () => {
      this.cameras.main.fadeOut(380, 8, 10, 22);
      this.time.delayedCall(400, () =>
        this.scene.start(getCompletionSceneForStage(this.stage)),
      );
    });
  }

  private updateHud(): void {
    const save = useGameStore.getState().save;
    useGameStore.getState().setHud({
      stageLabel: this.stage.label,
      stageTitle: this.stage.title,
      lives: save.lives,
      coins: save.coins,
      crowns: save.totalCrowns,
      time: Math.max(
        0,
        Math.ceil(this.stage.timeLimit - this.elapsedMs / 1000),
      ),
      bossHealth: Math.max(0, this.bossHealth / this.bossMaxHealth),
    });
  }

  private pauseGame(): void {
    if (this.paused) return;
    this.paused = true;
    this.physics.world.pause();
    this.anims.pauseAll();
    audioDirector.pauseAll();
    useGameStore.getState().setPaused(true);
  }

  private resumeGame(): void {
    if (!this.paused) return;
    this.restoreRuntime();
  }

  private restoreRuntime(): void {
    this.paused = false;
    this.physics.world.resume();
    this.anims.resumeAll();
    audioDirector.resumeAll();
    useGameStore.getState().setPaused(false);
  }

  private restartStage(): void {
    this.restoreRuntime();
    this.scene.restart({ nodeId: this.stage.id });
  }

  private returnToMap(): void {
    this.restoreRuntime();
    this.scene.start("WorldMap");
  }

  private shutdown(): void {
    gameEvents.off(GameEvent.Pause, this.pauseGame, this);
    gameEvents.off(GameEvent.Resume, this.resumeGame, this);
    gameEvents.off(GameEvent.Restart, this.restartStage, this);
    gameEvents.off(GameEvent.ReturnToMap, this.returnToMap, this);
  }
}
