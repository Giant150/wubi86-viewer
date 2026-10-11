// Learns stroke-type sequences of every wubi root (PUA glyph) from the known segment data.
import { solveSegments, solveSegmentsLoose } from './segment.mjs'
import { approxSegments } from './approx.mjs'

const isSplit = (idx) => idx.some((x, i) => i > 0 && x !== idx[i - 1] + 1)

export function buildRootModel(wubi, chars) {
  const idUnits = new Set()
  for (const w of wubi.values()) if (w.flag) idUnits.add(w.units[w.units.length - 1])

  const learned = new Map()
  const split = new Map()
  const add = (u, s, sp) => {
    if (!s) return
    if (!learned.has(u)) learned.set(u, new Map())
    const m = learned.get(u)
    m.set(s, (m.get(s) ?? 0) + 1)
    if (sp !== undefined) {
      const v = split.get(u) ?? [0, 0]
      v[0] += sp ? 1 : 0
      v[1]++
      split.set(u, v)
    }
  }
  for (const w of wubi.values()) {
    const c = chars.get(w.char)
    if (!c) continue
    if (w.keyUnit || w.charUnit) { add(w.units[0], c.strokeSeq); continue }
    if (!w.segments || w.strokeUnit) continue
    const ru = rootUnitsOf(w, idUnits)
    if (w.segments.length !== ru.length) continue
    if (w.segments.some((s) => !s.length || s.some((x) => x == null || x >= c.strokeSeq.length))) continue
    w.segments.forEach((idx, i) => add(ru[i], idx.map((k) => c.strokeSeq[k]).join(''), isSplit(idx)))
  }
  const seqs = new Map()
  for (const [u, m] of learned) {
    const e = [...m.entries()].sort((a, b) => b[1] - a[1])
    const top = e[0][1]
    seqs.set(u, e.filter(([, n], i) => i === 0 || n >= Math.max(2, top * 0.15)).map((x) => x[0]))
  }
  const splitRate = new Map([...split].map(([u, [a, b]]) => [u, (a + 0.1) / (b + 1)]))
  return { idUnits, seqs, splitRate }
}

export function rootUnitsOf(w, idUnits) {
  const u = w.units.slice()
  if (w.flag && idUnits.has(u[u.length - 1])) u.pop()
  return u
}

// returns { seg, quality: 'source' | 'exact' | 'approx' } or null
export function segmentChar(w, c, model, nStrokes) {
  if (!c || c.strokeSeq.length !== nStrokes) return null
  const ru = rootUnitsOf(w, model.idUnits)
  const seqs = ru.map((u) => model.seqs.get(u) ?? [])
  const s = w.segments
  const validSource =
    s && s.length === ru.length &&
    s.every((x, r) => x.length && x.every((i) => i != null && i < nStrokes) &&
      (!seqs[r].length || seqs[r].includes(x.map((i) => c.strokeSeq[i]).join(''))))
  if (validSource) return { seg: s, quality: 'source' }
  const gap = ru.length === 4
  if (seqs.every((q) => q.length)) {
    const sols = solveSegments(seqs, c.strokeSeq, gap)
    if (sols.length) {
      const score = (sol) =>
        sol.gaps * 0.5 +
        sol.seg.reduce((acc, idx, r) => {
          const rate = model.splitRate.get(ru[r]) ?? 0.05
          return acc + (isSplit(idx) ? 1 - rate : rate)
        }, 0)
      sols.sort((a, b) => score(a) - score(b))
      return { seg: sols[0].seg, quality: 'exact' }
    }
    const loose = solveSegmentsLoose(seqs, c.strokeSeq, gap)
    if (loose) return { seg: loose, quality: 'approx' }
  }
  const ap = approxSegments(seqs, c.strokeSeq, gap)
  if (ap && ap.cost <= Math.max(1, Math.floor(nStrokes / 4))) return { seg: ap.seg, quality: 'approx' }
  return null
}
