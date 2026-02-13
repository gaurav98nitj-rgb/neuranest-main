import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { categoriesApi } from '../lib/api'
import { ArrowLeft, TrendingUp, AlertTriangle, Lightbulb, BarChart3, ChevronRight, MessageSquare } from 'lucide-react'
import clsx from 'clsx'

const STAGE_BADGE: Record<string, string> = {
  exploding: 'bg-orange-900/60 text-orange-300', emerging: 'bg-emerald-900/60 text-emerald-300',
  peaking: 'bg-yellow-900/60 text-yellow-300', declining: 'bg-red-900/60 text-red-300',
  unknown: 'bg-brand-800 text-brand-400',
}
const STAGE_BAR: Record<string, string> = {
  exploding: 'bg-orange-500', emerging: 'bg-emerald-500', peaking: 'bg-yellow-500', declining: 'bg-red-500', unknown: 'bg-brand-600',
}

const tabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'opportunities', label: 'Opportunities', icon: TrendingUp },
  { id: 'voice', label: 'Category Voice', icon: MessageSquare },
]

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [overview, setOverview] = useState<any>(null)
  const [voice, setVoice] = useState<any>(null)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      categoriesApi.overview(id).then(r => setOverview(r.data)).catch(() => null),
      categoriesApi.voice(id).then(r => setVoice(r.data)).catch(() => null),
      categoriesApi.opportunities(id, { page_size: 50 }).then(r => setOpportunities(r.data?.data || [])).catch(() => null),
    ]).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-6 text-brand-400/40">Loading category...</div>
  if (!overview) return <div className="p-6 text-red-400">Category not found</div>

  const sd = overview.stage_distribution || {}
  const total = (sd.emerging || 0) + (sd.exploding || 0) + (sd.peaking || 0) + (sd.declining || 0) || 1

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <button onClick={() => navigate('/categories')} className="flex items-center gap-1 text-sm text-brand-400/60 hover:text-brand-300 mb-3 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Categories
      </button>
      <div className="flex items-center gap-4 mb-2">
        <span className="text-3xl">{overview.icon || '📦'}</span>
        <div>
          <h1 className="text-2xl font-bold text-white">{overview.name}</h1>
          <p className="text-sm text-brand-400">{overview.topic_count} topics · Level {overview.level}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-5 mb-6">
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Topics</p>
          <p className="text-2xl font-bold text-white">{overview.topic_count}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Avg Opportunity</p>
          <p className={clsx('text-2xl font-bold', (overview.avg_opportunity_score || 0) >= 60 ? 'text-emerald-400' : 'text-yellow-400')}>
            {overview.avg_opportunity_score?.toFixed(1) || '—'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Avg Competition</p>
          <p className="text-2xl font-bold text-brand-200">{overview.avg_competition_index?.toFixed(1) || '—'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">4W Growth</p>
          <p className={clsx('text-2xl font-bold', (overview.growth_rate_4w || 0) > 0 ? 'text-emerald-400' : 'text-red-400')}>
            {overview.growth_rate_4w ? `${(overview.growth_rate_4w * 100).toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      {/* Stage Distribution Bar */}
      <div className="card p-4 mb-6">
        <p className="text-xs text-brand-500 uppercase mb-3">Stage Distribution</p>
        <div className="h-3 rounded-full overflow-hidden flex bg-srf mb-3">
          {['exploding', 'emerging', 'peaking', 'declining'].map(stage => {
            const count = sd[stage] || 0
            if (count === 0) return null
            return <div key={stage} className={clsx(STAGE_BAR[stage], 'transition-all')} style={{ width: `${(count / total) * 100}%` }} />
          })}
        </div>
        <div className="flex gap-4 flex-wrap">
          {['exploding', 'emerging', 'peaking', 'declining'].map(stage => (
            <div key={stage} className="flex items-center gap-2">
              <div className={clsx('w-2.5 h-2.5 rounded-full', STAGE_BAR[stage])} />
              <span className="text-xs text-brand-300 capitalize">{stage}: <strong>{sd[stage] || 0}</strong></span>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-ln">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id ? 'border-brand-500 text-brand-300' : 'border-transparent text-brand-500 hover:text-brand-300'
            )}>
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Opportunities */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" /> Top Opportunities
            </h3>
            <div className="space-y-3">
              {(overview.top_opportunities || []).map((t: any, i: number) => (
                <div key={t.id} onClick={() => navigate(`/topics/${t.id}`)}
                  className="flex items-center justify-between p-3 rounded-lg bg-srf hover:bg-srf-2 cursor-pointer transition-colors group">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs text-brand-600 w-5 text-right font-mono">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-200 truncate">{t.name}</p>
                      <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full capitalize', STAGE_BADGE[t.stage])}>{t.stage}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx('text-sm font-bold tabular-nums',
                      (t.opportunity_score || 0) >= 70 ? 'text-emerald-400' : (t.opportunity_score || 0) >= 40 ? 'text-yellow-400' : 'text-red-400'
                    )}>{t.opportunity_score?.toFixed(1) || '—'}</span>
                    <ChevronRight className="h-4 w-4 text-brand-600 group-hover:text-brand-400 transition-colors" />
                  </div>
                </div>
              ))}
              {(!overview.top_opportunities || overview.top_opportunities.length === 0) && (
                <p className="text-sm text-brand-500 text-center py-4">No opportunities scored yet</p>
              )}
            </div>
          </div>

          {/* Subcategories */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4">Subcategories</h3>
            {(overview.subcategories || []).length > 0 ? (
              <div className="space-y-3">
                {overview.subcategories.map((sub: any) => (
                  <div key={sub.id} className="flex items-center justify-between p-3 rounded-lg bg-srf">
                    <div>
                      <p className="text-sm font-medium text-brand-200">{sub.name}</p>
                      <p className="text-xs text-brand-500">{sub.topic_count} topics</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-500 text-center py-4">No subcategories</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'opportunities' && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-ln bg-srf">
                <th className="text-left text-xs text-brand-400 font-medium uppercase tracking-wider p-4 w-8">#</th>
                <th className="text-left text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Topic</th>
                <th className="text-left text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Stage</th>
                <th className="text-right text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Opportunity</th>
                <th className="text-right text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Competition</th>
              </tr>
            </thead>
            <tbody>
              {opportunities.map((t: any, i: number) => (
                <tr key={t.id} onClick={() => navigate(`/topics/${t.id}`)}
                  className="cursor-pointer transition-colors hover:bg-srf-2 border-b border-ln/30">
                  <td className="p-4 text-xs text-brand-500 font-medium">{i + 1}</td>
                  <td className="p-4"><p className="text-sm font-semibold text-brand-100">{t.name}</p></td>
                  <td className="p-4"><span className={clsx('text-xs px-2.5 py-1 rounded-full font-medium capitalize', STAGE_BADGE[t.stage] || STAGE_BADGE.unknown)}>{t.stage}</span></td>
                  <td className="p-4 text-right">
                    <span className={clsx('text-sm font-bold tabular-nums', (t.opportunity_score || 0) >= 70 ? 'text-emerald-400' : (t.opportunity_score || 0) >= 40 ? 'text-yellow-400' : 'text-red-400')}>
                      {t.opportunity_score?.toFixed(1) || '—'}
                    </span>
                  </td>
                  <td className="p-4 text-right"><span className="text-sm text-brand-300 tabular-nums">{t.competition_index?.toFixed(1) || '—'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {opportunities.length === 0 && <div className="p-12 text-center text-brand-500 text-sm">No opportunities found.</div>}
        </div>
      )}

      {activeTab === 'voice' && voice && (
        <div className="space-y-6">
          {/* Voice KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-4">
              <p className="text-xs text-brand-500 uppercase mb-1">Reviews Analyzed</p>
              <p className="text-2xl font-bold text-white">{voice.total_reviews_analyzed}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-brand-500 uppercase mb-1">Pain Points</p>
              <p className="text-2xl font-bold text-red-400">{voice.total_negative_aspects}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-brand-500 uppercase mb-1">Feature Requests</p>
              <p className="text-2xl font-bold text-blue-400">{voice.total_feature_requests}</p>
            </div>
          </div>

          {/* Complaint Clusters */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" /> Top Complaint Themes
            </h3>
            {(voice.complaint_clusters || []).length > 0 ? (
              <div className="space-y-3">
                {voice.complaint_clusters.map((cluster: any) => (
                  <div key={cluster.cluster_id} className="p-4 rounded-lg bg-srf border-l-3 border-red-500/50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-brand-200">{cluster.label}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-brand-500">{cluster.size} mentions</span>
                        <div className="w-16 h-1.5 rounded-full bg-srf-2 overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${cluster.severity * 100}%` }} />
                        </div>
                      </div>
                    </div>
                    {cluster.representative_texts?.slice(0, 2).map((text: string, i: number) => (
                      <p key={i} className="text-xs text-brand-400 mt-1 italic">"{text}"</p>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-500 text-center py-4">No complaint clusters found — run NLP pipeline first</p>
            )}
          </div>

          {/* Feature Requests */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-blue-400" /> Feature Requests from Reviews
            </h3>
            {(voice.top_feature_requests || []).length > 0 ? (
              <div className="space-y-2">
                {voice.top_feature_requests.map((fr: any) => (
                  <div key={fr.id} className="flex items-start gap-3 p-3 rounded-lg bg-srf">
                    <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-brand-200 font-medium">{fr.aspect}</p>
                      {fr.evidence && <p className="text-xs text-brand-400 mt-1 italic truncate">"{fr.evidence}"</p>}
                    </div>
                    {fr.review_stars && (
                      <span className="text-xs text-yellow-400 flex-shrink-0">{'★'.repeat(fr.review_stars)}{'☆'.repeat(5 - fr.review_stars)}</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-brand-500 text-center py-4">No feature requests detected yet</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
