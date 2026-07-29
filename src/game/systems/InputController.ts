import Phaser from "phaser";
import {
  GameEvent,
  gameEvents,
  type TouchAction,
  type TouchInputEvent,
} from "../events";

export interface InputSnapshot {
  left: boolean;
  right: boolean;
  down: boolean;
  run: boolean;
  runPressed: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  moveX: number;
  aimX: number;
  aimY: number;
  rushHeld: boolean;
  rushReleased: boolean;
}

export class InputController {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = new Map<TouchAction, boolean>();
  private previousJump = false;
  private previousRun = false;
  private previousRush = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = (scene.input.keyboard?.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      leftAlt: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.D,
      up: Phaser.Input.Keyboard.KeyCodes.UP,
      upAlt: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.DOWN,
      downAlt: Phaser.Input.Keyboard.KeyCodes.S,
      jump: Phaser.Input.Keyboard.KeyCodes.SPACE,
      jumpAlt: Phaser.Input.Keyboard.KeyCodes.UP,
      jumpAlt2: Phaser.Input.Keyboard.KeyCodes.W,
      run: Phaser.Input.Keyboard.KeyCodes.SHIFT,
      runAlt: Phaser.Input.Keyboard.KeyCodes.X,
    }) ?? {}) as Record<string, Phaser.Input.Keyboard.Key>;

    scene.input.keyboard?.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ]);

    gameEvents.on(GameEvent.TouchInput, this.onTouchInput, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  read(): InputSnapshot {
    const pad = this.scene.input.gamepad?.getPad(0);
    const padX = pad?.axes[0]?.getValue() ?? 0;
    const padY = pad?.axes[1]?.getValue() ?? 0;
    const buttonJump = Boolean(pad?.buttons[0]?.pressed);
    const jumpHeld =
      this.isDown("jump", "jumpAlt", "jumpAlt2") ||
      buttonJump ||
      this.touch.get("jump") === true;

    const run =
      this.isDown("run", "runAlt") ||
      Boolean(pad?.buttons[2]?.pressed) ||
      this.touch.get("run") === true;

    const left =
      this.isDown("left", "leftAlt") ||
      padX < -0.3 ||
      this.touch.get("left") === true;
    const right =
      this.isDown("right", "rightAlt") ||
      padX > 0.3 ||
      this.touch.get("right") === true;
    const up =
      this.isDown("up", "upAlt") ||
      padY < -0.45 ||
      this.touch.get("jump") === true;
    const down =
      this.isDown("down", "downAlt") ||
      padY > 0.45 ||
      this.touch.get("down") === true;

    const moveX = left === right ? 0 : left ? -1 : 1;

    let aimX = 0;
    let aimY = 0;

    if (Math.hypot(padX, padY) > 0.3) {
      aimX = padX;
      aimY = padY;
    } else {
      if (left) aimX -= 1;
      if (right) aimX += 1;
      if (up) aimY -= 1;
      if (down) aimY += 1;
    }

    const aimMag = Math.hypot(aimX, aimY);
    if (aimMag > 0) {
      aimX /= aimMag;
      aimY /= aimMag;
    }

    const rushHeld = run;
    const rushReleased = !rushHeld && this.previousRush;

    const snapshot: InputSnapshot = {
      left,
      right,
      down,
      run,
      runPressed: run && !this.previousRun,
      jumpHeld,
      jumpPressed: jumpHeld && !this.previousJump,
      moveX,
      aimX,
      aimY,
      rushHeld,
      rushReleased,
    };

    this.previousJump = jumpHeld;
    this.previousRun = run;
    this.previousRush = rushHeld;
    return snapshot;
  }

  private isDown(...names: string[]): boolean {
    return names.some((name) => this.keys[name]?.isDown === true);
  }

  private onTouchInput(event: TouchInputEvent): void {
    this.touch.set(event.action, event.pressed);
  }

  private destroy(): void {
    gameEvents.off(GameEvent.TouchInput, this.onTouchInput, this);
    this.touch.clear();
  }
}
