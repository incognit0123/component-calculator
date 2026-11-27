import { describe, expect, it } from 'vitest'
import { loadFixture } from './fixtures'
import { resize } from './image'
import { filterThumbnail, locateFilterBox, LOW_FILTER_CONFIDENCE, readFilter, TEMPLATES } from './indicator'

const TEMPLATE_SOURCES: Record<keyof typeof TEMPLATES, string> = {
  all: 'all-by-shape',
  critDamage: 'crit-empty',
  skillDamage: 'skill-top',
  shieldDamage: 'shield',
  toWeakened: 'weakened',
  toPoisoned: 'poisoned',
  toChilled: 'chilled',
  laceration: 'laceration-top',
  toBosses: 'bosses',
}

const EXPECTED: Record<string, string> = {
  'all-by-quality-full': 'all',
  'all-by-shape': 'all',
  'crit-empty': 'critDamage',
  weakened: 'toWeakened',
  chilled: 'toChilled',
  'panel-open': 'toChilled',
  poisoned: 'toPoisoned',
  shield: 'shieldDamage',
  bosses: 'toBosses',
  'laceration-top': 'laceration',
  'laceration-bottom': 'laceration',
  'skill-top': 'skillDamage',
  'skill-scrolled': 'skillDamage',
  'video-chilled': 'toChilled',
  'video-poisoned': 'toPoisoned',
  'video-shield': 'shieldDamage',
}

describe('readFilter', () => {
  it('embeds templates matching their source fixtures', () => {
    const fresh = Object.fromEntries(
      Object.entries(TEMPLATE_SOURCES).map(([filter, name]) => {
        const img = loadFixture(name)
        return [filter, btoa(String.fromCharCode(...filterThumbnail(img, locateFilterBox(img)!)))]
      }),
    )
    // On a deliberate template change, paste `fresh` into TEMPLATES.
    expect(fresh).toEqual(TEMPLATES)
  })

  it.each(Object.entries(EXPECTED))('reads the active filter in %s', (name, filter) => {
    const r = readFilter(loadFixture(name))
    expect(r?.filter).toBe(filter)
    expect(r!.confidence).toBeGreaterThan(LOW_FILTER_CONFIDENCE)
  })

  it('finds nothing in a frame dimmed by a stat popup', () => {
    expect(readFilter(loadFixture('popup-dimmed'))).toBeNull()
  })

  it.each([0.6, 0.75, 0.885, 1.18, 1.5])('reads every filter at scale %s', (scale) => {
    for (const [name, filter] of Object.entries(EXPECTED)) {
      const src = loadFixture(name)
      const r = readFilter(resize(src, Math.round(src.width * scale), Math.round(src.height * scale)))
      expect(r?.filter, name).toBe(filter)
      expect(r!.confidence, name).toBeGreaterThan(LOW_FILTER_CONFIDENCE)
    }
  })

})

