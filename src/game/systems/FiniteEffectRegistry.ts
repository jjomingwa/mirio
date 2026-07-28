export interface FiniteEffect {
  onComplete(callback: () => void): void;
  offComplete(callback: () => void): void;
  destroy(): void;
}

export type ScheduleFiniteEffectCleanup = (
  delayMs: number,
  callback: () => void,
) => () => void;

export const ENEMY_POP_FRAME_COUNT = 6;
export const ENEMY_POP_FRAME_RATE = 13;

/**
 * Six frames at 13 fps need 462 ms; the extra 250 ms is a modest fallback
 * margin for delayed animation callbacks without allowing an unbounded effect.
 */
export const ENEMY_POP_MAX_LIFETIME_MS =
  Math.ceil((ENEMY_POP_FRAME_COUNT / ENEMY_POP_FRAME_RATE) * 1000) + 250;

export class FiniteEffectRegistry {
  private readonly cleanups = new Map<FiniteEffect, () => void>();

  constructor(
    private readonly maxLifetimeMs: number,
    private readonly schedule: ScheduleFiniteEffectCleanup,
  ) {}

  track(effect: FiniteEffect): void {
    if (this.cleanups.has(effect)) {
      return;
    }

    let cleaned = false;
    let cancelTimeout: (() => void) | undefined;

    const cleanup = (): void => {
      if (cleaned) {
        return;
      }
      cleaned = true;

      try {
        effect.offComplete(cleanup);
      } finally {
        try {
          cancelTimeout?.();
        } finally {
          try {
            effect.destroy();
          } finally {
            this.cleanups.delete(effect);
          }
        }
      }
    };

    this.cleanups.set(effect, cleanup);

    try {
      effect.onComplete(cleanup);
      if (cleaned) {
        return;
      }

      const cancel = this.schedule(this.maxLifetimeMs, cleanup);
      if (cleaned) {
        cancel();
      } else {
        cancelTimeout = cancel;
      }
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  destroyAll(): void {
    const errors: unknown[] = [];

    for (const cleanup of [...this.cleanups.values()]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        "Failed to clean up all finite effects.",
      );
    }
  }

  get activeCount(): number {
    return this.cleanups.size;
  }
}
