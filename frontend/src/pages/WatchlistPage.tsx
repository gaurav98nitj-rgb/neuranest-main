import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchlist, useRemoveFromWatchlist } from '../hooks/useData'
import {
  Trash2, Bell, BellPlus, Eye, Bookmark, TrendingUp,
  ArrowRight, ArrowUpRight, ArrowDownRight, Minus,
} from 'lucide-react'
import clsx from 'clsx'
import { EmptyState, ErrorState } from '../components/UIKit'

const STAGE_BADGE: Record<string, string> = {
  emerging: 'bg-sage-50 text-sage-400',
  exploding: 'bg-coral-100 text-coral-500',
  peaking: 'bg-amber-50 text-amber-300',
  declining: 'bg-rose-50 text-rose-400',
  stable: 'bg-plum-50 text-plum-400',
  unknown: 'bg-sand-200 text-sand-600',
}
const STAGE_BAR: Record<string, string> = {
  emerging: 'bg-sage-400',
  exploding: 'bg-coral-400',
  peaking: 'bg-amber-300',
  declining: 'bg-rose-400',
  stable: 'bg-plum-400',
}

function ScoreRing({ score, label, size = 52 }: { score: number | null | undefined; label: string; size?: number }) {
  if (score == null) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="rounded-full border-2 border-dashed border-sand-300 flex items-center justify-center"
          style={{ width: size, height: size }}>
          <span className="text-[10px] text-sand-500">N/A</span>
        </div>
        <span className="text-[10px] text-sand-500 uppercase tracking-wide">{label}</span>
      </div>
    )
  }
  const pct = Math.min(Math.max(score, 0), 100) / 100
  const r = (size - 6) / 2
  const circ = 2 * Math.PI * r
  const color = score >= 70 ? '#1A8754' : score >= 40 ? '#D4930D' : '#C0392B'
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6E1DA" strokeWidth={4} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={`${circ * pct} ${circ * (1 - pct)}`} strokeLinecap="round" />
      </svg>
      <span className="text-[10px] text-sand-600 uppercase tracking-wide">{label}</span>
      <span className="text-xs font-bold" style={{ color }}>{Math.round(score)}</span>
    </div>
  )
}

function GrowthBadge({ growth }: { growth: number | null | undefined }) {
  if (growth == null) return null
  const pct = (growth * 100).toFixed(0)
  const isPositive = growth > 0
  const Icon = growth > 0 ? ArrowUpRight : growth < 0 ? ArrowDownRight : Minus
  return (
    <span className={clsx('inline-flex items-center gap-0.5 text-xs font-semibold', isPositive ? 'text-sage-400' : 'text-rose-400')}>
      <Icon className="h-3 w-3" />
      {isPositive ? '+' : ''}{pct}%
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="card p-0 overflow-hidden animate-pulse">
      <div className="flex items-center">
        <div className="w-1.5 self-stretch bg-sand-300" />
        <div className="flex-1 flex items-center gap-6 px-5 py-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-sand-200 rounded" />
            <div className="h-3 w-32 bg-sand-100 rounded" />
          </div>
          <div className="h-12 w-12 bg-sand-200 rounded-full" />
          <div className="flex gap-1">
            <div className="h-8 w-8 bg-sand-100 rounded-lg" />
            <div className="h-8 w-8 bg-sand-100 rounded-lg" />
            <div className="h-8 w-8 bg-sand-100 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function WatchlistPage() {
  const navigate = useNavigate()
  const { data: items, isLoading, isError, refetch } = useWatchlist()
  const removeMut = useRemoveFromWatchlist()
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const count = items?.length || 0

  const getName = (item: any) => item.topic_name ?? item.name ?? item.topic?.name ?? 'Unnamed Topic'
  const getStage = (item: any) => item.topic_stage ?? item.stage ?? item.topic?.lifecycle_status ?? 'unknown'
  const getScore = (item: any) => item.opportunity_score ?? item.score ?? item.topic?.latest_scores?.opportunity ?? null
  const getGrowth = (item: any) => item.growth_4w ?? item.topic?.growth_4w ?? null
  const getTopicId = (item: any) => item.topic_id ?? item.id

  const handleRemove = (topicId: string) => {
    removeMut.mutate(topicId, { onSettled: () => setConfirmRemove(null) })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl text-charcoal-700" style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800 }}>My Watchlist</h1>
          <p className="text-sm text-sand-600 mt-1">
            {count} topic{count !== 1 ? 's' : ''} tracked · Free plan: 5 slots
          </p>
        </div>
        <button onClick={() => navigate('/explore')}
          className="flex items-center gap-2 px-4 py-2 bg-coral-400 text-white rounded-lg hover:bg-coral-500 text-sm font-medium transition-colors">
          <TrendingUp className="h-4 w-4" /> Browse Topics
        </button>
      </div>

      {isError && (
        <ErrorState message="Failed to load watchlist. Check your connection." onRetry={() => refetch()} />
      )}

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
      ) : !items?.length && !isError ? (
        <div className="card">
          <EmptyState
            emoji="🔖"
            title="Your watchlist is empty"
            description="Add topics from the Explorer to track trend stage changes, score spikes, and new competition."
            cta={{ label: '🔍 Explore Topics', onClick: () => navigate('/explore') }}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items!.map((item: any) => {
            const topicId = getTopicId(item)
            const stage = getStage(item)
            return (
              <div key={item.id || topicId} className="card p-0 overflow-hidden group hover:border-sand-400 transition-colors">
                <div className="flex items-center">
                  <div className={clsx('w-1.5 self-stretch', STAGE_BAR[stage] || 'bg-sand-400')} />
                  <div className="flex-1 flex items-center gap-5 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-charcoal-700 truncate cursor-pointer hover:text-coral-400 transition-colors"
                        onClick={() => navigate(`/topics/${topicId}`)}>
                        {getName(item)}
                      </h3>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full capitalize', STAGE_BADGE[stage] || STAGE_BADGE.unknown)}>
                          {stage}
                        </span>
                        <GrowthBadge growth={getGrowth(item)} />
                        <span className="text-xs text-sand-500">
                          Added {new Date(item.added_at || item.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <ScoreRing score={getScore(item)} label="Score" />
                    <div className="flex items-center gap-1">
                      <button onClick={() => navigate(`/topics/${topicId}`)}
                        className="p-2 text-sand-500 hover:text-charcoal-600 hover:bg-sand-100 rounded-lg transition-colors" title="View Details">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button onClick={() => navigate('/alerts')}
                        className="p-2 text-sand-500 hover:text-amber-300 hover:bg-sand-100 rounded-lg transition-colors" title="Set Alert">
                        <BellPlus className="h-4 w-4" />
                      </button>
                      {confirmRemove === topicId ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleRemove(topicId)} disabled={removeMut.isPending}
                            className="px-2 py-1 text-xs font-medium text-rose-400 bg-rose-50 hover:bg-rose-100 rounded transition-colors">
                            {removeMut.isPending ? '...' : 'Remove'}
                          </button>
                          <button onClick={() => setConfirmRemove(null)} className="px-2 py-1 text-xs text-sand-600 hover:text-charcoal-600">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmRemove(topicId)}
                          className="p-2 text-sand-400 hover:text-rose-400 hover:bg-sand-100 rounded-lg transition-colors" title="Remove">
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

      {items && items.length > 0 && items.length < 5 && (
        <div className="mt-6 p-4 card flex items-center gap-3">
          <div className="text-coral-400 p-2 bg-coral-50 rounded-lg"><Bell className="h-5 w-5" /></div>
          <div className="flex-1">
            <p className="text-sm font-medium text-charcoal-700">Set up alerts for your watchlist topics</p>
            <p className="text-xs text-sand-600 mt-0.5">Get notified when trend stages change or opportunity scores spike.</p>
          </div>
          <button onClick={() => navigate('/alerts')}
            className="flex items-center gap-1 text-sm font-medium text-coral-400 hover:text-coral-500 transition-colors whitespace-nowrap">
            Configure <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {items && items.length > 0 && (
        <div className="mt-4 px-1">
          <div className="flex justify-between text-xs text-sand-500 mb-1">
            <span>{count} / 5 slots used</span>
            <span>{5 - count} remaining</span>
          </div>
          <div className="h-1.5 bg-sand-200 rounded-full overflow-hidden">
            <div className="h-full bg-coral-400 rounded-full transition-all" style={{ width: `${Math.min((count / 5) * 100, 100)}%` }} />
          </div>
        </div>
      )}
    </div>
  )
}
