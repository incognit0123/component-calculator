import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Piece } from '../data/types'
import { BulkPieceEditor, countPieces } from './BulkPieceEditor'

afterEach(cleanup)

const owned: Piece = { id: 'keep', shape: 'I', quality: 'epic', stat: 'laceration' }

describe('BulkPieceEditor with imported counts', () => {
  it('opens on the first imported stat and applies the import as the whole inventory', () => {
    const onApply = vi.fn()
    render(
      <BulkPieceEditor
        pieces={[owned, { ...owned, id: 'gone', stat: 'critDamage' }]}
        initialCounts={{ 'laceration|epic|I': 2, 'skillDamage|legend|T': 1 }}
        onApply={onApply}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText(/replace your inventory of 2 pieces/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Skill/, pressed: true })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    const applied: Piece[] = onApply.mock.calls[0][0]
    expect(countPieces(applied)).toEqual({ 'laceration|epic|I': 2, 'skillDamage|legend|T': 1 })
    expect(applied.map((p) => p.id)).toContain('keep')
  })
})
