import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTopic, useTimeseries, useForecast, useCompetition, useReviewsSummary, useGenNextSpec, useAddToWatchlist } from '../hooks/useData'
import { socialApi } from '../lib/api'
import { ArrowLeft, Eye, TrendingUp, Shield, MessageSquare, Lightbulb, ChevronDown, ChevronUp, Info, Zap, AlertTriangle, BarChart3 } from 'lucide-react'
import { ComposedChart, Area, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'
import clsx from 'clsx'

const tabs = [
  { id: 'trend', label: 'Trend & Signals', icon: TrendingUp },
  { id: 'competition', label: 'Competition', icon: Shield },
  { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  { id: 'social', label: 'Social', icon: Zap },
  { id: 'gennext', label: 'Gen-Next', icon: Lightbulb },
]

const COMPONENT_META: Record<string, { label: string; color: string; description: string }> = {
  demand_growth:   { label: 'Demand Growth',   color: '#2E86C1', description: 'Search volume growth rate' },
  acceleration:    { label: 'Acceleration',     color: '#E67E22', description: 'Rate of change in growth' },
  low_competition: { label: 'Low Competition',  color: '#27AE60', description: 'Inverse of Amazon competition' },
  cross_source:    { label: 'Cross-Source',     color: '#8E44AD', description: 'Confirmation across data sources' },
  review_gap:      { label: 'Review Gap',       color: '#E74C3C', description: 'Gap between demand and quality' },
  forecast_uplift: { label: 'Forecast Uplift',  color: '#F39C12', description: 'Model predicts rising demand' },
  geo_expansion:   { label: 'Geo Expansion',    color: '#16A085', description: 'Interest spreading across regions' },
  search_momentum: { label: 'Search Momentum',  color: '#4285F4', description: 'Google Trends velocity' },
  social_buzz:     { label: 'Social Buzz',      color: '#FF5700', description: 'Reddit + social engagement' },
  demand_rank:     { label: 'Demand Rank',      color: '#FF9900', description: 'Amazon BA search frequency' },
  competition_gap: { label: 'Competition Gap',  color: '#27AE60', description: 'Room for new entrants' },
  science_signal:  { label: 'Science Signal',   color: '#7C3AED', description: 'Research paper validation' },
  data_richness:   { label: 'Data Richness',    color: '#6B7280', description: 'Number of signal sources' },
}

// ─── Color helpers (warm palette) ───
const scoreColor = (v: number | null) => {
  if (v === null || v === undefined) return '#8B8479'
  if (v >= 60) return '#1A8754'
  if (v >= 40) return '#D4930D'
  return '#C0392B'
}
const scoreBg = (v: number | null) => {
  if (v === null || v === undefined) return '#F9F7F4'
  if (v >= 60) return '#E8F5EE'
  if (v >= 40) return '#FFF8E6'
  return '#FFF0F0'
}
const stageBadge = (stage: string) => {
  const m: Record<string, string> = {
    emerging: 'bg-sage-50 text-sage-400 border-sage-100',
    exploding: 'bg-coral-100 text-coral-500 border-coral-200',
    peaking: 'bg-amber-50 text-amber-300 border-amber-100',
    declining: 'bg-rose-50 text-rose-400 border-rose-100',
  }
  return m[stage] || 'bg-sand-200 text-sand-600 border-sand-300'
}

export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('trend')
  const { data: topic, isLoading } = useTopic(id!)
  const addToWatchlist = useAddToWatchlist()

  if (isLoading) return (
    <div className="p-6 flex items-center gap-3 text-sand-500">
      <div className="w-5 h-5 border-2 border-sand-300 border-t-coral-400 rounded-full animate-spin" />
      Loading topic...
    </div>
  )
  if (!topic) return <div className="p-6 text-rose-500">Topic not found</div>

  // Get opportunity score from latest_scores or topic itself
  const oppScore = topic.latest_scores?.opportunity?.value ?? null

  return (
    <div className="p-6 min-h-screen bg-sand-50">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-sand-500 hover:text-coral-400 mb-2 transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Explorer
          </button>
          <h1 className="text-2xl text-charcoal-700" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400 }}>
            {topic.name}
          </h1>
          <div className="flex items-center gap-3 mt-2">
            <span className={clsx('text-xs font-medium px-2.5 py-0.5 rounded-full capitalize border', stageBadge(topic.stage))}>
              {topic.stage}
            </span>
            {topic.primary_category && <span className="text-sm text-sand-600">{topic.primary_category}</span>}
            {topic.description && <span className="text-xs text-sand-500 ml-2">{topic.description}</span>}
          </div>
        </div>
        <button
          onClick={() => addToWatchlist.mutate(id!)}
          className="flex items-center gap-2 px-4 py-2 bg-coral-400 text-white rounded-lg hover:bg-coral-500 text-sm font-medium transition-colors"
        >
          <Eye className="h-4 w-4" /> Add to Watchlist
        </button>
      </div>

      {/* Score Cards */}
      {topic.latest_scores && <ScoreSection scores={topic.latest_scores} />}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-sand-300">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-coral-400 text-coral-500'
                : 'border-transparent text-sand-600 hover:text-charcoal-700'
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

// ─── Score Section ───
function ScoreSection({ scores }: { scores: Record<string, any> }) {
  const [expanded, setExpanded] = useState(false)
  const opportunity = scores.opportunity
  const components = opportunity?.explanation?.components

  const scoreOrder = ['opportunity', 'demand', 'competition']
  const sortedEntries = Object.entries(scores).sort(([a], [b]) => {
    const ai = scoreOrder.indexOf(a)
    const bi = scoreOrder.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  return (
    <div className="mb-6">
      <div className="grid grid-cols-4 gap-4 mb-2">
        {sortedEntries.map(([type, data]: [string, any]) => (
          <div key={type} className="rounded-xl border p-4 transition-all"
            style={{ background: scoreBg(data.value), borderColor: `${scoreColor(data.value)}22` }}>
            <p className="text-xs text-sand-600 uppercase font-medium tracking-wide">{type.replace('_', ' ')}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: scoreColor(data.value) }}>
              {data.value?.toFixed(1) || '—'}
              <span className="text-xs font-normal text-sand-500 ml-1">/ 100</span>
            </p>
            {data.computed_at && (
              <p className="text-[10px] text-sand-500 mt-1">{new Date(data.computed_at).toLocaleDateString()}</p>
            )}
          </div>
        ))}

        {opportunity?.explanation?.confidence && (
          <div className="rounded-xl border p-4"
            style={{
              background: opportunity.explanation.confidence === 'high' ? '#E8F5EE' : '#FFF8E6',
              borderColor: opportunity.explanation.confidence === 'high' ? '#1A875422' : '#D4930D22'
            }}>
            <p className="text-xs text-sand-600 uppercase font-medium tracking-wide">Confidence</p>
            <div className="flex items-center gap-2 mt-1">
              {opportunity.explanation.confidence === 'high' ? (
                <Zap className="h-5 w-5 text-sage-400" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-400" />
              )}
              <p className="text-lg font-bold capitalize"
                style={{ color: opportunity.explanation.confidence === 'high' ? '#1A8754' : '#D4930D' }}>
                {opportunity.explanation.confidence}
              </p>
            </div>
          </div>
        )}
      </div>

      {components && (
        <button onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-coral-400 hover:text-coral-500 font-medium mt-1 mb-2 transition-colors">
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Hide' : 'Show'} Score Breakdown
        </button>
      )}

      {expanded && components && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-charcoal-700">Opportunity Score Components</h3>
            <span className="text-xs text-sand-500">
              Overall: <span className="font-bold text-charcoal-700">{opportunity.explanation.overall_score?.toFixed(1)}</span> / 100
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
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
                        <span className="text-sm font-medium text-charcoal-700 capitalize">{meta.label}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-sand-500">{((comp.contribution || 0)).toFixed(1)} pts</span>
                        <span className="text-xs text-sand-400 w-8 text-right">{Math.round(pct)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-sand-200 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, backgroundColor: meta.color }} />
                    </div>
                    {meta.description && (
                      <p className="text-[10px] text-sand-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{meta.description}</p>
                    )}
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Trend Tab: Multi-source signal timeline ───
function TrendTab({ topicId }: { topicId: string }) {
  const { data: ts } = useTimeseries(topicId)
  const { data: forecast } = useForecast(topicId)

  const dateMap: Record<string, { sources: Record<string, number> }> = {}
  for (const p of (ts?.data || [])) {
    if (!dateMap[p.date]) dateMap[p.date] = { sources: {} }
    const val = p.normalized_value || p.raw_value || 0
    dateMap[p.date].sources[p.source] = val
  }

  const historical = Object.entries(dateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { sources }]) => ({
      date: date.slice(0, 7), // YYYY-MM
      google_trends: sources['google_trends'] ?? null,
      reddit: sources['reddit'] ? Math.min(100, sources['reddit'] * 20) : null,
      amazon_ba: sources['amazon_ba'] ? Math.max(0, 100 - (sources['amazon_ba'] / 50)) : null,
      science: sources['science'] ?? null,
    }))

  // Aggregate by month
  const monthMap: Record<string, { gt: number[]; rd: number[]; ba: number[]; sc: number[] }> = {}
  for (const h of historical) {
    if (!monthMap[h.date]) monthMap[h.date] = { gt: [], rd: [], ba: [], sc: [] }
    if (h.google_trends !== null) monthMap[h.date].gt.push(h.google_trends)
    if (h.reddit !== null) monthMap[h.date].rd.push(h.reddit)
    if (h.amazon_ba !== null) monthMap[h.date].ba.push(h.amazon_ba)
    if (h.science !== null) monthMap[h.date].sc.push(h.science)
  }

  const chartData = Object.entries(monthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, d]) => ({
      date: month,
      'Google Trends': d.gt.length > 0 ? Math.round(d.gt.reduce((a, b) => a + b, 0) / d.gt.length) : null,
      'Reddit Buzz': d.rd.length > 0 ? Math.round(d.rd.reduce((a, b) => a + b, 0) / d.rd.length) : null,
      'Amazon Demand': d.ba.length > 0 ? Math.round(d.ba.reduce((a, b) => a + b, 0) / d.ba.length) : null,
      'Science': d.sc.length > 0 ? Math.round(d.sc.reduce((a, b) => a + b, 0) / d.sc.length) : null,
    }))

  const forecastData = (forecast?.forecasts || [])
    .filter((f: any) => f.yhat > 0)
    .sort((a: any, b: any) => a.forecast_date.localeCompare(b.forecast_date))
    .map((f: any) => ({
      date: f.forecast_date.slice(0, 7),
      forecast: Math.round(f.yhat * 10) / 10,
      forecast_upper: Math.round((f.yhat_upper || 0) * 10) / 10,
      forecast_lower: Math.round((f.yhat_lower || 0) * 10) / 10,
    }))

  const allData = [
    ...chartData.map(h => ({ ...h, forecast: null as number | null, forecast_upper: null as number | null, forecast_lower: null as number | null })),
    ...forecastData.map(f => ({ ...f, 'Google Trends': null, 'Reddit Buzz': null, 'Amazon Demand': null, 'Science': null })),
  ]

  const hasData = chartData.length > 0

  return (
    <div className="space-y-6">
      {/* Signal Timeline Chart */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg text-charcoal-700" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400 }}>
            Signal Timeline
          </h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#4285F4]" />Google Trends</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#FF5700]" />Reddit</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#FF9900]" />Amazon</span>
            {chartData.some(d => d['Science'] !== null) && (
              <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-[#7C3AED]" />Science</span>
            )}
          </div>
        </div>

        {hasData ? (
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={allData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E6E1DA" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8B8479' }} />
              <YAxis tick={{ fontSize: 11, fill: '#8B8479' }} domain={[0, 'auto']} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E6E1DA', borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="Google Trends" stroke="#4285F4" fill="#4285F433" strokeWidth={2} dot={false} connectNulls />
              <Area type="monotone" dataKey="Reddit Buzz" stroke="#FF5700" fill="#FF570022" strokeWidth={2} dot={false} connectNulls />
              <Area type="monotone" dataKey="Amazon Demand" stroke="#FF9900" fill="#FF990022" strokeWidth={2} dot={false} connectNulls />
              {chartData.some(d => d['Science'] !== null) && (
                <Bar dataKey="Science" fill="#7C3AED44" stroke="#7C3AED" barSize={8} />
              )}
              {forecastData.length > 0 && (
                <Line type="monotone" dataKey="forecast" stroke="#E8714A" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[350px] flex items-center justify-center text-sand-500">
            <div className="text-center">
              <BarChart3 className="h-10 w-10 mx-auto mb-3 text-sand-400" />
              <p className="text-sm font-medium">No timeseries data yet</p>
              <p className="text-xs text-sand-400 mt-1">Data will appear after ingestion pipelines run</p>
            </div>
          </div>
        )}

        {forecast && (
          <p className="text-xs text-sand-500 mt-2">
            Forecast: {forecast.model_version} · {forecastData.length} points · Generated: {new Date(forecast.generated_at).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Source counts summary */}
      {hasData && (
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Google Trends', count: chartData.filter(d => d['Google Trends'] !== null).length, color: '#4285F4', latest: chartData.filter(d => d['Google Trends'] !== null).pop()?.['Google Trends'] },
            { label: 'Reddit', count: chartData.filter(d => d['Reddit Buzz'] !== null).length, color: '#FF5700', latest: chartData.filter(d => d['Reddit Buzz'] !== null).pop()?.['Reddit Buzz'] },
            { label: 'Amazon BA', count: chartData.filter(d => d['Amazon Demand'] !== null).length, color: '#FF9900', latest: chartData.filter(d => d['Amazon Demand'] !== null).pop()?.['Amazon Demand'] },
            { label: 'Science', count: chartData.filter(d => d['Science'] !== null).length, color: '#7C3AED', latest: chartData.filter(d => d['Science'] !== null).pop()?.['Science'] },
          ].map(s => (
            <div key={s.label} className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                <span className="text-xs text-sand-600 font-medium uppercase">{s.label}</span>
              </div>
              <p className="text-xl font-bold text-charcoal-700">{s.count > 0 ? `${s.count} pts` : '—'}</p>
              {s.latest !== undefined && s.latest !== null && (
                <p className="text-xs text-sand-500 mt-0.5">Latest: {Math.round(s.latest)}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Competition Tab ───
function CompetitionTab({ topicId }: { topicId: string }) {
  const { data: comp } = useCompetition(topicId)
  if (!comp) return <div className="text-sand-500 py-8 text-center">Loading competition data...</div>

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
            <p className="text-xs text-sand-600 uppercase">{m.label}</p>
            <p className="text-xl font-bold mt-1 text-charcoal-700">{m.value ?? '—'}</p>
          </div>
        ))}
      </div>

      {comp.top_asins?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg text-charcoal-700 mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400 }}>
            Top Competing Products
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {comp.top_asins.map((a: any) => (
              <div key={a.asin} className="flex gap-3 p-3 border border-sand-300 rounded-lg hover:bg-sand-50 transition-colors">
                <div className="flex-1">
                  <p className="text-sm font-medium text-charcoal-700 line-clamp-2">{a.title || a.asin}</p>
                  <p className="text-xs text-sand-500 mt-1">{a.brand} · ${a.price} · {a.rating}★ · {a.review_count} reviews</p>
                </div>
                <span className="text-xs text-sand-400 font-medium">#{a.rank}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reviews Tab ───
function ReviewsTab({ topicId }: { topicId: string }) {
  const { data: reviews } = useReviewsSummary(topicId)
  if (!reviews) return <div className="text-sand-500 py-8 text-center">Loading review insights...</div>

  return (
    <div className="space-y-6">
      <div className="text-sm text-sand-600">
        Analyzed {reviews.total_reviews_analyzed} reviews across {reviews.asins_covered} products
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-sage-400 mb-4">✓ Top Pros</h3>
          {(reviews.pros || []).map((p: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-sand-200 last:border-0">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm capitalize text-charcoal-700">{p.aspect?.replace('_', ' ')}</span>
                <span className="text-xs text-sand-500">{p.mention_count} mentions</span>
              </div>
              {p.sample && <p className="text-xs text-sand-400 mt-1 italic">"{p.sample}"</p>}
            </div>
          ))}
          {(!reviews.pros || reviews.pros.length === 0) && <p className="text-sm text-sand-400 text-center py-4">No pro insights yet</p>}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-rose-400 mb-4">✗ Top Cons</h3>
          {(reviews.cons || []).map((c: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-sand-200 last:border-0">
              <div className="flex justify-between items-center">
                <span className="font-medium text-sm capitalize text-charcoal-700">{c.aspect?.replace('_', ' ')}</span>
                <span className="text-xs text-sand-500">{c.mention_count} mentions</span>
              </div>
              {c.sample && <p className="text-xs text-sand-400 mt-1 italic">"{c.sample}"</p>}
            </div>
          ))}
          {(!reviews.cons || reviews.cons.length === 0) && <p className="text-sm text-sand-400 text-center py-4">No con insights yet</p>}
        </div>
      </div>

      {reviews.top_pain_points?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-charcoal-700 mb-4">🔥 Top Pain Points</h3>
          {reviews.top_pain_points.map((pp: any, i: number) => (
            <div key={i} className="flex items-center gap-4 mb-3">
              <div className="w-20 h-2 bg-sand-200 rounded-full overflow-hidden">
                <div className="h-full bg-rose-400 rounded-full" style={{ width: `${pp.severity}%` }} />
              </div>
              <span className="text-sm font-medium capitalize flex-1 text-charcoal-700">{pp.aspect?.replace('_', ' ')}</span>
              <span className="text-xs text-sand-500">{pp.evidence}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Gen-Next Tab ───
function GenNextTab({ topicId }: { topicId: string }) {
  const { data: spec, isLoading, error } = useGenNextSpec(topicId)
  if (isLoading) return <div className="text-sand-500 py-8 text-center">Loading Gen-Next spec...</div>
  if (error) return <div className="card p-6 text-center text-sand-500">Gen-Next spec not available for this topic.</div>
  if (!spec) return null

  return (
    <div className="space-y-6">
      <p className="text-xs text-sand-500">Version {spec.version} · Generated {new Date(spec.generated_at).toLocaleDateString()} · Model: {spec.model_used}</p>

      <div className="grid grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-rose-400 mb-4">🔧 Must Fix</h3>
          {(spec.must_fix || []).map((item: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-sand-200 last:border-0">
              <div className="flex items-center gap-2">
                <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
                  item.severity === 'critical' ? 'bg-rose-50 text-rose-400' : 'bg-amber-50 text-amber-400'
                )}>{item.severity}</span>
                <span className="text-sm font-medium text-charcoal-700">{item.issue}</span>
              </div>
              <p className="text-xs text-sand-500 mt-1">{item.evidence}</p>
            </div>
          ))}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-semibold text-sage-400 mb-4">✨ Must Add</h3>
          {(spec.must_add || []).map((item: any, i: number) => (
            <div key={i} className="mb-3 pb-3 border-b border-sand-200 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-xs bg-coral-100 text-coral-500 px-2 py-0.5 rounded-full font-medium">P{item.priority}</span>
                <span className="text-sm font-medium text-charcoal-700">{item.feature}</span>
              </div>
              <p className="text-xs text-sand-500 mt-1">{item.demand_signal}</p>
            </div>
          ))}
        </div>
      </div>

      {spec.differentiators?.length > 0 && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-charcoal-700 mb-4">💡 Differentiators</h3>
          <div className="grid grid-cols-2 gap-4">
            {spec.differentiators.map((d: any, i: number) => (
              <div key={i} className="p-4 bg-sand-50 rounded-lg border border-sand-200">
                <p className="font-medium text-sm text-charcoal-700">{d.idea}</p>
                <p className="text-xs text-sand-500 mt-1">{d.rationale}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {spec.positioning && (
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-charcoal-700 mb-4">🎯 Positioning</h3>
          <div className="grid grid-cols-2 gap-4">
            {spec.positioning.target_price && <div><p className="text-xs text-sand-500">Target Price</p><p className="text-lg font-bold text-charcoal-700">${spec.positioning.target_price}</p></div>}
            {spec.positioning.target_rating && <div><p className="text-xs text-sand-500">Target Rating</p><p className="text-lg font-bold text-charcoal-700">{spec.positioning.target_rating} ★</p></div>}
            {spec.positioning.tagline && <div className="col-span-2"><p className="text-xs text-sand-500">Tagline</p><p className="text-lg font-semibold italic text-charcoal-700">"{spec.positioning.tagline}"</p></div>}
            {spec.positioning.target_demographic && <div className="col-span-2"><p className="text-xs text-sand-500">Target Demographic</p><p className="text-sm text-charcoal-700">{spec.positioning.target_demographic}</p></div>}
          </div>
        </div>
      )}
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

  if (loading) return <div className="text-sand-500 py-8 text-center">Loading social signals...</div>

  return (
    <div className="space-y-6">
      {signals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-4"><p className="text-xs text-sand-600 uppercase mb-1">Instagram</p><p className="text-xl font-bold text-pink-500">{signals.instagram_posts}</p><p className="text-[10px] text-sand-500">{signals.instagram_engagement?.toLocaleString()} engagement</p></div>
          <div className="card p-4"><p className="text-xs text-sand-600 uppercase mb-1">TikTok</p><p className="text-xl font-bold text-cyan-500">{signals.tiktok_videos}</p><p className="text-[10px] text-sand-500">{signals.tiktok_views?.toLocaleString()} views</p></div>
          <div className="card p-4"><p className="text-xs text-sand-600 uppercase mb-1">Reddit</p><p className="text-xl font-bold text-orange-500">{signals.reddit_mentions}</p><p className="text-[10px] text-sand-500">mentions</p></div>
          <div className="card p-4"><p className="text-xs text-sand-600 uppercase mb-1">Brand Mentions</p><p className="text-xl font-bold text-charcoal-700">{signals.total_brand_mentions}</p>
            {signals.avg_mention_sentiment !== null && (
              <p className={clsx('text-[10px]', signals.avg_mention_sentiment > 0 ? 'text-sage-400' : 'text-rose-400')}>
                {signals.avg_mention_sentiment > 0 ? '↑' : '↓'} {(signals.avg_mention_sentiment * 100).toFixed(0)}% sentiment
              </p>
            )}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-charcoal-700 uppercase mb-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-rose-400" /> Complaint Themes ({complaints.length})
        </h3>
        {complaints.length > 0 ? (
          <div className="space-y-3">
            {complaints.map((c: any) => (
              <div key={c.cluster_id} className="p-3 rounded-lg bg-sand-50 border-l-2 border-rose-400">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-charcoal-700">{c.label}</p>
                  <span className="text-xs text-sand-500">{c.size} mentions</span>
                </div>
                {c.representative_texts?.slice(0, 2).map((text: string, i: number) => (
                  <p key={i} className="text-xs text-sand-500 mt-1 italic">"{text}"</p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-sand-500 text-center py-4">No complaint clusters found — data appears after NLP pipeline runs</p>
        )}
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-charcoal-700 uppercase mb-4 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-blue-400" /> Feature Requests ({featureRequests.length})
        </h3>
        {featureRequests.length > 0 ? (
          <div className="space-y-2">
            {featureRequests.map((fr: any) => (
              <div key={fr.id} className="flex items-start gap-3 p-3 rounded-lg bg-sand-50">
                <Lightbulb className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-charcoal-700 font-medium">{fr.aspect}</p>
                  {fr.evidence && <p className="text-xs text-sand-500 mt-1 italic">"{fr.evidence}"</p>}
                </div>
                {fr.review_stars && (
                  <span className="text-xs text-amber-400 flex-shrink-0">{'★'.repeat(fr.review_stars)}{'☆'.repeat(5 - fr.review_stars)}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-sand-500 text-center py-4">No feature requests detected yet</p>
        )}
      </div>
    </div>
  )
}
