import assert from 'node:assert/strict'
import {
  createIdleSharedTimer,
  expireSharedTimer,
  isSharedTimerPreset,
  remainingSharedTimerMilliseconds,
  startSharedTimer,
} from '../src/sharedTimer.js'

const idle = createIdleSharedTimer()
assert.deepEqual(idle, {
  status: 'idle',
  durationSeconds: null,
  startedAt: null,
  deadline: null,
})

const twentyFiveSeconds = startSharedTimer(25, 1_000)
assert.deepEqual(twentyFiveSeconds, {
  status: 'running',
  durationSeconds: 25,
  startedAt: 1_000,
  deadline: 26_000,
})
assert.equal(remainingSharedTimerMilliseconds(twentyFiveSeconds, 11_000), 15_000)
assert.equal(expireSharedTimer(twentyFiveSeconds, 25_999), twentyFiveSeconds)

const expired = expireSharedTimer(twentyFiveSeconds, 26_000)
assert.equal(expired.status, 'expired')
assert.equal(remainingSharedTimerMilliseconds(expired, 30_000), 0)

const replacement = startSharedTimer(5, 12_000)
assert.deepEqual(replacement, {
  status: 'running',
  durationSeconds: 5,
  startedAt: 12_000,
  deadline: 17_000,
})

for (const preset of [5, 25, 30, 40]) assert.equal(isSharedTimerPreset(preset), true)
for (const invalid of [0, 10, 41, '25', null]) assert.equal(isSharedTimerPreset(invalid), false)

console.log('Shared timer start, replacement, expiration, reset, and preset validation passed.')
