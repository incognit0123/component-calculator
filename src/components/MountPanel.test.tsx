import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MOUNT_KEYS, type MountKey } from '../data/mounts'
import type { MountLevel } from '../data/lineBonuses'
import { MountPanel } from './MountPanel'

afterEach(cleanup)

describe('Ruinous Warskitter mount controls', () => {
  it('shows the original game artwork and allows unlocking and selecting Ruinous', () => {
    const unlocked = Object.fromEntries(MOUNT_KEYS.map((key) => [key, key === 'electricScooter'])) as Record<MountKey, boolean>
    const levels = Object.fromEntries(MOUNT_KEYS.map((key) => [key, 0])) as Record<MountKey, MountLevel>
    const props = { selectedMount: 'electricScooter' as const, unlocked, levels, onSelectMount: vi.fn(), onUnlockedChange: vi.fn(), onLevelChange: vi.fn() }
    const { rerender } = render(<MountPanel {...props} />)
    const locked = screen.getByRole('button', { name: 'Ruinous Warskitter (locked)' })
    expect(locked).toBeDisabled()
    expect(within(locked).queryByText('TBA')).not.toBeInTheDocument()
    expect(locked.querySelector('image')).toHaveAttribute('href', expect.stringContaining('ruinous_warskitter.webp'))
    expect(screen.queryByText('Line bonuses: TBA')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Unlock Ruinous Warskitter' }))
    expect(props.onUnlockedChange).toHaveBeenCalledWith('ruinWarskitter', true)
    rerender(<MountPanel {...props} unlocked={{ ...unlocked, ruinWarskitter: true }} />)
    const select = screen.getByRole('button', { name: 'Select Ruinous Warskitter' })
    expect(select).toBeEnabled()
    expect(within(select.parentElement!).getByText('60%')).toBeInTheDocument()
    fireEvent.click(select)
    expect(props.onSelectMount).toHaveBeenCalledWith('ruinWarskitter')

    rerender(<MountPanel {...props} unlocked={{ ...unlocked, ruinWarskitter: true }} levels={{ ...levels, ruinWarskitter: 8 }} />)
    expect(within(select.parentElement!).getByText('200%')).toBeInTheDocument()
  })
})
