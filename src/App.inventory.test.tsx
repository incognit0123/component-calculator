import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { countPieces } from './components/BulkPieceEditor'
import { STAT_META, zeroStats } from './data/stats'
import type { Piece } from './data/types'
import type { OptimizerResult, WorkerMessage } from './optimizer/types'

const PIECES_KEY = 'mount-opt:pieces:v1'
const piece: Piece = { id: 'original', shape: 'I', quality: 'good', stat: 'skillDamage' }
let onMessage: ((event: { data: WorkerMessage }) => void) | undefined

beforeEach(() => {
  window.localStorage.clear()
  onMessage = undefined
  vi.stubGlobal('Worker', class {
    addEventListener(_type: string, listener: (event: { data: WorkerMessage }) => void) { onMessage = listener }
    postMessage = vi.fn()
    terminate = vi.fn()
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const savedPieces = (): Piece[] => JSON.parse(window.localStorage.getItem(PIECES_KEY) ?? '[]')
function openBulk() {
  fireEvent.click(screen.getByRole('button', { name: 'Bulk edit' }))
  return within(screen.getByRole('dialog'))
}
function openPieceEditor() {
  fireEvent.click(screen.getByRole('button', { name: 'Expand inventory' }))
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
  return within(screen.getByRole('dialog'))
}
function startWithPiece() {
  window.localStorage.setItem(PIECES_KEY, JSON.stringify([piece]))
  render(<App />)
}
function result(): OptimizerResult {
  return {
    equippedMountKey: 'electricScooter', beforeScore: 1, afterScore: 1.1,
    unusedPieceIds: [], elapsedMs: 1, truncated: false,
    boards: [{
      mountKey: 'electricScooter', mountLevel: 0, isEquipped: true, syncRate: 100,
      placements: [{ pieceId: piece.id, rotation: 1, row: 0, col: 0 }],
      buffsFromPieces: { ...zeroStats(), skillDamage: 10 },
      buffsFromLines: zeroStats(), linesFilled: 0,
    }],
  }
}
function finishRun() {
  act(() => onMessage!({ data: { type: 'done', result: result() } }))
}
function resultBoard() {
  return screen.getByRole('heading', { name: 'Result' }).closest('.panel-frame')!.querySelector('svg')!
}

describe('inventory editor synchronization', () => {
  it('accepts pre-mount Vulnerability without offering nonexistent Vulnerability pieces', () => {
    render(<App />)
    fireEvent.change(screen.getByRole('spinbutton', { name: /Vulnerability/ }), { target: { value: '90' } })
    expect(JSON.parse(window.localStorage.getItem('mount-opt:current-stats:v1')!).vulnerability).toBe(90)
    const dialog = openBulk()
    expect(dialog.queryByRole('button', { name: /Vulnerability/ })).not.toBeInTheDocument()
  })

  // This full editor round-trip can exceed the default 5s on shared CI runners.
  it('shares additions, bulk counts across stat tabs, edits, and summary counts', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '+ Add piece' }))
    let dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /^I piece/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Epic' }))
    fireEvent.click(dialog.getByRole('button', { name: /Skill/ }))
    fireEvent.click(dialog.getByRole('switch', { name: 'Keep open' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Close' }))
    expect(savedPieces()).toHaveLength(2)
    expect(new Set(savedPieces().map((p) => p.id)).size).toBe(2)

    dialog = openBulk()
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    expect(dialog.getByRole('spinbutton', { name: 'epic I count' })).toHaveValue(2)
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'epic I count' }), { target: { value: '3' } })
    fireEvent.click(dialog.getByRole('button', { name: /Chilled/ }))
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'epicPlus T count' }), { target: { value: '2' } })
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    expect(dialog.getByRole('spinbutton', { name: 'epic I count' })).toHaveValue(3)
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(countPieces(savedPieces())).toEqual({ 'skillDamage|epic|I': 3, 'toChilled|epicPlus|T': 2 })
    expect(screen.getByText('5 pieces', { exact: true })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand inventory' }))
    expect(screen.getAllByRole('button', { name: 'Edit' })).toHaveLength(5)
    const editedId = savedPieces()[0].id
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    dialog = within(screen.getByRole('dialog'))
    fireEvent.click(dialog.getByRole('button', { name: /^J piece/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Legend' }))
    fireEvent.click(dialog.getByRole('button', { name: /Poisoned/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(savedPieces()[0]).toEqual({ id: editedId, shape: 'J', quality: 'legend', stat: 'toPoisoned' })

    dialog = openBulk()
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    expect(dialog.getByRole('spinbutton', { name: 'epic I count' })).toHaveValue(2)
    fireEvent.click(dialog.getByRole('button', { name: /Poisoned/ }))
    expect(dialog.getByRole('spinbutton', { name: 'legend J count' })).toHaveValue(1)
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(countPieces(savedPieces())).toEqual({
      'skillDamage|epic|I': 2, 'toChilled|epicPlus|T': 2, 'toPoisoned|legend|J': 1,
    })
  }, 15_000)

  it('discards cancelled bulk drafts and starts fresh when reopened', () => {
    startWithPiece()
    let dialog = openBulk()
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'good I count' }), { target: { value: '8' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(savedPieces()).toEqual([piece])
    dialog = openBulk()
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    expect(dialog.getByRole('spinbutton', { name: 'good I count' })).toHaveValue(1)
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(savedPieces()).toEqual([piece])
  })

  it('reflects card deletions and persists the same counts after reloading', () => {
    startWithPiece()
    fireEvent.click(screen.getByRole('button', { name: 'Expand inventory' }))
    fireEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(savedPieces()).toEqual([])
    let dialog = openBulk()
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    expect(dialog.getByRole('spinbutton', { name: 'good I count' })).toHaveValue(null)
    fireEvent.change(dialog.getByRole('spinbutton', { name: 'good I count' }), { target: { value: '2' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    const saved = savedPieces()
    cleanup()
    render(<App />)
    dialog = openBulk()
    fireEvent.click(dialog.getByRole('button', { name: /^Skill\b/ }))
    expect(dialog.getByRole('spinbutton', { name: 'good I count' })).toHaveValue(2)
    fireEvent.click(dialog.getByRole('button', { name: 'Apply' }))
    expect(savedPieces()).toEqual(saved)
  })
})

describe('inventory edits after an optimizer run', () => {
  it.each([
    ['quality', 'Epic'], ['stat', 'Poisoned'], ['shape', 'O'],
  ])('flags a saved %s edit and keeps the previous result consistent', (field, button) => {
    startWithPiece()
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    finishRun()
    const originalBoard = resultBoard().innerHTML
    const dialog = openPieceEditor()
    const name = field === 'shape' ? new RegExp(`^${button} piece`) : field === 'quality' ? button : new RegExp(button)
    fireEvent.click(dialog.getByRole('button', { name }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    expect(screen.getByText('Inventory changed since this result.')).toBeInTheDocument()
    expect(resultBoard().innerHTML).toBe(originalBoard)
  })

  it('detects edits made while the worker is still running', () => {
    startWithPiece()
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    const dialog = openPieceEditor()
    fireEvent.click(dialog.getByRole('button', { name: /Poisoned/ }))
    fireEvent.click(dialog.getByRole('button', { name: 'Save' }))
    finishRun()
    expect(screen.getByText('Inventory changed since this result.')).toBeInTheDocument()
    expect(resultBoard().querySelector('image')).toHaveAttribute('href', STAT_META.skillDamage.icon)
  })
})
