export interface HorizontalMovementPlan {
  accelerationX: number;
  dragX: number;
  maxSpeed: number;
  velocityX: number;
}

export function planHorizontalMovement(
  direction: -1 | 0 | 1,
  velocityX: number,
  grounded: boolean,
  running: boolean,
): HorizontalMovementPlan {
  const maxSpeed = running ? 222 : 156;
  if (direction === 0) {
    return {
      accelerationX: 0,
      dragX: grounded ? 1750 : 110,
      maxSpeed,
      velocityX,
    };
  }

  const reversing =
    Math.abs(velocityX) > 8 && Math.sign(velocityX) !== direction;
  return {
    accelerationX:
      direction *
      (grounded ? (reversing ? 2350 : 1480) : reversing ? 1320 : 840),
    dragX: grounded ? 880 : 70,
    maxSpeed,
    velocityX: reversing ? velocityX * (grounded ? 0.28 : 0.62) : velocityX,
  };
}
