import Phaser from "phaser";
import { getNode, getWorldForNode, WORLDS } from "../data/worlds";
import { getGameplaySceneForStage } from "../data/routing";
import type { StageNode, WorldDefinition } from "../data/types";
import { GameEvent, gameEvents } from "../events";
import { useGameStore } from "../state/store";
import { audioDirector } from "../systems/AudioDirector";

export class WorldMapScene extends Phaser.Scene {
  private world!: WorldDefinition;
  private currentNode!: StageNode;
  private avatar!: Phaser.GameObjects.Sprite;
  private selection!: Phaser.GameObjects.Arc;
  private title!: Phaser.GameObjects.Text;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private enter?: Phaser.Input.Keyboard.Key;
  private q?: Phaser.Input.Keyboard.Key;
  private e?: Phaser.Input.Keyboard.Key;
  private moving = false;

  constructor() {
    super("WorldMap");
  }

  create(): void {
    const store = useGameStore.getState();
    this.currentNode = getNode(store.save.currentNodeId);
    this.world = getWorldForNode(this.currentNode.id);
    store.setMode("map");
    store.setHud(null);
    audioDirector.applySettings(store.save.settings);
    audioDirector.playMusic("map");

    this.createBackdrop();
    this.drawPaths();
    this.drawNodes();

    this.selection = this.add
      .circle(this.currentNode.position.x, this.currentNode.position.y, 17)
      .setStrokeStyle(3, 0xfff3ad, 1);
    this.avatar = this.add
      .sprite(
        this.currentNode.position.x,
        this.currentNode.position.y - 18,
        "sunny",
        "player/idle/player-idle-1",
      )
      .setScale(0.82)
      .play("player-idle");

    this.title = this.add
      .text(240, 10, "", {
        align: "center",
        color: "#fff9e9",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "13px",
        fontStyle: "700",
        stroke: "#1c2840",
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0);
    this.updateTitle();

    this.add
      .text(240, 256, "방향키: 한 칸 이동  ·  Enter: 코스  ·  Q/E: 월드 전환", {
        color: "#f8f3dd",
        fontFamily: "Noto Sans KR Variable, sans-serif",
        fontSize: "9px",
        backgroundColor: "#152038cc",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5);

    this.cursors = this.input.keyboard?.createCursorKeys();
    this.enter = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.ENTER,
    );
    this.q = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.e = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.cameras.main.fadeIn(450, 10, 16, 29);
    gameEvents.emit(GameEvent.SceneReady, "WorldMap");
  }

  update(): void {
    if (this.moving) return;
    if (this.enter && Phaser.Input.Keyboard.JustDown(this.enter))
      this.launchCurrent();
    if (this.q && Phaser.Input.Keyboard.JustDown(this.q)) this.switchWorld(-1);
    if (this.e && Phaser.Input.Keyboard.JustDown(this.e)) this.switchWorld(1);
    if (this.cursors?.left && Phaser.Input.Keyboard.JustDown(this.cursors.left))
      this.moveByDirection(-1, 0);
    if (
      this.cursors?.right &&
      Phaser.Input.Keyboard.JustDown(this.cursors.right)
    )
      this.moveByDirection(1, 0);
    if (this.cursors?.up && Phaser.Input.Keyboard.JustDown(this.cursors.up))
      this.moveByDirection(0, -1);
    if (this.cursors?.down && Phaser.Input.Keyboard.JustDown(this.cursors.down))
      this.moveByDirection(0, 1);
  }

  private createBackdrop(): void {
    const keyByTheme: Record<string, [string, string?]> = {
      meadow: ["bg-meadow-back", "bg-meadow-mid"],
      desert: ["bg-day-sky", "bg-day-clouds"],
      coast: ["bg-ship-back", "bg-ship-mid"],
      forest: ["bg-forest-back", "bg-forest-mid"],
      frost: ["bg-mountain-sky", "bg-mountain-far"],
      mountain: ["bg-mountain-sky", "bg-mountain-hills"],
      sky: ["bg-day-sky", "bg-day-clouds"],
      lava: ["bg-lava-back", "bg-lava-mid"],
    };
    const [back, front] = keyByTheme[this.world.theme] ?? [
      "bg-meadow-back",
      "bg-meadow-mid",
    ];
    this.add
      .image(240, 135, back)
      .setDisplaySize(480, 270)
      .setTint(this.world.palette.haze);
    if (front)
      this.add.image(240, 155, front).setDisplaySize(480, 230).setAlpha(0.75);
    this.add.rectangle(240, 135, 480, 270, this.world.palette.sky, 0.16);
    this.add
      .text(14, 12, `WORLD ${this.world.number}  ${this.world.name}`, {
        color: "#ffffff",
        fontFamily: "Nunito Variable, Noto Sans KR Variable, sans-serif",
        fontSize: "15px",
        fontStyle: "900",
        stroke: "#202a44",
        strokeThickness: 4,
      })
      .setDepth(10);
  }

  private drawPaths(): void {
    const graphics = this.add.graphics();
    const save = useGameStore.getState().save;
    for (const source of this.world.nodes) {
      for (const [targetId, secret] of [
        ...source.next.map((id) => [id, false] as const),
        ...source.secretNext.map((id) => [id, true] as const),
      ]) {
        const target = getNode(targetId);
        if (target.worldId !== this.world.id) continue;
        const open =
          save.unlockedNodeIds.includes(source.id) &&
          save.unlockedNodeIds.includes(target.id);
        graphics.lineStyle(
          secret ? 3 : 5,
          open ? this.world.palette.path : 0x344052,
          open ? 0.95 : 0.48,
        );
        graphics.beginPath();
        graphics.moveTo(source.position.x, source.position.y);
        graphics.lineTo(target.position.x, target.position.y);
        graphics.strokePath();
        if (secret) {
          const midpoint = {
            x: (source.position.x + target.position.x) / 2,
            y: (source.position.y + target.position.y) / 2,
          };
          this.add.circle(
            midpoint.x,
            midpoint.y,
            4,
            open ? 0xffe178 : 0x4a5362,
            1,
          );
        }
      }
    }
  }

  private drawNodes(): void {
    const save = useGameStore.getState().save;
    for (const stage of this.world.nodes) {
      const unlocked = save.unlockedNodeIds.includes(stage.id);
      const cleared = save.clearedNodeIds.includes(stage.id);
      const secret = save.secretExitNodeIds.includes(stage.id);
      const container = this.add.container(stage.position.x, stage.position.y);
      const color = !unlocked
        ? 0x4a5362
        : cleared
          ? 0x77d69c
          : this.world.palette.accent;
      const marker = this.add.circle(
        0,
        0,
        stage.kind === "course" ? 11 : 14,
        color,
        1,
      );
      marker.setStrokeStyle(
        2,
        secret ? 0xffdf70 : 0xffffff,
        unlocked ? 0.9 : 0.35,
      );
      const label = this.add
        .text(
          0,
          stage.kind === "course" ? 0 : 1,
          stage.kind === "fortress"
            ? "Jr"
            : stage.kind === "final"
              ? "B"
              : (stage.label.split("-")[1] ?? stage.label),
          {
            color: "#172033",
            fontFamily: "Nunito Variable, sans-serif",
            fontSize: stage.kind === "course" ? "9px" : "8px",
            fontStyle: "900",
          },
        )
        .setOrigin(0.5);
      container.add([marker, label]);
      container.setSize(34, 34).setInteractive({ useHandCursor: true });
      container.on("pointerdown", () => this.onNodePointer(stage));
      if (!unlocked) container.setAlpha(0.65);
    }
  }

  private onNodePointer(stage: StageNode): void {
    if (stage.id === this.currentNode.id) {
      this.launchCurrent();
      return;
    }
    if (this.getAdjacent().some((candidate) => candidate.id === stage.id)) {
      this.moveTo(stage);
      return;
    }
    useGameStore.getState().setToast("이어진 길을 먼저 열어야 합니다.");
    gameEvents.emit(GameEvent.Toast, "이어진 길을 먼저 열어야 합니다.");
  }

  private getAdjacent(): StageNode[] {
    const save = useGameStore.getState().save;
    const ids = new Set([
      ...this.currentNode.next,
      ...this.currentNode.secretNext,
    ]);
    for (const candidate of this.world.nodes) {
      if (
        [...candidate.next, ...candidate.secretNext].includes(
          this.currentNode.id,
        )
      )
        ids.add(candidate.id);
    }
    return Array.from(ids)
      .map((id) => getNode(id))
      .filter(
        (node) =>
          node.worldId === this.world.id &&
          save.unlockedNodeIds.includes(node.id),
      );
  }

  private moveByDirection(dx: number, dy: number): void {
    const candidates = this.getAdjacent()
      .map((node) => {
        const x = node.position.x - this.currentNode.position.x;
        const y = node.position.y - this.currentNode.position.y;
        const length = Math.max(1, Math.hypot(x, y));
        return { node, score: (x / length) * dx + (y / length) * dy };
      })
      .filter((entry) => entry.score > 0.35)
      .sort((a, b) => b.score - a.score);
    if (candidates[0]) this.moveTo(candidates[0].node);
  }

  private moveTo(stage: StageNode): void {
    if (this.moving) return;
    this.moving = true;
    audioDirector.playSfx("menu");
    this.avatar.play("player-run");
    const duration = useGameStore.getState().save.settings.reducedMotion
      ? 120
      : 360;
    this.tweens.add({
      targets: this.selection,
      x: stage.position.x,
      y: stage.position.y,
      duration,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.avatar,
      x: stage.position.x,
      y: stage.position.y - 18,
      duration,
      ease: "Sine.easeInOut",
      onComplete: () => {
        this.currentNode = stage;
        useGameStore.getState().moveToNode(stage.id);
        this.avatar.play("player-idle");
        this.updateTitle();
        this.moving = false;
      },
    });
  }

  private updateTitle(): void {
    this.title?.setText(
      `${this.currentNode.label} · ${this.currentNode.title}`,
    );
  }

  private launchCurrent(): void {
    if (this.moving) return;
    audioDirector.playSfx("menu");
    this.cameras.main.fadeOut(300, 8, 12, 24);
    this.time.delayedCall(320, () => {
      this.scene.start(getGameplaySceneForStage(this.currentNode), {
        nodeId: this.currentNode.id,
      });
    });
  }

  private switchWorld(direction: number): void {
    const save = useGameStore.getState().save;
    const unlocked = WORLDS.filter((world) =>
      save.unlockedWorldIds.includes(world.id),
    );
    const currentIndex = unlocked.findIndex(
      (world) => world.id === this.world.id,
    );
    const target = unlocked[currentIndex + direction];
    if (!target) return;
    const node = [...target.nodes]
      .reverse()
      .find((candidate) => save.unlockedNodeIds.includes(candidate.id));
    if (!node) return;
    useGameStore.getState().moveToNode(node.id);
    this.scene.restart();
  }
}
