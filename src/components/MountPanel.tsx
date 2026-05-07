import {
  MAX_MOUNT_LEVEL,
  type MountLevel,
} from '../data/lineBonuses'
import { MOUNT_KEYS, MOUNTS, syncRateFor, type MountKey } from '../data/mounts'
import { PanelShell } from './PanelShell'

interface Props {
  selectedMount: MountKey
  unlocked: Record<MountKey, boolean>
  levels: Record<MountKey, MountLevel>
  onSelectMount: (key: MountKey) => void
  onUnlockedChange: (key: MountKey, unlocked: boolean) => void
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

function PadlockIcon({
  open,
  size = 12,
  color = 'currentColor',
}: {
  open: boolean
  size?: number
  color?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="1.6" />
      {open ? (
        <path d="M8.5 11V7a3.5 3.5 0 0 1 6.2-2.2" />
      ) : (
        <path d="M8.5 11V7a3.5 3.5 0 1 1 7 0v4" />
      )}
    </svg>
  )
}

function LockToggle({
  unlocked,
  disabled,
  onChange,
  mountName,
}: {
  unlocked: boolean
  disabled?: boolean
  onChange: () => void
  mountName: string
}) {
  const title = disabled
    ? 'At least one mount must remain unlocked'
    : unlocked
      ? `Lock ${mountName}`
      : `Unlock ${mountName}`
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={unlocked}
      aria-label={title}
      title={title}
      className={`relative w-12 h-6 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent ${
        unlocked ? 'bg-accent/50' : 'bg-bg-line'
      }`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none"
      >
        <PadlockIcon open={false} size={11} color="rgba(255,255,255,0.35)" />
        <PadlockIcon open size={11} color="rgba(255,255,255,0.35)" />
      </span>
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center transition-transform ${
          unlocked ? 'translate-x-6' : 'translate-x-0'
        }`}
      >
        <PadlockIcon open={unlocked} size={12} color="#1f2937" />
      </span>
    </button>
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

export function MountPanel({
  selectedMount,
  unlocked,
  levels,
  onSelectMount,
  onUnlockedChange,
  onLevelChange,
}: Props) {
  const unlockedCount = MOUNT_KEYS.reduce(
    (n, key) => (unlocked[key] ? n + 1 : n),
    0,
  )

  return (
    <PanelShell title="Mount">
      <div className="flex flex-col gap-3 mt-1">
        <div className="grid grid-cols-3 gap-3">
          {MOUNT_KEYS.map((key) => {
            const mount = MOUNTS[key]
            const isUnlocked = unlocked[key]
            const isSelected = key === selectedMount
            const level = levels[key]
            const syncRate = syncRateFor(key, level)
            // Don't allow locking the last unlocked mount; selected mount can
            // be locked too — App auto-switches selection to another unlocked.
            const lockToggleDisabled = isUnlocked && unlockedCount <= 1
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
                  onClick={() => isUnlocked && onSelectMount(key)}
                  disabled={!isUnlocked}
                  aria-pressed={isSelected}
                  aria-label={
                    isUnlocked
                      ? `Select ${mount.name}`
                      : `${mount.name} (locked)`
                  }
                  title={isUnlocked ? undefined : 'Locked — unlock to equip'}
                  className="rounded-md focus:outline-none focus:ring-2 focus:ring-accent transition disabled:cursor-not-allowed"
                  style={{
                    filter: !isUnlocked
                      ? 'grayscale(1)'
                      : isSelected
                        ? undefined
                        : 'grayscale(0.6)',
                    opacity: !isUnlocked ? 0.45 : isSelected ? 1 : 0.85,
                  }}
                >
                  <MountIcon bgColor={mount.bgColor} iconUrl={mount.iconUrl} />
                </button>
                <LockToggle
                  unlocked={isUnlocked}
                  disabled={lockToggleDisabled}
                  onChange={() => onUnlockedChange(key, !isUnlocked)}
                  mountName={mount.name}
                />
                <StarSelector
                  level={level}
                  disabled={!isUnlocked}
                  onChange={(lv) => onLevelChange(key, lv)}
                />
                {isUnlocked && !isSelected && (
                  <div className="text-[11px] text-gray-400 text-center">
                    Sync rate{' '}
                    <span className="text-gray-200 font-medium">
                      {syncRate}%
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </PanelShell>
  )
}

function StarSelector({
  level,
  disabled,
  onChange,
}: {
  level: MountLevel
  disabled?: boolean
  onChange: (next: MountLevel) => void
}) {
  const handleClick = (clickedLevel: MountLevel) => {
    if (disabled) return
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
            disabled={disabled}
            aria-pressed={filled}
            aria-label={`Set mount level to ${slot.level}`}
            className="rounded p-0.5 transition hover:bg-white/5 focus:outline-none focus:ring-1 focus:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
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
