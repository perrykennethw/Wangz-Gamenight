export const GAME_AUDIO_CUES = [
  "opening",
  "faceoff-buzz",
  "answer-reveal",
  "wrong-answer",
  "repeat-answer",
  "timer-warning",
  "timer-expired",
  "round-win",
  "game-win",
  "fast-money-start",
  "fast-money-reveal",
  "fast-money-win",
] as const;

export type GameAudioCue = (typeof GAME_AUDIO_CUES)[number];
export type GameAudioPackChoice = "original" | "alternate";
export type AlternateAudioPackStatus = "unconfigured" | "loading" | "ready" | "error";

export const GAME_AUDIO_CUE_LABELS: Record<GameAudioCue, string> = {
  opening: "Opening theme",
  "faceoff-buzz": "Face-off buzz",
  "answer-reveal": "Answer reveal",
  "wrong-answer": "Wrong answer",
  "repeat-answer": "Repeat answer",
  "timer-warning": "Timer warning",
  "timer-expired": "Time expired",
  "round-win": "Round win",
  "game-win": "Game win",
  "fast-money-start": "Fast Money start",
  "fast-money-reveal": "Fast Money reveal",
  "fast-money-win": "Fast Money win",
};

export interface GameAudioState {
  enabled: boolean;
  volume: number;
  playingCue: GameAudioCue | null;
  selectedPack: GameAudioPackChoice;
  alternatePackName: string | null;
  alternatePackStatus: AlternateAudioPackStatus;
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

export interface AudioPackRights {
  source: string;
  owner: string;
  license: string;
  distribution: string;
  attribution?: string;
}

export interface RecordedAudioPack {
  version: 1;
  id: string;
  name: string;
  rights: AudioPackRights;
  cues: Partial<Record<GameAudioCue, string>>;
}

interface RecordedAudio {
  preload: string;
  volume: number;
  currentTime: number;
  onended: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  play(): Promise<void>;
  pause(): void;
  load(): void;
}

export interface AudioPackLoadOptions {
  loadJson?: (url: string) => Promise<unknown>;
  createAudio?: (url: string) => RecordedAudio;
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
  "faceoff-buzz": {
    duration: 0.42,
    tones: [
      { start: 0, duration: 0.36, frequency: 440, endFrequency: 620, gain: 0.14, type: "square" },
      { start: 0.02, duration: 0.34, frequency: 880, gain: 0.07, type: "sine" },
    ],
  },
  "answer-reveal": {
    duration: 0.62,
    tones: [
      { start: 0, duration: 0.2, frequency: 523.25, gain: 0.13, type: "triangle" },
      { start: 0.16, duration: 0.2, frequency: 659.25, gain: 0.14, type: "triangle" },
      { start: 0.32, duration: 0.24, frequency: 783.99, gain: 0.15, type: "triangle" },
    ],
  },
  "wrong-answer": {
    duration: 0.78,
    tones: [
      { start: 0, duration: 0.72, frequency: 190, endFrequency: 68, gain: 0.2, type: "sawtooth" },
      { start: 0.02, duration: 0.68, frequency: 132, endFrequency: 52, gain: 0.08, type: "square" },
    ],
  },
  "repeat-answer": {
    duration: 0.58,
    tones: [
      { start: 0, duration: 0.12, frequency: 740, gain: 0.14, type: "square" },
      { start: 0.17, duration: 0.12, frequency: 520, gain: 0.14, type: "square" },
      { start: 0.34, duration: 0.18, frequency: 740, gain: 0.14, type: "square" },
    ],
  },
  "timer-warning": {
    duration: 0.46,
    tones: [
      { start: 0, duration: 0.14, frequency: 880, gain: 0.13, type: "square" },
      { start: 0.24, duration: 0.16, frequency: 880, gain: 0.13, type: "square" },
    ],
  },
  "timer-expired": {
    duration: 0.9,
    tones: [
      { start: 0, duration: 0.22, frequency: 392, gain: 0.15, type: "sawtooth" },
      { start: 0.24, duration: 0.22, frequency: 293.66, gain: 0.16, type: "sawtooth" },
      { start: 0.48, duration: 0.34, frequency: 196, gain: 0.17, type: "sawtooth" },
    ],
  },
  "round-win": {
    duration: 1.26,
    tones: [
      { start: 0, duration: 0.25, frequency: 392, gain: 0.12, type: "triangle" },
      { start: 0.22, duration: 0.25, frequency: 523.25, gain: 0.13, type: "triangle" },
      { start: 0.44, duration: 0.25, frequency: 659.25, gain: 0.14, type: "triangle" },
      { start: 0.67, duration: 0.5, frequency: 783.99, gain: 0.15, type: "triangle" },
    ],
  },
  "game-win": {
    duration: 2.15,
    tones: [
      { start: 0, duration: 0.3, frequency: 392, gain: 0.12, type: "triangle" },
      { start: 0.26, duration: 0.3, frequency: 523.25, gain: 0.13, type: "triangle" },
      { start: 0.52, duration: 0.3, frequency: 659.25, gain: 0.14, type: "triangle" },
      { start: 0.78, duration: 0.3, frequency: 783.99, gain: 0.15, type: "triangle" },
      { start: 1.08, duration: 0.96, frequency: 523.25, gain: 0.11, type: "triangle" },
      { start: 1.08, duration: 0.96, frequency: 659.25, gain: 0.1, type: "triangle" },
      { start: 1.08, duration: 0.96, frequency: 783.99, gain: 0.09, type: "triangle" },
    ],
  },
  "fast-money-start": {
    duration: 0.86,
    tones: [
      { start: 0, duration: 0.18, frequency: 329.63, gain: 0.12, type: "square" },
      { start: 0.2, duration: 0.18, frequency: 440, gain: 0.13, type: "square" },
      { start: 0.4, duration: 0.38, frequency: 659.25, gain: 0.14, type: "triangle" },
    ],
  },
  "fast-money-reveal": {
    duration: 0.55,
    tones: [
      { start: 0, duration: 0.48, frequency: 987.77, gain: 0.13, type: "sine" },
      { start: 0.04, duration: 0.4, frequency: 1318.51, gain: 0.08, type: "sine" },
    ],
  },
  "fast-money-win": {
    duration: 2.34,
    tones: [
      { start: 0, duration: 0.26, frequency: 523.25, gain: 0.13, type: "triangle" },
      { start: 0.22, duration: 0.26, frequency: 659.25, gain: 0.14, type: "triangle" },
      { start: 0.44, duration: 0.26, frequency: 783.99, gain: 0.15, type: "triangle" },
      { start: 0.66, duration: 0.34, frequency: 1046.5, gain: 0.16, type: "triangle" },
      { start: 1.02, duration: 1.2, frequency: 523.25, gain: 0.1, type: "triangle" },
      { start: 1.02, duration: 1.2, frequency: 659.25, gain: 0.09, type: "triangle" },
      { start: 1.02, duration: 1.2, frequency: 783.99, gain: 0.08, type: "triangle" },
      { start: 1.02, duration: 1.2, frequency: 1046.5, gain: 0.07, type: "sine" },
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Audio pack ${field} must be a non-empty string.`);
  }
  return value.trim();
}

export function parseAudioPackManifest(value: unknown, manifestUrl: string): RecordedAudioPack {
  if (!isRecord(value) || value.version !== 1) {
    throw new Error("Audio pack manifest must use version 1.");
  }
  if (!isRecord(value.rights)) {
    throw new Error("Audio pack manifest must document its rights.");
  }
  if (!isRecord(value.cues)) {
    throw new Error("Audio pack manifest must contain a cues object.");
  }

  const cues: Partial<Record<GameAudioCue, string>> = {};
  const knownCues = new Set<string>(GAME_AUDIO_CUES);
  for (const [cue, source] of Object.entries(value.cues)) {
    if (!knownCues.has(cue)) throw new Error(`Unknown audio cue: ${cue}.`);
    const resolved = new URL(requiredText(source, `cue ${cue}`), manifestUrl);
    if (resolved.protocol !== "https:" && resolved.protocol !== "http:") {
      throw new Error(`Audio cue ${cue} must use an HTTP or HTTPS URL.`);
    }
    cues[cue as GameAudioCue] = resolved.toString();
  }
  if (Object.keys(cues).length === 0) {
    throw new Error("Audio pack manifest must define at least one cue.");
  }

  const rights: AudioPackRights = {
    source: requiredText(value.rights.source, "rights.source"),
    owner: requiredText(value.rights.owner, "rights.owner"),
    license: requiredText(value.rights.license, "rights.license"),
    distribution: requiredText(value.rights.distribution, "rights.distribution"),
    ...(typeof value.rights.attribution === "string" && value.rights.attribution.trim()
      ? { attribution: value.rights.attribution.trim() }
      : {}),
  };

  return {
    version: 1,
    id: requiredText(value.id, "id"),
    name: requiredText(value.name, "name"),
    rights,
    cues,
  };
}

export function audioCuePlan(cue: GameAudioCue): AudioCuePlan {
  const plan = cuePlans[cue];
  return { duration: plan.duration, tones: plan.tones.map((tone) => ({ ...tone })) };
}

function savedPreferences(): Pick<GameAudioState, "enabled" | "volume" | "selectedPack"> {
  if (typeof window === "undefined") return { enabled: false, volume: 0.7, selectedPack: "original" };
  try {
    const value = JSON.parse(window.localStorage.getItem(preferencesKey) ?? "null") as Partial<GameAudioState> | null;
    return {
      enabled: value?.enabled === true,
      volume: typeof value?.volume === "number"
        ? Math.min(1, Math.max(0, value.volume))
        : 0.7,
      selectedPack: value?.selectedPack === "alternate" ? "alternate" : "original",
    };
  } catch {
    return { enabled: false, volume: 0.7, selectedPack: "original" };
  }
}

async function loadJson(url: string): Promise<unknown> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Audio pack request failed with ${response.status}.`);
  return response.json() as Promise<unknown>;
}

function createRecordedAudio(url: string): RecordedAudio {
  return new Audio(url);
}

export class GameAudioController {
  private state: GameAudioState;
  private preferredPack: GameAudioPackChoice;
  private readonly listeners = new Set<StateListener>();
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private readonly sources = new Set<OscillatorNode>();
  private playingTimer: number | null = null;
  private alternatePack: RecordedAudioPack | null = null;
  private recordings = new Map<GameAudioCue, RecordedAudio>();
  private readonly failedRecordings = new Set<GameAudioCue>();
  private activeRecording: RecordedAudio | null = null;
  private playbackGeneration = 0;
  private packLoadGeneration = 0;

  constructor() {
    const preferences = savedPreferences();
    this.preferredPack = preferences.selectedPack;
    this.state = {
      enabled: preferences.enabled,
      volume: preferences.volume,
      playingCue: null,
      selectedPack: "original",
      alternatePackName: null,
      alternatePackStatus: "unconfigured",
      error: null,
    };
  }

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
    if (enabled && this.state.selectedPack === "original") void this.unlock();
  }

  setVolume(volume: number): void {
    const nextVolume = Math.min(1, Math.max(0, volume));
    this.state = { ...this.state, volume: nextVolume };
    this.masterGain?.gain.setTargetAtTime(
      this.outputGain(nextVolume),
      this.context?.currentTime ?? 0,
      0.015,
    );
    for (const recording of this.recordings.values()) recording.volume = this.outputGain(nextVolume);
    this.persist();
    this.notify();
  }

  setPack(pack: GameAudioPackChoice): boolean {
    if (pack === "alternate" && this.state.alternatePackStatus !== "ready") return false;
    this.stop();
    this.preferredPack = pack;
    this.state = { ...this.state, selectedPack: pack, error: null };
    this.persist();
    this.notify();
    if (this.state.enabled && pack === "original") void this.unlock();
    return true;
  }

  async configureAlternatePack(manifestUrl: string, options: AudioPackLoadOptions = {}): Promise<boolean> {
    const url = manifestUrl.trim();
    if (!url) return false;
    const generation = ++this.packLoadGeneration;
    this.clearRecordings();
    this.alternatePack = null;
    this.state = {
      ...this.state,
      selectedPack: "original",
      alternatePackName: null,
      alternatePackStatus: "loading",
      error: null,
    };
    this.notify();

    try {
      const value = await (options.loadJson ?? loadJson)(url);
      const pack = parseAudioPackManifest(value, url);
      if (generation !== this.packLoadGeneration) return false;
      const audioFactory = options.createAudio ?? createRecordedAudio;
      const recordings = new Map<GameAudioCue, RecordedAudio>();
      for (const [cue, source] of Object.entries(pack.cues) as [GameAudioCue, string][]) {
        const recording = audioFactory(source);
        recording.preload = "auto";
        recording.volume = this.outputGain(this.state.volume);
        recording.onerror = () => this.failedRecordings.add(cue);
        recordings.set(cue, recording);
        try {
          recording.load();
        } catch {
          this.failedRecordings.add(cue);
        }
      }
      this.recordings = recordings;
      this.alternatePack = pack;
      this.state = {
        ...this.state,
        selectedPack: this.preferredPack,
        alternatePackName: pack.name,
        alternatePackStatus: "ready",
        error: null,
      };
      this.persist();
      this.notify();
      return true;
    } catch (cause) {
      if (generation !== this.packLoadGeneration) return false;
      const message = cause instanceof Error ? cause.message : "The configured audio pack could not be loaded.";
      this.state = {
        ...this.state,
        selectedPack: "original",
        alternatePackName: null,
        alternatePackStatus: "error",
        error: `${message} Using Original cues.`,
      };
      this.notify();
      return false;
    }
  }

  async unlock(): Promise<boolean> {
    if (this.state.selectedPack === "alternate" && this.alternatePack) return true;
    return Boolean(await this.runningContext());
  }

  async play(cue: GameAudioCue): Promise<boolean> {
    if (!this.state.enabled) return false;
    this.stop();
    const generation = this.playbackGeneration;
    const recording = this.state.selectedPack === "alternate"
      && !this.failedRecordings.has(cue)
      ? this.recordings.get(cue)
      : undefined;
    if (recording) return this.playRecording(cue, recording, generation);
    return this.playOriginal(cue, generation);
  }

  stop(): void {
    this.playbackGeneration += 1;
    if (this.playingTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(this.playingTimer);
      this.playingTimer = null;
    }
    if (this.activeRecording) {
      this.activeRecording.pause();
      try {
        this.activeRecording.currentTime = 0;
      } catch {
        // Some browsers reject seeking before the media metadata loads.
      }
      this.activeRecording = null;
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

  private async playRecording(cue: GameAudioCue, recording: RecordedAudio, generation: number): Promise<boolean> {
    this.activeRecording = recording;
    recording.volume = this.outputGain(this.state.volume);
    try {
      recording.currentTime = 0;
    } catch {
      // Playback can still begin when an unloaded recording cannot be seeked.
    }
    recording.onended = () => {
      if (generation !== this.playbackGeneration) return;
      this.activeRecording = null;
      this.state = { ...this.state, playingCue: null };
      this.notify();
    };
    recording.onerror = () => {
      this.failedRecordings.add(cue);
      if (generation !== this.playbackGeneration || this.activeRecording !== recording) return;
      this.activeRecording = null;
      this.state = { ...this.state, playingCue: null };
      this.notify();
      void this.playOriginal(
        cue,
        generation,
        `${GAME_AUDIO_CUE_LABELS[cue]} failed in ${this.alternatePack?.name ?? "the alternate pack"}. Using the Original cue.`,
      );
    };
    this.state = { ...this.state, playingCue: cue, error: null };
    this.notify();
    try {
      await recording.play();
      return generation === this.playbackGeneration;
    } catch {
      this.failedRecordings.add(cue);
      if (generation !== this.playbackGeneration || this.activeRecording !== recording) return false;
      this.activeRecording = null;
      this.state = { ...this.state, playingCue: null };
      this.notify();
      return this.playOriginal(
        cue,
        generation,
        `${GAME_AUDIO_CUE_LABELS[cue]} could not play from ${this.alternatePack?.name ?? "the alternate pack"}. Using the Original cue.`,
      );
    }
  }

  private async playOriginal(cue: GameAudioCue, generation: number, warning: string | null = null): Promise<boolean> {
    const context = await this.runningContext();
    if (!context || !this.masterGain || generation !== this.playbackGeneration) return false;
    const plan = cuePlans[cue];
    const startedAt = context.currentTime + 0.025;
    for (const tone of plan.tones) this.scheduleTone(context, startedAt, tone);

    this.state = { ...this.state, playingCue: cue, error: warning };
    this.notify();
    this.playingTimer = window.setTimeout(() => {
      this.playingTimer = null;
      if (generation === this.playbackGeneration && this.state.playingCue === cue) {
        this.state = { ...this.state, playingCue: null };
        this.notify();
      }
    }, plan.duration * 1000 + 80);
    return true;
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
    if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, toneEnd);
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

  private clearRecordings(): void {
    this.stop();
    for (const recording of this.recordings.values()) {
      recording.pause();
      recording.onended = null;
      recording.onerror = null;
    }
    this.recordings.clear();
    this.failedRecordings.clear();
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
        selectedPack: this.preferredPack,
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
