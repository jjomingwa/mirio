import Phaser from "phaser";

export const gameEvents = new Phaser.Events.EventEmitter();

export const GameEvent = {
  Start: "ui:start",
  Pause: "ui:pause",
  Resume: "ui:resume",
  Restart: "ui:restart",
  ReturnToMap: "ui:return-to-map",
  SettingsChanged: "ui:settings-changed",
  TouchInput: "ui:touch-input",
  Toast: "game:toast",
  SceneReady: "game:scene-ready",
  StageComplete: "game:stage-complete",
} as const;

export type TouchAction = "left" | "right" | "down" | "jump" | "run";

export interface TouchInputEvent {
  action: TouchAction;
  pressed: boolean;
}
