import {
  LINE_BONUS_TIERS,
  MAX_MOUNT_LEVEL,
  type MountLevel,
} from '../data/lineBonuses'
import { PanelShell } from './PanelShell'

interface Props {
  level: MountLevel
  onChange: (next: MountLevel) => void
}

interface StarSlot {
  /** The mount level this star represents when filled (1..8). */
  level: MountLevel
  /** Position 1..4 within its row. */
  position: 1 | 2 | 3 | 4
}

const YELLOW_ROW: StarSlot[] = [
  { level: 1, position: 1 },
  { level: 2, position: 2 },
  { level: 3, position: 3 },
  { level: 4, position: 4 },
]
const RED_ROW: StarSlot[] = [
  { level: 5, position: 1 },
  { level: 6, position: 2 },
  { level: 7, position: 3 },
  { level: 8, position: 4 },
]

const YELLOW_FILL = '#FACC15'
const RED_FILL = '#EF4444'
const EMPTY_FILL = '#3a3d4d'
const STROKE = '#151922'

function StarIcon({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg viewBox="0 0 24 24" width={32} height={32} aria-hidden="true">
      <path
        d="M12 2.5l2.92 6.16 6.58.95-4.76 4.76 1.13 6.71L12 18l-5.87 3.08 1.13-6.71L2.5 9.61l6.58-.95L12 2.5z"
        fill={filled ? color : EMPTY_FILL}
        stroke={STROKE}
        strokeWidth={1.2}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function nextUnlockHint(level: MountLevel): string {
  // First locked tier (lowest unlockedAtLevel > level), if any.
  let next: { minLines: number; unlockedAt: MountLevel } | null = null
  for (const tier of LINE_BONUS_TIERS) {
    if (tier.unlockedAtLevel > level) {
      if (next == null || tier.unlockedAtLevel < next.unlockedAt) {
        next = { minLines: tier.minLines, unlockedAt: tier.unlockedAtLevel }
      }
    }
  }
  if (!next) return 'Max level — all line bonuses unlocked.'

  const needed = next.unlockedAt - level
  const tierLabel = `${next.minLines}-line bonus`
  return `${needed} more star${needed === 1 ? '' : 's'} unlocks the ${tierLabel}.`
}

export function MountPanel({ level, onChange }: Props) {
  const handleStarClick = (clickedLevel: MountLevel) => {
    // Click an already-filled star == that exact level: clear back to one
    // below it (so the leftmost yellow star can deselect to 0). Otherwise
    // jump up/down so all stars at or below this one are filled.
    const next: MountLevel =
      clickedLevel === level
        ? ((clickedLevel - 1) as MountLevel)
        : clickedLevel
    onChange(Math.max(0, Math.min(MAX_MOUNT_LEVEL, next)) as MountLevel)
  }

  const renderRow = (slots: StarSlot[], color: string) => (
    <div className="flex gap-2 justify-center">
      {slots.map((slot) => {
        const filled = level >= slot.level
        return (
          <button
            key={slot.level}
            type="button"
            onClick={() => handleStarClick(slot.level)}
            aria-pressed={filled}
            aria-label={`Set mount level to ${slot.level}`}
            className="rounded-md p-1 transition hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <StarIcon filled={filled} color={color} />
          </button>
        )
      })}
    </div>
  )

  return (
    <PanelShell title="Mount">
      <div className="flex flex-col gap-2 mt-1">
        {renderRow(YELLOW_ROW, YELLOW_FILL)}
        {renderRow(RED_ROW, RED_FILL)}
        <p className="text-xs text-gray-400 text-center mt-1">
          {nextUnlockHint(level)}
        </p>
      </div>
    </PanelShell>
  )
}
