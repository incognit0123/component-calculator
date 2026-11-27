import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { scanFiles } from '../utils/inventoryScan/scanFiles'
import type { ScanSegment } from '../utils/inventoryScan/track'
import { InventoryImportDialog } from './InventoryImportDialog'

const segments: ScanSegment[] = [
  { filter: 'all', filterConfidence: 1, frames: 5, ambiguousSteps: 0, pieces: [] },
  {
    filter: 'toChilled',
    filterConfidence: 0.05,
    frames: 40,
    ambiguousSteps: 2,
    pieces: [
      { row: 0, col: 0, shape: 'I', quality: 'legend', confidence: 1 },
      { row: 0, col: 1, shape: 'O', quality: 'epicPlus', confidence: 1 },
    ],
  },
]

vi.mock('../utils/inventoryScan/scanFiles', () => ({
  scanFiles: vi.fn(async () => ({ segments: segments.map((s) => ({ ...s, spansFiles: false })), skipped: [] })),
}))

afterEach(cleanup)

describe('InventoryImportDialog', () => {
  it('lets the user confirm each list’s stat and hands the counts to Bulk edit', async () => {
    const onReview = vi.fn()
    const { container } = render(
      <InventoryImportDialog
        pieces={[{ id: 'x', shape: 'T', quality: 'good', stat: 'critDamage' }]}
        onClose={() => {}}
        onReview={onReview}
      />,
    )
    const input = container.querySelector('input[type="file"]')!
    fireEvent.change(input, { target: { files: [new File([''], 'rec.mp4', { type: 'video/mp4' })] } })

    const selects = await screen.findAllByLabelText('Stat for this list')
    expect(selects.map((s) => (s as HTMLSelectElement).value)).toEqual(['', 'toChilled'])
    expect(screen.getByText(/hard to read\. Check the stat/)).toBeInTheDocument()
    expect(screen.getByText(/moved too fast to follow in 2 places/)).toBeInTheDocument()

    fireEvent.change(selects[1], { target: { value: 'toPoisoned' } })
    fireEvent.click(screen.getByRole('button', { name: 'Review in Bulk edit' }))
    expect(onReview).toHaveBeenCalledWith({
      'critDamage|good|T': 1,
      'toPoisoned|legend|I': 1,
      'toPoisoned|epicPlus|O': 1,
    })
  })

  it('names files it could not read instead of reporting a missing list', async () => {
    vi.mocked(scanFiles).mockResolvedValueOnce({ segments: [], skipped: ['clip.mkv'] })
    const { container } = render(<InventoryImportDialog pieces={[]} onClose={() => {}} onReview={() => {}} />)
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [new File([''], 'clip.mkv')] } })
    expect(await screen.findByText(/Skipped clip\.mkv/)).toBeInTheDocument()
    expect(screen.queryByText(/No Install Component list/)).toBeNull()
  })
})
