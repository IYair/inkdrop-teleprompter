import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatDuration,
  getDedicatedSnapshot,
  isPendingForWindow,
  moveBlock
} from '../src/phaseTwo.ts'

test('formats estimated duration as minutes and seconds', () => {
  assert.equal(formatDuration(116, 120), '0:58')
  assert.equal(formatDuration(510, 135), '3:47')
})

test('moves between script blocks without leaving their bounds', () => {
  assert.equal(moveBlock(0, -1, 6), 0)
  assert.equal(moveBlock(2, 1, 6), 3)
  assert.equal(moveBlock(5, 1, 6), 5)
})

test('only the destination window consumes a fresh second-screen request', () => {
  const pending = { noteId: 'note:1', sourceWindowId: '1', createdAt: 10_000 }
  assert.equal(isPendingForWindow(pending, 'note:1', '1', 12_000), false)
  assert.equal(isPendingForWindow(pending, 'note:1', '2', 12_000), true)
  assert.equal(isPendingForWindow(pending, 'note:2', '2', 12_000), false)
  assert.equal(isPendingForWindow(pending, 'note:1', '2', 30_000), false)
})

test('delivers the script snapshot only to a fresh dedicated destination window', () => {
  const snapshot = { _id: 'note:1', title: 'Mi guion', body: 'Texto para cámara' }
  const pending = { snapshot, sourceWindowId: '1', createdAt: 10_000 }
  assert.deepEqual(getDedicatedSnapshot(pending, '2', 12_000), snapshot)
  assert.equal(getDedicatedSnapshot(pending, '1', 12_000), undefined)
  assert.equal(getDedicatedSnapshot(pending, '2', 30_000), undefined)
})
