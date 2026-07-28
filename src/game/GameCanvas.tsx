import { useEffect, useRef } from "react";
import type Phaser from "phaser";
import { createGame } from "./config";

export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    gameRef.current = createGame(hostRef.current);
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className="game-host"
      aria-label="Crowntrail Kingdom 게임 화면"
    />
  );
}
