import type { CharRecord } from '../lib/data'
import { wordRule } from '../lib/explain'

interface Props {
  word: string
  codes: string[]
  recs: (CharRecord | null)[]
  onSearch: (q: string) => void
}

export function charFullCode(rec: CharRecord | null): string {
  if (!rec) return ''
  if (rec.full && rec.codes.some(([c]) => c === rec.full)) return rec.full
  return [...rec.codes].sort((a, b) => b[0].length - a[0].length)[0]?.[0] ?? rec.full ?? ''
}

export function WordCard({ word, codes, recs, onSearch }: Props) {
  const chars = [...word]
  const { rule, picks } = wordRule(chars)
  const fulls = recs.map(charFullCode)
  const derived = picks.map(([ci, idx]) => idx.map((i) => fulls[ci]?.[i] ?? '?').join('')).join('')
  const takeMap = new Map(picks.map(([ci, idx]) => [ci, idx]))

  return (
    <article className="card pop-in p-5 sm:p-7">
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
        <h2 className="font-kai text-5xl tracking-wide">{word}</h2>
        <span className="text-sm text-ink-2 dark:text-white/50">词组 · {chars.length} 字</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {codes.length ? (
          codes.map((c) => (
            <button
              key={c}
              onClick={() => onSearch(c)}
              className="rounded-xl border border-cinnabar/30 bg-cinnabar/5 px-3 py-1.5 font-mono text-xl font-semibold tracking-[0.2em] text-cinnabar transition hover:bg-cinnabar/10 dark:text-[#ff8a7a]"
            >
              {c}
            </button>
          ))
        ) : (
          <span className="text-ink-2 dark:text-white/60">
            微软五笔词库未收录该词组，按规则应为 <b className="font-mono tracking-widest">{derived}</b>
          </span>
        )}
      </div>

      <p className="mt-5 text-[15px] leading-7">{rule}</p>
      <div className="mt-3 flex flex-wrap items-stretch gap-3">
        {chars.map((ch, ci) => {
          const take = takeMap.get(ci)
          const full = fulls[ci]
          return (
            <button
              key={ci}
              onClick={() => onSearch(ch)}
              className={`flex min-w-[84px] flex-col items-center gap-1 rounded-2xl border px-3 py-2.5 transition hover:-translate-y-0.5 ${
                take
                  ? 'border-cinnabar/30 bg-white/80 dark:bg-white/5'
                  : 'border-dashed border-black/10 opacity-60 dark:border-white/10'
              }`}
              title={`查看「${ch}」的拆解`}
            >
              <span className="font-kai text-3xl">{ch}</span>
              <span className="font-mono text-sm tracking-widest">
                {full
                  ? [...full].map((l, i) => (
                      <span
                        key={i}
                        className={take?.includes(i) ? 'rounded bg-cinnabar px-0.5 font-bold text-white' : 'opacity-40'}
                      >
                        {l}
                      </span>
                    ))
                  : '—'}
              </span>
              {!take && <span className="text-[10px]">不取码</span>}
            </button>
          )
        })}
      </div>
      {codes.length > 0 && !codes.includes(derived) && !derived.includes('?') && (
        <p className="mt-3 text-xs text-ink-2/80 dark:text-white/45">
          注：按单字全码推得 {derived}，与词库编码不同，可能因单字存在其他取码方式，以词库为准。
        </p>
      )}
    </article>
  )
}
