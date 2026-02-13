import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTopic, useTimeseries, useForecast, useCompetition, useReviewsSummary, useGenNextSpec, useAddToWatchlist } from '../hooks/useData'
import { socialApi } from '../lib/api'
import { ArrowLeft, Eye, TrendingUp, Shield, MessageSquare, Lightbulb, ChevronDown, ChevronUp, Info, Zap, AlertTriangle } from 'lucide-react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import clsx from 'clsx'

const tabs = [
  { id: 'trend', label: 'Trend & Forecast', icon: TrendingUp },
  { id: 'competition', label: 'Competition', icon: Shield },
  { id: 'reviews', label: 'Review Intelligence', icon: MessageSquare },
  { id: 'social', label: 'Social Signals', icon: Zap },
  { id: 'gennext', label: 'Gen-Next Spec', icon: Lightbulb },
]

// ─── Component labels & colors for score breakdown ───
const COMPONENT_META: Record<string, { label: string; color: string; description: string }> = {
  demand_growth:   { label: 'Demand Growth',   color: '#2E86C1', description: 'Search volume growth rate over recent weeks' },
  acceleration:    { label: 'Acceleration',     color: '#E67E22', description: 'Rate of change in growth — is momentum building?' },
  low_competition: { label: 'Low Competition',  color: '#27AE60', description: 'Inverse of Amazon competition index' },
  cross_source:    { label: 'Cross-Source',     color: '#8E44AD', description: 'Confirmation across Google Trends, Reddit, Amazon' },
  review_gap:      { label: 'Review Gap',       color: '#E74C3C', description: 'Gap between demand and review quality/quantity' },
  forecast_uplift: { label: 'Forecast Uplift',  color: '#F39C12', description: 'Prophet model predicts rising demand ahead' },
  geo_expansion:   { label: 'Geo Expansion',    color: '#16A085', description: 'Interest spreading across multiple regions' },
}

export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('trend')
  const { data: topic, isLoading } = useTopic(id!)
  const addToWatchlist = useAddToWatchlist()

  if (isLoading) return <div className="p-6 text-brand-400/40">Loading...</div>
  if (!topic) return <div className="p-6 text-red-400">Topic not found</div>

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-brand-300/50 hover:text-brand-400 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <h1 className="text-2xl font-bold text-white">{topic.name}</h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full capitalize',
              { 'bg-emerald-500/15 text-emerald-400': topic.stage === 'emerging',
                'bg-orange-500/15 text-orange-400': topic.stage === 'exploding',
                'bg-yellow-500/15 text-yellow-400': topic.stage === 'peaking',
                'bg-red-500/15 text-red-400': topic.stage === 'declining' }
            )}>{topic.stage}</span>
            {topic.primary_category && <span className="text-sm text-brand-300/50">{topic.primary_category}</span>}
          </div>
        </div>
        <button
          onClick={() => addToWatchlist.mutate(id!)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 text-sm"
        >
          <Eye className="h-4 w-4" /> Add to Watchlist
        </button>
      </div>

      {/* Score Cards + Breakdown */}
      {topic.latest_scores && <ScoreSection scores={topic.latest_scores} />}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-line">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-brand-600 text-brand-400'
                : 'border-transparent text-brand-300/50 hover:text-brand-200'
            )}
          >
            <tab.icon className="h-4 w-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'trend' && <TrendTab topicId={id!} />}
      {activeTab === 'competition' && <CompetitionTab topicId={id!} />}
      {activeTab === 'reviews' && <ReviewsTab topicId={id!} />}
      {activeTab === 'social' && <SocialSignalsTab topicId={id!} />}
      {activeTab === 'gennext' && <GenNextTab topicId={id!} />}
    </div>
  )
}

// ─── Score Section: Cards + Expandable Breakdown ───
function ScoreSection({ scores }: { scores: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false)
  const opportunity = scores.opportunity
  const components = opportunity?.explanation?.components

  const scoreColor = (value: number | null) => {
    if (value === null || value === undefined) return 'text-brand-400/40'
    if (value >= 70) return 'text-emerald-400'
    if (value >= 40) return 'text-yellow-400'
    return 'text-red-400'
  }

  const scoreBg = (value: number | null) => {
    if (value === null || value === undefined) return 'bg-surface-1 border-line'
    if (value >= 70) return 'bg-green-50 border-green-200'
    if (value >= 40) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  // Order scores: opportunity first, then demand, competition, rest
  const scoreOrder = ['opportunity', 'demand', 'competition']
  const sortedEntries = Object.entries(scores).sort(([a], [b]) => {
    const ai = scoreOrder.indexOf(a)
    const bi = scoreOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="mb-6">
      {/* Score Cards Row */}
      <div className="grid grid-cols-4 gap-4 mb-2">
        {sortedEntries.map(([type, data]: [string, any]) => (
          <div key={type} className={clsx('rounded-xl border p-4 transition-all', scoreBg(data.value))}>
            <p className="text-xs text-brand-300/50 uppercase font-medium tracking-wide">{type.replace('_', ' ')}</p>
            <p className={clsx('text-2xl font-bold mt-1', scoreColor(data.value))}>
              {data.value?.toFixed(1) || '—'}
              <span className="text-xs font-normal text-brand-400/40 ml-1">/ 100</span>
            </p>
            {data.computed_at && (
              <p className="text-[10px] text-brand-400/40 mt-1">
                {new Date(data.computed_at).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}

        {/* Confidence card */}
        {opportunity?.explanation?.confidence && (
          <div className={clsx('rounded-xl border p-4',
            opportunity.explanation.confidence === 'high' ? 'bg-green-50 border-green-200' :
            opportunity.explanation.confidence === 'medium' ? 'bg-yellow-50 border-yellow-200' :
            'bg-orange-50 border-orange-200'
          )}>
            <p className="text-xs text-brand-300/50 uppercase font-medium tracking-wide">Confidence</p>
            <div className="flex items-center gap-2 mt-1">
              {opportunity.explanation.confidence === 'high' ? (
                <Zap className="h-5 w-5 text-emerald-400" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-orange-500" />
              )}
              <p className={clsx('text-lg font-bold capitalize',
                opportunity.explanation.confidence === 'high' ? 'text-emerald-400' :
                opportunity.explanation.confidence === 'medium' ? 'text-yellow-400' :
                'text-orange-500'
              )}>
                {opportunity.explanation.confidence}
              </p>
            </div>
            {opportunity.explanation.dampener_applied && (
              <p className="text-[10px] text-orange-500 mt-1">Dampener applied</p>
            )}
          </div>
        )}
      </div>

      {/* Expand/Collapse Breakdown Toggle */}
      {components && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-700 font-medium mt-1 mb-2 transition-colors"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Hide' : 'Show'} Opportunity Score Breakdown
        </button>
      )}

      {/* Breakdown Panel */}
      {expanded && components && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-brand-200">Opportunity Score Components</h3>
            <span className="text-xs text-brand-400/40">
              Overall: <span className="font-bold text-brand-200">{opportunity.explanation.overall_score?.toFixed(1)}</span> / 100
            </span>
          </div>

          <div className="space-y-3">
            {Object.entries(components)
              .sort(([, a]: [string, any], [, b]: [string, any]) => (b.contribution || 0) - (a.contribution || 0))
              .map(([key, comp]: [string, any]) => {
                const meta = COMPONENT_META[key] || { label: key.replace(/_/g, ' '), color: '#6B7280', description: '' }
                const maxContribution = comp.weight * 100
                const pct = maxContribution > 0 ? ((comp.contribution || 0) / maxContribution) * 100 : 0

                return (
                  <div key={key} className="group">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: meta.color }}
                        />
                        <span className="text-xs font-medium text-brand-200">{meta.label}</span>
                        <span className="text-[10px] text-brand-400/40">({(comp.weight * 100).toFixed(0)}% weight)</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {comp.raw !== undefined && comp.raw !== null && (
                          <span className="text-[10px] text-brand-400/40">
                            raw: {typeof comp.raw === 'number' ? comp.raw.toFixed(1) : comp.raw}
                          </span>
                        )}
                        {comp.normalized !== undefined && comp.normalized !== null && (
                          <span className="text-[10px] text-brand-400/40">
                            norm: {typeof comp.normalized === 'number' ? comp.normalized.toFixed(0) : comp.normalized}
                          </span>
                        )}
                        <span className="text-xs font-bold tabular-nums" style={{ color: meta.color }}>
                          +{comp.contribution?.toFixed(1) || '0.0'}
                        </span>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="h-2 bg-surface-2 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.min(Math.max(pct, 0), 100)}%`,
                          backgroundColor: meta.color,
                        }}
                      />
                    </div>

                    {/* Description on hover */}
                    {meta.description && (
                      <p className="text-[10px] text-brand-400/40 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {meta.description}
                      </p>
                    )}
                  </div>
                )
              })}
          </div>

          {/* Summary footer */}
          <div className="mt-4 pt-3 border-t border-line/50 flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-brand-400/40">
              <Info className="h-3 w-3" />
              {Object.keys(components).length} weighted components
            </div>
            {opportunity.explanation.dampener_applied && (
              <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-medium">
                Low-confidence dampener applied (~15% reduction)
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function TrendTab({ topicId }: { topicId: string }) {
  const { data: ts } = useTimeseries(topicId)
  const { data: forecast } = useForecast(topicId)

  const dateMap: Record<string, { sum: number; count: number; sources: Record<string, number> }> = {}
  for (const p of (ts?.data || [])) {
    const d = p.date
    if (!dateMap[d]) dateMap[d] = { sum: 0, count: 0, sources: {} }
    const val = p.normalized_value || p.raw_value || 0
    dateMap[d].sum += val
    dateMap[d].count += 1
    dateMap[d].sources[p.source] = val
  }

  const historical = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sum, count, sources }]) => ({
      date,
      value: Math.round((sum / count) * 10) / 10,
      google: sources['google_trends'] || null,
      reddit: sources['reddit'] || null,
    }))

  const forecastData = (forecast?.forecasts || [])
    .filter((f: any) => f.yhat > 0)
    .sort((a: any, b: any) => a.forecast_date.localeCompare(b.forecast_date))
    .map((f: any) => ({
      date: f.forecast_date,
      yhat: Math.round(f.yhat * 10) / 10,
      yhat_lower: Math.round((f.yhat_lower || 0) * 10) / 10,
      yhat_upper: Math.round((f.yhat_upper || 0) * 10) / 10,
    }))

  const lastHistorical = historical[historical.length - 1]
  const chartData = [
    ...historical.map(h => ({ ...h, yhat: null as number | null, yhat_lower: null as number | null, yhat_upper: null as number | null })),
    ...(lastHistorical ? [{
      date: lastHistorical.date,
      value: lastHistorical.value,
      google: null as number | null,
      reddit: null as number | null,
      yhat: lastHistorical.value,
      yhat_lower: lastHistorical.value,
      yhat_upper: lastHistorical.value,
    }] : []),
    ...forecastData.map(f => ({
      date: f.date,
      value: null as number | null,
      google: null as number | null,
      reddit: null as number | null,
      yhat: f.yhat,
      yhat_lower: f.yhat_lower,
      yhat_upper: f.yhat_upper,
    })),
  ]

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold mb-4">Search Interest Over Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} domain={[0, 'auto']} />
          <Tooltip />
          <Legend />
          <Area type="monotone" dataKey="value" name="Actual (avg)" stroke="#2E86C1" fill="#D6EAF8" strokeWidth={2} dot={false} connectNulls={false} />
          <Area type="monotone" dataKey="yhat_upper" name="Forecast CI" stroke="none" fill="#7FB3D8" fillOpacity={0.15} dot={false} connectNulls={false} />
          <Area type="monotone" dataKey="yhat_lower" stroke="none" fill="#FFFFFF" fillOpacity={1} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="yhat" name="Forecast" stroke="#2E86C1" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
          <ReferenceLine x={todayStr} stroke="#999" strokeDasharray="3 3" label={{ value: "Today", position: "top", fontSize: 11 }} />
        </ComposedChart>
      </ResponsiveContainer>
      {forecast && (
        <p className="text-xs text-brand-400/40 mt-2">
          Forecast: {forecast.model_version} | {forecastData.length} points | Generated: {new Date(forecast.generated_at).toLocaleDateString()}
        </p>
      )}
    </div>
  )
}

function CompetitionTab({ topicId }: { topicId: string }) {
  const { data: comp } = useCompetition(topicId)
  if (!comp) return <div className="text-brand-400/40">Loading competition data...</div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Listings', value: comp.listing_count },
          { label: 'Median Price', value: comp.median_price ? `$${comp.median_price}` : '—' },
          { label: 'Median Reviews', value: comp.median_reviews },
          { label: 'Avg Rating', value: comp.avg_rating ? `${comp.avg_rating} ★` : '—' },
        ].map(m => (
          <div key={m.label} className="card p-4">
            <p className="text-xs text-brand-300/50 uppercase">{m.label}</p>
            <p className="text-xl font-bold mt-1">{m.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {comp.top_asins?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">Top Competing Products</h3>
          <div className="grid grid-cols-2 gap-4">
            {comp.top_asins.map((a: any) => (
              <div key={a.asin} className="flex gap-3 p-3 border border-line/50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium line-clamp-2">{a.title || a.asin}</p>
                  <p className="text-xs text-brand-300/50 mt-1">{a.brand} · ${a.price} · {a.rating}★ · {a.review_count} reviews</p>
                </div>
                <span className="text-xs text-brand-400/40">#{a.rank}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ReviewsTab({ topicId }: { topicId: string }) {
  const { data: reviews } = useReviewsSummary(topicId)
  if (!reviews) return <div className="text-brand-400/40">Loading review insights...</div>

  return (
    <div className="space-y-6">
      <div className="text-sm text-brand-300/50">
        Analyzed {reviews.total_reviews_analyzed} reviews across {reviews.asins_covered} products
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-emerald-400 mb-4">✓ Top Pros</h3>
          {reviews.pros.map((p: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-line/50 last:border-0">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm capitalize">{p.aspect.replace('_', ' ')}</span>
                <span className="text-xs text-brand-300/50">{p.mention_count} mentions</span>
              </div>
              {p.sample && <p className="text-xs text-brand-300/50 mt-1 italic">"{p.sample}"</p>}
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-red-700 mb-4">✗ Top Cons</h3>
          {reviews.cons.map((c: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-line/50 last:border-0">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm capitalize">{c.aspect.replace('_', ' ')}</span>
                <span className="text-xs text-brand-300/50">{c.mention_count} mentions</span>
              </div>
              {c.sample && <p className="text-xs text-brand-300/50 mt-1 italic">"{c.sample}"</p>}
            </div>
          ))}
        </div>
      </div>

      {reviews.top_pain_points?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold mb-4">🔥 Top Pain Points</h3>
          {reviews.top_pain_points.map((pp: any, i: number) => (
            <div key={i} className="flex items-center gap-4 mb-3">
              <div className="w-16 h-2 bg-surface-2 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${pp.severity}%` }} />
              </div>
              <span className="text-sm font-medium capitalize flex-1">{pp.aspect.replace('_', ' ')}</span>
              <span className="text-xs text-brand-300/50">{pp.evidence}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GenNextTab({ topicId }: { topicId: string }) {
  const { data: spec, isLoading, error } = useGenNextSpec(topicId)
  if (isLoading) return <div className="text-brand-400/40">Loading Gen-Next spec...</div>
  if (error) return <div className="card p-6 text-center text-brand-300/50">Gen-Next spec not available. Upgrade to Pro for full access.</div>
  if (!spec) return null

  return (
    <div className="space-y-6">
      <p className="text-xs text-brand-400/40">Version {spec.version} · Generated {new Date(spec.generated_at).toLocaleDateString()} · Model: {spec.model_used}</p>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-red-700 mb-4">🔧 Must Fix</h3>
          {spec.must_fix.map((item: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-line/50 last:border-0">
              <div className="flex items-center gap-2">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                  item.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-400'
                )}>{item.severity}</span>
                <span className="text-sm font-medium">{item.issue}</span>
              </div>
              <p className="text-xs text-brand-300/50 mt-1">{item.evidence}</p>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-emerald-400 mb-4">✨ Must Add</h3>
          {spec.must_add.map((item: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-line/50 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full font-medium">P{item.priority}</span>
                <span className="text-sm font-medium">{item.feature}</span>
              </div>
              <p className="text-xs text-brand-300/50 mt-1">{item.demand_signal}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-purple-700 mb-4">💡 Differentiators</h3>
        <div className="grid grid-cols-2 gap-4">
          {spec.differentiators.map((d: any, i: number) => (
            <div key={i} className="p-4 bg-purple-50 rounded-lg">
              <p className="font-medium text-sm">{d.idea}</p>
              <p className="text-xs text-brand-300/60 mt-1">{d.rationale}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-brand-700 mb-4">🎯 Positioning</h3>
        <div className="grid grid-cols-2 gap-4">
          {spec.positioning.target_price && <div><p className="text-xs text-brand-300/50">Target Price</p><p className="text-lg font-bold">${spec.positioning.target_price}</p></div>}
          {spec.positioning.target_rating && <div><p className="text-xs text-brand-300/50">Target Rating</p><p className="text-lg font-bold">{spec.positioning.target_rating} ★</p></div>}
          {spec.positioning.tagline && <div className="col-span-2"><p className="text-xs text-brand-300/50">Tagline</p><p className="text-lg font-semibold italic">"{spec.positioning.tagline}"</p></div>}
          {spec.positioning.target_demographic && <div className="col-span-2"><p className="text-xs text-brand-300/50">Target Demographic</p><p className="text-sm">{spec.positioning.target_demographic}</p></div>}
        </div>
      </div>
    </div>
  )
}

// ─── Social Signals Tab ───
function SocialSignalsTab({ topicId }: { topicId: string }) {
  const [signals, setSignals] = useState<any>(null)
  const [complaints, setComplaints] = useState<any[]>([])
  const [featureRequests, setFeatureRequests] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      socialApi.topicSignals(topicId).then((r: any) => setSignals(r.data)).catch(() => null),
      socialApi.topicComplaints(topicId).then((r: any) => setComplaints(r.data || [])).catch(() => null),
      socialApi.topicFeatureRequests(topicId).then((r: any) => setFeatureRequests(r.data || [])).catch(() => null),
    ]).finally(() => setLoading(false))
  }, [topicId])

  if (loading) return <div className="text-brand-400/40 py-8 text-center">Loading social signals...</div>

  return (
    <div className="space-y-6">
      {/* Platform Signals */}
      {signals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-brand-500 uppercase mb-1">Instagram</p>
            <p className="text-xl font-bold text-pink-400">{signals.instagram_posts}</p>
            <p className="text-[10px] text-brand-500">{signals.instagram_engagement.toLocaleString()} engagement</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-brand-500 uppercase mb-1">TikTok</p>
            <p className="text-xl font-bold text-cyan-400">{signals.tiktok_videos}</p>
            <p className="text-[10px] text-brand-500">{signals.tiktok_views.toLocaleString()} views</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-brand-500 uppercase mb-1">Reddit</p>
            <p className="text-xl font-bold text-orange-400">{signals.reddit_mentions}</p>
            <p className="text-[10px] text-brand-500">mentions</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-brand-500 uppercase mb-1">Brand Mentions</p>
            <p className="text-xl font-bold text-brand-200">{signals.total_brand_mentions}</p>
            {signals.avg_mention_sentiment !== null && (
              <p className={clsx('text-[10px]', signals.avg_mention_sentiment > 0 ? 'text-emerald-400' : 'text-red-400')}>
                {signals.avg_mention_sentiment > 0 ? '↑' : '↓'} {(signals.avg_mention_sentiment * 100).toFixed(0)}% sentiment
              </p>
            )}
          </div>
        </div>
      )}

      {/* Complaint Clusters */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-400" /> Complaint Themes ({complaints.length})
        </h3>
        {complaints.length > 0 ? (
          <div className="space-y-3">
            {complaints.map((c: any) => (
              <div key={c.cluster_id} className="p-3 rounded-lg bg-srf border-l-2 border-red-500/50">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-brand-200">{c.label}</p>
                  <span className="text-xs text-brand-500">{c.size} mentions</span>
                </div>
                {c.representative_texts?.slice(0, 2).map((text: string, i: number) => (
                  <p key={i} className="text-xs text-brand-400 mt-1 italic">"{text}"</p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-brand-500 text-center py-4">No complaint clusters found — data will appear after NLP pipeline runs</p>
        )}
      </div>

      {/* Feature Requests */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-blue-400" /> Feature Requests ({featureRequests.length})
        </h3>
        {featureRequests.length > 0 ? (
          <div className="space-y-2">
            {featureRequests.map((fr: any) => (
              <div key={fr.id} className="flex items-start gap-3 p-3 rounded-lg bg-srf">
                <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-brand-200 font-medium">{fr.aspect}</p>
                  {fr.evidence && <p className="text-xs text-brand-400 mt-1 italic">"{fr.evidence}"</p>}
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
  )
}
