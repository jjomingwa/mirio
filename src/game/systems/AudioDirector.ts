import { Howl, Howler } from "howler";
import type { GameSettings } from "../state/save";

export type MusicTrack = "intro" | "map" | "course" | "boss" | "finale";
export type SfxName =
  | "jump"
  | "coin"
  | "crown"
  | "hurt"
  | "stomp"
  | "checkpoint"
  | "menu"
  | "fire"
  | "bossHit"
  | "clear";

const musicSources: Record<MusicTrack, string> = {
  intro: "/assets/audio/music/exploration.ogg",
  map: "/assets/audio/music/exploration.ogg",
  course: "/assets/audio/music/platformer_level03_loop.ogg",
  boss: "/assets/audio/music/Going%20Up.ogg",
  finale: "/assets/audio/music/exploration.ogg",
};

const sfxSources: Record<SfxName, string> = {
  jump: "Jump.wav",
  coin: "Blink (life - money).wav",
  crown: "Blink (crystal - bottom).wav",
  hurt: "Let down.wav",
  stomp: "Enemy.wav",
  checkpoint: "Blinl (stuff - save point).wav",
  menu: "Blink (menu).wav",
  fire: "Blaster_short.wav",
  bossHit: "Gun_short.wav",
  clear: "Blink (relic - artifact).wav",
};

function sfxUrl(fileName: string): string {
  return `/assets/audio/sfx/${encodeURIComponent(fileName)}`;
}

class AudioDirector {
  private music = new Map<MusicTrack, Howl>();
  private sfx = new Map<SfxName, Howl>();
  private currentTrack: MusicTrack | null = null;
  private pendingTrack: { track: MusicTrack; fadeMs: number } | null = null;
  private unlocked = false;
  private musicVolume = 0.68;
  private sfxVolume = 0.82;
  private lastPlayed = new Map<SfxName, number>();

  constructor() {
    for (const [track, src] of Object.entries(musicSources) as [
      MusicTrack,
      string,
    ][]) {
      this.music.set(
        track,
        new Howl({
          src: [src],
          loop: true,
          preload: true,
          html5: false,
          volume: 0,
        }),
      );
    }

    for (const [name, file] of Object.entries(sfxSources) as [
      SfxName,
      string,
    ][]) {
      this.sfx.set(
        name,
        new Howl({
          src: [sfxUrl(file)],
          preload: true,
          html5: false,
          volume: this.sfxVolume,
          pool: 4,
        }),
      );
    }
  }

  async unlock(): Promise<void> {
    try {
      if (Howler.ctx?.state === "suspended") await Howler.ctx.resume();
      this.unlocked = true;
      const pending = this.pendingTrack;
      this.pendingTrack = null;
      if (pending) this.playMusic(pending.track, pending.fadeMs);
    } catch {
      this.unlocked = false;
    }
  }

  applySettings(settings: GameSettings): void {
    this.musicVolume = settings.musicVolume;
    this.sfxVolume = settings.sfxVolume;
    for (const sound of this.sfx.values()) sound.volume(this.sfxVolume);
    if (this.currentTrack)
      this.music.get(this.currentTrack)?.volume(this.musicVolume);
  }

  playMusic(track: MusicTrack, fadeMs = 700): void {
    if (!this.unlocked) {
      this.pendingTrack = { track, fadeMs };
      return;
    }
    if (this.currentTrack === track) return;

    const previousTrack = this.currentTrack;
    const previous = previousTrack ? this.music.get(previousTrack) : undefined;
    const next = this.music.get(track);
    if (!next) return;

    if (previous) {
      previous.fade(previous.volume(), 0, fadeMs);
      window.setTimeout(() => {
        if (this.currentTrack !== previousTrack) previous.stop();
      }, fadeMs + 30);
    }

    next.volume(0);
    next.play();
    next.fade(0, this.musicVolume, fadeMs);
    this.currentTrack = track;
  }

  playSfx(name: SfxName, cooldownMs = 45): void {
    if (!this.unlocked) return;
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < cooldownMs) return;

    this.lastPlayed.set(name, now);
    const sound = this.sfx.get(name);
    sound?.volume(this.sfxVolume);
    sound?.play();
  }

  pauseAll(): void {
    for (const sound of [...this.music.values(), ...this.sfx.values()])
      sound.pause();
  }

  resumeAll(): void {
    if (!this.unlocked || !this.currentTrack) return;
    const current = this.music.get(this.currentTrack);
    if (current && !current.playing()) current.play();
  }

  stopAll(): void {
    for (const sound of [...this.music.values(), ...this.sfx.values()])
      sound.stop();
    this.currentTrack = null;
    this.pendingTrack = null;
  }
}

export const audioDirector = new AudioDirector();
