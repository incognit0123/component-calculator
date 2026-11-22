import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { zeroStats } from '../data/stats'
import { StatsSummary } from './StatsSummary'

afterEach(cleanup)

it('uses the 200% synced piece bonus once in the After column', () => {
  render(<StatsSummary currentStats={{ ...zeroStats(), skillDamage: 50 }}
    buffsFromPieces={{ ...zeroStats(), skillDamage: 42 }}
    secondaryValues={{ ...zeroStats(), skillDamage: 84 }} secondaryKind="syncRate"
    secondaryLabel="(× 200% sync rate)" />)
  const row = screen.getByRole('row', { name: /Skill Damage/ })
  expect(within(row).getAllByRole('cell').slice(1).map((cell) => cell.textContent)).toEqual(['50%', '+42%', '+84%', '134%'])
})

describe('pending line bonuses', () => {
  it('shows unknown line contributions as TBA and labels totals as known values', () => {
    const props = { currentStats: zeroStats(), buffsFromPieces: { ...zeroStats(), critDamage: 10 }, secondaryValues: zeroStats(), secondaryKind: 'lines' as const, secondaryLabel: '+ Lines' }
    const { rerender } = render(<StatsSummary {...props} secondaryPending />)
    expect(screen.getAllByText('TBA')).toHaveLength(9)
    expect(screen.getByRole('columnheader', { name: 'After (known)' })).toBeInTheDocument()
    rerender(<StatsSummary {...props} />)
    expect(screen.queryByText('TBA')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'After' })).toBeInTheDocument()
  })

  it('displays baseline and mount Vulnerability separately from component buffs', () => {
    render(<StatsSummary currentStats={{ ...zeroStats(), vulnerability: 90 }} buffsFromPieces={zeroStats()}
      secondaryValues={{ ...zeroStats(), vulnerability: 130 }} secondaryKind="lines" secondaryLabel="+ Mount" />)
    const row = screen.getAllByText('Vulnerability')[0].closest('tr')!
    expect(within(row).getAllByRole('cell').slice(1).map((cell) => cell.textContent)).toEqual(['90%', '—', '+130%', '220%'])
  })
})
