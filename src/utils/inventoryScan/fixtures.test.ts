import { describe, expect, it } from 'vitest'
import { FIXTURE_NAMES, loadFixture } from './fixtures'

describe('scan fixtures', () => {
  it('decode to full-width RGBA screenshots', () => {
    expect(FIXTURE_NAMES).toContain('all-by-quality-full')
    for (const name of FIXTURE_NAMES) {
      const img = loadFixture(name)
      expect(img.width).toBe(1220)
      expect(img.data.length).toBe(img.width * img.height * 4)
    }
  })
})
