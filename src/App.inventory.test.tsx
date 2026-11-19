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
  }, 10_000)

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
  }, 10_000)
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

it('keeps result stats frozen and hides merge options after stats or stars change', () => {
  const unused = [{ ...piece, id: 'unused-a' }, { ...piece, id: 'unused-b' }]
  window.localStorage.setItem(PIECES_KEY, JSON.stringify([piece, ...unused]))
  render(<App />)
  const vulnerability = screen.getByRole('spinbutton', { name: 'Vulnerability (%)' })
  fireEvent.change(vulnerability, { target: { value: '90' } })
  fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
  act(() => onMessage!({ data: { type: 'done', result: { ...result(), unusedPieceIds: unused.map(({ id }) => id) } } }))
  expect(screen.getByText('Merge options for unused pieces (1)')).toBeInTheDocument()

  fireEvent.change(vulnerability, { target: { value: '200' } })
  const staleResult = within(screen.getByLabelText('Out-of-date result'))
  const vulnerabilityRow = staleResult.getByRole('row', { name: /Vulnerability/ })
  expect(within(vulnerabilityRow).getAllByRole('cell').map((cell) => cell.textContent?.trim()).slice(1))
    .toEqual(['90%', '—', '—', '90%'])
  expect(screen.getByText('Stats or mount settings changed since this result.')).toBeInTheDocument()
  expect(screen.queryByText(/Merge options for unused pieces/)).not.toBeInTheDocument()

  fireEvent.change(vulnerability, { target: { value: '90' } })
  expect(screen.queryByLabelText('Out-of-date result')).not.toBeInTheDocument()
  expect(screen.getByText('Merge options for unused pieces (1)')).toBeInTheDocument()

  const scooter = screen.getByRole('button', { name: 'Select Electric Scooter' }).parentElement!
  fireEvent.click(within(scooter).getByRole('button', { name: 'Set mount level to 1' }))
  expect(screen.getByText('Stats or mount settings changed since this result.')).toBeInTheDocument()
  expect(screen.queryByText(/Merge options for unused pieces/)).not.toBeInTheDocument()
})

it('records the chosen unused pieces and the actual merge outcome in one inventory update', () => {
  const unused: Piece[] = [
    { ...piece, id: 'good-crit', stat: 'critDamage' },
    { ...piece, id: 'good-shield', stat: 'shieldDamage' },
    { ...piece, id: 'good-chilled', stat: 'toChilled' },
    ...Array.from({ length: 3 }, (_, index): Piece => ({ ...piece, id: `epic-${index}`, shape: 'O', quality: 'epic' })),
    ...Array.from({ length: 2 }, (_, index): Piece => ({ ...piece, id: `epic-plus-${index}`, shape: 'L', quality: 'epicPlus' })),
    ...Array.from({ length: 6 }, (_, index): Piece => ({ ...piece, id: `legend-${index}`, shape: 'J', quality: 'legend' })),
  ]
  const inventory = [piece, ...unused]
  window.localStorage.setItem(PIECES_KEY, JSON.stringify(inventory))
  window.localStorage.setItem('mount-opt:current-stats:v1', JSON.stringify({
    ...zeroStats(), critDamage: 1000, toChilled: 1000,
  }))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
  act(() => onMessage!({ data: { type: 'done', result: { ...result(), unusedPieceIds: unused.map(({ id }) => id) } } }))

  fireEvent.click(screen.getByText('Merge options for unused pieces (2)'))
  fireEvent.click(screen.getByRole('button', { name: 'Record merge of Epic square pieces' }))
  let dialog = within(screen.getByRole('dialog', { name: 'Record a merge' }))
  expect(dialog.getByRole('combobox', { name: 'Piece 3' })).toBeInTheDocument()
  const epicInput = dialog.getByRole('group', { name: 'Used square pieces Epic' })
  const epicPlusOutput = dialog.getByRole('group', { name: 'New square piece Epic+1' })
  expect(epicInput.querySelectorAll('svg polygon')).toHaveLength(0)
  expect(epicPlusOutput.querySelectorAll('svg polygon')).toHaveLength(4)
  expect(dialog.getByText('After this merge, you’ll have 13 pieces for 14 board slots.')).toBeInTheDocument()
  expect(dialog.getByText('You’ll be 1 piece short.')).toBeInTheDocument()
  fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
  expect(savedPieces()).toEqual(inventory)

  const record = screen.getByRole('button', { name: 'Record merge of Good I pieces' })
  expect(record.closest('li')).not.toHaveTextContent('Crit Damage (+8%)')
  fireEvent.click(record)
  dialog = within(screen.getByRole('dialog', { name: 'Record a merge' }))
  expect(dialog.getByText('After this merge, you’ll have 14 pieces for 14 board slots.')).toBeInTheDocument()
  expect(dialog.queryByText(/piece.*short/)).not.toBeInTheDocument()
  expect(dialog.getByText('The current layout has gaps. Filling them also depends on which shapes fit.')).toBeInTheDocument()
  expect(dialog.queryByRole('combobox', { name: 'Piece 3' })).not.toBeInTheDocument()
  const firstSource = dialog.getByRole('combobox', { name: 'Piece 1' })
  expect(firstSource).toHaveValue('good-crit')
  expect(dialog.getByRole('combobox', { name: 'Piece 2' })).toHaveValue('good-chilled')
  expect(within(firstSource).queryByRole('option', { name: /^Skill Damage/ })).not.toBeInTheDocument()
  fireEvent.change(firstSource, { target: { value: 'good-shield' } })
  expect(dialog.getByRole('group', { name: 'New I piece Better' })).toBeInTheDocument()
  expect(dialog.queryByRole('combobox', { name: 'Grade' })).not.toBeInTheDocument()
  expect(dialog.queryByRole('combobox', { name: 'Shape' })).not.toBeInTheDocument()
  const save = dialog.getByRole('button', { name: 'Save merged piece' })
  expect(save).toBeDisabled()
  fireEvent.change(dialog.getByRole('combobox', { name: 'Stat' }), { target: { value: 'laceration' } })
  fireEvent.click(save)

  const updated = savedPieces()
  expect(updated.slice(0, -1)).toEqual(inventory.filter(({ id }) => id !== 'good-chilled' && id !== 'good-shield'))
  expect(updated.at(-1)).toMatchObject({ shape: 'I', quality: 'better', stat: 'laceration' })
  expect(screen.getByText('Inventory changed since this result.')).toBeInTheDocument()
  expect(screen.queryByText(/Merge options for unused pieces/)).not.toBeInTheDocument()
  const mergeSaved = screen.getByText('Merge saved. Run the optimizer again to find more merge options.')
  expect(mergeSaved).toHaveAttribute('role', 'status')
  fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
  expect(mergeSaved).not.toBeInTheDocument()
}, 10_000)
