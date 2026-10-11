import { useCallback, useEffect, useRef, useState } from 'react'
import { getChar, getMeta, getRoots, getWordCodes, type CharRecord, type Meta, type RootInfo } from './lib/data'
import { history } from './lib/history'
import { CharCard } from './components/CharCard'
import { WordCard } from './components/WordCard'
import { CodeResults } from './components/CodeResults'
import { HistoryPanel } from './components/HistoryPanel'
import { RootsPage } from './components/RootsPage'
import { ReviewPage } from './components/ReviewPage'

type Page = 'search' | 'roots' | 'review'

function readLocation(): { page: Page; q: string } {
  const p = location.pathname.replace(/\/+$/, '')
  const page: Page = p === '/roots' ? 'roots' : p === '/review' ? 'review' : 'search'
  return { page, q: new URLSearchParams(location.search).get('q') ?? '' }
}

const isCode = (q: string) => /^[a-z]{1,4}$/i.test(q)
const hanOnly = (q: string) => [...q].filter((c) => /\p{Script=Han}|〇/u.test(c)).join('')
const historyKey = (q: string) => (isCode(q) ? q.toLowerCase() : hanOnly(q))

interface SearchResult {
  q: string
  kind: 'code' | 'han' | 'none'
  word?: { text: string; codes: string[]; recs: (CharRecord | null)[] }
  chars: { ch: string; rec: CharRecord | null }[]
}

function CharCardLoader({ ch, roots, onSearch }: { ch: string; roots: Record<string, RootInfo>; onSearch: (q: string) => void }) {
  const [rec, setRec] = useState<CharRecord | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    getChar(ch).then((r) => alive && setRec(r))
    return () => {
      alive = false
    }
  }, [ch])
  if (rec === undefined) return null
  return <CharCard ch={ch} rec={rec} roots={roots} onSearch={onSearch} />
}

const EXAMPLES = ['胜', '国', '露', '我', '鹏', '五笔', '学习', '中华人民共和国', 'etgg', 'ggtt']

export default function App() {
  const [loc, setLoc] = useState(readLocation)
  const [input, setInput] = useState(loc.q)
  const [roots, setRoots] = useState<Record<string, RootInfo> | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [result, setResult] = useState<SearchResult | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const composing = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getRoots().then(setRoots)
    getMeta().then(setMeta)
    const onPop = () => {
      const l = readLocation()
      setLoc(l)
      setInput(l.q)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((page: Page, q: string, replace = false) => {
    const path = page === 'search' ? '/' : `/${page}`
    const url = q ? `${path}?q=${encodeURIComponent(q)}` : path
    if (url !== location.pathname + location.search) {
      if (replace) window.history.replaceState(null, '', url)
      else window.history.pushState(null, '', url)
    }
    setLoc({ page, q })
  }, [])

  const search = useCallback(
    (q: string) => {
      setInput(q)
      navigate('search', q.trim())
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    [navigate],
  )

  const q = loc.page === 'search' ? loc.q.trim() : ''
  useEffect(() => {
    let alive = true
    if (!q) {
      setResult(null)
      return
    }
    ;(async (): Promise<SearchResult> => {
      if (isCode(q)) return { q, kind: 'code', chars: [] }
      const han = hanOnly(q)
      if (!han) return { q, kind: 'none', chars: [] }
      const list = [...han]
      const uniq = [...new Set(list)].slice(0, 16)
      const recs = new Map(await Promise.all(uniq.map(async (ch) => [ch, await getChar(ch)] as const)))
      let word: SearchResult['word']
      if (list.length > 1 && list.length <= 12) {
        word = { text: han, codes: await getWordCodes(han), recs: list.map((c) => recs.get(c) ?? null) }
      }
      return { q, kind: 'han', word, chars: uniq.map((ch) => ({ ch, rec: recs.get(ch) ?? null })) }
    })().then((r) => alive && setResult(r))
    return () => {
      alive = false
    }
  }, [q])

  // record settled queries into history
  useEffect(() => {
    if (!result || result.kind === 'none') return
    const t = window.setTimeout(() => history.record(historyKey(result.q)), 1500)
    return () => window.clearTimeout(t)
  }, [result])

  const onInput = (v: string) => {
    setInput(v)
    if (!composing.current) navigate('search', v.trim(), true)
  }

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const pages = [
    ['search', '查询'],
    ['roots', '字根表'],
    ['review', '复习'],
  ] as const

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-3 py-5">
        <button onClick={() => search('')} className="flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-cinnabar font-kai text-2xl text-white shadow-md shadow-cinnabar/30">
            五
          </span>
          <span className="text-left leading-tight">
            <span className="block font-kai text-xl">五笔字根图解</span>
            <span className="block text-[11px] tracking-wider text-ink-2 dark:text-white/45">86 版 · 微软五笔词库</span>
          </span>
        </button>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          {pages.map(([p, label]) => (
            <button
              key={p}
              onClick={() => navigate(p, p === 'search' ? input.trim() : '')}
              className={`rounded-full px-3 py-1.5 transition ${
                loc.page === p ? 'bg-ink text-paper dark:bg-white dark:text-black' : 'hover:bg-black/5 dark:hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
          <button className="btn ml-1 !px-2.5" onClick={() => setHistoryOpen(true)} title="查询记录">
            🕘<span className="hidden sm:inline">记录</span>
          </button>
          <button className="btn !px-2.5" onClick={toggleTheme} title="切换明暗">
            {dark ? '☀' : '☾'}
          </button>
        </nav>
      </header>

      <main className="flex-1 pb-16">
        {loc.page === 'search' && (
          <>
            <div className={`transition-all ${q ? 'pt-2' : 'pt-[10vh]'}`}>
              {!q && (
                <div className="mb-8 text-center">
                  <h1 className="font-kai text-4xl sm:text-5xl">一字一拆，看懂五笔</h1>
                  <p className="mt-3 text-ink-2 dark:text-white/55">
                    输入汉字、词语或五笔编码，田字格高亮每个字根，并自动讲解取码规则。
                  </p>
                </div>
              )}
              <div className="relative mx-auto max-w-2xl">
                <input
                  ref={inputRef}
                  autoFocus
                  value={input}
                  onChange={(e) => onInput(e.target.value)}
                  onCompositionStart={() => (composing.current = true)}
                  onCompositionEnd={(e) => {
                    composing.current = false
                    onInput(e.currentTarget.value)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && input.trim() && historyKey(input.trim())) history.record(historyKey(input.trim()))
                    if (e.key === 'Escape') onInput('')
                  }}
                  placeholder="输入汉字 / 词语 / 编码，如：胜、五笔、etgg"
                  className="w-full rounded-2xl border border-black/10 bg-white/90 py-4 pl-5 pr-12 text-xl shadow-[0_8px_30px_rgba(60,40,20,0.08)] outline-none transition placeholder:text-ink-2/40 focus:border-cinnabar/50 focus:ring-4 focus:ring-cinnabar/10 dark:border-white/10 dark:bg-white/5 dark:placeholder:text-white/25"
                  spellCheck={false}
                  autoComplete="off"
                />
                {input && (
                  <button
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-ink-2/50 hover:text-cinnabar dark:text-white/40"
                    onClick={() => {
                      onInput('')
                      inputRef.current?.focus()
                    }}
                    aria-label="清空"
                  >
                    ✕
                  </button>
                )}
              </div>
              {!q && (
                <div className="mx-auto mt-5 flex max-w-2xl flex-wrap justify-center gap-2">
                  {EXAMPLES.map((e) => (
                    <button key={e} className="btn text-sm" onClick={() => search(e)}>
                      <span className={isCode(e) ? 'font-mono' : 'font-kai text-base'}>{e}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-8 space-y-5">
              {q && !roots && <p className="text-center text-ink-2">加载字根数据…</p>}
              {roots && result && result.q === q && (
                <>
                  {result.kind === 'code' && (
                    <CodeResults
                      code={q.toLowerCase()}
                      roots={roots}
                      onSearch={search}
                      renderChar={(ch) => <CharCardLoader ch={ch} roots={roots} onSearch={search} />}
                    />
                  )}
                  {result.kind === 'none' && (
                    <p className="text-center text-ink-2 dark:text-white/50">
                      请输入汉字，或 1～4 位五笔编码（a～y，z 为万能键）。
                    </p>
                  )}
                  {result.word && (
                    <WordCard word={result.word.text} codes={result.word.codes} recs={result.word.recs} onSearch={search} />
                  )}
                  {result.chars.map(({ ch, rec }) => (
                    <CharCard key={ch} ch={ch} rec={rec} roots={roots} onSearch={search} />
                  ))}
                </>
              )}
            </div>
          </>
        )}
        {loc.page === 'roots' && roots && <RootsPage roots={roots} onSearch={search} />}
        {loc.page === 'review' && roots && <ReviewPage roots={roots} onSearch={search} />}
      </main>

      <footer className="border-t border-black/5 py-6 text-center text-xs leading-6 text-ink-2/70 dark:border-white/10 dark:text-white/35">
        {meta && (
          <p>
            收录 {meta.chars.toLocaleString()} 个汉字、{meta.words.toLocaleString()} 个词组；字根拆解{' '}
            {meta.decomposed.toLocaleString()} 字，田字格笔画 {meta.strokes.toLocaleString()} 字。
          </p>
        )}
        <p>
          编码与候选顺序来自 Windows 微软五笔词库；字根拆解参考{' '}
          <a className="underline" href="https://github.com/sdcb/search-wubi" target="_blank" rel="noreferrer">
            search-wubi
          </a>
          ；笔画矢量来自{' '}
          <a className="underline" href="https://github.com/skishore/makemeahanzi" target="_blank" rel="noreferrer">
            Make Me a Hanzi
          </a>{' '}
          (Arphic Public License)。查询记录仅保存在本机浏览器。
        </p>
      </footer>

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onSearch={search}
        onReview={() => {
          setHistoryOpen(false)
          navigate('review', '')
        }}
      />
    </div>
  )
}
