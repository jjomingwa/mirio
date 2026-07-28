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
  jumpHeld: boolean;
  jumpPressed: boolean;
}

export class InputController {
  private keys: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = new Map<TouchAction, boolean>();
  private previousJump = false;

  constructor(private readonly scene: Phaser.Scene) {
    this.keys = (scene.input.keyboard?.addKeys({
      left: Phaser.Input.Keyboard.KeyCodes.LEFT,
      leftAlt: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.D,
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
    const horizontal = pad?.axes[0]?.getValue() ?? 0;
    const vertical = pad?.axes[1]?.getValue() ?? 0;
    const buttonJump = Boolean(pad?.buttons[0]?.pressed);
    const jumpHeld =
      this.isDown("jump", "jumpAlt", "jumpAlt2") ||
      buttonJump ||
      this.touch.get("jump") === true;

    const snapshot: InputSnapshot = {
      left:
        this.isDown("left", "leftAlt") ||
        horizontal < -0.3 ||
        this.touch.get("left") === true,
      right:
        this.isDown("right", "rightAlt") ||
        horizontal > 0.3 ||
        this.touch.get("right") === true,
      down:
        this.isDown("down", "downAlt") ||
        vertical > 0.45 ||
        this.touch.get("down") === true,
      run:
        this.isDown("run", "runAlt") ||
        Boolean(pad?.buttons[2]?.pressed) ||
        this.touch.get("run") === true,
      jumpHeld,
      jumpPressed: jumpHeld && !this.previousJump,
    };

    this.previousJump = jumpHeld;
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
