import assert from 'node:assert/strict'
import { restoreManagedFormInputFocus } from '../src/formFocus.js'

function inputFixture(disabled = false) {
  let focused = 0
  let selected = 0
  const input = {
    disabled,
    focus: () => { focused += 1 },
    select: () => { selected += 1 },
  }
  return {
    input,
    calls: () => ({ focused, selected }),
  }
}

const body = { id: 'body' }
const formControl = { id: 'submit' }
const externalControl = { id: 'timer' }

{
  const fixture = inputFixture()
  assert.equal(restoreManagedFormInputFocus({
    input: fixture.input,
    activeElement: body,
    body,
    isWithinForm: () => false,
  }), true)
  assert.deepEqual(fixture.calls(), { focused: 1, selected: 0 })
}

{
  const fixture = inputFixture()
  assert.equal(restoreManagedFormInputFocus({
    input: fixture.input,
    activeElement: formControl,
    body,
    isWithinForm: (element) => element === formControl,
  }), true)
  assert.deepEqual(fixture.calls(), { focused: 1, selected: 0 })
}

{
  const fixture = inputFixture()
  assert.equal(restoreManagedFormInputFocus({
    input: fixture.input,
    activeElement: externalControl,
    body,
    isWithinForm: () => false,
  }), false)
  assert.deepEqual(fixture.calls(), { focused: 0, selected: 0 })
}

{
  const fixture = inputFixture(true)
  assert.equal(restoreManagedFormInputFocus({
    input: fixture.input,
    activeElement: body,
    body,
    isWithinForm: () => false,
  }), false)
  assert.deepEqual(fixture.calls(), { focused: 0, selected: 0 })
}

{
  const fixture = inputFixture()
  assert.equal(restoreManagedFormInputFocus({
    input: fixture.input,
    activeElement: null,
    body,
    isWithinForm: () => false,
    selectText: true,
  }), true)
  assert.deepEqual(fixture.calls(), { focused: 1, selected: 1 })
}

console.log('Managed form focus restores enabled transcription, selects rejected text, and respects external controls.')
