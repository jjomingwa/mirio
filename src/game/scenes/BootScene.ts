import Phaser from "phaser";
import { WORLDS } from "../data/worlds";
import { useGameStore } from "../state/store";

const BASE = "/assets/sunnyland-base";
const FOREST = "/assets/sunnyland-forest";
const FANTASY = "/assets/fantasy";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  preload(): void {
    this.load.json("v2-manifest", "/assets/crowntrail-v2/manifest.json");
    this.load.image(
      "goldenwind-background",
      "/assets/crowntrail-v2/goldenwind-background.png",
    );
    this.load.atlas(
      "sunny",
      `${BASE}/atlas/atlas.png`,
      `${BASE}/atlas/atlas.json`,
    );
    this.load.atlas(
      "props",
      `${BASE}/atlas/atlas-props.png`,
      `${BASE}/atlas/atlas-props.json`,
    );

    this.load.image("bg-meadow-back", `${BASE}/environment/back.png`);
    this.load.image("bg-meadow-mid", `${BASE}/environment/middle.png`);
    this.load.image("bg-forest-back", `${FOREST}/environment/background.png`);
    this.load.image("bg-forest-mid", `${FOREST}/environment/middleground.png`);
    this.load.image(
      "bg-day-sky",
      `${FANTASY}/Environments/Day-Platformer/PNG/sky.png`,
    );
    this.load.image(
      "bg-day-clouds",
      `${FANTASY}/Environments/Day-Platformer/PNG/clouds.png`,
    );
    this.load.image(
      "bg-day-trees",
      `${FANTASY}/Environments/Day-Platformer/PNG/trees.png`,
    );
    this.load.image(
      "bg-lava-back",
      `${FANTASY}/Environments/lava-background/PNG/background.png`,
    );
    this.load.image(
      "bg-lava-mid",
      `${FANTASY}/Environments/lava-background/PNG/middle-rocks.png`,
    );
    this.load.image(
      "bg-mist-back",
      `${FANTASY}/Environments/mist-forest-background/layers/mist-forest-background-back.png`,
    );
    this.load.image(
      "bg-mist-trees",
      `${FANTASY}/Environments/mist-forest-background/layers/mist-forest-background-back-trees.png`,
    );
    this.load.image(
      "bg-mountain-sky",
      `${FANTASY}/Environments/sunny-rocky-mountains/PNG/sunny-mountains-sky.png`,
    );
    this.load.image(
      "bg-mountain-far",
      `${FANTASY}/Environments/sunny-rocky-mountains/PNG/sunny-mountains-far-back.png`,
    );
    this.load.image(
      "bg-mountain-hills",
      `${FANTASY}/Environments/sunny-rocky-mountains/PNG/sunny-mountains-hills.png`,
    );
    this.load.image(
      "bg-ship-back",
      `${FANTASY}/Environments/ships-graveyard/PNG/mockup/background.png`,
    );
    this.load.image(
      "bg-ship-mid",
      `${FANTASY}/Environments/ships-graveyard/PNG/mockup/middle.png`,
    );
    this.load.image(
      "bg-ship-front",
      `${FANTASY}/Environments/ships-graveyard/PNG/mockup/front.png`,
    );

    for (let index = 0; index < 6; index += 1) {
      this.load.image(
        `warden-idle-${index}`,
        `${FANTASY}/Sprites/Grotto-escape-2-boss-dragon/PNG/sprites/idle/_000${index}_Layer-${index + 1}.png`,
      );
    }
    for (let index = 0; index < 7; index += 1) {
      this.load.image(
        `warden-breath-${index}`,
        `${FANTASY}/Sprites/Grotto-escape-2-boss-dragon/PNG/sprites/breath/_000${index}_Layer-${index + 1}.png`,
      );
    }
    for (let index = 0; index < 9; index += 1) {
      this.load.image(
        `vespera-fly-${index}`,
        `${FANTASY}/Sprites/sunny-dragon/PNG/sprites/_000${index}_Layer-${index + 1}.png`,
      );
    }
  }

  create(): void {
    void WORLDS;
    this.createAnimations();
    useGameStore.getState().setMode("title");
    this.scene.start("Intro");
  }

  private createAnimations(): void {
    const add = (
      key: string,
      prefix: string,
      start: number,
      end: number,
      frameRate: number,
      repeat = -1,
    ) => {
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: Array.from({ length: end - start + 1 }, (_, offset) => ({
          key: "sunny",
          frame: `${prefix}${start + offset}`,
        })),
        frameRate,
        repeat,
      });
    };

    add("player-idle", "player/idle/player-idle-", 1, 4, 8);
    add("player-run", "player/run/player-run-", 1, 6, 13);
    add("player-jump", "player/jump/player-jump-", 1, 2, 8);
    add("opossum-walk", "opossum/opossum-", 1, 6, 10);
    add("frog-idle", "frog/idle/frog-idle-", 1, 4, 7);
    add("eagle-fly", "eagle/eagle-attack-", 1, 4, 9);
    add("coin-spin", "cherry/cherry-", 1, 7, 11);
    add("crown-shine", "gem/gem-", 1, 5, 9);
    add("enemy-pop", "enemy-death/enemy-death-", 1, 6, 13, 0);
  }
}
