export type GameAudioCue = "opening" | "wrong" | "repeat";

export interface GameAudioState {
  enabled: boolean;
  volume: number;
  playingCue: GameAudioCue | null;
  error: string | null;
}

export interface AudioTone {
  start: number;
  duration: number;
  frequency: number;
  endFrequency?: number;
  gain: number;
  type: OscillatorType;
}

export interface AudioCuePlan {
  duration: number;
  tones: AudioTone[];
}

type StateListener = (state: GameAudioState) => void;

const preferencesKey = "wangz-game-audio";

const cuePlans: Record<GameAudioCue, AudioCuePlan> = {
  opening: {
    duration: 2.35,
    tones: [
      { start: 0, duration: 0.3, frequency: 261.63, gain: 0.15, type: "triangle" },
      { start: 0.27, duration: 0.3, frequency: 329.63, gain: 0.16, type: "triangle" },
      { start: 0.54, duration: 0.3, frequency: 392, gain: 0.17, type: "triangle" },
      { start: 0.81, duration: 0.36, frequency: 523.25, gain: 0.18, type: "triangle" },
      { start: 1.18, duration: 1.05, frequency: 523.25, gain: 0.14, type: "triangle" },
      { start: 1.18, duration: 1.05, frequency: 659.25, gain: 0.11, type: "triangle" },
      { start: 1.18, duration: 1.05, frequency: 783.99, gain: 0.1, type: "triangle" },
      { start: 1.18, duration: 1.05, frequency: 1046.5, gain: 0.08, type: "sine" },
      { start: 0, duration: 1.16, frequency: 130.81, gain: 0.045, type: "sine" },
      { start: 1.18, duration: 1.05, frequency: 261.63, gain: 0.05, type: "sine" },
    ],
  },
  wrong: {
    duration: 0.78,
    tones: [
      { start: 0, duration: 0.72, frequency: 190, endFrequency: 68, gain: 0.2, type: "sawtooth" },
      { start: 0.02, duration: 0.68, frequency: 132, endFrequency: 52, gain: 0.08, type: "square" },
    ],
  },
  repeat: {
    duration: 0.58,
    tones: [
      { start: 0, duration: 0.12, frequency: 740, gain: 0.14, type: "square" },
      { start: 0.17, duration: 0.12, frequency: 520, gain: 0.14, type: "square" },
      { start: 0.34, duration: 0.18, frequency: 740, gain: 0.14, type: "square" },
    ],
  },
};

export function audioCuePlan(cue: GameAudioCue): AudioCuePlan {
  const plan = cuePlans[cue];
  return { duration: plan.duration, tones: plan.tones.map((tone) => ({ ...tone })) };
}

function savedPreferences(): Pick<GameAudioState, "enabled" | "volume"> {
  if (typeof window === "undefined") return { enabled: false, volume: 0.7 };
  try {
    const value = JSON.parse(window.localStorage.getItem(preferencesKey) ?? "null") as Partial<GameAudioState> | null;
    return {
      enabled: value?.enabled === true,
      volume: typeof value?.volume === "number"
        ? Math.min(1, Math.max(0, value.volume))
        : 0.7,
    };
  } catch {
    return { enabled: false, volume: 0.7 };
  }
}

class GameAudioController {
  private state: GameAudioState = { ...savedPreferences(), playingCue: null, error: null };
  private readonly listeners = new Set<StateListener>();
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly sources = new Set<OscillatorNode>();
  private playingTimer: number | null = null;

  getState(): GameAudioState {
    return { ...this.state };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) this.stop();
    this.state = { ...this.state, enabled, error: null };
    this.persist();
    this.notify();
    if (enabled) void this.unlock();
  }

  setVolume(volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    this.state = { ...this.state, volume: nextVolume };
    this.masterGain?.gain.setTargetAtTime(
      this.outputGain(nextVolume),
      this.context?.currentTime ?? 0,
      0.015,
    );
    this.persist();
    this.notify();
  }

  async unlock(): Promise<boolean> {
    return Boolean(await this.runningContext());
  }

  async play(cue: GameAudioCue): Promise<boolean> {
    if (!this.state.enabled) return false;
    const context = await this.runningContext();
    if (!context || !this.masterGain) return false;

    this.stop();
    const plan = cuePlans[cue];
    const startedAt = context.currentTime + 0.025;
    for (const tone of plan.tones) this.scheduleTone(context, startedAt, tone);

    this.state = { ...this.state, playingCue: cue, error: null };
    this.notify();
    this.playingTimer = window.setTimeout(() => {
      this.playingTimer = null;
      if (this.state.playingCue === cue) {
        this.state = { ...this.state, playingCue: null };
        this.notify();
      }
    }, plan.duration * 1000 + 80);
    return true;
  }

  stop(): void {
    if (this.playingTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.playingTimer);
      this.playingTimer = null;
    }
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // A source that has already ended does not need another stop.
      }
    }
    this.sources.clear();
    if (this.state.playingCue) {
      this.state = { ...this.state, playingCue: null };
      this.notify();
    }
  }

  private async runningContext(): Promise<AudioContext | null> {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext
      ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      this.fail("Game audio is not supported by this browser.");
      return null;
    }

    try {
      if (!this.context) {
        this.context = new AudioContextClass();
        this.masterGain = this.context.createGain();
        this.masterGain.gain.value = this.outputGain(this.state.volume);
        this.masterGain.connect(this.context.destination);
      }
      if (this.context.state === "suspended") await this.context.resume();
      if (this.context.state !== "running") {
        this.fail("Select Enable audio, then try the cue again.");
        return null;
      }
      return this.context;
    } catch {
      this.fail("Your browser blocked audio. Select Enable audio and try again.");
      return null;
    }
  }

  private scheduleTone(context: AudioContext, startedAt: number, tone: AudioTone): void {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const toneStart = startedAt + tone.start;
    const toneEnd = toneStart + tone.duration;
    const attackEnd = toneStart + Math.min(0.025, tone.duration / 3);

    oscillator.type = tone.type;
    oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
    if (tone.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, toneEnd);
    }
    envelope.gain.setValueAtTime(0.0001, toneStart);
    envelope.gain.exponentialRampToValueAtTime(tone.gain, attackEnd);
    envelope.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
    oscillator.connect(envelope);
    envelope.connect(this.masterGain!);
    oscillator.addEventListener("ended", () => {
      this.sources.delete(oscillator);
      oscillator.disconnect();
      envelope.disconnect();
    }, { once: true });
    this.sources.add(oscillator);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.03);
  }

  private outputGain(volume: number): number {
    return Math.pow(volume, 1.35);
  }

  private fail(message: string): void {
    this.state = { ...this.state, playingCue: null, error: message };
    this.notify();
  }

  private persist(): void {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(preferencesKey, JSON.stringify({
        enabled: this.state.enabled,
        volume: this.state.volume,
      }));
    } catch {
      // Audio preferences can remain session-only when storage is unavailable.
    }
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const gameAudio = new GameAudioController();
