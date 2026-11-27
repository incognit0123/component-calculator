import { useState } from 'react'
import { Modal } from 'antd'
import type { MountLevel } from '../data/lineBonuses'
import { MOUNTS, syncRateFor, type MountKey } from '../data/mounts'

// Expo's per-level costs. Entry zero is the unlock.
const SHARDS = {
  Better: [30, 20, 25, 40, 50, 75, 100, 120, 160],
  Excellent: [50, 10, 15, 20, 35, 45, 60, 75, 100],
  Legendary: [80, 20, 30, 45, 65, 100, 140, 180, 220],
}
const LEGENDARY_CORES = [0, 1, 1, 2, 2, 4, 4, 4, 6]
const FIRST_LEGENDARY = 'ruinWarskitter'
const LEGENDARY_MOUNTS: readonly MountKey[] = [FIRST_LEGENDARY, 'netherflameStalker', 'doomsteed']
const BASIC_MOUNTS = { Better: 'electricScooter', Excellent: 'techHoverboard' } as const
const GRADES = ['Better', 'Excellent', 'Legendary'] as const
const STAR_LABELS = ['Zero stars', 'Yellow 1', 'Yellow 2', 'Yellow 3', 'Yellow 4', 'Red 1', 'Red 2', 'Red 3', 'Red 4']
const ROW_BONUS_LEVELS = [2, 4, 6, 8] as const

type Grade = typeof GRADES[number]
type UpgradeStep = { mount: MountKey; benefit: string } & (
  | { action: 'unlock' }
  | { action: 'equip' }
  | { action: 'upgrade'; from: MountLevel; to: MountLevel }
)

interface Props {
  selectedMount: MountKey
  unlocked: Record<MountKey, boolean>
  levels: Record<MountKey, MountLevel>
  onSelectMount: (mount: MountKey) => void
  onUnlockedChange: (mount: MountKey, unlocked: boolean) => void
  onLevelChange: (mount: MountKey, level: MountLevel) => void
}

function basicSteps(mount: MountKey): UpgradeStep[] {
  return [
    { action: 'unlock', mount, benefit: `An additional board at ${syncRateFor(mount, 0)}% sync.` },
    ...ROW_BONUS_LEVELS.map((to, index): UpgradeStep => ({
      action: 'upgrade', mount, from: index === 0 ? 0 : ROW_BONUS_LEVELS[index - 1], to,
      benefit: `${syncRateFor(mount, to)}% sync or a bonus for ${5 + index} filled rows when equipped.`,
    })),
  ]
}

function legendarySteps({ selectedMount, unlocked, levels }: Props): UpgradeStep[] {
  const owned = LEGENDARY_MOUNTS.filter((mount) => unlocked[mount])
    .sort((a, b) => levels[b] - levels[a])
  const primary = LEGENDARY_MOUNTS.includes(selectedMount) ? selectedMount : owned[0] ?? FIRST_LEGENDARY
  const synced = LEGENDARY_MOUNTS.filter((mount) => mount !== primary)
    .sort((a, b) => levels[b] - levels[a])

  const syncUpgrades = (from: MountLevel, to: MountLevel): UpgradeStep[] => synced.map((mount) => ({
    action: 'upgrade', mount, from, to, benefit: `${syncRateFor(mount, to)}% sync.`,
  }))
  const equippedUpgrade = (from: MountLevel, to: MountLevel, rows: number): UpgradeStep => ({
    action: 'upgrade', mount: primary, from, to, benefit: `Equipped bonus for ${rows} filled rows.`,
  })

  return [
    {
      action: 'unlock', mount: primary,
      benefit: primary === FIRST_LEGENDARY ? 'Ruinous Shots inflict Vulnerability at zero stars.' : 'Your starting Legendary board.',
    },
    {
      action: 'equip', mount: primary,
      benefit: primary === FIRST_LEGENDARY ? 'Aim for four filled rows to unlock the Vulnerability stacking bonus.' : 'Use the equipped board to activate its row bonuses.',
    },
    ...synced.map((mount): UpgradeStep => ({
      action: 'unlock', mount, benefit: `A board at ${syncRateFor(mount, 0)}% sync when you have spare pieces.`,
    })),
    ...(primary === 'doomsteed' ? [] : [equippedUpgrade(0, 2, 5)]),
    ...syncUpgrades(0, 4),
    ...syncUpgrades(4, 5),
    equippedUpgrade(primary === 'doomsteed' ? 0 : 2, 4, 6),
    equippedUpgrade(4, 6, 7),
    ...syncUpgrades(5, 6),
    ...syncUpgrades(6, 8),
    equippedUpgrade(6, 8, 8),
  ]
}

function costForStep(costs: number[], step: UpgradeStep, currentLevel?: MountLevel): number {
  if (step.action === 'unlock') return costs[0]
  if (step.action === 'equip') return 0
  const from = Math.max(step.from, currentLevel ?? step.from)
  return costs.slice(from + 1, step.to + 1).reduce((total, cost) => total + cost, 0)
}

function stepLabel(step: UpgradeStep): string {
  const name = MOUNTS[step.mount].name
  if (step.action === 'unlock') return `Unlock ${name}`
  if (step.action === 'equip') return `Equip ${name}`
  return `${name} to ${STAR_LABELS[step.to]}`
}

export function MountUpgradeGuide(props: Props) {
  const { levels, unlocked, selectedMount, onLevelChange, onSelectMount, onUnlockedChange } = props
  const [isOpen, setIsOpen] = useState(false)
  const [grade, setGrade] = useState<Grade>('Legendary')
  const steps = grade === 'Legendary' ? legendarySteps(props) : basicSteps(BASIC_MOUNTS[grade])

  const isDone = (step: UpgradeStep) => {
    if (step.action === 'equip') return selectedMount === step.mount
    if (step.action === 'unlock') return unlocked[step.mount]
    return unlocked[step.mount] && levels[step.mount] >= step.to
  }
  const next = steps.find((step) => !isDone(step))
  const shards = (step: UpgradeStep, currentLevel?: MountLevel) => costForStep(SHARDS[grade], step, currentLevel)
  const cores = (step: UpgradeStep, currentLevel?: MountLevel) => grade === 'Legendary' ? costForStep(LEGENDARY_CORES, step, currentLevel) : 0

  function recordStep(step: UpgradeStep) {
    if (step.action === 'unlock') onUnlockedChange(step.mount, true)
    else if (step.action === 'equip') onSelectMount(step.mount)
    else onLevelChange(step.mount, step.to)
  }

  return (
    <>
      <button type="button" aria-haspopup="dialog" className="app-button px-2 py-1 text-xs" onClick={() => setIsOpen(true)}>
        Upgrade guide
      </button>
      <Modal
        open={isOpen}
        title="Mount upgrade guide"
        footer={null}
        width={720}
        onCancel={() => setIsOpen(false)}
        styles={{
          container: { background: 'var(--sio-accent-surface)' },
          header: { background: 'transparent' },
          title: { color: 'var(--sio-text)' },
        }}
        closeIcon={<span className="text-gray-300">×</span>}
      >
        <fieldset className="mb-4 mt-3 flex flex-wrap gap-2" aria-label="Mount grade">
          {GRADES.map((option) => (
            <button
              type="button"
              key={option}
              aria-pressed={grade === option}
              onClick={() => setGrade(option)}
              className={`app-button px-3 py-1.5 text-xs hover:bg-bg-elev ${grade === option ? 'border-accent bg-accent/25' : 'border-bg-line bg-bg text-gray-300'}`}
            >
              {option}
            </button>
          ))}
        </fieldset>

        <section aria-label="Next recommended step" aria-live="polite" className="mb-4 rounded-lg border border-accent/70 bg-accent/15 p-3 sm:p-4">
          {next ? (
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-blue-200">Recommended next</p>
                <h3 className="mt-1 text-base font-semibold text-white">{stepLabel(next)}</h3>
                <p className="mt-1 text-sm text-gray-200">{next.benefit}</p>
                {next.action !== 'equip' && (
                  <p className="mt-1 text-xs font-semibold text-blue-100">
                    {shards(next, levels[next.mount])} shards · {cores(next, levels[next.mount])} cores required
                  </p>
                )}
              </div>
              <button type="button" className="app-button px-3 py-1.5 text-xs" onClick={() => recordStep(next)}>
                {next.action === 'equip' ? 'Equip in optimizer' : `Record ${next.action}`}
              </button>
            </div>
          ) : (
            <p className="text-sm font-semibold text-white">All {grade.toLowerCase()} steps complete</p>
          )}
        </section>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-gray-300">
            <caption className="pb-2 text-left text-gray-300">
              Suggested upgrade order. Record upgrades after you make them in game. Costs are per step.
            </caption>
            <thead>
              <tr>
                <th scope="col" className="px-2 pb-1">Step</th>
                <th scope="col" className="px-2 pb-1 text-right">Shards</th>
                <th scope="col" className="px-2 pb-1 text-right">Cores</th>
                <th scope="col" className="px-2 pb-1">Benefit</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step) => {
                const label = stepLabel(step)
                const current = step === next
                return (
                  <tr key={label} className={`border-t border-bg-line/70 ${current ? 'bg-accent/20 text-white' : ''}`}>
                    <th scope="row" className={`px-2 py-2 ${current ? 'font-semibold' : 'font-normal'}`}>
                      {label}
                      {current && <span className="ml-2 font-semibold text-blue-200">Next</span>}
                      {isDone(step) && <span className="ml-2 text-emerald-200">Done</span>}
                    </th>
                    <td className="px-2 text-right tabular-nums">{shards(step)}</td>
                    <td className="px-2 text-right tabular-nums">{cores(step)}</td>
                    <td className="px-2">{step.benefit}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  )
}
