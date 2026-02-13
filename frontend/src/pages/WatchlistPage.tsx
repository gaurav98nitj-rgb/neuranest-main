import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchlist, useRemoveFromWatchlist } from '../hooks/useData'
import {
  Trash2, Bell, BellPlus, Eye, Bookmark, TrendingUp,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus, AlertCircle, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'

/* ── Stage visual tokens ───────────────────────────────── */
const STAGE_BADGE: Record<string, string> = {
  emerging:  'bg-emerald-900/60 text-emerald-300',
  exploding: 'bg-orange-900/60  text-orange-300',
  peaking:   'bg-yellow-900/60  text-yellow-300',
  declining: 'bg-red-900/60     text-red-300',
  stable:    'bg-sky-900/60     text-sky-300',
  unknown:   'bg-brand-800      text-brand-400',
}
const STAGE_BAR: Record<string, string> = {
  emerging:  'bg-emerald-500',
  exploding: 'bg-orange-500',
  peaking:   'bg-yellow-500',
  declining: 'bg-red-400',
  stable:    'bg-sky-400',
}

/* ── Score ring SVG ────────────────────────────────────── */
function ScoreRing({ score, label, size = 52 }: { score: number | null | undefined; label: string; size?: number }) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="rounded-full border-2 border-dashed border-brand-700 flex items-center justify-center"
          style={{ width: size, height: size }}>
          <span className="text-[10px] text-brand-600">N/A</span>
        </div>
        <span className="text-[10px] text-brand-600 uppercase tracking-wide">{label}</span>
      </div>
    )
  }
  const pct = Math.min(Math.max(score, 0), 100) / 100
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const color = score >= 70 ? '#10B981' : score >= 40 ? '#EAB308' : '#EF4444'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1E5570" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`} strokeLinecap="round" />
      </svg>
      <span className="text-[10px] text-brand-500 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  )
}

/* ── Growth indicator ─────────────────────────────────── */
function GrowthBadge({ growth }: { growth: number | null | undefined }) {
  if (growth == null) return null
  const pct = (growth * 100).toFixed(0)
  const isPositive = growth > 0
  const Icon = growth > 0 ? ArrowUpRight : growth < 0 ? ArrowDownRight : Minus
  return (
    <span className={clsx(
      'inline-flex items-center gap-0.5 text-xs font-semibold',
      isPositive ? 'text-emerald-400' : 'text-red-400'
    )}>
      <Icon className="h-3 w-3" />
      {isPositive ? '+' : ''}{pct}%
    </span>
  )
}

/* ── Skeleton loader ──────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="card p-0 overflow-hidden animate-pulse">
      <div className="flex items-center">
        <div className="w-1.5 self-stretch bg-brand-700" />
        <div className="flex-1 flex items-center gap-6 px-5 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-brand-700 rounded" />
            <div className="h-3 w-32 bg-brand-800 rounded" />
          </div>
          <div className="h-12 w-12 bg-brand-700 rounded-full" />
          <div className="flex gap-1">
            <div className="h-8 w-8 bg-brand-800 rounded-lg" />
            <div className="h-8 w-8 bg-brand-800 rounded-lg" />
            <div className="h-8 w-8 bg-brand-800 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main page ────────────────────────────────────────── */
export default function WatchlistPage() {
  const navigate = useNavigate()
  const { data: items, isLoading, isError, refetch } = useWatchlist()
  const removeMut = useRemoveFromWatchlist()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const count = items?.length || 0

  /* Helper: safely read nested fields since API shape may vary */
  const getName   = (item: any) => item.topic_name   ?? item.name   ?? item.topic?.name   ?? 'Unnamed Topic'
  const getStage  = (item: any) => item.topic_stage  ?? item.stage  ?? item.topic?.lifecycle_status ?? 'unknown'
  const getScore  = (item: any) => item.opportunity_score ?? item.score ?? item.topic?.latest_scores?.opportunity ?? null
  const getGrowth = (item: any) => item.growth_4w ?? item.topic?.growth_4w ?? null
  const getTopicId = (item: any) => item.topic_id ?? item.id

  const handleRemove = (topicId: string) => {
    removeMut.mutate(topicId, { onSettled: () => setConfirmRemove(null) })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My Watchlist</h1>
          <p className="text-sm text-brand-400 mt-1">
            {count} topic{count !== 1 ? 's' : ''} tracked · Free plan: 5 slots
          </p>
        </div>
        <button
          onClick={() => navigate('/explore')}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-400 text-sm font-medium transition-colors"
        >
          <TrendingUp className="h-4 w-4" /> Browse Topics
        </button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="card p-6 flex items-center gap-4 border border-red-900/50 mb-4">
          <AlertCircle className="h-8 w-8 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-brand-200">Failed to load watchlist</p>
            <p className="text-xs text-brand-500 mt-0.5">Check your connection and try again.</p>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-300 border border-ln rounded-lg hover:bg-srf-2 transition-colors">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>

      /* Empty state */
      ) : !items?.length && !isError ? (
        <div className="card p-12 text-center">
          <Bookmark className="h-16 w-16 text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-brand-200 mb-2">Your watchlist is empty</h3>
          <p className="text-sm text-brand-400 mb-6 max-w-md mx-auto">
            Add topics from the Explorer to track trend stage changes, score spikes, and new competition.
          </p>
          <button onClick={() => navigate('/explore')}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-400 text-sm font-medium transition-colors">
            <TrendingUp className="h-4 w-4" /> Explore Topics
          </button>
        </div>

      /* Items */
      ) : (
        <div className="space-y-3">
          {items!.map((item: any) => {
            const topicId = getTopicId(item)
            const stage = getStage(item)
            return (
              <div key={item.id || topicId} className="card p-0 overflow-hidden group hover:border-ln-lt transition-colors">
                <div className="flex items-center">
                  {/* Stage bar */}
                  <div className={clsx('w-1.5 self-stretch', STAGE_BAR[stage] || 'bg-brand-600')} />

                  <div className="flex-1 flex items-center gap-5 px-5 py-4">
                    {/* Topic info */}
                    <div className="flex-1 min-w-0">
                      <h3
                        className="font-semibold text-brand-100 truncate cursor-pointer hover:text-white transition-colors"
                        onClick={() => navigate(`/topics/${topicId}`)}
                      >
                        {getName(item)}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={clsx(
                          'text-xs font-medium px-2 py-0.5 rounded-full capitalize',
                          STAGE_BADGE[stage] || STAGE_BADGE.unknown
                        )}>
                          {stage}
                        </span>
                        <GrowthBadge growth={getGrowth(item)} />
                        <span className="text-xs text-brand-600">
                          Added {new Date(item.added_at || item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Score ring */}
                    <ScoreRing score={getScore(item)} label="Score" />

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/topics/${topicId}`)}
                        className="p-2 text-brand-500 hover:text-brand-300 hover:bg-srf-2 rounded-lg transition-colors"
                        title="View Details">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => navigate('/alerts')}
                        className="p-2 text-brand-500 hover:text-yellow-400 hover:bg-srf-2 rounded-lg transition-colors"
                        title="Set Alert">
                        <BellPlus className="h-4 w-4" />
                      </button>

                      {confirmRemove === topicId ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleRemove(topicId)}
                            disabled={removeMut.isPending}
                            className="px-2 py-1 text-xs font-medium text-red-300 bg-red-900/50 hover:bg-red-900/80 rounded transition-colors">
                            {removeMut.isPending ? '...' : 'Remove'}
                          </button>
                          <button onClick={() => setConfirmRemove(null)}
                            className="px-2 py-1 text-xs text-brand-500 hover:text-brand-300">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(topicId)}
                          className="p-2 text-brand-600 hover:text-red-400 hover:bg-srf-2 rounded-lg transition-colors"
                          title="Remove">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Alert CTA banner */}
      {items && items.length > 0 && items.length < 5 && (
        <div className="mt-6 p-4 card flex items-center gap-3">
          <div className="text-brand-400 p-2 bg-srf rounded-lg">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-brand-200">Set up alerts for your watchlist topics</p>
            <p className="text-xs text-brand-500 mt-0.5">Get notified when trend stages change or opportunity scores spike.</p>
          </div>
          <button onClick={() => navigate('/alerts')}
            className="flex items-center gap-1 text-sm font-medium text-brand-400 hover:text-brand-200 transition-colors whitespace-nowrap">
            Configure <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Capacity indicator */}
      {items && items.length > 0 && (
        <div className="mt-4 px-1">
          <div className="flex justify-between text-xs text-brand-600 mb-1">
            <span>{count} / 5 slots used</span>
            <span>{5 - count} remaining</span>
          </div>
          <div className="h-1.5 bg-brand-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all" style={{ width: `${Math.min((count / 5) * 100, 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
