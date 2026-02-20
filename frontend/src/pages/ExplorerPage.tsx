import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTopics, useWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from '../hooks/useData'
import { ChevronLeft, ChevronRight, Download, Bookmark, BookmarkCheck, Loader2, Search, SlidersHorizontal, Database } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
import clsx from 'clsx'

const STAGES = ['All', 'exploding', 'emerging', 'peaking', 'declining']

const CATEGORIES = [
  'All',
  'Health & Personal Care', 'Beauty', 'Home', 'Kitchen', 'Grocery',
  'Electronics', 'Pet Products', 'Health & Wellness', 'Beauty & Skincare',
  'Kitchen & Cooking', 'Fitness & Sports', 'Home & Living', 'Luggage',
  'Tech & Gadgets', 'Baby & Kids', 'Pet Care', 'Outdoor & Garden',
  'Automotive', 'Sustainability & Eco', 'Gaming & Entertainment',
  'Fashion & Accessories',
]

function StageBadge({ stage }: { stage: string }) {
  const m: Record<string, string> = {
    emerging:  'bg-sage-50 text-sage-400 border border-sage-100',
    exploding: 'bg-coral-100 text-coral-500 border border-coral-200',
    peaking:   'bg-amber-50 text-amber-300 border border-amber-100',
    declining: 'bg-rose-50 text-rose-400 border border-rose-100',
    unknown:   'bg-sand-200 text-sand-600 border border-sand-300',
  }
  return <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full capitalize', m[stage] || m.unknown)}>{stage}</span>
}

function ScoreBadge({ score, label }: { score: number | null; label?: string }) {
  if (score === null || score === undefined) return <span className="text-sand-500">—</span>
  const c = score >= 60 ? 'text-sage-400' : score >= 40 ? 'text-amber-300' : 'text-rose-400'
  const bg = score >= 60 ? 'bg-sage-50' : score >= 40 ? 'bg-amber-50' : 'bg-rose-50'
  return (
    <div className="flex flex-col items-center">
      <span className={clsx('font-bold text-sm tabular-nums px-2 py-0.5 rounded-md', c, bg)}>{score.toFixed(1)}</span>
      {label && <span className="text-[9px] text-sand-500 mt-0.5">{label}</span>}
    </div>
  )
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return <span className="text-sand-400 text-[10px]">No data</span>
  const chartData = data.map((v) => ({ v }))
  const up = data[data.length - 1] > data[0]
  return (
    <ResponsiveContainer width={80} height={30}>
      <AreaChart data={chartData}>
        <Area type="monotone" dataKey="v" stroke={up ? '#1A8754' : '#C0392B'} fill={up ? 'rgba(26,135,84,0.12)' : 'rgba(192,57,43,0.12)'} strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function SourceDots({ sources }: { sources: string[] | null }) {
  if (!sources || sources.length === 0) return <span className="text-sand-400 text-[10px]">0</span>
  const colorMap: Record<string, { bg: string; label: string }> = {
    google_trends: { bg: '#4285F4', label: 'GT' },
    reddit: { bg: '#FF5700', label: 'RD' },
    amazon_ba: { bg: '#FF9900', label: 'BA' },
    science: { bg: '#7C3AED', label: 'SC' },
  }
  return (
    <div className="flex gap-0.5 justify-center">
      {sources.map(s => {
        const c = colorMap[s] || { bg: '#8B8479', label: s.slice(0,2).toUpperCase() }
        return (
          <span key={s} title={s} style={{ background: c.bg }}
            className="text-[8px] text-white font-bold px-1 py-0.5 rounded">
            {c.label}
          </span>
        )
      })}
    </div>
  )
}

function WatchlistButton({ topicId, watchlistIds, onAdd, onRemove }: {
  topicId: string; watchlistIds: Set<string>; onAdd: (id: string) => void; onRemove: (id: string) => void
}) {
  const w = watchlistIds.has(topicId)
  return (
    <button onClick={(e) => { e.stopPropagation(); w ? onRemove(topicId) : onAdd(topicId) }}
      className={clsx('p-1.5 rounded-lg transition-all', w ? 'text-coral-400 bg-coral-100' : 'text-sand-500 hover:text-coral-400 hover:bg-sand-200')}
      title={w ? 'Remove from watchlist' : 'Add to watchlist'}>
      {w ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </button>
  )
}

export default function ExplorerPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ category: 'All', stage: 'All', search: '', sort: '-opportunity_score', page: 1, page_size: 25 })
  const [exporting, setExporting] = useState(false)

  const params: Record<string, any> = { sort: filters.sort, page: filters.page, page_size: filters.page_size }
  if (filters.category !== 'All') params.category = filters.category
  if (filters.stage !== 'All') params.stage = filters.stage
  if (filters.search) params.search = filters.search

  const { data, isLoading } = useTopics(params)
  const topics = data?.data || []
  const pagination = data?.pagination || { page: 1, page_size: 25, total: 0, total_pages: 0 }

  const { data: watchlistItems } = useWatchlist()
  const addMut = useAddToWatchlist()
  const remMut = useRemoveFromWatchlist()
  const watchlistIds = new Set((watchlistItems || []).map((w: any) => w.topic_id))

  const handleExport = async () => {
    setExporting(true)
    try {
      const ep: Record<string, any> = {}
      if (filters.category !== 'All') ep.category = filters.category
      if (filters.stage !== 'All') ep.stage = filters.stage
      const r = await api.get('/exports/topics.csv', { params: ep, responseType: 'blob' })
      const url = window.URL.createObjectURL(new Blob([r.data]))
      const a = document.createElement('a'); a.href = url; a.download = 'neuranest_export.csv'
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url)
    } catch (err) { console.error('Export failed:', err) }
    finally { setExporting(false) }
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-charcoal-700" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400 }}>Trend Explorer</h1>
          <p className="text-sm text-sand-600 mt-1">
            {pagination.total.toLocaleString()} topics tracked · Scores updated in real-time
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-sand-500">
            <Database className="h-3.5 w-3.5" />
            <span>{pagination.total.toLocaleString()} topics</span>
          </div>
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-coral-400 text-white rounded-lg hover:bg-coral-500 text-sm font-medium disabled:opacity-50 transition-colors">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {exporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sand-500" />
            <input type="text" placeholder="Search topics..." value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              className="w-full pl-10 pr-3 py-2 text-sm" />
          </div>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
            className="px-3 py-2 text-sm border border-sand-300 rounded-lg bg-white">
            {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
          <div className="flex gap-1">
            {STAGES.map(s => (
              <button key={s} onClick={() => setFilters({ ...filters, stage: s, page: 1 })}
                className={clsx('px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                  filters.stage === s ? 'bg-coral-400 text-white border-coral-400' : 'bg-white text-sand-700 border-sand-300 hover:text-coral-400 hover:border-coral-300')}>
                {s === 'All' ? 'All Stages' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value, page: 1 })}
            className="px-3 py-2 text-sm border border-sand-300 rounded-lg bg-white">
            <option value="-opportunity_score">Score ↓</option>
            <option value="opportunity_score">Score ↑</option>
            <option value="name">A → Z</option>
            <option value="-name">Z → A</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-sand-300 bg-sand-100">
              <th className="px-3 py-3 w-10"></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-sand-600 uppercase tracking-wider">Topic</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-sand-600 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-sand-600 uppercase tracking-wider">Stage</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-sand-600 uppercase tracking-wider">Trend</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-sand-600 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-sand-600 uppercase tracking-wider">Competition</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-sand-600 uppercase tracking-wider">Sources</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sand-500">
                <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />Loading trends...
              </td></tr>
            ) : topics.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sand-500">No topics found for these filters</td></tr>
            ) : topics.map((topic: any, idx: number) => (
              <tr key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)}
                className={clsx(
                  'cursor-pointer transition-colors hover:bg-coral-50 border-b border-sand-200',
                  idx % 2 === 1 && 'bg-sand-50'
                )}>
                <td className="px-3 py-3 text-center">
                  <WatchlistButton topicId={topic.id} watchlistIds={watchlistIds}
                    onAdd={(id) => addMut.mutate(id)} onRemove={(id) => remMut.mutate(id)} />
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-charcoal-700">{topic.name}</span>
                </td>
                <td className="px-4 py-3 text-sm text-sand-700">{topic.primary_category || '—'}</td>
                <td className="px-4 py-3 text-center"><StageBadge stage={topic.stage} /></td>
                <td className="px-4 py-3"><div className="flex justify-center"><MiniSparkline data={topic.sparkline || []} /></div></td>
                <td className="px-4 py-3 text-center"><ScoreBadge score={topic.opportunity_score} /></td>
                <td className="px-4 py-3 text-center"><ScoreBadge score={topic.competition_index} /></td>
                <td className="px-4 py-3 text-center"><SourceDots sources={topic.sources_active} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-sand-300">
            <span className="text-sm text-sand-600">
              Showing {(pagination.page - 1) * pagination.page_size + 1}–{Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setFilters({ ...filters, page: 1 })} disabled={filters.page <= 1}
                className="px-2 py-1 text-xs rounded hover:bg-sand-200 text-sand-600 disabled:opacity-30">First</button>
              <button onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page <= 1} className="p-1.5 rounded-lg hover:bg-sand-200 text-sand-600 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
              <span className="text-sm text-sand-600 font-medium">Page {pagination.page} of {pagination.total_pages}</span>
              <button onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page >= pagination.total_pages} className="p-1.5 rounded-lg hover:bg-sand-200 text-sand-600 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
              <button onClick={() => setFilters({ ...filters, page: pagination.total_pages })} disabled={filters.page >= pagination.total_pages}
                className="px-2 py-1 text-xs rounded hover:bg-sand-200 text-sand-600 disabled:opacity-30">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
