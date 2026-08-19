export const SHARED_TIMER_PRESETS = [5, 25, 30, 40] as const

export type SharedTimerPreset = (typeof SHARED_TIMER_PRESETS)[number]
export type SharedTimerStatus = 'idle' | 'running' | 'expired'

export type SharedTimerState =
  | {
      status: 'idle'
      durationSeconds: null
      startedAt: null
      deadline: null
    }
  | {
      status: 'running' | 'expired'
      durationSeconds: SharedTimerPreset
      startedAt: number
      deadline: number
    }

export function isSharedTimerPreset(value: unknown): value is SharedTimerPreset {
  return typeof value === 'number'
    && SHARED_TIMER_PRESETS.includes(value as SharedTimerPreset)
}

export function createIdleSharedTimer(): SharedTimerState {
  return {
    status: 'idle',
    durationSeconds: null,
    startedAt: null,
    deadline: null,
  }
}

export function startSharedTimer(
  durationSeconds: SharedTimerPreset,
  now: number,
): SharedTimerState {
  return {
    status: 'running',
    durationSeconds,
    startedAt: now,
    deadline: now + durationSeconds * 1000,
  }
}

export function expireSharedTimer(
  timer: SharedTimerState,
  now: number,
): SharedTimerState {
  if (timer.status !== 'running' || now < timer.deadline) return timer
  return { ...timer, status: 'expired' }
}

export function remainingSharedTimerMilliseconds(
  timer: SharedTimerState,
  now: number,
): number {
  if (timer.status === 'idle') return 0
  return Math.max(0, timer.deadline - now)
}
