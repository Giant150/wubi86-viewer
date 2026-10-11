export interface CharRecord {
  /** Microsoft Wubi codes: [code, candidate rank] */
  codes: [string, number][]
  py?: string
  ids?: string
  rad?: string
  /** stroke type sequence: 1横 2竖 3撇 4点 5折 */
  ss?: string
  /** 86 full code from decomposition data */
  full?: string
  /** 0 normal, 1 key-name root, 2 character root, 3 single stroke */
  t?: number
  /** root glyph ids (hex PUA codepoints) */
  r?: string[]
  /** identification-code glyph id */
  idu?: string
  /** e.g. 横·左右〔一 ⿰〕 */
  flag?: string
  more?: string
  /** stroke SVG paths (hanzi-writer coordinates) */
  s?: string[]
  /** stroke indices per root */
  seg?: number[][]
  q?: 'source' | 'exact' | 'approx'
}

export interface RootInfo {
  k: string
  p: string
  n: string
  /** descriptive alias for non-character roots, e.g. 青字头 */
  a?: string
  id: number
}

export interface Meta {
  entries: number
  codes: number
  words: number
  chars: number
  decomposed: number
  strokes: number
}

const cache = new Map<string, Promise<unknown>>()

function fetchJson<T>(path: string): Promise<T> {
  let p = cache.get(path)
  if (!p) {
    p = fetch(`/data/${path}`).then((r) => {
      if (r.status === 404) return {}
      if (!r.ok) throw new Error(`${r.status} ${path}`)
      return r.json()
    })
    p.catch(() => cache.delete(path))
    cache.set(path, p)
  }
  return p as Promise<T>
}

const cp = (s: string) => s.codePointAt(0)!

export async function getChar(ch: string): Promise<CharRecord | null> {
  const shard = await fetchJson<Record<string, CharRecord>>(`c/${(cp(ch) >> 4).toString(16)}.json`)
  return shard[ch] ?? null
}

export async function getWordCodes(word: string): Promise<string[]> {
  const shard = await fetchJson<Record<string, string[]>>(`w/${(cp(word) >> 6).toString(16)}.json`)
  return shard[word] ?? []
}

/** All codes starting with the first two letters of `code`, with their candidates in system order. */
export function getCodeShard(code: string): Promise<Record<string, string[]>> {
  return fetchJson(`k/${code.slice(0, 2)}.json`)
}

export const getRoots = () => fetchJson<Record<string, RootInfo>>('roots.json')
export const getMeta = () => fetchJson<Meta>('meta.json')
