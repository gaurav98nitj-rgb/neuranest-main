import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTopics, useWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from '../hooks/useData'
import { ChevronLeft, ChevronRight, Download, Bookmark, BookmarkCheck, Loader2, Search } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
import clsx from 'clsx'

const STAGES = ['All', 'emerging', 'exploding', 'peaking', 'declining']
const CATEGORIES = ['All', 'Electronics', 'Health', 'Home', 'Beauty', 'Fitness', 'Kitchen', 'Outdoors', 'Pets', 'Baby']

function StageBadge({ stage }: { stage: string }) {
  const m: Record<string, string> = {
    emerging: 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50',
    exploding: 'bg-orange-900/60 text-orange-300 border border-orange-700/50',
    peaking: 'bg-yellow-900/60 text-yellow-300 border border-yellow-700/50',
    declining: 'bg-red-900/60 text-red-300 border border-red-700/50',
    unknown: 'bg-brand-800 text-brand-300 border border-brand-700',
  }
  return <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full capitalize', m[stage] || m.unknown)}>{stage}</span>
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-brand-500">—</span>
  const c = score >= 70 ? 'text-emerald-400' : score >= 40 ? 'text-yellow-400' : 'text-red-400'
  return <span className={clsx('font-bold text-sm tabular-nums', c)}>{score.toFixed(1)}</span>
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data || data.length === 0) return null
  const chartData = data.map((v) => ({ v }))
  const up = data[data.length - 1] > data[0]
  return (
    <ResponsiveContainer width={80} height={30}>
      <AreaChart data={chartData}>
        <Area type="monotone" dataKey="v" stroke={up ? '#10B981' : '#EF4444'} fill={up ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function WatchlistButton({ topicId, watchlistIds, onAdd, onRemove }: {
  topicId: string; watchlistIds: Set<string>; onAdd: (id: string) => void; onRemove: (id: string) => void
}) {
  const w = watchlistIds.has(topicId)
  return (
    <button onClick={(e) => { e.stopPropagation(); w ? onRemove(topicId) : onAdd(topicId) }}
      className={clsx('p-1.5 rounded-lg transition-all', w ? 'text-brand-300 bg-brand-800' : 'text-brand-600 hover:text-brand-400 hover:bg-brand-800')}
      title={w ? 'Remove from watchlist' : 'Add to watchlist'}>
      {w ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
    </button>
  )
}

export default function ExplorerPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({ category: 'All', stage: 'All', search: '', sort: '-opportunity_score', page: 1, page_size: 20 })
  const [exporting, setExporting] = useState(false)

  const params: Record<string, any> = { sort: filters.sort, page: filters.page, page_size: filters.page_size }
  if (filters.category !== 'All') params.category = filters.category
  if (filters.stage !== 'All') params.stage = filters.stage
  if (filters.search) params.search = filters.search

  const { data, isLoading } = useTopics(params)
  const topics = data?.data || []
  const pagination = data?.pagination || { page: 1, page_size: 20, total: 0, total_pages: 0 }

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
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Trend Explorer</h1>
          <p className="text-sm text-brand-400 mt-1">Discover emerging product opportunities with predictive intelligence</p>
        </div>
        <button onClick={handleExport} disabled={exporting}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-400 text-sm font-medium disabled:opacity-50 transition-colors">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500" />
            <input type="text" placeholder="Search topics..." value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value, page: 1 })}
              className="w-full pl-10 pr-3 py-2 text-sm" />
          </div>
          <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value, page: 1 })}
            className="px-3 py-2 text-sm">
            {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
          </select>
          <div className="flex gap-1">
            {STAGES.map(s => (
              <button key={s} onClick={() => setFilters({ ...filters, stage: s, page: 1 })}
                className={clsx('px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                  filters.stage === s ? 'bg-brand-500 text-white border-brand-500' : 'bg-srf-1 text-brand-300 border-ln hover:text-brand-200 hover:border-ln-lt')}>
                {s === 'All' ? 'All Stages' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-ln bg-srf">
              <th className="px-3 py-3 w-10"></th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-brand-400 uppercase tracking-wider">Topic</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-brand-400 uppercase tracking-wider">Stage</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-brand-400 uppercase tracking-wider">Category</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-brand-400 uppercase tracking-wider">Trend</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-brand-400 uppercase tracking-wider">Score</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-brand-400 uppercase tracking-wider">Competition</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-brand-400 uppercase tracking-wider">Sources</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-brand-500">Loading trends...</td></tr>
            ) : topics.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-brand-500">No topics found</td></tr>
            ) : topics.map((topic: any) => (
              <tr key={topic.id} onClick={() => navigate(`/topics/${topic.id}`)}
                className="cursor-pointer transition-colors hover:bg-srf-2 border-b border-ln/30">
                <td className="px-3 py-3 text-center">
                  <WatchlistButton topicId={topic.id} watchlistIds={watchlistIds}
                    onAdd={(id) => addMut.mutate(id)} onRemove={(id) => remMut.mutate(id)} />
                </td>
                <td className="px-4 py-3"><span className="font-medium text-brand-100">{topic.name}</span></td>
                <td className="px-4 py-3"><StageBadge stage={topic.stage} /></td>
                <td className="px-4 py-3 text-sm text-brand-300">{topic.primary_category || '—'}</td>
                <td className="px-4 py-3 flex justify-center"><MiniSparkline data={topic.sparkline || []} /></td>
                <td className="px-4 py-3 text-center"><ScoreBadge score={topic.opportunity_score} /></td>
                <td className="px-4 py-3 text-center"><ScoreBadge score={topic.competition_index} /></td>
                <td className="px-4 py-3 text-center"><span className="text-xs text-brand-500">{topic.sources_active?.length || 0} sources</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ln">
            <span className="text-sm text-brand-400">
              Showing {(pagination.page - 1) * pagination.page_size + 1}–{Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page <= 1} className="p-1.5 rounded-lg hover:bg-srf-2 text-brand-300 disabled:opacity-30"><ChevronLeft className="h-5 w-5" /></button>
              <button onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page >= pagination.total_pages} className="p-1.5 rounded-lg hover:bg-srf-2 text-brand-300 disabled:opacity-30"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
