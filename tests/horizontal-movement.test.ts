import { describe, expect, it } from "vitest";
import { planHorizontalMovement } from "../src/game/systems/HorizontalMovement";

describe("horizontal movement", () => {
  it("brakes quickly when the player reverses on the ground", () => {
    const plan = planHorizontalMovement(-1, 156, true, false);
    expect(plan.velocityX).toBeCloseTo(43.68);
    expect(plan.accelerationX).toBe(-2350);
  });

  it("keeps air turns responsive without snapping", () => {
    const plan = planHorizontalMovement(1, -156, false, true);
    expect(plan.velocityX).toBeCloseTo(-96.72);
    expect(plan.accelerationX).toBe(1320);
    expect(plan.maxSpeed).toBe(222);
  });

  it("uses strong ground drag when directional input is released", () => {
    const plan = planHorizontalMovement(0, 120, true, false);
    expect(plan.accelerationX).toBe(0);
    expect(plan.dragX).toBe(1750);
  });
});
