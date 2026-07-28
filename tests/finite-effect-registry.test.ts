import { describe, expect, it } from "vitest";
import {
  ENEMY_POP_FRAME_COUNT,
  ENEMY_POP_FRAME_RATE,
  ENEMY_POP_MAX_LIFETIME_MS,
  FiniteEffectRegistry,
  type FiniteEffect,
  type ScheduleFiniteEffectCleanup,
} from "../src/game/systems/FiniteEffectRegistry";

class FakeEffect implements FiniteEffect {
  readonly listeners = new Set<() => void>();
  destroyCalls = 0;

  constructor(private readonly destroyError?: Error) {}

  onComplete(callback: () => void): void {
    this.listeners.add(callback);
  }

  offComplete(callback: () => void): void {
    this.listeners.delete(callback);
  }

  destroy(): void {
    this.destroyCalls += 1;
    if (this.destroyError) {
      throw this.destroyError;
    }
  }

  complete(): void {
    for (const callback of [...this.listeners]) {
      callback();
    }
  }

  completeTwice(): void {
    for (const callback of [...this.listeners]) {
      callback();
      callback();
    }
  }
}

class FakeScheduler {
  private nextId = 0;
  private readonly timers = new Map<number, () => void>();
  readonly delays: number[] = [];

  readonly schedule: ScheduleFiniteEffectCleanup = (delayMs, callback) => {
    const id = this.nextId;
    this.nextId += 1;
    this.delays.push(delayMs);
    this.timers.set(id, callback);

    return () => {
      this.timers.delete(id);
    };
  };

  fireAll(): void {
    for (const callback of [...this.timers.values()]) {
      callback();
    }
  }

  get activeCount(): number {
    return this.timers.size;
  }
}

const createHarness = () => {
  const scheduler = new FakeScheduler();
  const registry = new FiniteEffectRegistry(
    ENEMY_POP_MAX_LIFETIME_MS,
    scheduler.schedule,
  );
  return { registry, scheduler };
};

describe("finite effect registry", () => {
  it("documents a maximum lifetime longer than the full enemy-pop animation", () => {
    const animationDurationMs = Math.ceil(
      (ENEMY_POP_FRAME_COUNT / ENEMY_POP_FRAME_RATE) * 1000,
    );

    expect(ENEMY_POP_MAX_LIFETIME_MS).toBeGreaterThanOrEqual(
      animationDurationMs,
    );
  });

  it("cleans up an effect when its animation completes", () => {
    const { registry, scheduler } = createHarness();
    const effect = new FakeEffect();

    registry.track(effect);
    expect(registry.activeCount).toBe(1);
    expect(effect.listeners.size).toBe(1);
    expect(scheduler.activeCount).toBe(1);

    effect.complete();

    expect(effect.destroyCalls).toBe(1);
    expect(effect.listeners.size).toBe(0);
    expect(scheduler.activeCount).toBe(0);
    expect(registry.activeCount).toBe(0);
  });

  it("cleans up an effect when its maximum lifetime expires", () => {
    const { registry, scheduler } = createHarness();
    const effect = new FakeEffect();

    registry.track(effect);
    expect(scheduler.delays).toEqual([ENEMY_POP_MAX_LIFETIME_MS]);

    scheduler.fireAll();

    expect(effect.destroyCalls).toBe(1);
    expect(effect.listeners.size).toBe(0);
    expect(scheduler.activeCount).toBe(0);
    expect(registry.activeCount).toBe(0);
  });

  it("cleans up every tracked effect during shutdown", () => {
    const { registry, scheduler } = createHarness();
    const effects = [new FakeEffect(), new FakeEffect(), new FakeEffect()];
    effects.forEach((effect) => registry.track(effect));

    registry.destroyAll();

    expect(effects.map((effect) => effect.destroyCalls)).toEqual([1, 1, 1]);
    expect(
      effects.reduce((count, effect) => count + effect.listeners.size, 0),
    ).toBe(0);
    expect(scheduler.activeCount).toBe(0);
    expect(registry.activeCount).toBe(0);
  });

  it("cleans up later effects when an earlier destroy throws", () => {
    const { registry, scheduler } = createHarness();
    const destroyError = new Error("early destroy failed");
    const effects = [
      new FakeEffect(destroyError),
      new FakeEffect(),
      new FakeEffect(),
    ];
    effects.forEach((effect) => registry.track(effect));

    expect(() => registry.destroyAll()).toThrow(
      new AggregateError(
        [destroyError],
        "Failed to clean up all finite effects.",
      ),
    );

    expect(effects.map((effect) => effect.destroyCalls)).toEqual([1, 1, 1]);
    expect(
      effects.reduce((count, effect) => count + effect.listeners.size, 0),
    ).toBe(0);
    expect(scheduler.activeCount).toBe(0);
    expect(registry.activeCount).toBe(0);
  });

  it("does not retain sprites, listeners, or timers after 100 effects", () => {
    const { registry, scheduler } = createHarness();
    const effects = Array.from({ length: 100 }, () => new FakeEffect());

    for (const effect of effects) {
      registry.track(effect);
      effect.complete();
    }

    const liveSprites = effects.filter((effect) => effect.destroyCalls === 0);
    const listenerCount = effects.reduce(
      (count, effect) => count + effect.listeners.size,
      0,
    );

    expect(liveSprites).toHaveLength(0);
    expect(listenerCount).toBe(0);
    expect(scheduler.activeCount).toBe(0);
    expect(registry.activeCount).toBe(0);
  });

  it("does not destroy twice when completion is emitted twice", () => {
    const { registry, scheduler } = createHarness();
    const effect = new FakeEffect();

    registry.track(effect);
    effect.completeTwice();

    expect(effect.destroyCalls).toBe(1);
    expect(effect.listeners.size).toBe(0);
    expect(scheduler.activeCount).toBe(0);
    expect(registry.activeCount).toBe(0);
  });
});
