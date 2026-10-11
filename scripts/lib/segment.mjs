// Automatic assignment of a character's strokes to its wubi roots.
// seqs: array per root of candidate stroke-type strings (e.g. ["3511"])
// strokes: stroke-type string of the character, e.g. "351131121"
// allowGap: allow uncoded strokes between the 3rd and last root (chars with >4 roots)
// Returns array per root of stroke index arrays, or null.
const sortStr = (s) => [...s].sort().join('')

// Loose mode: a root may match a contiguous chunk with the same strokes in a different order.
export function solveSegmentsLoose(seqs, strokes, allowGap) {
  const loose = seqs.map((list) => [...new Set(list.map(sortStr))])
  const sorted = (j, L) => sortStr(strokes.slice(j, j + L))
  const n = strokes.length, k = seqs.length
  const assign = []
  function rec(j, r, gaps) {
    if (r === k) return j === n ? assign.slice() : null
    for (const q of loose[r]) {
      if (j + q.length <= n && sorted(j, q.length) === q) {
        assign.push(Array.from({ length: q.length }, (_, t) => j + t))
        const res = rec(j + q.length, r + 1, gaps)
        if (res) return res
        assign.pop()
      }
    }
    if (allowGap && r === k - 1 && j < n) return rec(j + 1, r, gaps + 1)
    return null
  }
  return rec(0, 0, 0)
}

export function solveSegments(seqs, strokes, allowGap, maxSolutions = 64) {
  const n = strokes.length
  const k = seqs.length
  const assign = Array.from({ length: k }, () => [])
  const solutions = []

  function rec(j, r, pending, chunks, gaps) {
    if (solutions.length >= maxSolutions) return
    if (j === n) {
      if (r === k && pending.length === 0) solutions.push({ seg: assign.map((a) => a.slice()), chunks, gaps })
      return
    }
    // continue a pending (split) root with its full remaining suffix
    for (let p = 0; p < pending.length; p++) {
      const { root, rest } = pending[p]
      const last = assign[root][assign[root].length - 1]
      if (last !== j - 1 && strokes.startsWith(rest, j)) {
        for (let t = 0; t < rest.length; t++) assign[root].push(j + t)
        const np = pending.slice(0, p).concat(pending.slice(p + 1))
        rec(j + rest.length, r, np, chunks + 1, gaps)
        assign[root].length -= rest.length
      }
    }
    // start the next root
    if (r < k) {
      for (const seq of seqs[r]) {
        for (let L = Math.min(seq.length, n - j); L >= 1; L--) {
          if (strokes.slice(j, j + L) !== seq.slice(0, L)) continue
          for (let t = 0; t < L; t++) assign[r].push(j + t)
          if (L === seq.length) rec(j + L, r + 1, pending, chunks + 1, gaps)
          else if (pending.length < 2) rec(j + L, r + 1, pending.concat([{ root: r, rest: seq.slice(L) }]), chunks + 1, gaps)
          assign[r].length -= L
        }
      }
    }
    // uncoded strokes are only allowed right before the last root
    if (allowGap && r === k - 1 && pending.length === 0) rec(j + 1, r, pending, chunks, gaps + 1)
    // rare: trailing uncoded strokes (e.g. 我)
    if (allowGap && r === k && pending.length === 0) rec(j + 1, r, pending, chunks, gaps + 10)
  }

  rec(0, 0, [], 0, 0)
  return solutions
}

export function parseSegments(s) {
  return s.split('/').map((part) =>
    part.split(',').flatMap((x) => {
      const [a, b] = x.split('-').map(Number)
      if (b === undefined) return [a]
      const r = []
      for (let i = a; i <= b; i++) r.push(i)
      return r
    }),
  )
}
