import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { categoriesApi } from '../lib/api'
import { ArrowLeft, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb, BarChart3, ChevronRight, MessageSquare, Target, Activity, ArrowUpRight } from 'lucide-react'

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', borderLight: '#F1F5F9',
  coral: '#E16A4A', coralLight: '#FEF0EB', coralUltraLight: '#FFF7F5',
  sage: '#2ED3A5', sageLight: '#EAFAF5', amber: '#FFC857', amberLight: '#FFF8E6',
  rose: '#EF4444', roseLight: '#FEF2F2', plum: '#6B4EFF', plumLight: '#F0EEFF',
  charcoal: '#2C5282', charcoalDeep: '#1E3A5F', blue: '#2563EB',
  ink: '#0F172A', slate: '#475569', stone: '#64748B', sand: '#94A3B8',
}

const STAGE: Record<string, { bg: string; text: string; bar: string }> = {
  emerging: { bg: C.sageLight, text: C.sage, bar: C.sage },
  exploding: { bg: C.coralLight, text: C.coral, bar: C.coral },
  peaking: { bg: C.amberLight, text: C.amber, bar: C.amber },
  declining: { bg: C.roseLight, text: C.rose, bar: C.rose },
  unknown: { bg: C.borderLight, text: C.stone, bar: C.stone },
}

const EMOJI: Record<string, string> = {
  'Health': '💊', 'Electronics': '⚡', 'Fitness': '🏋️', 'Kitchen': '🍳',
  'Beauty': '✨', 'Home': '🏡', 'Baby': '👶', 'Pet': '🐾',
  'Outdoor': '🏕️', 'Outdoors': '🏕️', 'Office': '💼', 'Fashion': '👗',
}

function StageBadge({ stage }: { stage: string }) {
  const s = STAGE[stage] || STAGE.unknown
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: s.bg, color: s.text, textTransform: 'capitalize' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.bar }} />{stage}
    </span>
  )
}

function Sparkline({ data, color = C.coral, width = 160, height = 40 }: { data: number[]; color?: string; width?: number; height?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data); const max = Math.max(...data); const range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 4) - 2}`).join(' ')
  return (
    <svg width={width} height={height}>
      <defs><linearGradient id={`cat-sp`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill="url(#cat-sp)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('overview')
  const [overview, setOverview] = useState<any>(null)
  const [voice, setVoice] = useState<any>(null)
  const [opportunities, setOpportunities] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [stageFilter, setStageFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalOpps, setTotalOpps] = useState(0)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      categoriesApi.overview(id).then(r => setOverview(r.data)).catch(() => null),
      categoriesApi.voice(id).then(r => setVoice(r.data)).catch(() => null),
    ]).finally(() => setLoading(false))
  }, [id])

  // Fetch opportunities when tab/filter/page changes
  useEffect(() => {
    if (!id) return
    const params: Record<string, any> = { page, page_size: 20 }
    if (stageFilter) params.stage = stageFilter
    categoriesApi.opportunities(id, params).then(r => {
      setOpportunities(r.data?.data || [])
      setTotalPages(r.data?.pagination?.total_pages || 1)
      setTotalOpps(r.data?.pagination?.total || 0)
    }).catch(() => setOpportunities([]))
  }, [id, stageFilter, page])

  if (loading) return <div style={{ padding: 40, color: C.coral, fontFamily: "'Inter', sans-serif" }}>Loading category...</div>
  if (!overview) return <div style={{ padding: 40, color: C.rose, fontFamily: "'Inter', sans-serif" }}>Category not found</div>

  const sd = overview.stage_distribution || {}
  const total = (sd.emerging || 0) + (sd.exploding || 0) + (sd.peaking || 0) + (sd.declining || 0) || 1
  const metricsHistory = overview.metrics_history || []
  const sparklineData = metricsHistory.map((m: any) => m.avg_opportunity_score || 0)
  const emoji = EMOJI[overview.name] || overview.icon || '📦'
  const growthColor = (overview.growth_rate_4w || 0) > 0 ? C.sage : (overview.growth_rate_4w || 0) < 0 ? C.rose : C.stone

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'opportunities', label: `Opportunities (${totalOpps})`, icon: TrendingUp },
    { id: 'voice', label: 'Category Voice', icon: MessageSquare },
  ]

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Inter', -apple-system, sans-serif", color: C.ink }}>
      {/* Back */}
      <button onClick={() => navigate('/categories')} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: C.stone, background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16 }}>
        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Categories
      </button>

      {/* Hero Card */}
      <div style={{ background: C.card, borderRadius: 16, padding: '28px 32px', border: `1px solid ${C.border}`, marginBottom: 24, position: 'relative', overflow: 'hidden', boxShadow: '0 2px 8px rgba(42,37,32,0.06)' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.coral}, ${C.sage})` }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 42 }}>{emoji}</span>
            <div>
              <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: C.charcoalDeep, fontFamily: "'Sora', sans-serif" }}>{overview.name}</h1>
              {overview.description && <p style={{ fontSize: 13, color: C.stone, margin: '4px 0 0', maxWidth: 500 }}>{overview.description}</p>}
              <p style={{ fontSize: 12, color: C.sand, margin: '4px 0 0' }}>Level {overview.level} · {overview.topic_count} topics</p>
            </div>
          </div>
          {sparklineData.length > 2 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>Opportunity Trend (30d)</div>
              <Sparkline data={sparklineData} />
            </div>
          )}
        </div>

        {/* KPI Row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginTop: 24 }}>
          {[
            { label: 'Topics', value: overview.topic_count || 0, color: C.charcoal },
            { label: 'Avg Opportunity', value: overview.avg_opportunity_score?.toFixed(1) || '—', color: (overview.avg_opportunity_score || 0) >= 60 ? C.sage : C.amber },
            { label: 'Avg Competition', value: overview.avg_competition_index?.toFixed(1) || '—', color: C.charcoal },
            { label: '4w Growth', value: overview.growth_rate_4w ? `${(overview.growth_rate_4w * 100).toFixed(1)}%` : '—', color: growthColor },
            { label: 'Subcategories', value: overview.subcategories?.length || 0, color: C.plum },
          ].map(m => (
            <div key={m.label} style={{ textAlign: 'center', padding: '10px 0', background: C.bg, borderRadius: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
              <div style={{ fontSize: 9, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>

        {/* Stage distribution */}
        <div style={{ marginTop: 18 }}>
          <div style={{ height: 8, borderRadius: 4, overflow: 'hidden', display: 'flex', background: C.borderLight }}>
            {(['exploding', 'emerging', 'peaking', 'declining'] as const).map(stage => {
              const count = sd[stage] || 0
              if (count === 0) return null
              return <div key={stage} style={{ width: `${(count / total) * 100}%`, background: STAGE[stage]?.bar, transition: 'width 0.3s' }} />
            })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
            {(['exploding', 'emerging', 'peaking', 'declining'] as const).map(stage => {
              const count = sd[stage] || 0
              if (count === 0) return null
              const s = STAGE[stage]
              return <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: s.bar }} /><span style={{ fontSize: 11, color: C.slate, textTransform: 'capitalize' }}>{stage}: <strong>{count}</strong></span></div>
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(tab => {
          const Icon = tab.icon; const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', fontSize: 13, fontWeight: 600,
              border: 'none', borderBottom: `2px solid ${active ? C.coral : 'transparent'}`,
              background: 'none', cursor: 'pointer', color: active ? C.coral : C.stone, transition: 'all 0.15s',
            }}>
              <Icon style={{ width: 14, height: 14 }} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* ═══ OVERVIEW TAB ═══ */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Top Opportunities */}
          <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: C.coral }} />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target style={{ width: 14, height: 14, color: C.coral }} /> Top Opportunities
            </h3>
            {(overview.top_opportunities || []).length > 0 ? (
              overview.top_opportunities.map((t: any, i: number) => {
                const sc = t.opportunity_score || 0
                const scoreColor = sc >= 70 ? C.sage : sc >= 40 ? C.amber : C.rose
                return (
                  <div key={t.id} onClick={() => navigate(`/topics/${t.id}`)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                    background: i === 0 ? C.coralUltraLight : 'transparent',
                    border: i === 0 ? `1px solid ${C.coral}20` : '1px solid transparent',
                    transition: 'background 0.1s',
                  }}
                    onMouseEnter={e => { if (i > 0) e.currentTarget.style.background = C.bg }}
                    onMouseLeave={e => { if (i > 0) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', background: i === 0 ? C.coral + '15' : C.borderLight, color: i === 0 ? C.coral : C.stone, fontSize: 11, fontWeight: 700 }}>{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                      <StageBadge stage={t.stage} />
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>{sc.toFixed(1)}</div>
                    <ChevronRight style={{ width: 14, height: 14, color: C.sand }} />
                  </div>
                )
              })
            ) : <div style={{ fontSize: 12, color: C.sand, textAlign: 'center', padding: 20, fontStyle: 'italic' }}>No scored topics yet</div>}
          </div>

          {/* Subcategories */}
          <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, margin: '0 0 14px' }}>Subcategories ({overview.subcategories?.length || 0})</h3>
            {(overview.subcategories || []).length > 0 ? (
              overview.subcategories.map((sub: any) => (
                <div key={sub.id} onClick={() => navigate(`/categories/${sub.id}`)} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px',
                  borderRadius: 10, marginBottom: 4, cursor: 'pointer', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => e.currentTarget.style.background = C.bg}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{sub.name}</div><div style={{ fontSize: 11, color: C.stone }}>{sub.topic_count} topics</div></div>
                  <ChevronRight style={{ width: 14, height: 14, color: C.sand }} />
                </div>
              ))
            ) : <div style={{ fontSize: 12, color: C.sand, textAlign: 'center', padding: 20, fontStyle: 'italic' }}>No subcategories</div>}
          </div>

          {/* Metrics History */}
          {metricsHistory.length > 2 && (
            <div style={{ gridColumn: 'span 2', background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Activity style={{ width: 14, height: 14, color: C.plum }} /> Category Health Over Time
              </h3>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 100 }}>
                {metricsHistory.map((m: any, i: number) => {
                  const val = m.avg_opportunity_score || 0
                  const max = Math.max(...metricsHistory.map((x: any) => x.avg_opportunity_score || 0), 1)
                  const h = (val / max) * 90
                  const color = val >= 60 ? C.sage : val >= 40 ? C.amber : C.rose
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${m.date}: ${val.toFixed(1)}`}>
                      <div style={{ width: '100%', maxWidth: 18, height: Math.max(h, 3), borderRadius: '3px 3px 0 0', background: color + '80', transition: 'height 0.3s' }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 10, color: C.sand }}>{metricsHistory[0]?.date}</span>
                <span style={{ fontSize: 10, color: C.sand }}>{metricsHistory[metricsHistory.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ OPPORTUNITIES TAB ═══ */}
      {activeTab === 'opportunities' && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {/* Stage filter pills */}
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.charcoalDeep }}>All Topics</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {['', 'emerging', 'exploding', 'peaking', 'declining'].map(s => (
                <button key={s} onClick={() => { setStageFilter(s); setPage(1) }} style={{
                  padding: '5px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: stageFilter === s ? C.coral : C.borderLight, color: stageFilter === s ? '#fff' : C.stone,
                  textTransform: 'capitalize', transition: 'all 0.15s',
                }}>{s || 'All'}</button>
              ))}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                {['#', 'Topic', 'Stage', 'Opportunity', 'Competition', ''].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '10px 16px', fontSize: 10, fontWeight: 600, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {opportunities.map((t: any, i: number) => {
                const sc = t.opportunity_score || 0
                const scoreColor = sc >= 70 ? C.sage : sc >= 40 ? C.amber : C.rose
                return (
                  <tr key={t.id} onClick={() => navigate(`/topics/${t.id}`)}
                    style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bg}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 12, color: C.sand, fontWeight: 600 }}>{(page - 1) * 20 + i + 1}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.ink }}>{t.name}</td>
                    <td style={{ padding: '12px 16px' }}><StageBadge stage={t.stage} /></td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>{t.opportunity_score?.toFixed(1) || '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: C.slate, fontFamily: "'JetBrains Mono', monospace" }}>{t.competition_index?.toFixed(1) || '—'}</td>
                    <td style={{ padding: '12px 16px' }}><ArrowUpRight style={{ width: 14, height: 14, color: C.sand }} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {opportunities.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.sand, fontSize: 13 }}>{stageFilter ? `No ${stageFilter} topics.` : 'No topics found.'}</div>}

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '14px 0', borderTop: `1px solid ${C.borderLight}` }}>
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: page <= 1 ? C.sand : C.slate, cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Previous</button>
              <span style={{ padding: '6px 12px', fontSize: 12, color: C.stone }}>Page {page} of {totalPages}</span>
              <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: page >= totalPages ? C.sand : C.slate, cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>Next</button>
            </div>
          )}
        </div>
      )}

      {/* ═══ VOICE TAB ═══ */}
      {activeTab === 'voice' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {voice ? (
            <>
              {/* Voice KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                {[
                  { label: 'Reviews Analyzed', value: voice.total_reviews_analyzed, color: C.charcoal },
                  { label: 'Pain Points', value: voice.total_negative_aspects, color: C.rose },
                  { label: 'Feature Requests', value: voice.total_feature_requests, color: C.blue },
                ].map(m => (
                  <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
                  </div>
                ))}
              </div>

              {/* Complaint Clusters */}
              <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle style={{ width: 14, height: 14, color: C.rose }} /> Top Complaint Themes
                </h3>
                {(voice.complaint_clusters || []).length > 0 ? (
                  voice.complaint_clusters.map((cluster: any) => (
                    <div key={cluster.cluster_id} style={{ padding: '14px 16px', borderRadius: 10, background: C.roseLight, borderLeft: `3px solid ${C.rose}`, marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{cluster.label}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: C.stone }}>{cluster.size} mentions</span>
                          <div style={{ width: 50, height: 5, borderRadius: 3, background: C.rose + '30', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(cluster.severity || 0) * 100}%`, background: C.rose, borderRadius: 3 }} />
                          </div>
                        </div>
                      </div>
                      {cluster.representative_texts?.slice(0, 2).map((text: string, i: number) => (
                        <p key={i} style={{ fontSize: 11, color: C.slate, margin: '2px 0', fontStyle: 'italic' }}>"{text}"</p>
                      ))}
                    </div>
                  ))
                ) : <div style={{ fontSize: 12, color: C.sand, textAlign: 'center', padding: 16 }}>No complaint clusters — run NLP pipeline first</div>}
              </div>

              {/* Feature Requests */}
              <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
                <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lightbulb style={{ width: 14, height: 14, color: C.blue }} /> Feature Requests from Reviews
                </h3>
                {(voice.top_feature_requests || []).length > 0 ? (
                  voice.top_feature_requests.map((fr: any) => (
                    <div key={fr.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: C.bg, marginBottom: 4 }}>
                      <Lightbulb style={{ width: 14, height: 14, color: C.blue, marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{fr.aspect}</div>
                        {fr.evidence && <p style={{ fontSize: 11, color: C.stone, margin: '2px 0 0', fontStyle: 'italic' }}>"{fr.evidence}"</p>}
                      </div>
                      {fr.review_stars && <span style={{ fontSize: 12, color: C.amber }}>{'★'.repeat(fr.review_stars)}{'☆'.repeat(5 - fr.review_stars)}</span>}
                    </div>
                  ))
                ) : <div style={{ fontSize: 12, color: C.sand, textAlign: 'center', padding: 16 }}>No feature requests detected yet</div>}
              </div>
            </>
          ) : (
            <div style={{ background: C.card, borderRadius: 14, padding: 40, border: `1px solid ${C.border}`, textAlign: 'center' }}>
              <MessageSquare style={{ width: 36, height: 36, color: C.sand, margin: '0 auto 12px' }} />
              <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Category Voice data unavailable</p>
              <p style={{ fontSize: 12, color: C.stone }}>Run the Social Listening + NLP pipeline to generate complaint clusters and feature requests.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
