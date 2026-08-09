import { beforeEach, describe, expect, it } from 'vitest'
import { legacySeededUnlocked, legacySeededMountLevels } from './App'

const UNLOCKED_MOUNTS_KEY = 'mount-opt:unlocked-mounts:v1'
const MOUNT_LEVELS_KEY = 'mount-opt:mount-levels:v1'

describe('legacy localStorage migration to Netherflame Stalker', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('migrates a pre-Netherflame unlocked map (booleans), preserving unlocks and locking the new mount', () => {
    // How usePersistedState persisted unlockedMounts before the 4th mount: a
    // 3-key *boolean* map (not the 0/1 form used by export strings).
    window.localStorage.setItem(
      UNLOCKED_MOUNTS_KEY,
      JSON.stringify({ electricScooter: true, techHoverboard: true, doomsteed: false }),
    )

    const result = legacySeededUnlocked()

    // Existing unlocks are preserved (regression: the old 0/1 check silently
    // dropped them and reset to selected-mount-only), new mount defaults locked.
    expect(result).toEqual({
      electricScooter: true,
      techHoverboard: true,
      doomsteed: false,
      netherflameStalker: false,
    })
    // The migrated 4-key map is written back so usePersistedState reads a value
    // that passes the now-4-key validator instead of falling back to the seed.
    expect(JSON.parse(window.localStorage.getItem(UNLOCKED_MOUNTS_KEY)!)).toEqual(result)
  })

  it('is idempotent once the unlocked map already contains the new mount', () => {
    const alreadyMigrated = {
      electricScooter: true,
      techHoverboard: false,
      doomsteed: true,
      netherflameStalker: true,
    }
    window.localStorage.setItem(UNLOCKED_MOUNTS_KEY, JSON.stringify(alreadyMigrated))
    expect(legacySeededUnlocked()).toEqual(alreadyMigrated)
  })

  it('migrates a pre-Netherflame mount-levels map, preserving levels and defaulting the new mount to 0', () => {
    window.localStorage.setItem(
      MOUNT_LEVELS_KEY,
      JSON.stringify({ electricScooter: 3, techHoverboard: 0, doomsteed: 8 }),
    )

    const result = legacySeededMountLevels()

    expect(result).toEqual({
      electricScooter: 3,
      techHoverboard: 0,
      doomsteed: 8,
      netherflameStalker: 0,
    })
    expect(JSON.parse(window.localStorage.getItem(MOUNT_LEVELS_KEY)!)).toEqual(result)
  })
})
