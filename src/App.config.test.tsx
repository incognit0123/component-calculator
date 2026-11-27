import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { decodeConfig, encodeConfig } from './utils/config'
import { MOUNT_KEYS, MOUNTS, type MountKey } from './data/mounts'
import type { MountLevel } from './data/lineBonuses'
import { zeroStats } from './data/stats'
import type { Piece } from './data/types'
import { solveAll } from './optimizer/solveAll'
import type { WorkerMessage } from './optimizer/types'

beforeEach(() => window.localStorage.clear())
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const setup = () => ({
  currentStats: zeroStats(), pieces: [] as Piece[], selectedMountKey: 'electricScooter' as const,
  mountLevels: Object.fromEntries(MOUNT_KEYS.map((key) => [key, 0])) as Record<MountKey, MountLevel>,
  unlockedMounts: Object.fromEntries(MOUNT_KEYS.map((key) => [key, key === 'electricScooter'])) as Record<MountKey, boolean>,
  optimizeScope: 'allUnlocked' as const, fullTimeLimit: { enabled: true, seconds: 120 },
})

function wrap(version: number, payload: object): string {
  return `mount-opt:v${version}:${btoa(JSON.stringify(payload))}`
}

function legacyPayload(version: number) {
  const compact = JSON.parse(atob(encodeConfig(setup()).split(':')[2]))
  compact.version = version
  compact.g = 1
  compact.m = 'n'
  compact.l = 0
  delete compact.lv.ruinWarskitter
  delete compact.u.ruinWarskitter
  if (version < 7) {
    delete compact.lv.netherflameStalker
    delete compact.u.netherflameStalker
  }
  return compact
}

describe('configuration compatibility', () => {
  it('opens the Expo setup instructions from the Current stats panel', () => {
    render(<App />)

    const statsPanel = screen.getByText('Current stats').closest('.ant-ribbon')!.parentElement!
    expect(screen.queryByRole('dialog', { name: 'Set up current stats' })).not.toBeInTheDocument()
    fireEvent.click(within(statsPanel).getByRole('button', { name: 'Setup guide' }))
    const setupGuide = within(screen.getByRole('dialog', { name: 'Set up current stats' }))
    expect(setupGuide.getByRole('link', { name: 'Expo’s calculator' })).toHaveAttribute('href', 'https://sio-tools.exp0.dev/')
    const instructions = setupGuide.getByRole('list')
    expect(instructions).toHaveTextContent('turn off every switch under Mounts, then expand Result')
    expect(instructions).toHaveTextContent('Copy each percentage into the matching field in Current stats, or take a screenshot of Result and use Upload')
  })

  it('records unlock, equip, and upgrade steps from the Mounts panel', () => {
    window.localStorage.setItem('mount-opt:mount-levels:v1', JSON.stringify({ ...setup().mountLevels, electricScooter: 1 }))
    render(<App />)
    const mountPanel = screen.getByText('Mounts', { exact: true }).closest('.ant-ribbon')!.parentElement!
    fireEvent.click(within(mountPanel).getByRole('button', { name: 'Upgrade guide' }))
    const guide = within(screen.getByRole('dialog', { name: 'Mount upgrade guide' }))
    expect(guide.getByRole('button', { name: 'Legendary', pressed: true })).toBeInTheDocument()
    const nextStep = guide.getByRole('region', { name: 'Next recommended step' })
    const next = within(nextStep)
    expect(next.getByRole('heading', { name: 'Unlock Ruinous Warskitter' })).toBeInTheDocument()
    const table = within(guide.getByRole('table', { name: /Suggested upgrade order/ }))
    const firstLegendary = table.getByRole('row', { name: /Unlock Ruinous Warskitter.*Next/ })
    expect(within(firstLegendary).getAllByRole('cell').slice(0, 2).map((cell) => cell.textContent)).toEqual(['80', '0'])
    expect(table.getByRole('row', { name: /Equip Ruinous Warskitter/ })).toBeInTheDocument()

    fireEvent.click(next.getByRole('button', { name: 'Record unlock' }))
    expect(next.getByRole('heading', { name: 'Equip Ruinous Warskitter' })).toBeInTheDocument()
    fireEvent.click(next.getByRole('button', { name: 'Equip in optimizer' }))
    expect(next.getByRole('heading', { name: 'Unlock Netherflame Stalker' })).toBeInTheDocument()
    expect(window.localStorage.getItem('mount-opt:selected-mount:v1')).toBe(JSON.stringify('ruinWarskitter'))

    fireEvent.click(guide.getByRole('button', { name: 'Excellent' }))
    expect(next.getByRole('heading', { name: 'Unlock Tech Hoverboard' })).toBeInTheDocument()
    fireEvent.click(guide.getByRole('button', { name: 'Better' }))
    expect(next.getByRole('heading', { name: 'Electric Scooter to Yellow 2' })).toBeInTheDocument()
    expect(nextStep).toHaveTextContent('25 shards · 0 cores required')
    fireEvent.click(next.getByRole('button', { name: 'Record upgrade' }))

    expect(guide.getByRole('row', { name: /Electric Scooter to Yellow 2.*Done/ })).toBeInTheDocument()
    expect(next.getByRole('heading', { name: 'Electric Scooter to Yellow 4' })).toBeInTheDocument()
  })

  it('round-trips the setup in v10 exports', () => {
    const config = setup()
    const exported = encodeConfig(config)
    expect(exported.startsWith('mount-opt:v10:')).toBe(true)
    expect(decodeConfig(exported)).toEqual(config)
    expect(JSON.parse(atob(exported.split(':')[2])).lv.ruinWarskitter).toBe(0)
  })

  it('preserves non-zero pre-mount Vulnerability in exports', () => {
    const config = setup()
    config.currentStats.vulnerability = 90
    expect(decodeConfig(encodeConfig(config))).toEqual(config)
  })

  it('shows and opens empty mount boards after the inventory runs out', async () => {
    let onMessage: ((event: { data: WorkerMessage }) => void) | undefined
    vi.stubGlobal('Worker', class {
      addEventListener(_type: string, listener: (event: { data: WorkerMessage }) => void) { onMessage = listener }
      postMessage = vi.fn()
      terminate = vi.fn()
    })
    const config = setup()
    const pieces: Piece[] = [{ id: 'only-piece', shape: 'I', quality: 'good', stat: 'skillDamage' }]
    window.localStorage.setItem('mount-opt:pieces:v1', JSON.stringify(pieces))
    window.localStorage.setItem('mount-opt:unlocked-mounts:v1', JSON.stringify(
      Object.fromEntries(MOUNT_KEYS.map((key) => [key, true])),
    ))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    const result = await solveAll(pieces, zeroStats(), MOUNT_KEYS.map((key) => ({
      mountKey: key, mountLevel: config.mountLevels[key], isEquipped: key === config.selectedMountKey,
    })))
    act(() => onMessage!({ data: { type: 'done', result } }))

    const resultPanel = screen.getByRole('heading', { name: 'Result' }).closest('.panel-frame')!
    const view = within(resultPanel as HTMLElement)
    const coverage = view.getByRole('complementary', { name: 'Board coverage' })
    expect(coverage).toHaveTextContent('Used every piece in your inventory (1).')
    expect(coverage).toHaveTextContent('Total board capacity is 104 pieces. Aim for 103 more pieces, even if they are lower grade.')
    for (const key of MOUNT_KEYS) {
      expect(view.getByRole('button', { name: new RegExp(`${MOUNTS[key].name}.*(?:pieces?|Empty board)$`) })).toBeInTheDocument()
    }
    expect(view.getAllByText('Empty board')).toHaveLength(4)
    const emptyBoard = view.getByRole('button', { name: /Doomsteed.*Empty board/ })
    fireEvent.click(emptyBoard)
    expect(emptyBoard).toHaveAttribute('aria-pressed', 'true')
    expect(view.getByText('0 lines filled · 0 pieces placed')).toBeInTheDocument()
    expect(resultPanel.querySelector('svg')!.querySelectorAll('g')).toHaveLength(0)
    expect(screen.queryByText(/Time limit too low/)).not.toBeInTheDocument()
  })

  it.each(['O', 'I'] as const)('uses the equipped-only scope for coverage with a full inventory of %s pieces', async (shape) => {
    let onMessage: ((event: { data: WorkerMessage }) => void) | undefined
    const postMessage = vi.fn()
    vi.stubGlobal('Worker', class {
      addEventListener(_type: string, listener: (event: { data: WorkerMessage }) => void) { onMessage = listener }
      postMessage = postMessage
      terminate = vi.fn()
    })
    const config = setup()
    const pieces: Piece[] = Array.from({ length: 14 }, (_, index) => ({
      id: `piece-${index}`, shape, quality: 'good', stat: 'skillDamage',
    }))
    window.localStorage.setItem('mount-opt:pieces:v1', JSON.stringify(pieces))
    window.localStorage.setItem('mount-opt:unlocked-mounts:v1', JSON.stringify({
      ...config.unlockedMounts, ruinWarskitter: true,
    }))
    window.localStorage.setItem('mount-opt:optimize-scope:v1', JSON.stringify('equippedOnly'))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    const input = postMessage.mock.calls[0][0]
    const result = await solveAll(input.pieces, input.currentStats, input.mountConfigs)
    act(() => onMessage!({ data: { type: 'done', result } }))

    const coverage = screen.queryByRole('complementary', { name: 'Board coverage' })
    if (shape === 'I') {
      expect(coverage).not.toBeInTheDocument()
    } else {
      expect(coverage).toHaveTextContent('Placed 12 of the 14 pieces in your inventory.')
      expect(coverage).toHaveTextContent('Total board capacity is 14 pieces. You have enough pieces by count.')
      expect(screen.getByText('Run the optimizer across all unlocked mounts to see merge options.')).toBeInTheDocument()
      expect(screen.queryByText(/Merge options for unused pieces/)).not.toBeInTheDocument()
    }

    fireEvent.click(screen.getByRole('button', { name: 'All unlocked mounts' }))
    expect(screen.getByText('Stats or mount settings changed since this result.')).toBeInTheDocument()
  })

  it('loads v9 exports with zero Vulnerability while preserving the original eight stats', () => {
    const config = setup()
    config.currentStats.skillDamage = 1_405
    config.currentStats.toChilled = 1_068.82
    const payload = JSON.parse(atob(encodeConfig(config).split(':')[2]))
    payload.version = 9
    delete payload.vu
    expect(decodeConfig(wrap(9, payload))).toEqual(config)
  })

  it.each([undefined, -1, null, '90'])('rejects invalid v10 Vulnerability: %s', (vu) => {
    const payload = JSON.parse(atob(encodeConfig(setup()).split(':')[2]))
    expect(() => decodeConfig(wrap(10, { ...payload, vu }))).toThrow('invalid')
  })

  it.each([1, 2, 3, 4, 5, 6, 7])('loads v%i setups', (version) => {
    const config = setup()
    const compact = legacyPayload(version)
    const payload = version === 1 ? { version: 1, currentStats: config.currentStats, pieces: [], mode: 'normal', fullTimeLimit: config.fullTimeLimit } : compact
    expect(decodeConfig(wrap(version, payload))).toEqual(config)
  })

  it('rejects a malformed legacy v8 flag', () => {
    const compact = legacyPayload(8)
    expect(() => decodeConfig(wrap(8, { ...compact, g: 'exhaustive' }))).toThrow('invalid')
  })

  it.each([0, 1])('loads a v8 setup with retired mode flag %i', (g) => {
    const compact = legacyPayload(8)
    expect(decodeConfig(wrap(8, { ...compact, g }))).toEqual(setup())
  })

  it('round-trips Ruin as equipped with its own level and unlock status', () => {
    const config = setup()
    config.mountLevels.ruinWarskitter = 4
    config.unlockedMounts.ruinWarskitter = true
    const withRuin = { ...config, selectedMountKey: 'ruinWarskitter' as const }
    expect(decodeConfig(encodeConfig(withRuin))).toEqual(withRuin)
  })

  it('preserves a pre-Ruin v8 setup and appends Ruin locked at level zero', () => {
    const compact = legacyPayload(8)
    compact.mt = 'netherflameStalker'
    compact.lv = { electricScooter: 5, techHoverboard: 7, doomsteed: 1, netherflameStalker: 3 }
    compact.u = { electricScooter: 1, techHoverboard: 1, doomsteed: 1, netherflameStalker: 1 }
    const loaded = decodeConfig(wrap(8, compact))
    expect(loaded.selectedMountKey).toBe('netherflameStalker')
    expect(loaded.mountLevels).toEqual({ ...compact.lv, ruinWarskitter: 0 })
    expect(loaded.unlockedMounts).toEqual({ electricScooter: true, techHoverboard: true, doomsteed: true, netherflameStalker: true, ruinWarskitter: false })
  })

  it('requires valid Ruin data in v9 imports and force-unlocks the equipped mount', () => {
    const compact = JSON.parse(atob(encodeConfig(setup()).split(':')[2]))
    compact.version = 9
    compact.mt = 'ruinWarskitter'
    expect(decodeConfig(wrap(9, compact)).unlockedMounts.ruinWarskitter).toBe(true)
    compact.lv.ruinWarskitter = 9
    expect(() => decodeConfig(wrap(9, compact))).toThrow('invalid')
    delete compact.lv.ruinWarskitter
    expect(() => decodeConfig(wrap(9, compact))).toThrow('invalid')
  })

  it('displays known Ruinous Vulnerability and removes the provisional TBA labels', async () => {
    let onMessage: ((event: { data: WorkerMessage }) => void) | undefined
    vi.stubGlobal('Worker', class {
      addEventListener(_type: string, listener: (event: { data: WorkerMessage }) => void) { onMessage = listener }
      postMessage = vi.fn()
      terminate = vi.fn()
    })
    const config = setup()
    config.unlockedMounts.ruinWarskitter = true
    const pieces: Piece[] = [{ id: 'ruin-piece', shape: 'I', quality: 'good', stat: 'skillDamage' }]
    window.localStorage.setItem('mount-opt:selected-mount:v1', JSON.stringify('ruinWarskitter'))
    window.localStorage.setItem('mount-opt:unlocked-mounts:v1', JSON.stringify(config.unlockedMounts))
    window.localStorage.setItem('mount-opt:mount-levels:v1', JSON.stringify(config.mountLevels))
    window.localStorage.setItem('mount-opt:pieces:v1', JSON.stringify(pieces))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    const result = await solveAll(pieces, zeroStats(), [
      { mountKey: 'ruinWarskitter', mountLevel: 0, isEquipped: true },
    ])
    expect(onMessage).toBeDefined()
    act(() => onMessage!({ data: { type: 'done', result } }))
    expect(screen.getByRole('note')).toHaveTextContent('Vulnerability is maintained')
    expect(screen.getByText('Best score')).toBeInTheDocument()
    expect(screen.queryByText('TBA')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'After' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: '+ Mount' })).toBeInTheDocument()
    const row = screen.getAllByText('Vulnerability', { selector: 'span' }).find((node) => node.closest('tr'))!.closest('tr')!
    expect(within(row).getAllByRole('cell').slice(1).map((cell) => cell.textContent)).toEqual(['0%', '—', '+30%', '30%'])
  })

  it.each([4, 8] as const)('explains only active Ruinous bonus assumptions at mount level %i', async (level) => {
    let onMessage: ((event: { data: WorkerMessage }) => void) | undefined
    vi.stubGlobal('Worker', class {
      addEventListener(_type: string, listener: (event: { data: WorkerMessage }) => void) { onMessage = listener }
      postMessage = vi.fn()
      terminate = vi.fn()
    })
    const config = setup()
    config.mountLevels.ruinWarskitter = level
    config.unlockedMounts.ruinWarskitter = true
    const pieces: Piece[] = Array.from({ length: 24 }, (_, index) => ({
      id: `ruin-${index}`, shape: 'I', quality: 'good', stat: 'skillDamage',
    }))
    window.localStorage.setItem('mount-opt:selected-mount:v1', JSON.stringify('ruinWarskitter'))
    window.localStorage.setItem('mount-opt:unlocked-mounts:v1', JSON.stringify(config.unlockedMounts))
    window.localStorage.setItem('mount-opt:mount-levels:v1', JSON.stringify(config.mountLevels))
    window.localStorage.setItem('mount-opt:pieces:v1', JSON.stringify(pieces))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    const result = await solveAll(pieces, zeroStats(), [
      { mountKey: 'ruinWarskitter', mountLevel: level, isEquipped: true },
    ])
    act(() => onMessage!({ data: { type: 'done', result } }))
    expect(screen.getByText('Assumes six stacks for the 5-line bonus (+60% Shield Damage).')).toBeInTheDocument()
    expect(screen.getByText(/Assumes five Enhancement stacks/)).toBeInTheDocument()
    if (level === 8) {
      expect(screen.getByText(/230% total from this mount/)).toBeInTheDocument()
    } else {
      expect(screen.queryByText(/230% total from this mount/)).not.toBeInTheDocument()
    }
    // Picker edits do not change which mount produced the frozen result.
    fireEvent.click(screen.getByRole('button', { name: 'Select Electric Scooter' }))
    expect(screen.getByText('Stats or mount settings changed since this result.')).toBeInTheDocument()
    expect(screen.getByText('Assumes six stacks for the 5-line bonus (+60% Shield Damage).')).toBeInTheDocument()
  })

  it.each([false, true])('ignores the retired persisted mode %s when running the optimizer', (greedy) => {
    window.localStorage.setItem('mount-opt:greedy:v1', JSON.stringify(greedy))
    const postMessage = vi.fn()
    vi.stubGlobal('Worker', class {
      addEventListener = vi.fn()
      postMessage = postMessage
      terminate = vi.fn()
    })
    window.localStorage.setItem('mount-opt:pieces:v1', JSON.stringify([
      { id: 'one-piece', shape: 'I', quality: 'legend', stat: 'skillDamage' },
    ]))
    render(<App />)
    expect(screen.queryByRole('checkbox', { name: 'Greedy' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Run optimizer' }))
    expect(postMessage).toHaveBeenCalledOnce()
    expect(postMessage.mock.calls[0][0]).not.toHaveProperty('greedy')
  })
})
