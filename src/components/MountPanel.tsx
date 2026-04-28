import {
  MAX_MOUNT_LEVEL,
  maxBonusLinesForLevel,
  type LineBonusTier,
  type MountLevel,
} from '../data/lineBonuses'
import { MOUNT_KEYS, MOUNTS, type MountKey } from '../data/mounts'
import { PanelShell } from './PanelShell'

interface Props {
  selectedMount: MountKey
  levels: Record<MountKey, MountLevel>
  onSelectMount: (key: MountKey) => void
  onLevelChange: (key: MountKey, level: MountLevel) => void
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
const BG_OUTLINE = '#eaecef'

const CLIPPED_POINTS = '15,0 85,0 100,15 100,85 85,100 15,100 0,85 0,15'

function StarIcon({
  filled,
  color,
  size = 26,
}: {
  filled: boolean
  color: string
  size?: number
}) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
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

function MountIcon({
  bgColor,
  iconUrl,
  size = 80,
}: {
  bgColor: string
  iconUrl: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ filter: 'drop-shadow(black 1.5px 3px 4.8px)' }}
      aria-hidden="true"
    >
      <polygon fill={bgColor} points={CLIPPED_POINTS} />
      <polygon
        fill="none"
        points={CLIPPED_POINTS}
        stroke={BG_OUTLINE}
        strokeLinejoin="round"
        strokeWidth={3}
        style={{
          transform: 'scale(0.9)',
          transformOrigin: 'center center',
        }}
      />
      <image
        href={iconUrl}
        x={15}
        y={15}
        width={70}
        height={70}
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  )
}

function nextUnlockHint(level: MountLevel, tiers: LineBonusTier[]): string {
  let next: { minLines: number; unlockedAt: MountLevel } | null = null
  for (const tier of tiers) {
    if (tier.unlockedAtLevel > level) {
      if (next == null || tier.unlockedAtLevel < next.unlockedAt) {
        next = { minLines: tier.minLines, unlockedAt: tier.unlockedAtLevel }
      }
    }
  }
  if (!next) {
    const cap = maxBonusLinesForLevel(level, tiers)
    return cap > 0
      ? 'Max level — all line bonuses unlocked.'
      : 'No bonuses unlocked yet.'
  }
  const needed = next.unlockedAt - level
  return `${needed} more star${needed === 1 ? '' : 's'} unlocks the ${next.minLines}-line bonus.`
}

export function MountPanel({
  selectedMount,
  levels,
  onSelectMount,
  onLevelChange,
}: Props) {
  return (
    <PanelShell title="Mount">
      <div className="flex flex-col gap-3 mt-1">
        <div className="grid grid-cols-3 gap-3">
          {MOUNT_KEYS.map((key) => {
            const mount = MOUNTS[key]
            const isSelected = key === selectedMount
            const level = levels[key]
            return (
              <div
                key={key}
                className="flex flex-col items-center gap-2 min-w-0"
              >
                <div
                  className={`text-xs font-medium text-center truncate w-full ${
                    isSelected ? 'text-white' : 'text-gray-400'
                  }`}
                  title={mount.name}
                >
                  {mount.name}
                </div>
                <button
                  type="button"
                  onClick={() => onSelectMount(key)}
                  aria-pressed={isSelected}
                  aria-label={`Select ${mount.name}`}
                  className="rounded-md focus:outline-none focus:ring-2 focus:ring-accent transition"
                  style={{
                    filter: isSelected ? undefined : 'grayscale(0.6)',
                    opacity: isSelected ? 1 : 0.85,
                  }}
                >
                  <MountIcon bgColor={mount.bgColor} iconUrl={mount.iconUrl} />
                </button>
                <StarSelector
                  level={level}
                  onChange={(lv) => onLevelChange(key, lv)}
                />
              </div>
            )
          })}
        </div>
        <p className="text-xs text-gray-400 text-center">
          {nextUnlockHint(
            levels[selectedMount],
            MOUNTS[selectedMount].lineBonusTiers,
          )}
        </p>
      </div>
    </PanelShell>
  )
}

function StarSelector({
  level,
  onChange,
}: {
  level: MountLevel
  onChange: (next: MountLevel) => void
}) {
  const handleClick = (clickedLevel: MountLevel) => {
    const next: MountLevel =
      clickedLevel === level
        ? ((clickedLevel - 1) as MountLevel)
        : clickedLevel
    onChange(Math.max(0, Math.min(MAX_MOUNT_LEVEL, next)) as MountLevel)
  }

  const renderRow = (slots: StarSlot[], color: string) => (
    <div className="flex gap-0.5 justify-center">
      {slots.map((slot) => {
        const filled = level >= slot.level
        return (
          <button
            key={slot.level}
            type="button"
            onClick={() => handleClick(slot.level)}
            aria-pressed={filled}
            aria-label={`Set mount level to ${slot.level}`}
            className="rounded p-0.5 transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <StarIcon filled={filled} color={color} size={18} />
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="flex flex-col gap-0.5">
      {renderRow(YELLOW_ROW, YELLOW_FILL)}
      {renderRow(RED_ROW, RED_FILL)}
    </div>
  )
}
