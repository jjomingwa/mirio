import type {
  CourseHazard,
  CourseLayout,
  CoursePickup,
  CoursePlatform,
  CourseSpawn,
  StageNode,
} from "../data/types";

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, min: number, max: number): number {
  return Math.round(min + random() * (max - min));
}

function nearestPlatform(
  platforms: CoursePlatform[],
  targetX: number,
): CoursePlatform {
  return platforms.reduce((closest, platform) =>
    Math.abs(platform.x - targetX) < Math.abs(closest.x - targetX)
      ? platform
      : closest,
  );
}

function overlapsRange(
  platform: CoursePlatform,
  start: number,
  end: number,
): boolean {
  return (
    platform.x + platform.width / 2 > start &&
    platform.x - platform.width / 2 < end
  );
}

export function buildCourse(stage: StageNode): CourseLayout {
  const random = mulberry32(stage.seed);
  const groundY = 236;
  const width = 2480 + stage.difficulty * 170 + between(random, 0, 180);
  const platforms: CoursePlatform[] = [];
  const enemies: CourseSpawn[] = [];
  const pickups: CoursePickup[] = [];
  const hazards: CourseHazard[] = [];
  const secretX = stage.secretExit ? width - 430 : undefined;
  let cursor = 0;
  let section = 0;

  while (cursor < width) {
    const remaining = width - cursor;
    const segmentWidth = Math.min(remaining, between(random, 260, 430));
    platforms.push({
      x: cursor + segmentWidth / 2,
      y: groundY,
      width: segmentWidth,
    });

    const sidePadding = 48;
    const platformGap = 16;
    const availableWidth = segmentWidth - sidePadding * 2;
    const requestedLedges = between(
      random,
      1,
      stage.pace === "vertical" ? 3 : 2,
    );
    const ledges =
      segmentWidth < 160
        ? 0
        : Math.max(
            1,
            Math.min(
              requestedLedges,
              Math.floor((availableWidth + platformGap) / (58 + platformGap)),
            ),
          );
    const maxLedgeWidth =
      ledges === 0
        ? 0
        : Math.floor((availableWidth - platformGap * (ledges - 1)) / ledges);
    const ledgeWidth =
      ledges === 0 ? 0 : between(random, 58, Math.min(96, maxLedgeWidth));
    const ledgeSpan =
      ledges * ledgeWidth + Math.max(0, ledges - 1) * platformGap;
    const ledgeStart = cursor + (segmentWidth - ledgeSpan) / 2;

    for (let index = 0; index < ledges; index += 1) {
      const ledgeX =
        ledgeStart + ledgeWidth / 2 + index * (ledgeWidth + platformGap);
      const tier =
        stage.pace === "vertical" ? index : index === 0 ? 0 : section % 2;
      const ledgeY = groundY - 48 - tier * 32 - between(random, 0, 4);
      const ledge: CoursePlatform = {
        x: ledgeX,
        y: ledgeY,
        width: ledgeWidth,
        oneWay: true,
      };

      if (
        secretX !== undefined &&
        overlapsRange(ledge, secretX - 205, secretX + 90)
      ) {
        continue;
      }

      if (
        stage.difficulty >= 4 &&
        index === ledges - 1 &&
        section % 3 === 1 &&
        stage.pace !== "gentle"
      ) {
        ledge.motion = {
          axis: stage.pace === "vertical" ? "y" : "x",
          distance: between(random, 38, 70),
          duration: between(random, 1500, 2400),
        };
      }

      platforms.push(ledge);

      const coinCount = between(
        random,
        2,
        Math.min(4, Math.floor((ledgeWidth - 8) / 20)),
      );
      for (let coin = 0; coin < coinCount; coin += 1) {
        pickups.push({
          type: "coin",
          x: ledgeX - (coinCount - 1) * 10 + coin * 20,
          y:
            ledgeY -
            24 -
            Math.sin((coin / Math.max(1, coinCount - 1)) * Math.PI) * 10,
        });
      }
    }

    if (cursor > 360 && cursor < width - 420) {
      const enemyCount = between(
        random,
        0,
        Math.min(3, 1 + Math.floor(stage.difficulty / 3)),
      );
      const roster: CourseSpawn["type"][] =
        stage.theme === "forest"
          ? ["frog", "ghost", "opossum"]
          : stage.theme === "sky"
            ? ["eagle", "ghost", "eagle"]
            : stage.theme === "lava"
              ? ["lizard", "opossum", "eagle"]
              : ["opossum", "frog", "eagle"];

      for (let enemy = 0; enemy < enemyCount; enemy += 1) {
        enemies.push({
          type: roster[between(random, 0, roster.length - 1)] ?? "opossum",
          x: cursor + 100 + enemy * 76,
          y: groundY - 28,
        });
      }
    }

    if (remaining <= segmentWidth) break;

    const gapWidth = between(
      random,
      stage.pace === "gentle" ? 38 : 48,
      Math.min(112, 68 + stage.difficulty * 4),
    );
    const hazardType: CourseHazard["type"] =
      stage.theme === "lava" ? "lava" : "spikes";
    if (section > 0 && stage.difficulty >= 2) {
      hazards.push({
        x: cursor + segmentWidth + gapWidth / 2,
        y: groundY + 4,
        width: gapWidth,
        type: hazardType,
      });
    }

    cursor += segmentWidth + gapWidth;
    section += 1;
  }

  const checkpointX = Math.round(width * 0.5);
  const goalX = width - 110;
  let secretGoal: CourseLayout["secretGoal"];

  if (secretX !== undefined) {
    platforms.push(
      { x: secretX - 150, y: groundY - 60, width: 80, oneWay: true },
      { x: secretX - 60, y: groundY - 105, width: 80, oneWay: true },
      { x: secretX + 35, y: groundY - 150, width: 90, oneWay: true },
    );
    secretGoal = { x: secretX + 35, y: groundY - 181 };
  }

  const elevatedPlatforms = platforms.filter(
    (platform) => platform.y < groundY - 20,
  );
  const crownHosts: CoursePlatform[] = [];
  const crowns: CoursePickup[] = [];
  for (let index = 0; index < 3; index += 1) {
    const targetX = width * (0.24 + index * 0.25);
    const availableHosts = elevatedPlatforms.filter(
      (platform) => !crownHosts.includes(platform),
    );
    const host = nearestPlatform(availableHosts, targetX);
    crownHosts.push(host);
    crowns.push({ type: "crown", index, x: host.x, y: host.y - 34 });
  }

  const separatedCoins = pickups.filter((pickup) =>
    crowns.every(
      (crown) => Math.hypot(pickup.x - crown.x, pickup.y - crown.y) >= 28,
    ),
  );

  return {
    width,
    groundY,
    platforms,
    enemies,
    pickups: [...separatedCoins, ...crowns],
    hazards,
    checkpointX,
    goalX,
    secretGoal,
  };
}
