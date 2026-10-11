import { getChar, getWordCodes, type DictCode } from './data'

/** One committed chunk: a dictionary word or single character typed with one code. */
export interface Segment {
  text: string
  code: string
  rank: number
  /** candidates under the code */
  n: number
  /** '' = auto commit (unique 4-letter code), ' ' = space, '2'..'9' = pick by digit */
  commit: string
  keys: number
  /** no usable code in the dictionary */
  missing?: boolean
}

export interface TypingPlan {
  segs: Segment[]
  keys: number
  /** how many segments need a non-first candidate */
  picks: number
}

export const MAX_PLAN_CHARS = 40
const MAX_WORD_LEN = 12
const MISSING_COST = 100

/** Key that commits the candidate, or null when it would need paging (rank > 9). */
export function commitKey(code: string, rank: number, n: number): string | null {
  if (rank > 9) return null
  if (code.length === 4 && n === 1) return ''
  return rank === 1 ? ' ' : String(rank)
}

export function bestSegment(text: string, codes: DictCode[]): Segment | null {
  let best: Segment | null = null
  for (const [code, rank, n] of codes) {
    const commit = commitKey(code, rank, n)
    if (commit === null) continue
    const keys = code.length + commit.length
    if (!best || keys < best.keys || (keys === best.keys && rank < best.rank)) {
      best = { text, code, rank, n, commit, keys }
    }
  }
  return best
}

const better = (a: TypingPlan, b: TypingPlan) =>
  a.keys - b.keys || a.segs.length - b.segs.length || a.picks - b.picks

/**
 * K-best segmentation of `chars` into dictionary words/characters minimizing keystrokes.
 * Ties prefer fewer segments, then fewer non-first candidate picks.
 */
export function solvePlans(n: number, options: (Segment | null)[][], k: number): TypingPlan[] {
  const dp: TypingPlan[][] = Array.from({ length: n + 1 }, () => [])
  dp[0] = [{ segs: [], keys: 0, picks: 0 }]
  for (let j = 1; j <= n; j++) {
    const cands: TypingPlan[] = []
    for (let i = Math.max(0, j - MAX_WORD_LEN); i < j; i++) {
      const seg = options[i][j - i - 1]
      if (!seg) continue
      for (const p of dp[i]) {
        cands.push({ segs: [...p.segs, seg], keys: p.keys + seg.keys, picks: p.picks + (seg.rank > 1 ? 1 : 0) })
      }
    }
    dp[j] = cands.sort(better).slice(0, k)
  }
  return dp[n]
}

export interface PlanResult {
  plans: TypingPlan[]
  /** keystrokes when typing character by character */
  perChar: number
  truncated: boolean
}

export async function planTyping(chars: string[], k = 3): Promise<PlanResult> {
  const n = Math.min(chars.length, MAX_PLAN_CHARS)
  // options[i][len-1]: best way to type chars[i, i+len)
  const options: (Segment | null)[][] = await Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const row: (Segment | null)[] = []
      const ch = chars[i]
      const rec = await getChar(ch)
      row.push(
        bestSegment(ch, rec?.codes ?? []) ?? { text: ch, code: '', rank: 1, n: 0, commit: '', keys: MISSING_COST, missing: true },
      )
      for (let len = 2; len <= MAX_WORD_LEN && i + len <= n; len++) {
        const w = chars.slice(i, i + len).join('')
        row.push(bestSegment(w, await getWordCodes(w)))
      }
      return row
    }),
  )
  const plans = solvePlans(n, options, k).map((p) => ({
    ...p,
    keys: p.keys - p.segs.filter((s) => s.missing).length * MISSING_COST,
  }))
  const perChar = options.reduce((s, row) => s + (row[0]?.missing ? 0 : row[0]!.keys), 0)
  return { plans, perChar, truncated: chars.length > n }
}
