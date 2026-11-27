import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { decode } from 'fast-png'
import type { RgbaImage } from '../../src/utils/inventoryScan/image'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class InputBlockedError extends Error {}

function run(args: string[], input?: { binary: true }): Buffer {
  const res = spawnSync('adb', args, { maxBuffer: 64 * 1024 * 1024, encoding: input ? undefined : 'buffer' })
  if (res.error) throw new Error(`adb not found or failed to start: ${res.error.message}`)
  const stderr = res.stderr.toString()
  if (res.status !== 0) throw new Error(`adb ${args.join(' ')} failed: ${stderr.trim()}`)
  return res.stdout
}

export function listDevices(): string[] {
  return run(['devices'])
    .toString()
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === 'device')
    .map(([serial]) => serial)
}

export class Device {
  readonly serial: string

  constructor(serial: string) {
    this.serial = serial
  }

  private adb(args: string[]): Buffer {
    return run(['-s', this.serial, ...args])
  }

  shell(command: string): string {
    return this.adb(['shell', command]).toString()
  }

  screenshot(): RgbaImage {
    const png = decode(this.adb(['exec-out', 'screencap', '-p']))
    const data = new Uint8ClampedArray(png.width * png.height * 4)
    for (let i = 0, j = 0; i < data.length; i += 4, j += png.channels) {
      data[i] = png.data[j]
      data[i + 1] = png.data[j + 1]
      data[i + 2] = png.data[j + 2]
      data[i + 3] = 255
    }
    return { width: png.width, height: png.height, data }
  }

  /** `input` exits 0 even when the OS refuses the injection; the refusal only shows on stderr. */
  private input(args: string): void {
    const res = spawnSync('adb', ['-s', this.serial, 'shell', `input ${args}`], { encoding: 'utf8' })
    const out = `${res.stdout}${res.stderr}`
    if (/SecurityException|INJECT_EVENTS/.test(out)) throw new InputBlockedError(out.trim())
    if (res.status !== 0) throw new Error(`input ${args} failed: ${out.trim()}`)
  }

  tap(x: number, y: number): void {
    this.input(`tap ${Math.round(x)} ${Math.round(y)}`)
  }

  /** Moves in steps, then holds still before lifting, so the list stops where the finger stops instead of flinging on. */
  async drag(x: number, fromY: number, toY: number, steps = 12, holdMs = 350): Promise<void> {
    const rx = Math.round(x)
    this.input(`motionevent DOWN ${rx} ${Math.round(fromY)}`)
    for (let i = 1; i <= steps; i += 1) {
      this.input(`motionevent MOVE ${rx} ${Math.round(fromY + ((toY - fromY) * i) / steps)}`)
    }
    for (let t = 0; t < holdMs; t += 120) {
      this.input(`motionevent MOVE ${rx} ${Math.round(toY)}`)
      await sleep(120)
    }
    this.input(`motionevent UP ${rx} ${Math.round(toY)}`)
  }

  startRecording(remotePath: string): ChildProcess {
    return spawn('adb', ['-s', this.serial, 'shell', 'screenrecord', '--time-limit', '180', remotePath], {
      stdio: 'ignore',
    })
  }

  /** SIGINT lets screenrecord finish the mp4; killing the local adb process would leave it unplayable. */
  async stopRecording(proc: ChildProcess): Promise<void> {
    spawnSync('adb', ['-s', this.serial, 'shell', 'pkill -INT screenrecord'])
    await new Promise<void>((resolve) => {
      if (proc.exitCode !== null) resolve()
      else proc.once('exit', () => resolve())
    })
    await sleep(1000)
  }

  pull(remote: string, local: string): void {
    this.adb(['pull', remote, local])
    this.adb(['shell', `rm -f ${remote}`])
  }
}
