import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWatchlist, useAddToWatchlist, useRemoveFromWatchlist } from '../hooks/useData'
import {
  ChevronLeft, ChevronRight, Download, Bookmark, BookmarkCheck,
  Loader2, Search, ChevronDown, ChevronUp, Zap, TrendingUp,
  Shield, AlertTriangle, Clock, Target, ExternalLink, Bell,
  FileText, BarChart3, Activity, Eye, Beaker, Radio
} from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { api } from '../lib/api'
import clsx from 'clsx'

const STAGES = ['All', 'emerging', 'exploding', 'peaking', 'declining']
const CATEGORIES = ['All', 'Electronics', 'Health', 'Home', 'Beauty', 'Fitness', 'Kitchen', 'Outdoors', 'Pets', 'Baby']

/* ─── NeuraNest brand palette ─── */
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', borderLight: '#F1F5F9',
  coral: '#E16A4A', coralHover: '#C85A3A', coralLight: '#FEF0EB', coralUltraLight: '#FFF7F5',
  sage: '#2ED3A5', sageLight: '#EAFAF5', amber: '#FFC857', amberLight: '#FFF8E6',
  rose: '#EF4444', roseLight: '#FEF2F2', plum: '#6B4EFF', plumLight: '#F0EEFF',
  charcoal: '#2C5282', charcoalDeep: '#1E3A5F',
  ink: '#0F172A', slate: '#475569', stone: '#64748B', sand: '#94A3B8',
}

const STAGE_CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  emerging: { bg: C.sageLight, text: C.sage, dot: C.sage, label: 'Emerging' },
  exploding: { bg: C.coralLight, text: C.coral, dot: C.coral, label: 'Exploding' },
  peaking: { bg: C.amberLight, text: C.amber, dot: C.amber, label: 'Peaking' },
  declining: { bg: C.roseLight, text: C.rose, dot: C.rose, label: 'Declining' },
  unknown: { bg: C.borderLight, text: C.stone, dot: C.stone, label: 'Unknown' },
}

const CONFIDENCE_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: C.sageLight, text: C.sage, label: 'High Confidence' },
  medium: { bg: C.amberLight, text: C.amber, label: 'Medium Confidence' },
  low: { bg: C.borderLight, text: C.stone, label: 'Low Confidence' },
}

const ARCHETYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  'science-led': { icon: Beaker, label: 'Science-Led', color: C.plum },
  'social-led': { icon: Radio, label: 'Social-Led', color: C.coral },
  'problem-led': { icon: Target, label: 'Problem-Led', color: C.sage },
  'demand-led': { icon: TrendingUp, label: 'Demand-Led', color: C.amber },
  'unknown': { icon: Activity, label: 'Multi-Signal', color: C.stone },
}

const DRIVER_LABELS: Record<string, string> = {
  demand_growth: 'Demand Growth',
  acceleration: 'Acceleration',
  cross_source: 'Cross-Source Signals',
  low_competition: 'Low Competition',
  review_gap: 'Review Pain Gap',
  geo_expansion: 'Geo Expansion',
  forecast_uplift: 'Forecast Uplift',
}

/* ─── Sub-components ─── */
function StageBadge({ stage }: { stage: string }) {
  const s = STAGE_CONFIG[stage] || STAGE_CONFIG.unknown
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text, textTransform: 'capitalize', letterSpacing: '0.3px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  )
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const c = CONFIDENCE_CONFIG[confidence] || CONFIDENCE_CONFIG.low
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 600,
      background: c.bg, color: c.text,
    }}>
      <Shield style={{ width: 10, height: 10 }} />
      {c.label}
    </span>
  )
}

function ConvergenceMeter({ active, total }: { active: number; total: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: total }).map((_, i) => (
          <div key={i} style={{
            width: 8, height: 8, borderRadius: 2,
            background: i < active ? C.coral : C.borderLight,
            transition: 'background 0.2s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: active >= 3 ? C.sage : C.stone }}>
        {active}/{total}
      </span>
    </div>
  )
}

function ScoreBar({ score, color = C.coral }: { score: number | null; color?: string }) {
  if (score === null) return <span style={{ color: C.sand, fontSize: 12 }}>—</span>
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 48, height: 5, borderRadius: 3, background: C.borderLight, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(score, 100)}%`, height: '100%', borderRadius: 3,
          background: score >= 70 ? C.sage : score >= 40 ? C.amber : C.rose,
          transition: 'width 0.3s ease',
        }} />
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
        color: score >= 70 ? C.sage : score >= 40 ? C.amber : C.rose,
      }}>
        {score.toFixed(1)}
      </span>
    </div>
  )
}

function MiniSparkline({ data, width = 80, height = 30 }: { data: number[]; width?: number; height?: number }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const up = data[data.length - 1] > data[0]
  const color = up ? C.sage : C.rose
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / range) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`sp-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#sp-${color.replace('#', '')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* ─── Driver Bar ─── */
function DriverBar({ name, contribution, maxContribution }: {
  name: string; contribution: number; maxContribution: number
}) {
  const pct = maxContribution > 0 ? (contribution / maxContribution) * 100 : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: C.slate, width: 120, flexShrink: 0 }}>
        {DRIVER_LABELS[name] || name.replace(/_/g, ' ')}
      </span>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: C.borderLight, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3,
          background: `linear-gradient(90deg, ${C.coral}, ${C.coralHover})`,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.ink, fontFamily: "'JetBrains Mono', monospace", width: 36, textAlign: 'right' }}>
        {contribution.toFixed(1)}
      </span>
    </div>
  )
}

/* ─── Decision Card (Expanded Row) ─── */
function DecisionCard({ topic, watchlistIds, onAdd, onRemove, onNavigate }: {
  topic: any; watchlistIds: Set<string>; onAdd: (id: string) => void; onRemove: (id: string) => void; onNavigate: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const expl = topic.explainability || {}
  const confidence = expl.confidence || 'low'
  const archetype = ARCHETYPE_CONFIG[expl.archetype] || ARCHETYPE_CONFIG.unknown
  const ArchetypeIcon = archetype.icon
  const convergence = expl.convergence || { active: 0, total: 5, signals: {} }
  const drivers = expl.top_drivers || []
  const risks = expl.risks || []
  const timeToPeak = expl.time_to_peak
  const maxContribution = drivers.length > 0 ? Math.max(...drivers.map((d: any) => d.contribution)) : 1
  const isWatched = watchlistIds.has(topic.id)

  return (
    <div style={{
      background: C.card, borderRadius: 14, marginBottom: 10,
      border: `1px solid ${expanded ? C.coral + '40' : C.border}`,
      boxShadow: expanded ? '0 4px 20px rgba(232,113,74,0.08)' : '0 1px 3px rgba(42,37,32,0.04)',
      transition: 'all 0.2s ease',
      overflow: 'hidden',
    }}>
      {/* Main Row — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'grid',
          gridTemplateColumns: '40px 1.4fr 100px 100px 90px 90px 80px 90px 36px',
          alignItems: 'center',
          padding: '14px 16px',
          cursor: 'pointer',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = C.coralUltraLight)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Watchlist */}
        <div onClick={e => { e.stopPropagation(); isWatched ? onRemove(topic.id) : onAdd(topic.id) }}
          style={{
            width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', transition: 'all 0.15s',
            background: isWatched ? C.coralLight : 'transparent',
            color: isWatched ? C.coral : C.sand,
          }}>
          {isWatched
            ? <BookmarkCheck style={{ width: 15, height: 15 }} />
            : <Bookmark style={{ width: 15, height: 15 }} />}
        </div>

        {/* Name + Category + Archetype */}
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, marginBottom: 3 }}>
            {topic.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: C.stone }}>{topic.primary_category || '—'}</span>
            {expl.archetype && expl.archetype !== 'unknown' && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                fontSize: 10, fontWeight: 600, color: archetype.color,
                padding: '1px 6px', borderRadius: 8,
                background: archetype.color + '12',
              }}>
                <ArchetypeIcon style={{ width: 9, height: 9 }} />
                {archetype.label}
              </span>
            )}
          </div>
        </div>

        {/* Stage */}
        <div><StageBadge stage={topic.stage} /></div>

        {/* Confidence */}
        <div><ConfidenceBadge confidence={confidence} /></div>

        {/* Sparkline */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <MiniSparkline data={topic.sparkline || []} />
        </div>

        {/* Score */}
        <div><ScoreBar score={topic.opportunity_score} /></div>

        {/* Convergence */}
        <div>
          <ConvergenceMeter active={convergence.active} total={convergence.total} />
        </div>

        {/* Time to peak */}
        <div style={{ fontSize: 10, color: C.stone, display: 'flex', alignItems: 'center', gap: 3 }}>
          {timeToPeak && (
            <>
              <Clock style={{ width: 10, height: 10 }} />
              {timeToPeak}
            </>
          )}
        </div>

        {/* Expand chevron */}
        <div style={{ display: 'flex', justifyContent: 'center', color: C.sand }}>
          {expanded
            ? <ChevronUp style={{ width: 16, height: 16 }} />
            : <ChevronDown style={{ width: 16, height: 16 }} />}
        </div>
      </div>

      {/* Expanded Detail Panel */}
      {expanded && (
        <div style={{
          borderTop: `1px solid ${C.borderLight}`,
          padding: '20px 24px',
          background: `linear-gradient(180deg, ${C.coralUltraLight} 0%, ${C.card} 100%)`,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>

            {/* Column 1: Why This Trend (Score Explainability) */}
            <div>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: C.charcoal, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Zap style={{ width: 13, height: 13, color: C.coral }} />
                Why This Trend
              </h4>

              {/* Opportunity Score Donut */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
                <div style={{ position: 'relative', width: 56, height: 56 }}>
                  <svg width="56" height="56" viewBox="0 0 56 56">
                    <circle cx="28" cy="28" r="22" fill="none" stroke={C.borderLight} strokeWidth="5" />
                    <circle cx="28" cy="28" r="22" fill="none" stroke={C.coral} strokeWidth="5"
                      strokeDasharray={`${(topic.opportunity_score || 0) / 100 * 138} 138`}
                      strokeLinecap="round" transform="rotate(-90 28 28)"
                      style={{ transition: 'stroke-dasharray 0.5s ease' }} />
                  </svg>
                  <div style={{
                    position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, color: C.ink, fontFamily: "'JetBrains Mono', monospace",
                  }}>
                    {(topic.opportunity_score || 0).toFixed(0)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>Opportunity Score</div>
                  <div style={{ fontSize: 11, color: C.stone }}>
                    {expl.dampener_applied ? 'Dampened (limited data)' : 'Full confidence weighting'}
                  </div>
                </div>
              </div>

              {/* Driver bars */}
              {drivers.map((d: any) => (
                <DriverBar key={d.name} name={d.name} contribution={d.contribution} maxContribution={maxContribution} />
              ))}

              {drivers.length === 0 && (
                <div style={{ fontSize: 12, color: C.sand, fontStyle: 'italic' }}>Score breakdown not yet available</div>
              )}
            </div>

            {/* Column 2: Signal Convergence */}
            <div>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: C.charcoal, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <Activity style={{ width: 13, height: 13, color: C.sage }} />
                Signal Convergence
              </h4>

              {/* Signal list */}
              {Object.entries(convergence.signals || {}).map(([signal, active]) => {
                const labels: Record<string, string> = {
                  google_trends: 'Google Trends', reddit: 'Reddit',
                  instagram: 'Social (IG/FB)', tiktok: 'TikTok', science: 'Science Papers',
                }
                const icons: Record<string, string> = {
                  google_trends: '📈', reddit: '💬', instagram: '📸', tiktok: '🎵', science: '🔬',
                }
                return (
                  <div key={signal} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderRadius: 10, marginBottom: 4,
                    background: active ? C.sageLight : C.borderLight,
                    border: `1px solid ${active ? C.sage + '30' : 'transparent'}`,
                    transition: 'all 0.2s',
                  }}>
                    <span style={{ fontSize: 14 }}>{icons[signal] || '📊'}</span>
                    <span style={{
                      flex: 1, fontSize: 12, fontWeight: 500,
                      color: active ? C.sage : C.sand,
                    }}>
                      {labels[signal] || signal}
                    </span>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: active ? C.sage : C.sand + '40',
                    }} />
                  </div>
                )
              })}

              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 10,
                background: convergence.active >= 3 ? C.sageLight : C.amberLight,
                border: `1px solid ${convergence.active >= 3 ? C.sage + '20' : C.amber + '20'}`,
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 600,
                  color: convergence.active >= 3 ? C.sage : C.amber,
                }}>
                  {convergence.active >= 4 ? 'Strong convergence — multiple signals aligned'
                    : convergence.active >= 3 ? 'Good convergence — trend validated across sources'
                      : convergence.active >= 2 ? 'Partial convergence — needs more signal confirmation'
                        : 'Weak convergence — early stage signal'}
                </div>
              </div>
            </div>

            {/* Column 3: Risks + Actions */}
            <div>
              <h4 style={{
                fontSize: 12, fontWeight: 700, color: C.charcoal, textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <AlertTriangle style={{ width: 13, height: 13, color: C.amber }} />
                Risks & Actions
              </h4>

              {/* Risk indicators */}
              {risks.length > 0 ? risks.map((risk: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                  borderRadius: 10, marginBottom: 4,
                  background: risk.level === 'high' ? C.roseLight : C.amberLight,
                }}>
                  <AlertTriangle style={{
                    width: 12, height: 12,
                    color: risk.level === 'high' ? C.rose : C.amber,
                  }} />
                  <span style={{
                    fontSize: 11, color: risk.level === 'high' ? C.rose : C.amber,
                    fontWeight: 500,
                  }}>
                    {risk.detail}
                  </span>
                </div>
              )) : (
                <div style={{
                  padding: '8px 12px', borderRadius: 10, background: C.sageLight,
                  fontSize: 11, color: C.sage, fontWeight: 500, marginBottom: 8,
                }}>
                  No significant risks detected
                </div>
              )}

              {/* Action buttons */}
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onNavigate(topic.id) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                    borderRadius: 10, border: 'none', cursor: 'pointer', width: '100%',
                    background: C.coral, color: '#fff', fontSize: 12, fontWeight: 600,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = C.coralHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = C.coral)}
                >
                  <ExternalLink style={{ width: 13, height: 13 }} />
                  View Full Evidence Page
                </button>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <button
                    onClick={e => { e.stopPropagation(); isWatched ? onRemove(topic.id) : onAdd(topic.id) }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '8px', borderRadius: 8, border: `1px solid ${C.border}`,
                      cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      background: isWatched ? C.coralLight : C.card,
                      color: isWatched ? C.coral : C.stone,
                    }}
                  >
                    <Eye style={{ width: 12, height: 12 }} />
                    {isWatched ? 'Watching' : 'Watch'}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation() }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: '8px', borderRadius: 8, border: `1px solid ${C.border}`,
                      cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      background: C.card, color: C.stone,
                    }}
                  >
                    <Bell style={{ width: 12, height: 12 }} />
                    Set Alert
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


/* ─── Main Explorer Page ─── */
export default function ExplorerPage() {
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    category: 'All', stage: 'All', search: '', sort: '-opportunity_score', page: 1, page_size: 20,
  })
  const [exporting, setExporting] = useState(false)
  const [topics, setTopics] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, page_size: 20, total: 0, total_pages: 0 })
  const [loading, setLoading] = useState(true)

  // Fetch with explainability
  useEffect(() => {
    setLoading(true)
    const params: Record<string, any> = {
      sort: filters.sort, page: filters.page, page_size: filters.page_size,
      include_explainability: true,
    }
    if (filters.category !== 'All') params.category = filters.category
    if (filters.stage !== 'All') params.stage = filters.stage
    if (filters.search) params.search = filters.search

    api.get('/topics', { params })
      .then(r => {
        setTopics(r.data?.data || [])
        setPagination(r.data?.pagination || { page: 1, page_size: 20, total: 0, total_pages: 0 })
      })
      .catch(err => console.error('Explorer fetch failed:', err))
      .finally(() => setLoading(false))
  }, [filters])

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

  // Stage summary counts
  const stageCounts = topics.reduce((acc: Record<string, number>, t: any) => {
    acc[t.stage] = (acc[t.stage] || 0) + 1; return acc
  }, {})

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.ink,
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: '28px 36px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{
            fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.02em',
            color: C.charcoalDeep, fontFamily: "'Sora', sans-serif",
          }}>
            Trend Explorer
          </h1>
          <p style={{ color: C.stone, fontSize: 13, margin: '4px 0 0' }}>
            Discover and evaluate product opportunities with decision-grade intelligence
          </p>
        </div>
        <button onClick={handleExport} disabled={exporting} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
          background: C.coral, color: '#fff', border: 'none', borderRadius: 10,
          cursor: 'pointer', fontSize: 13, fontWeight: 600,
          opacity: exporting ? 0.6 : 1, transition: 'all 0.15s',
        }}>
          {exporting ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Download style={{ width: 14, height: 14 }} />}
          {exporting ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Opportunity Funnel (mini) */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 20, background: C.card,
        borderRadius: 12, padding: 4, border: `1px solid ${C.border}`,
        width: 'fit-content',
      }}>
        {STAGES.map(s => {
          const count = s === 'All' ? pagination.total : (stageCounts[s] || 0)
          const isActive = filters.stage === s
          return (
            <button key={s} onClick={() => setFilters({ ...filters, stage: s, page: 1 })} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
              background: isActive ? C.coral : 'transparent',
              color: isActive ? '#fff' : C.stone,
            }}>
              {s === 'All' ? 'All Stages' : s.charAt(0).toUpperCase() + s.slice(1)}
              <span style={{
                padding: '1px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                background: isActive ? 'rgba(255,255,255,0.25)' : C.borderLight,
                color: isActive ? '#fff' : C.sand,
              }}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Filters bar */}
      <div style={{
        display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center',
      }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: C.sand }} />
          <input
            type="text" placeholder="Search topics..."
            value={filters.search}
            onChange={e => setFilters({ ...filters, search: e.target.value, page: 1 })}
            style={{
              width: '100%', padding: '10px 12px 10px 36px', border: `1px solid ${C.border}`,
              borderRadius: 10, fontSize: 13, background: C.card, color: C.ink,
              outline: 'none', transition: 'border 0.15s',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          />
        </div>
        <select
          value={filters.category}
          onChange={e => setFilters({ ...filters, category: e.target.value, page: 1 })}
          style={{
            padding: '10px 14px', border: `1px solid ${C.border}`, borderRadius: 10,
            fontSize: 13, background: C.card, color: C.ink, cursor: 'pointer',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: C.stone }}>
          {pagination.total} topics found
        </div>
      </div>

      {/* Column Headers */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '40px 1.4fr 100px 100px 90px 90px 80px 90px 36px',
        alignItems: 'center',
        padding: '8px 16px',
        fontSize: 10, fontWeight: 700, color: C.stone,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        borderBottom: `1px solid ${C.border}`,
        marginBottom: 8,
      }}>
        <div></div>
        <div>Topic</div>
        <div>Stage</div>
        <div>Confidence</div>
        <div style={{ textAlign: 'center' }}>Trend</div>
        <div>Score</div>
        <div>Signals</div>
        <div>Timeline</div>
        <div></div>
      </div>

      {/* Decision Cards List */}
      {loading ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 60, color: C.coral,
        }}>
          <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite', marginRight: 8 }} />
          Loading trends...
        </div>
      ) : topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: C.sand, fontSize: 14 }}>
          No topics found matching your filters
        </div>
      ) : (
        topics.map((topic: any) => (
          <DecisionCard
            key={topic.id}
            topic={topic}
            watchlistIds={watchlistIds}
            onAdd={id => addMut.mutate(id)}
            onRemove={id => remMut.mutate(id)}
            onNavigate={id => navigate(`/topics/${id}`)}
          />
        ))
      )}

      {/* Pagination */}
      {pagination.total_pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 0', marginTop: 8,
        }}>
          <span style={{ fontSize: 12, color: C.stone }}>
            Showing {(pagination.page - 1) * pagination.page_size + 1}–
            {Math.min(pagination.page * pagination.page_size, pagination.total)} of {pagination.total}
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
              disabled={filters.page <= 1}
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.stone, opacity: filters.page <= 1 ? 0.3 : 1,
              }}
            >
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </button>
            <button
              onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
              disabled={filters.page >= pagination.total_pages}
              style={{
                width: 34, height: 34, borderRadius: 8, border: `1px solid ${C.border}`,
                background: C.card, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: C.stone, opacity: filters.page >= pagination.total_pages ? 0.3 : 1,
              }}
            >
              <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
          </div>
        </div>
      )}

      {/* CSS for spin animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
