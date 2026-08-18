import assert from 'node:assert/strict'
import { audioCuePlan, type GameAudioCue } from '../src/gameAudio.js'

const cues: GameAudioCue[] = ['opening', 'wrong', 'repeat']

for (const cue of cues) {
  const plan = audioCuePlan(cue)
  assert.ok(plan.duration > 0, `${cue} needs a positive duration`)
  assert.ok(plan.tones.length > 0, `${cue} needs at least one tone`)
  for (const tone of plan.tones) {
    assert.ok(tone.start >= 0, `${cue} tone starts before the cue`)
    assert.ok(tone.duration > 0, `${cue} tone needs a positive duration`)
    assert.ok(tone.start + tone.duration <= plan.duration, `${cue} tone exceeds the cue duration`)
    assert.ok(tone.frequency > 0, `${cue} tone needs a positive frequency`)
    assert.ok((tone.endFrequency ?? tone.frequency) > 0, `${cue} frequency ramp must stay positive`)
    assert.ok(tone.gain > 0 && tone.gain <= 1, `${cue} tone gain must stay in range`)
  }
}

assert.ok(audioCuePlan('opening').tones.length >= 8, 'Opening cue should be a layered fanfare')
assert.ok(audioCuePlan('wrong').tones.every((tone) => (tone.endFrequency ?? tone.frequency) < tone.frequency), 'Wrong-answer cue should descend')
assert.equal(audioCuePlan('repeat').tones.length, 3, 'Repeat-answer cue should use three distinct beeps')

const mutableCopy = audioCuePlan('opening')
mutableCopy.tones.length = 0
assert.ok(audioCuePlan('opening').tones.length > 0, 'Callers must not mutate the shared cue plan')

console.log('Original opening, wrong-answer, and repeat-answer audio cue plans are valid.')
