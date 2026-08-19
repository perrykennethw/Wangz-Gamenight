import assert from 'node:assert/strict'
import { isValidAvatarId, normalizeAvatarId } from '../src/avatarId.js'

assert.equal(normalizeAvatarId('contestants/Space Cat.webp'), 'contestants/Space Cat.webp')
assert.equal(normalizeAvatarId('  family favorites/Space Cat.webp  '), 'family favorites/Space Cat.webp')
assert.equal(normalizeAvatarId(null), null)
assert.equal(isValidAvatarId('contestants/Space Cat.webp'), true)

for (const avatarId of [
  'https://example.com/avatar.webp',
  'contestants/../private.webp',
  'contestants\\avatar.webp',
  'contestants/Space%20Cat.webp',
  'contestants/Space\nCat.webp',
]) {
  assert.throws(() => normalizeAvatarId(avatarId), /valid avatar/i)
  assert.equal(isValidAvatarId(avatarId), false)
}

console.log('Avatar keys accept literal spaces while rejecting URLs, encoded keys, traversal, backslashes, and control characters.')
