import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { StatKey } from '../../src/data/types'
import { detectGrid } from '../../src/utils/inventoryScan/grid'
import type { RgbaImage } from '../../src/utils/inventoryScan/image'
import { LOW_FILTER_CONFIDENCE, readFilter } from '../../src/utils/inventoryScan/indicator'
import { Device, InputBlockedError, listDevices, sleep } from './adb'
import { boardActivity, findPanelIcons, gutterX, listDifference } from './screen'

/** The filter panel's icons, row by row. Display names stay out of this script because `data/stats.ts` imports images Node cannot load. */
const PANEL_ORDER: StatKey[] = [
  'critDamage',
  'toWeakened',
  'toChilled',
  'toPoisoned',
  'shieldDamage',
  'toBosses',
  'laceration',
  'skillDamage',
]

const REMOTE_VIDEO = '/data/local/tmp/component-capture.mp4'
const MAX_DRAGS_PER_FILTER = 40

class Abort extends Error {}

const { values: args } = parseArgs({
  options: {
    serial: { type: 'string', short: 's' },
    out: { type: 'string', short: 'o', default: 'tools/capture/out' },
    'dry-run': { type: 'boolean', default: false },
  },
})

function log(msg: string) {
  console.log(`[capture] ${msg}`)
}

async function settledScreenshot(device: Device, ok: (img: RgbaImage) => boolean, what: string): Promise<RgbaImage> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await sleep(350)
    const img = device.screenshot()
    if (ok(img)) return img
  }
  throw new Abort(`Timed out waiting for ${what}. Is the game still on Install Component?`)
}

function requireInstallComponent(img: RgbaImage) {
  const filter = readFilter(img)
  if (!filter) throw new Abort('Install Component is not on screen, or a popup is covering it. Open it and run again.')
  return filter
}

async function selectFilter(device: Device, stat: StatKey, boardBaseline: number): Promise<void> {
  const before = device.screenshot()
  const filter = requireInstallComponent(before)
  if (filter.filter === stat && filter.confidence >= LOW_FILTER_CONFIDENCE) return
  device.tap(filter.box.x + filter.box.w / 2, filter.box.y + filter.box.h / 2)
  const open = await settledScreenshot(device, (img) => findPanelIcons(img, filter.box) !== null, 'the filter menu to open')
  const icon = findPanelIcons(open, filter.box)![PANEL_ORDER.indexOf(stat)]
  device.tap(icon.x + icon.w / 2, icon.y + icon.h / 2)
  const after = await settledScreenshot(
    device,
    (img) => {
      const f = readFilter(img)
      return f !== null && f.filter === stat && findPanelIcons(img, f.box) === null
    },
    `the ${stat} filter`,
  )
  checkBoard(after, boardBaseline)
}

function checkBoard(img: RgbaImage, baseline: number) {
  const box = readFilter(img)?.box
  if (!box) return
  if (boardActivity(img, box) > baseline + 200) {
    throw new Abort('Something appeared on the mount board, so a component may have been installed. Check the game.')
  }
}

async function scrollToBottom(device: Device, boardBaseline: number): Promise<number> {
  let current = device.screenshot()
  for (let drags = 0; drags < MAX_DRAGS_PER_FILTER; drags += 1) {
    const grid = detectGrid(current)
    if (!grid || grid.rowTops.length < 2) return drags
    const lastRow = grid.rowTops.length - 1
    // Only the list's final row can have an empty slot, so an empty bottom-right cell means the end is already on screen.
    if (!grid.cells.some((c) => c.row === lastRow && c.col === grid.columns.length - 1)) return drags
    const pitch = grid.pitchY ?? grid.cellSize
    const fromY = grid.rowTops[grid.rowTops.length - 1] + grid.cellSize / 2
    const toY = Math.max(grid.rowTops[0], fromY - pitch * 2)
    await device.drag(gutterX(grid), fromY, toY)
    const next = await settledScreenshot(device, (img) => readFilter(img) !== null, 'the list to settle')
    checkBoard(next, boardBaseline)
    if (listDifference(current, next, grid) < 1.5) return drags + 1
    current = next
  }
  return MAX_DRAGS_PER_FILTER
}

async function main() {
  const devices = listDevices()
  const serial = args.serial ?? (devices.length === 1 ? devices[0] : undefined)
  if (!serial) {
    throw new Abort(
      devices.length === 0
        ? 'No phone found. Connect it with USB debugging on and check `adb devices`.'
        : `Several devices are connected (${devices.join(', ')}); pick one with --serial.`,
    )
  }
  const device = new Device(serial)
  const first = device.screenshot()
  const filter = requireInstallComponent(first)
  const baseline = boardActivity(first, filter.box)
  log(`Found Install Component on ${serial} (${first.width}×${first.height}), filter: ${filter.filter}.`)
  if (args['dry-run']) {
    log('Dry run: the screen was recognised; nothing was tapped.')
    return
  }

  const outDir = resolve(args.out!)
  mkdirSync(outDir, { recursive: true })
  const local = join(outDir, `components-${new Date().toISOString().replace(/[:.]/g, '-')}.mp4`)
  log('Recording. Keep your hands off the phone until this finishes.')
  const recording = device.startRecording(REMOTE_VIDEO)
  const progress: { current: StatKey | null; stoppedAt: StatKey | null } = { current: PANEL_ORDER[0], stoppedAt: null }
  recording.once('exit', () => {
    progress.stoppedAt = progress.current
  })
  try {
    await sleep(1000)
    for (const stat of PANEL_ORDER) {
      progress.current = stat
      log(`${stat}: selecting`)
      await selectFilter(device, stat, baseline)
      const drags = await scrollToBottom(device, baseline)
      log(`${stat}: scrolled to the bottom (${drags} drag${drags === 1 ? '' : 's'})`)
    }
    progress.current = null
  } finally {
    await device.stopRecording(recording)
  }
  device.pull(REMOTE_VIDEO, local)
  log(`Saved ${local}`)
  if (progress.stoppedAt) {
    const missing = PANEL_ORDER.slice(PANEL_ORDER.indexOf(progress.stoppedAt))
    throw new Abort(
      `The recording stopped early, during ${progress.stoppedAt} (screenrecord stops after three minutes). These filters may be missing from it: ${missing.join(', ')}.`,
    )
  }
  log('Upload it in the optimizer with Inventory → Import from game.')
}

main().catch((e) => {
  if (e instanceof InputBlockedError) {
    console.error('[capture] The phone refused simulated taps. See "Phone refuses taps" in tools/capture/README.md.')
    console.error(`[capture] ${e.message}`)
  } else {
    console.error(`[capture] ${e instanceof Abort ? e.message : e instanceof Error ? (e.stack ?? e.message) : String(e)}`)
  }
  process.exitCode = 1
})
