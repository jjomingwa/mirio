import Phaser from "phaser";
import { getNode } from "../data/worlds";
import type { CourseLayout, StageNode, ThemeId } from "../data/types";
import { GameEvent, gameEvents } from "../events";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";
import { buildCourse } from "../systems/CourseBuilder";
import {
  ENEMY_POP_MAX_LIFETIME_MS,
  FiniteEffectRegistry,
} from "../systems/FiniteEffectRegistry";
import { InputController } from "../systems/InputController";
import { planHorizontalMovement } from "../systems/HorizontalMovement";
import {
  advanceCrownRush,
  createCrownRushState,
  type CrownRushState,
} from "../systems/CrownRush";

interface SceneData {
  nodeId: string;
}

interface ParallaxLayer {
  sprite: Phaser.GameObjects.TileSprite;
  factor: number;
}

export class LevelScene extends Phaser.Scene {
  private stage!: StageNode;
  private layout!: CourseLayout;
  private player!: Phaser.Physics.Arcade.Sprite;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private movingPlatforms!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private pickups!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.StaticGroup;
  private controller!: InputController;
  private parallax: ParallaxLayer[] = [];
  private elapsedMs = 0;
  private lastHudMs = 0;
  private lastGroundedMs = -Infinity;
  private jumpBufferedMs = -Infinity;
  private invulnerableUntil = 0;
  private respawnX = 82;
  private hitPoints = 2;
  private stageCoins = 0;
  private crowns = new Set<number>();
  private completing = false;
  private paused = false;
  private defeatedEnemies = new WeakSet<Phaser.Physics.Arcade.Sprite>();
  private enemyPopEffects?: FiniteEffectRegistry;
  private crownRush: CrownRushState = createCrownRushState();
  private crownRushDirection: -1 | 1 = 1;

  constructor() {
    super("Level");
  }

  init(data: SceneData): void {
    this.stage = getNode(data.nodeId);
    this.layout = buildCourse(this.stage);
    this.parallax = [];
    this.elapsedMs = 0;
    this.lastHudMs = 0;
    this.lastGroundedMs = -Infinity;
    this.jumpBufferedMs = -Infinity;
    this.invulnerableUntil = 0;
    this.respawnX = 82;
    this.hitPoints = 2;
    this.stageCoins = 0;
    this.crowns = new Set<number>();
    this.completing = false;
    this.paused = false;
    this.defeatedEnemies = new WeakSet<Phaser.Physics.Arcade.Sprite>();
    this.crownRush = createCrownRushState();
    this.crownRushDirection = 1;
  }

  create(): void {
    this.enemyPopEffects = new FiniteEffectRegistry(
      ENEMY_POP_MAX_LIFETIME_MS,
      (delayMs, callback) => {
        const timer = this.time.delayedCall(delayMs, callback);
        return () => timer.remove(false);
      },
    );
    const store = useGameStore.getState();
    this.physics.world.resume();
    this.anims.resumeAll();
    store.setPaused(false);
    store.setMode("course");
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic(this.stage.kind === "castle" ? "boss" : "course");

    this.physics.world.setBounds(0, 0, this.layout.width, 360);
    this.createBackground();
    this.platforms = this.physics.add.staticGroup();
    this.movingPlatforms = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.enemies = this.physics.add.group();
    this.pickups = this.physics.add.group({
      allowGravity: false,
      immovable: true,
    });
    this.hazards = this.physics.add.staticGroup();

    this.createTerrain();
    this.createDecor();
    this.createPickups();
    this.createEnemies();
    this.createPlayer();
    this.createCheckpointAndGoals();
    this.controller = new InputController(this);
    useGameStore
      .getState()
      .setToast("CROWN RUSH: move, then press SHIFT or X to burst forward.");

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.player, this.movingPlatforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.collider(this.enemies, this.movingPlatforms);
    this.physics.add.overlap(this.player, this.enemies, (_player, enemy) => {
      this.onEnemyOverlap(enemy as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.pickups, (_player, pickup) => {
      this.onPickup(pickup as Phaser.Physics.Arcade.Sprite);
    });
    this.physics.add.overlap(this.player, this.hazards, () =>
      this.damagePlayer(true),
    );

    this.cameras.main.setBounds(0, 0, this.layout.width, 270);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.12, -86, 18);
    this.cameras.main.setDeadzone(120, 72);
    this.cameras.main.fadeIn(420, 9, 14, 28);

    gameEvents.on(GameEvent.Pause, this.pauseGame, this);
    gameEvents.on(GameEvent.Resume, this.resumeGame, this);
    gameEvents.on(GameEvent.Restart, this.restartStage, this);
    gameEvents.on(GameEvent.ReturnToMap, this.returnToMap, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
    gameEvents.emit(GameEvent.SceneReady, "Level");
    this.updateHud(true);
  }

  update(time: number, delta: number): void {
    if (this.completing || this.paused) return;
    this.elapsedMs += delta;
    const input = this.controller.read();
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const grounded = body.blocked.down || body.touching.down;

    if (grounded) this.lastGroundedMs = time;
    if (input.jumpPressed) this.jumpBufferedMs = time;

    const direction: -1 | 0 | 1 =
      input.left === input.right ? 0 : input.left ? -1 : 1;
    const wasRushing = this.crownRush.phase === "rushing";
    const rush = advanceCrownRush(this.crownRush, {
      now: time,
      grounded,
      pressed: input.runPressed,
      direction,
    });
    this.crownRush = rush.state;
    if (rush.activation) {
      this.crownRushDirection = rush.activation.direction;
      this.player.setTint(0xffdf72);
      audioDirector.playSfx("jump", 55);
    }
    if (wasRushing && this.crownRush.phase !== "rushing") {
      this.player.clearTint();
    }

    if (this.crownRush.phase === "rushing") {
      body
        .setVelocityX(this.crownRushDirection * 390)
        .setAccelerationX(0)
        .setDragX(0)
        .setMaxVelocity(390, 760);
    } else {
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
    }
    if (direction !== 0) this.player.setFlipX(direction < 0);

    if (
      time - this.lastGroundedMs <= 110 &&
      time - this.jumpBufferedMs <= 125
    ) {
      body.setVelocityY(-470);
      this.lastGroundedMs = -Infinity;
      this.jumpBufferedMs = -Infinity;
      audioDirector.playSfx("jump", 80);
    }

    if (!input.jumpHeld && body.velocity.y < -185) body.setVelocityY(-185);
    if (input.down && !grounded && body.velocity.y > 0)
      body.setVelocityY(body.velocity.y + 24);

    this.updatePlayerAnimation(grounded, input.down);
    this.updateEnemies(time);
    this.updateParallax();
    this.updateHud(false);

    if (this.player.y > 318 || this.elapsedMs >= this.stage.timeLimit * 1000) {
      this.damagePlayer(true, true);
    }
  }

  private createBackground(): void {
    const keys: Record<ThemeId, [string, string, number, number]> = {
      meadow: ["bg-meadow-back", "bg-meadow-mid", 0xffffff, 0xffffff],
      desert: ["bg-day-sky", "bg-day-clouds", 0xffc46b, 0xffdda0],
      coast: ["bg-ship-back", "bg-ship-mid", 0x87d9e5, 0xa9f1dd],
      forest: ["bg-mist-back", "bg-mist-trees", 0x8db5a0, 0x9fc39a],
      frost: ["bg-mountain-sky", "bg-mountain-far", 0xb5e6ff, 0xd9f6ff],
      mountain: ["bg-mountain-sky", "bg-mountain-hills", 0xaeb9c8, 0xb6a995],
      sky: ["bg-day-sky", "bg-day-clouds", 0xc0c8ff, 0xf0e8ff],
      lava: ["bg-lava-back", "bg-lava-mid", 0xffffff, 0xffb06b],
    };
    const [backKey, frontKey, backTint, frontTint] = keys[this.stage.theme];
    const back = this.add
      .tileSprite(240, 135, 480, 270, backKey)
      .setScrollFactor(0)
      .setTint(backTint)
      .setDepth(-30);
    const front = this.add
      .tileSprite(240, 160, 480, 220, frontKey)
      .setScrollFactor(0)
      .setTint(frontTint)
      .setAlpha(this.stage.theme === "lava" ? 0.9 : 0.78)
      .setDepth(-20);
    this.parallax.push(
      { sprite: back, factor: 0.08 },
      { sprite: front, factor: 0.24 },
    );
    this.add
      .rectangle(
        240,
        135,
        480,
        270,
        this.stage.theme === "lava" ? 0x2c1320 : 0x5f83a8,
        0.08,
      )
      .setScrollFactor(0)
      .setDepth(-10);
  }

  private createTerrain(): void {
    for (const platform of this.layout.platforms) {
      const frame = platform.oneWay
        ? "platform-long"
        : this.stage.theme === "lava"
          ? "block-big"
          : "block";
      const visual = this.add
        .tileSprite(
          platform.x,
          platform.y,
          platform.width,
          platform.oneWay ? 12 : 20,
          "props",
          frame,
        )
        .setDepth(5);

      if (platform.motion) {
        this.physics.add.existing(visual);
        const body = visual.body as Phaser.Physics.Arcade.Body;
        body.setAllowGravity(false).setImmovable(true);
        this.movingPlatforms.add(visual);
        const axis = platform.motion.axis;
        this.tweens.add({
          targets: visual,
          [axis]: platform[axis] + platform.motion.distance,
          duration: platform.motion.duration,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      } else {
        this.platforms.add(visual);
        (
          visual.body as Phaser.Physics.Arcade.StaticBody
        ).updateFromGameObject();
      }
    }

    for (const hazard of this.layout.hazards) {
      const frame = hazard.type === "lava" ? "spike-skull" : "spikes";
      const visual = this.add
        .tileSprite(hazard.x, hazard.y, hazard.width, 14, "props", frame)
        .setTint(hazard.type === "lava" ? 0xff6b35 : 0xffffff)
        .setDepth(7);
      this.hazards.add(visual);
      (visual.body as Phaser.Physics.Arcade.StaticBody).updateFromGameObject();
    }
  }

  private createDecor(): void {
    const frames =
      this.stage.theme === "forest"
        ? ["tree", "shrooms", "bush", "rock"]
        : this.stage.theme === "lava"
          ? ["skulls", "face-block", "rock"]
          : ["bush", "tree", "rock", "shrooms"];
    for (let x = 180; x < this.layout.width; x += 280 + (x % 93)) {
      const frame = frames[Math.floor(x / 200) % frames.length] ?? "bush";
      this.add
        .image(x, this.layout.groundY - 9, "props", frame)
        .setOrigin(0.5, 1)
        .setAlpha(0.88)
        .setDepth(2);
    }
  }

  private createPickups(): void {
    for (const pickup of this.layout.pickups) {
      const sprite = this.pickups.create(
        pickup.x,
        pickup.y,
        "sunny",
        pickup.type === "coin" ? "cherry/cherry-1" : "gem/gem-1",
      ) as Phaser.Physics.Arcade.Sprite;
      sprite.setData("pickupType", pickup.type);
      if (pickup.index !== undefined)
        sprite.setData("crownIndex", pickup.index);
      sprite.play(pickup.type === "coin" ? "coin-spin" : "crown-shine");
      sprite.setScale(pickup.type === "coin" ? 0.66 : 0.82);
    }
  }

  private createEnemies(): void {
    for (const spawn of this.layout.enemies) {
      const frame =
        spawn.type === "frog"
          ? "frog/idle/frog-idle-1"
          : spawn.type === "eagle" || spawn.type === "ghost"
            ? "eagle/eagle-attack-1"
            : "opossum/opossum-1";
      const enemy = this.enemies.create(
        spawn.x,
        spawn.y,
        "sunny",
        frame,
      ) as Phaser.Physics.Arcade.Sprite;
      enemy.setData("enemyType", spawn.type);
      enemy.setData("originX", spawn.x);
      enemy.setData("nextAction", 0);
      enemy.setVelocityX(-42 - this.stage.difficulty * 2);
      enemy.setCollideWorldBounds(false);

      if (spawn.type === "frog") enemy.play("frog-idle");
      else if (spawn.type === "eagle" || spawn.type === "ghost") {
        enemy.play("eagle-fly");
        (enemy.body as Phaser.Physics.Arcade.Body).setAllowGravity(false);
        if (spawn.type === "ghost") enemy.setTint(0xbba7ff).setAlpha(0.82);
      } else {
        enemy.play("opossum-walk");
        if (spawn.type === "lizard") enemy.setTint(0xff8f6b);
      }
    }
  }

  private createCheckpointAndGoals(): void {
    const checkpoint = this.physics.add.staticImage(
      this.layout.checkpointX,
      this.layout.groundY - 20,
      "props",
      "sign",
    );
    checkpoint.setData("activated", false);
    this.physics.add.overlap(this.player, checkpoint, () => {
      if (checkpoint.getData("activated")) return;
      checkpoint.setData("activated", true);
      checkpoint.setTint(0x9bf0a7);
      this.respawnX = this.layout.checkpointX;
      audioDirector.playSfx("checkpoint", 300);
      useGameStore.getState().setToast("체크포인트");
    });

    const normalGoal = this.physics.add.staticImage(
      this.layout.goalX,
      this.layout.groundY - 24,
      "props",
      "door",
    );
    normalGoal.setScale(1.35).refreshBody();
    this.physics.add.overlap(this.player, normalGoal, () =>
      this.finish("normal"),
    );

    if (this.layout.secretGoal) {
      const secretGoal = this.physics.add.staticImage(
        this.layout.secretGoal.x,
        this.layout.secretGoal.y,
        "props",
        "door",
      );
      secretGoal.setTint(0xffdc73).setScale(1.15).refreshBody();
      this.add
        .text(
          this.layout.secretGoal.x,
          this.layout.secretGoal.y - 31,
          "SECRET",
          {
            color: "#fff0a8",
            fontFamily: "Nunito Variable, sans-serif",
            fontSize: "8px",
            fontStyle: "900",
            stroke: "#432f50",
            strokeThickness: 3,
          },
        )
        .setOrigin(0.5);
      this.physics.add.overlap(this.player, secretGoal, () =>
        this.finish("secret"),
      );
    }
  }

  private createPlayer(): void {
    this.player = this.physics.add.sprite(
      this.respawnX,
      this.layout.groundY - 54,
      "sunny",
      "player/idle/player-idle-1",
    );
    this.player.setDepth(20).setScale(1.05).play("player-idle");
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body
      .setSize(15, 24)
      .setOffset(8, 7)
      .setMaxVelocity(222, 760)
      .setDragX(1450);
  }

  private updatePlayerAnimation(grounded: boolean, crouching: boolean): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!grounded) {
      if (this.player.anims.currentAnim?.key !== "player-jump")
        this.player.play("player-jump");
    } else if (crouching) {
      this.player.stop().setFrame("player/crouch/player-crouch-1");
    } else if (Math.abs(body.velocity.x) > 18) {
      if (this.player.anims.currentAnim?.key !== "player-run")
        this.player.play("player-run");
    } else if (this.player.anims.currentAnim?.key !== "player-idle") {
      this.player.play("player-idle");
    }
  }

  private updateEnemies(time: number): void {
    for (const member of this.enemies.getChildren()) {
      const enemy = member as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      const type = enemy.getData("enemyType") as string;

      if (
        type === "frog" &&
        body.blocked.down &&
        time > Number(enemy.getData("nextAction"))
      ) {
        enemy.setData("nextAction", time + 1600 + this.stage.difficulty * 40);
        body.setVelocityY(-330);
        body.setVelocityX(this.player.x < enemy.x ? -62 : 62);
      } else if (type === "eagle" || type === "ghost") {
        const origin = Number(enemy.getData("originX"));
        enemy.y += Math.sin((time + origin) / 360) * 0.35;
        body.setVelocityX(this.player.x < enemy.x ? -46 : 46);
      } else if (
        body.blocked.left ||
        body.blocked.right ||
        Math.abs(enemy.x - Number(enemy.getData("originX"))) > 150
      ) {
        body.setVelocityX(body.velocity.x === 0 ? -48 : -body.velocity.x);
        enemy.setFlipX(body.velocity.x > 0);
      }
    }
  }

  private updateParallax(): void {
    for (const layer of this.parallax) {
      layer.sprite.tilePositionX = this.cameras.main.scrollX * layer.factor;
    }
  }

  private onEnemyOverlap(enemy: Phaser.Physics.Arcade.Sprite): void {
    if (!enemy.active || this.completing) return;
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    const enemyBody = enemy.body as Phaser.Physics.Arcade.Body;
    const stomping =
      playerBody.velocity.y > 80 && playerBody.bottom <= enemyBody.center.y + 8;
    if (stomping || this.crownRush.phase === "rushing") {
      if (this.defeatedEnemies.has(enemy)) return;
      this.defeatedEnemies.add(enemy);
      enemy.disableBody(true, true);
      if (stomping) playerBody.setVelocityY(-285);
      audioDirector.playSfx("stomp", 90);
      this.createEnemyPop(enemy.x, enemy.y);
    } else {
      this.damagePlayer(false);
    }
  }

  private createEnemyPop(x: number, y: number): void {
    const pop = this.add.sprite(x, y, "sunny", "enemy-death/enemy-death-1");
    const completionEvent = Phaser.Animations.Events.ANIMATION_COMPLETE;

    this.enemyPopEffects?.track({
      onComplete: (callback) => pop.once(completionEvent, callback),
      offComplete: (callback) => pop.off(completionEvent, callback),
      destroy: () => pop.destroy(),
    });
    pop.play("enemy-pop");
  }

  private onPickup(pickup: Phaser.Physics.Arcade.Sprite): void {
    if (!pickup.active) return;
    const type = pickup.getData("pickupType") as "coin" | "crown";
    if (type === "coin") {
      this.stageCoins += 1;
      audioDirector.playSfx("coin");
    } else {
      this.crowns.add(Number(pickup.getData("crownIndex")));
      audioDirector.playSfx("crown", 120);
    }
    this.tweens.add({
      targets: pickup,
      y: pickup.y - 18,
      alpha: 0,
      duration: 220,
      onComplete: () => pickup.disableBody(true, true),
    });
    this.updateHud(true);
  }

  private damagePlayer(fatal: boolean, fell = false): void {
    if (this.completing || this.time.now < this.invulnerableUntil) return;
    if (!fatal && this.hitPoints > 1) {
      this.hitPoints -= 1;
      this.invulnerableUntil = this.time.now + 1300;
      this.player.setTint(0xff8f8f);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(
        this.player.flipX ? 170 : -170,
        -260,
      );
      audioDirector.playSfx("hurt", 200);
      this.time.delayedCall(1300, () => this.player.clearTint());
      if (useGameStore.getState().save.settings.screenShake)
        this.cameras.main.shake(90, 0.004);
      return;
    }

    this.hitPoints = 2;
    this.invulnerableUntil = this.time.now + 1500;
    useGameStore.getState().loseLife();
    audioDirector.playSfx("hurt", 220);
    this.cameras.main.fadeOut(180, 28, 20, 35);
    this.time.delayedCall(210, () => {
      this.player.setPosition(this.respawnX, this.layout.groundY - 64);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(
        0,
        fell ? 0 : -80,
      );
      this.player.clearTint().setAlpha(1);
      this.cameras.main.fadeIn(220, 28, 20, 35);
      this.updateHud(true);
    });
  }

  private finish(exit: "normal" | "secret"): void {
    if (this.completing) return;
    this.completing = true;
    (this.player.body as Phaser.Physics.Arcade.Body).enable = false;
    this.player.play("player-idle");
    audioDirector.playSfx("clear", 400);
    const store = useGameStore.getState();
    store.finishStage(this.stage.id, {
      exit,
      crowns: Array.from(this.crowns),
      elapsedSeconds: Math.max(1, this.elapsedMs / 1000),
      coins: this.stageCoins,
    });
    this.add
      .text(
        240 + this.cameras.main.scrollX,
        112,
        exit === "secret" ? "SECRET ROUTE!" : "COURSE CLEAR!",
        {
          color: exit === "secret" ? "#ffe379" : "#ffffff",
          fontFamily: "Nunito Variable, sans-serif",
          fontSize: "27px",
          fontStyle: "900",
          stroke: "#26304b",
          strokeThickness: 7,
        },
      )
      .setOrigin(0.5)
      .setDepth(100);
    gameEvents.emit(GameEvent.StageComplete, { nodeId: this.stage.id, exit });
    this.time.delayedCall(1500, () => {
      this.cameras.main.fadeOut(300, 8, 12, 24);
      this.time.delayedCall(320, () => this.scene.start("WorldMap"));
    });
  }

  private updateHud(force: boolean): void {
    if (!force && this.elapsedMs - this.lastHudMs < 160) return;
    this.lastHudMs = this.elapsedMs;
    const save = useGameStore.getState().save;
    useGameStore.getState().setHud({
      stageLabel: this.stage.label,
      stageTitle: this.stage.title,
      lives: save.lives,
      coins: save.coins + this.stageCoins,
      crowns: this.crowns.size,
      time: Math.max(
        0,
        Math.ceil(this.stage.timeLimit - this.elapsedMs / 1000),
      ),
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
    this.enemyPopEffects?.destroyAll();
    this.enemyPopEffects = undefined;
    gameEvents.off(GameEvent.Pause, this.pauseGame, this);
    gameEvents.off(GameEvent.Resume, this.resumeGame, this);
    gameEvents.off(GameEvent.Restart, this.restartStage, this);
    gameEvents.off(GameEvent.ReturnToMap, this.returnToMap, this);
  }
}
