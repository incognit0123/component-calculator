import { recognize } from 'tesseract.js'
import type { StatKey, StatTotals } from '../data/types'

const TARGETS: { key: StatKey; aliases: string[] }[] = [
  { key: 'critDamage', aliases: ['crit damage'] },
  { key: 'skillDamage', aliases: ['skill damage', 'skil damage'] },
  { key: 'shieldDamage', aliases: ['shield damage', 'shiled damage'] },
  { key: 'toWeakened', aliases: ['to weakened', 'damage to weakened'] },
  { key: 'toPoisoned', aliases: ['to poisoned', 'damage to poisoned'] },
  { key: 'toChilled', aliases: ['to chilled', 'damage to chilled'] },
  { key: 'laceration', aliases: ['laceration'] },
  { key: 'toBosses', aliases: ['damage to bosses', 'damage to boss', 'to bosses'] },
]

function normalizeLine(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

function normalizeMultiline(text: string): string {
  return text
    .toLowerCase()
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  )
  for (let i = 0; i <= a.length; i += 1) dp[i][0] = i
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      )
    }
  }
  return dp[a.length][b.length]
}

function fuzzyIncludes(haystack: string, needle: string): boolean {
  if (haystack.includes(needle)) return true
  const hayTokens = haystack.split(' ')
  const needleTokens = needle.split(' ')
  if (hayTokens.length < needleTokens.length) return false
  for (let i = 0; i <= hayTokens.length - needleTokens.length; i += 1) {
    let totalDistance = 0
    for (let j = 0; j < needleTokens.length; j += 1) {
      totalDistance += levenshtein(hayTokens[i + j], needleTokens[j])
    }
    if (totalDistance <= Math.max(1, Math.floor(needle.length * 0.2))) {
      return true
    }
  }
  return false
}

function parseStatsFromText(raw: string): Partial<StatTotals> {
  const out: Partial<StatTotals> = {}
  const text = normalizeMultiline(raw)
  const lines = text.split('\n').map((line) => normalizeLine(line)).filter(Boolean)

  const extractForAlias = (alias: string): number | null => {
    // Primary strategy: line-level label match, then use nearest percentage
    // after that label (helps when OCR merges both screenshot columns).
    for (const line of lines) {
      const exactIdx = line.indexOf(alias)
      const isMatch = exactIdx >= 0 || fuzzyIncludes(line, alias)
      if (!isMatch) continue

      const fromIdx = exactIdx >= 0 ? exactIdx : 0
      const segment = line.slice(fromIdx)
      const withoutBrackets = segment.replace(/\[[^\]]*\]/g, ' ')
      const afterColon = withoutBrackets.match(/:\s*(-?\d+(?:\.\d+)?)\s*%/i)
      const nearestPercent =
        afterColon ?? withoutBrackets.match(/(-?\d+(?:\.\d+)?)\s*%/i)
      if (!nearestPercent) continue
      const value = Number(nearestPercent[1])
      if (Number.isFinite(value)) return value
    }

    // Fallback strategy on flattened OCR text.
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`${escaped}[^\\n]{0,90}`, 'i')
    const match = text.match(pattern)
    if (!match) return null

    // Ignore bracketed uptime snippets like "[100% up ...]"
    const withoutBrackets = match[0].replace(/\[[^\]]*\]/g, ' ')
    const percentMatch =
      withoutBrackets.match(/:\s*(-?\d+(?:\.\d+)?)\s*%/i) ??
      withoutBrackets.match(/(-?\d+(?:\.\d+)?)\s*%/i)
    if (!percentMatch) return null
    const value = Number(percentMatch[1])
    return Number.isFinite(value) ? value : null
  }

  for (const target of TARGETS) {
    for (const alias of target.aliases) {
      const value = extractForAlias(alias)
      if (value != null) {
        out[target.key] = value
        break
      }
    }
  }

  return out
}

export async function ocrStatsFromImage(file: File): Promise<Partial<StatTotals>> {
  const result = await recognize(file, 'eng', {
    logger: () => {
      // silent
    },
  })
  return parseStatsFromText(result.data.text)
}
