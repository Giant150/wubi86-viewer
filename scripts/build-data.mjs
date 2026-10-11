// Builds sharded JSON data for the site into public/data.
// Inputs (data-src/): ms-wubi.tsv (from extract-ms-lex.mjs), search-wubi data files, hanzi-writer-data, 黑体字根.ttf
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import opentype from 'opentype.js'
import { loadWubi, loadChars, loadHanziWriter, loadMs, SRC } from './lib/load.mjs'
import { buildRootModel, rootUnitsOf, segmentChar } from './lib/roots.mjs'

const OUT = 'public/data'
rmSync(OUT, { recursive: true, force: true })
for (const d of ['c', 'k', 'w']) mkdirSync(join(OUT, d), { recursive: true })
const write = (p, v) => writeFileSync(join(OUT, p), JSON.stringify(v))
const hex = (u) => u.codePointAt(0).toString(16)
const isHan = (s) => /^\p{Script=Han}$/u.test(s) || s === '〇'

const wubi = loadWubi()
const chars = loadChars()
const model = buildRootModel(wubi, chars)
console.log('roots learned', model.seqs.size)

// ---- Microsoft dictionary: candidate order = weight ascending (stable by file order)
const ms = loadMs()
const byCode = new Map()
for (const e of ms) {
  if (!byCode.has(e.code)) byCode.set(e.code, [])
  byCode.get(e.code).push(e)
}
for (const list of byCode.values()) list.sort((a, b) => a.weight - b.weight || a.idx - b.idx)

// [code, candidate rank (1-based), candidate count under that code]
const charCodes = new Map() // char -> [[code, rank, n]]
const wordCodes = new Map() // word -> [[code, rank, n]]
for (const [code, list] of byCode) {
  list.forEach((e, i) => {
    const target = [...e.word].length === 1 ? charCodes : wordCodes
    if (!target.has(e.word)) target.set(e.word, [])
    const arr = target.get(e.word)
    if (!arr.some((x) => x[0] === code)) arr.push([code, i + 1, list.length])
  })
}
const byLenThenCode = (a, b) => a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1)
for (const arr of charCodes.values()) arr.sort(byLenThenCode)
for (const arr of wordCodes.values()) arr.sort(byLenThenCode)

// ---- code index shards (by first 2 letters)
const kShards = new Map()
for (const [code, list] of byCode) {
  const k = code.slice(0, 2)
  if (!kShards.has(k)) kShards.set(k, {})
  kShards.get(k)[code] = list.map((e) => e.word)
}
for (const [k, v] of kShards) write(`k/${k}.json`, v)

// ---- word -> codes shards (by first char codepoint >> 6)
const wShards = new Map()
for (const [word, codes] of wordCodes) {
  const b = (word.codePointAt(0) >> 6).toString(16)
  if (!wShards.has(b)) wShards.set(b, {})
  wShards.get(b)[word] = codes
}
for (const [b, v] of wShards) write(`w/${b}.json`, v)

// ---- roots: glyph path + key + name
const fontBuf = readFileSync(join(SRC, '黑体字根.ttf'))
const font = opentype.parse(fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.length))
const keyCount = new Map()
const rootName = new Map()
const bump = (u, k) => {
  if (!k) return
  if (!keyCount.has(u)) keyCount.set(u, {})
  const m = keyCount.get(u)
  m[k] = (m[k] ?? 0) + 1
}
for (const w of wubi.values()) {
  if (w.keyUnit || w.charUnit) {
    bump(w.units[0], w.code[0])
    if (!rootName.has(w.units[0])) rootName.set(w.units[0], w.char)
    continue
  }
  if (w.strokeUnit) continue
  const ru = rootUnitsOf(w, model.idUnits)
  ru.forEach((u, i) => bump(u, w.code[i]))
  if (ru.length < w.units.length) bump(w.units[w.units.length - 1], w.code[w.code.length - 1])
}
const aliases = JSON.parse(readFileSync('scripts/root-names.json', 'utf8'))
const usedUnits = new Set()
for (const w of wubi.values()) for (const u of w.units) usedUnits.add(u)
const roots = {}
for (const u of usedUnits) {
  const glyph = font.hasChar(u) ? font.charToGlyph(u) : null
  const path = glyph && glyph.path.commands.length ? glyph.getPath(0, 86, 100).toPathData(1) : ''
  const kc = keyCount.get(u) ?? {}
  const key = Object.entries(kc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
  const r = { k: key, p: path, n: rootName.get(u) ?? (u.codePointAt(0) < 0xe000 ? u : ''), id: model.idUnits.has(u) ? 1 : 0 }
  if (!r.n && aliases[hex(u)]) r.a = aliases[hex(u)]
  roots[hex(u)] = r
}
write('roots.json', roots)

// ---- char details (by codepoint >> 4)
const cShards = new Map()
const stats = { chars: 0, decomposed: 0, strokes: 0, seg: { source: 0, exact: 0, approx: 0 } }
const allChars = new Set([...charCodes.keys()].filter(isHan))
for (const ch of wubi.keys()) if (charCodes.has(ch)) allChars.add(ch)
for (const ch of allChars) {
  const w = wubi.get(ch)
  const c = chars.get(ch)
  const hw = loadHanziWriter(ch)
  const rec = { codes: charCodes.get(ch) ?? [] }
  if (c) {
    rec.py = c.pinyin
    rec.ids = c.ids
    rec.rad = c.radical
    rec.ss = c.strokeSeq
  }
  if (w) {
    stats.decomposed++
    rec.full = w.code
    rec.t = w.keyUnit ? 1 : w.strokeUnit ? 3 : w.charUnit ? 2 : 0
    const ru = w.keyUnit || w.charUnit || w.strokeUnit ? w.units : rootUnitsOf(w, model.idUnits)
    rec.r = ru.map(hex)
    if (rec.t === 0 && ru.length < w.units.length) rec.idu = hex(w.units[w.units.length - 1])
    if (w.flag) rec.flag = w.flag
    if (w.more) rec.more = w.more.replace(/^⊙/, '')
  }
  if (hw) {
    stats.strokes++
    rec.s = hw.strokes
    if (w && rec.t === 0) {
      const r = segmentChar(w, c, model, hw.strokes.length)
      if (r) {
        rec.seg = r.seg
        rec.q = r.quality
        stats.seg[r.quality]++
      }
    }
  }
  stats.chars++
  const b = (ch.codePointAt(0) >> 4).toString(16)
  if (!cShards.has(b)) cShards.set(b, {})
  cShards.get(b)[ch] = rec
}
for (const [b, v] of cShards) write(`c/${b}.json`, v)

const meta = {
  entries: ms.length,
  codes: byCode.size,
  words: wordCodes.size,
  ...stats,
  files: cShards.size + kShards.size + wShards.size + 2,
}
write('meta.json', meta)
console.log(meta)
