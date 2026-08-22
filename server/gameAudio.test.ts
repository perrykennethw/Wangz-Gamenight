import assert from 'node:assert/strict'
import {
  GAME_AUDIO_CUES,
  GameAudioController,
  audioCuePlan,
  parseAudioPackManifest,
} from '../src/gameAudio.js'

for (const cue of GAME_AUDIO_CUES) {
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
assert.ok(
  audioCuePlan('wrong-answer').tones.every((tone) => (tone.endFrequency ?? tone.frequency) < tone.frequency),
  'Wrong-answer cue should descend',
)
assert.equal(audioCuePlan('repeat-answer').tones.length, 3, 'Repeat-answer cue should use three distinct beeps')

const mutableCopy = audioCuePlan('opening')
mutableCopy.tones.length = 0
assert.ok(audioCuePlan('opening').tones.length > 0, 'Callers must not mutate the shared cue plan')

const manifestUrl = 'https://media.example.com/audio/manifest.json'
const validManifest = {
  version: 1,
  id: 'licensed-feud',
  name: 'Licensed Feud Pack',
  rights: {
    source: 'Stakeholder-provided archive',
    owner: 'Example Rights Owner',
    license: 'Written permission dated 2026-08-21',
    distribution: 'Wangz Gamenight production deployment',
    attribution: 'Used with permission',
  },
  cues: {
    opening: './opening.mp3',
    'wrong-answer': 'https://cdn.example.com/wrong.ogg',
  },
}
const parsed = parseAudioPackManifest(validManifest, manifestUrl)
assert.equal(parsed.cues.opening, 'https://media.example.com/audio/opening.mp3')
assert.equal(parsed.cues['wrong-answer'], 'https://cdn.example.com/wrong.ogg')
assert.equal(parsed.rights.attribution, 'Used with permission')

assert.throws(
  () => parseAudioPackManifest({ ...validManifest, rights: undefined }, manifestUrl),
  /document its rights/i,
)
assert.throws(
  () => parseAudioPackManifest({ ...validManifest, cues: { surprise: './surprise.mp3' } }, manifestUrl),
  /unknown audio cue/i,
)
assert.throws(
  () => parseAudioPackManifest({ ...validManifest, cues: { opening: 'data:audio/mp3;base64,AA==' } }, manifestUrl),
  /HTTP or HTTPS/i,
)

class FakeAudio {
  preload = ''
  volume = 1
  currentTime = 0
  onended: ((event: Event) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  loadCount = 0
  playCount = 0
  pauseCount = 0

  constructor(readonly url: string) {}

  load(): void {
    this.loadCount += 1
  }

  async play(): Promise<void> {
    this.playCount += 1
  }

  pause(): void {
    this.pauseCount += 1
  }
}

const created: FakeAudio[] = []
const controller = new GameAudioController()
assert.equal(await controller.configureAlternatePack(manifestUrl, {
  loadJson: async () => validManifest,
  createAudio: (url) => {
    const audio = new FakeAudio(url)
    created.push(audio)
    return audio
  },
}), true)
assert.equal(controller.getState().alternatePackStatus, 'ready')
assert.equal(controller.getState().alternatePackName, 'Licensed Feud Pack')
assert.ok(created.every((audio) => audio.preload === 'auto' && audio.loadCount === 1))

assert.equal(controller.setPack('alternate'), true)
controller.setEnabled(true)
assert.equal(await controller.play('opening'), true)
assert.equal(created[0].playCount, 1)
assert.equal(controller.getState().playingCue, 'opening')

controller.setVolume(0.25)
assert.ok(created.every((audio) => audio.volume > 0 && audio.volume < 0.25))

assert.equal(await controller.play('wrong-answer'), true)
assert.equal(created[0].pauseCount, 1, 'Starting another cue should stop the first recording')
assert.equal(created[1].playCount, 1)
created[1].onended?.(new Event('ended'))
assert.equal(controller.getState().playingCue, null)

controller.stop()
assert.equal(controller.setPack('original'), true)
assert.equal(controller.getState().selectedPack, 'original')

const failedController = new GameAudioController()
assert.equal(await failedController.configureAlternatePack(manifestUrl, {
  loadJson: async () => ({ ...validManifest, rights: undefined }),
}), false)
assert.equal(failedController.getState().selectedPack, 'original')
assert.equal(failedController.getState().alternatePackStatus, 'error')
assert.match(failedController.getState().error ?? '', /using Original cues/i)

console.log('Original cue plans and configurable recorded audio packs are valid.')
