import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { BossScene } from "./scenes/BossScene";
import { EndingScene } from "./scenes/EndingScene";
import { IntroScene } from "./scenes/IntroScene";
import { LevelScene } from "./scenes/LevelScene";
import { WorldMapScene } from "./scenes/WorldMapScene";

export const GAME_WIDTH = 480;
export const GAME_HEIGHT = 270;

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: "#111827",
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    antialiasGL: false,
    render: {
      powerPreference: "high-performance",
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 1200 },
        debug: false,
      },
    },
    input: {
      gamepad: true,
    },
    scene: [
      BootScene,
      IntroScene,
      WorldMapScene,
      LevelScene,
      BossScene,
      EndingScene,
    ],
  });
}
