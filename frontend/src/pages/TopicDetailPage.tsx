import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTopic, useTimeseries, useForecast, useCompetition, useReviewsSummary, useGenNextSpec, useAddToWatchlist } from '../hooks/useData'
import { socialApi, api } from '../lib/api'
import {
  ArrowLeft, Eye, TrendingUp, Shield, MessageSquare, Lightbulb,
  ChevronDown, ChevronUp, Info, Zap, AlertTriangle, Activity,
  Clock, Target, Beaker, Radio, Bell, ExternalLink, BookmarkCheck
} from 'lucide-react'
import { ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend, ReferenceLine } from 'recharts'

/* ─── NeuraNest Brand Palette ─── */
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

const COMPONENT_META: Record<string, { label: string; color: string; description: string }> = {
  demand_growth: { label: 'Demand Growth', color: C.coral, description: 'Search volume growth rate over recent weeks' },
  acceleration: { label: 'Acceleration', color: C.amber, description: 'Rate of change in growth — is momentum building?' },
  low_competition: { label: 'Low Competition', color: C.sage, description: 'Inverse of Amazon competition index' },
  cross_source: { label: 'Cross-Source', color: C.plum, description: 'Confirmation across Google Trends, Reddit, Amazon' },
  review_gap: { label: 'Review Gap', color: C.rose, description: 'Gap between demand and review quality/quantity' },
  forecast_uplift: { label: 'Forecast Uplift', color: '#D4930D', description: 'Prophet model predicts rising demand ahead' },
  geo_expansion: { label: 'Geo Expansion', color: C.charcoal, description: 'Interest spreading across multiple regions' },
}

const SIGNAL_META: Record<string, { label: string; emoji: string }> = {
  google_trends: { label: 'Google Trends', emoji: '📈' },
  reddit: { label: 'Reddit', emoji: '💬' },
  instagram: { label: 'Instagram/FB', emoji: '📸' },
  tiktok: { label: 'TikTok', emoji: '🎵' },
  science: { label: 'Science Papers', emoji: '🔬' },
  facebook: { label: 'Facebook', emoji: '👥' },
  bioRxiv: { label: 'Science Papers', emoji: '🔬' },
}

const ARCHETYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  'science-led': { icon: Beaker, label: 'Science-Led', color: C.plum },
  'social-led': { icon: Radio, label: 'Social-Led', color: C.coral },
  'problem-led': { icon: Target, label: 'Problem-Led', color: C.sage },
  'demand-led': { icon: TrendingUp, label: 'Demand-Led', color: C.amber },
  'unknown': { icon: Activity, label: 'Multi-Signal', color: C.stone },
}

/* ─── Shared Components ─── */
function StageBadge({ stage, size = 'md' }: { stage: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = STAGE_CONFIG[stage] || STAGE_CONFIG.unknown
  const sizes = { sm: { fs: 10, px: 8, py: 2, dot: 5 }, md: { fs: 12, px: 12, py: 4, dot: 6 }, lg: { fs: 14, px: 16, py: 5, dot: 8 } }
  const sz = sizes[size]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: `${sz.py}px ${sz.px}px`, borderRadius: 24,
      fontSize: sz.fs, fontWeight: 600, background: s.bg, color: s.text,
      textTransform: 'capitalize', letterSpacing: '0.03em',
    }}>
      <span style={{ width: sz.dot, height: sz.dot, borderRadius: '50%', background: s.dot }} />
      {s.label}
    </span>
  )
}

function SectionCard({ title, subtitle, icon, accentColor, children, noPadding }: {
  title: string; subtitle?: string; icon?: React.ReactNode; accentColor?: string; children: React.ReactNode; noPadding?: boolean;
}) {
  return (
    <div style={{
      background: C.card, borderRadius: 14, padding: noPadding ? 0 : 24,
      border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(42,37,32,0.04)',
      position: 'relative', overflow: 'hidden',
    }}>
      {accentColor && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${accentColor}, ${accentColor}60)` }} />
      )}
      <div style={{ padding: noPadding ? '20px 24px 0' : 0, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.charcoalDeep, fontFamily: "'Sora', sans-serif" }}>{title}</h3>
        </div>
        {subtitle && <p style={{ fontSize: 11, color: C.stone, margin: '4px 0 0' }}>{subtitle}</p>}
      </div>
      <div style={{ padding: noPadding ? '0 24px 24px' : 0 }}>{children}</div>
    </div>
  )
}

/* ─── Score Donut ─── */
function ScoreDonut({ score, label, size = 72, color }: { score: number; label: string; size?: number; color?: string }) {
  const c = color || (score >= 70 ? C.sage : score >= 40 ? C.amber : C.rose)
  const r = (size - 8) / 2
  const circumference = 2 * Math.PI * r
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={C.borderLight} strokeWidth="5" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth="5"
            strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
            strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size > 60 ? 18 : 14, fontWeight: 800, color: C.ink, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums',
        }}>
          {score.toFixed(0)}
        </div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 4 }}>
        {label}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════
   MAIN TOPIC DETAIL / EVIDENCE PAGE
   ═══════════════════════════════════════════════ */
export default function TopicDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('trend')
  const { data: topic, isLoading } = useTopic(id!)
  const addToWatchlist = useAddToWatchlist()

  // Fetch explainability data
  const [explainability, setExplainability] = useState<any>(null)
  useEffect(() => {
    if (!id) return
    api.get('/topics', { params: { search: '', page_size: 1, include_explainability: true } })
      .then(() => {
        // Fetch the single topic with explainability via the detail endpoint
        // The detail endpoint already returns explanation_json in latest_scores
      })
      .catch(() => { })
  }, [id])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
        <div style={{ color: C.coral, fontSize: 14 }}>Loading topic...</div>
      </div>
    )
  }
  if (!topic) {
    return (
      <div style={{ padding: 40, background: C.bg, minHeight: '100vh' }}>
        <div style={{ color: C.rose, fontSize: 14 }}>Topic not found</div>
      </div>
    )
  }

  const scores = topic.latest_scores || {}
  const opportunity = scores.opportunity || {}
  const competition = scores.competition || {}
  const demand = scores.demand || {}
  const explanation = opportunity.explanation || {}
  const components = explanation.components || {}
  const confidence = explanation.confidence || 'low'
  const dampenerApplied = explanation.dampener_applied || false

  // Derive convergence from explanation or scores
  const sortedComponents = Object.entries(components)
    .map(([key, comp]: [string, any]) => ({ key, ...comp }))
    .sort((a, b) => (b.contribution || 0) - (a.contribution || 0))

  const maxContribution = sortedComponents.length > 0 ? Math.max(...sortedComponents.map(c => c.contribution || 0)) : 1

  // Derive risk signals
  const compValue = competition.value || 50
  const risks: { type: string; level: string; detail: string }[] = []
  if (compValue > 70) risks.push({ type: 'competition', level: 'high', detail: `Competition index: ${compValue.toFixed(0)}/100 — crowded market` })
  if (topic.stage === 'peaking') risks.push({ type: 'lifecycle', level: 'medium', detail: 'Trend may be past peak growth phase' })
  if (topic.stage === 'declining') risks.push({ type: 'lifecycle', level: 'high', detail: 'Trend is in decline — high risk for new entrants' })
  if (dampenerApplied) risks.push({ type: 'data', level: 'medium', detail: 'Limited data available — score dampened ~15%' })
  if (confidence === 'low') risks.push({ type: 'confidence', level: 'medium', detail: 'Low confidence — fewer than 2 data sources' })

  // Time-to-peak
  const timeToPeak = topic.stage === 'emerging' ? '6–12 months' : topic.stage === 'exploding' ? '1–3 months' : topic.stage === 'peaking' ? 'At peak' : topic.stage === 'declining' ? 'Past peak' : 'Unknown'

  // Archetype (heuristic)
  const hasScience = sortedComponents.some(c => c.key === 'geo_expansion' && c.contribution > 3)
  const hasSocial = (components.cross_source?.sources_positive || 0) >= 2
  const hasReviewGap = (components.review_gap?.severity || 0) > 50
  const archetype = hasScience ? 'science-led' : hasSocial ? 'social-led' : hasReviewGap ? 'problem-led' : 'demand-led'
  const archetypeConfig = ARCHETYPE_CONFIG[archetype] || ARCHETYPE_CONFIG.unknown
  const ArchetypeIcon = archetypeConfig.icon

  const tabs = [
    { id: 'trend', label: 'Trend & Forecast', icon: TrendingUp },
    { id: 'competition', label: 'Competition', icon: Shield },
    { id: 'reviews', label: 'Review Intelligence', icon: MessageSquare },
    { id: 'social', label: 'Social Signals', icon: Zap },
    { id: 'gennext', label: 'Gen-Next Spec', icon: Lightbulb },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.ink,
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: '24px 36px',
    }}>
      {/* Back nav */}
      <button onClick={() => navigate(-1)} style={{
        display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: C.stone,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16,
      }}>
        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Explorer
      </button>

      {/* ═══ HERO HEADER ═══ */}
      <div style={{
        background: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
        padding: '28px 32px', marginBottom: 24,
        boxShadow: '0 2px 8px rgba(42,37,32,0.06)',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Top accent */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.coral}, ${C.sage})` }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          {/* Left: Name + badges */}
          <div>
            <h1 style={{
              fontSize: 28, fontWeight: 800, margin: 0, color: C.charcoalDeep,
              fontFamily: "'Sora', sans-serif", letterSpacing: '-0.03em',
            }}>
              {topic.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <StageBadge stage={topic.stage} size="md" />
              {topic.primary_category && (
                <span style={{ fontSize: 13, color: C.stone }}>{topic.primary_category}</span>
              )}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                color: archetypeConfig.color, padding: '3px 10px', borderRadius: 12,
                background: archetypeConfig.color + '12',
              }}>
                <ArchetypeIcon style={{ width: 11, height: 11 }} />
                {archetypeConfig.label}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600,
                color: confidence === 'high' ? C.sage : confidence === 'medium' ? C.amber : C.stone,
                padding: '3px 10px', borderRadius: 12,
                background: (confidence === 'high' ? C.sage : confidence === 'medium' ? C.amber : C.stone) + '12',
              }}>
                <Shield style={{ width: 10, height: 10 }} />
                {confidence.charAt(0).toUpperCase() + confidence.slice(1)} Confidence
              </span>
            </div>
          </div>

          {/* Right: Actions */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => addToWatchlist.mutate(id!)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              background: C.coral, color: '#fff', border: 'none', borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'background 0.15s',
            }}>
              <Eye style={{ width: 14, height: 14 }} /> Add to Watchlist
            </button>
            <button style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px',
              background: C.card, color: C.stone, border: `1px solid ${C.border}`, borderRadius: 10,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>
              <Bell style={{ width: 14, height: 14 }} /> Set Alert
            </button>
          </div>
        </div>

        {/* Score cards row */}
        <div style={{ display: 'flex', gap: 20, marginTop: 24, alignItems: 'center' }}>
          <ScoreDonut score={opportunity.value || 0} label="Opportunity" color={C.coral} size={80} />
          <ScoreDonut score={compValue} label="Competition" color={C.charcoal} size={64} />
          <ScoreDonut score={demand.value || 0} label="Demand" color={C.sage} size={64} />

          <div style={{ width: 1, height: 50, background: C.borderLight, margin: '0 8px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Clock style={{ width: 13, height: 13, color: C.stone }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.charcoal }}>Time to Peak</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
              {timeToPeak}
            </span>
          </div>

          <div style={{ width: 1, height: 50, background: C.borderLight, margin: '0 8px' }} />

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Activity style={{ width: 13, height: 13, color: C.stone }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: C.charcoal }}>Signals</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
              {components.cross_source?.total_sources || '—'}
            </span>
            <span style={{ fontSize: 11, color: C.stone, marginLeft: 4 }}>active sources</span>
          </div>
        </div>
      </div>

      {/* ═══ EVIDENCE PANEL (3-column) ═══ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

        {/* Col 1: Score Breakdown */}
        <SectionCard title="Opportunity Score Breakdown" icon={<Zap style={{ width: 14, height: 14, color: C.coral }} />} accentColor={C.coral}>
          {sortedComponents.length > 0 ? (
            <>
              {sortedComponents.map(comp => {
                const meta = COMPONENT_META[comp.key] || { label: comp.key.replace(/_/g, ' '), color: C.stone, description: '' }
                const pct = maxContribution > 0 ? ((comp.contribution || 0) / maxContribution) * 100 : 0
                return (
                  <div key={comp.key} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 500, color: C.slate }}>{meta.label}</span>
                        <span style={{ fontSize: 9, color: C.sand }}>({((comp.weight || 0) * 100).toFixed(0)}%)</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, fontFamily: "'JetBrains Mono', monospace" }}>
                        +{(comp.contribution || 0).toFixed(1)}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: C.borderLight, overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3,
                        background: meta.color, transition: 'width 0.4s ease', opacity: 0.8,
                      }} />
                    </div>
                    <div style={{ fontSize: 9, color: C.sand, marginTop: 2 }}>{meta.description}</div>
                  </div>
                )
              })}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.borderLight}`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: C.stone }}>{sortedComponents.length} weighted components</span>
                {dampenerApplied && (
                  <span style={{ fontSize: 10, fontWeight: 600, color: C.amber, padding: '2px 8px', borderRadius: 8, background: C.amberLight }}>
                    Dampener applied
                  </span>
                )}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: C.sand, fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
              Score breakdown will appear after the scoring pipeline runs
            </div>
          )}
        </SectionCard>

        {/* Col 2: Signal Convergence */}
        <SectionCard title="Signal Convergence" icon={<Activity style={{ width: 14, height: 14, color: C.sage }} />} accentColor={C.sage}>
          <SignalConvergencePanel topicId={id!} />
        </SectionCard>

        {/* Col 3: Risk Matrix */}
        <SectionCard title="Risk Assessment" icon={<AlertTriangle style={{ width: 14, height: 14, color: C.amber }} />} accentColor={C.amber}>
          {risks.length > 0 ? (
            risks.map((risk, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
                borderRadius: 10, marginBottom: 6,
                background: risk.level === 'high' ? C.roseLight : C.amberLight,
                border: `1px solid ${risk.level === 'high' ? C.rose + '20' : C.amber + '20'}`,
              }}>
                <AlertTriangle style={{
                  width: 14, height: 14, flexShrink: 0, marginTop: 1,
                  color: risk.level === 'high' ? C.rose : C.amber,
                }} />
                <div>
                  <div style={{
                    fontSize: 12, fontWeight: 600,
                    color: risk.level === 'high' ? C.rose : C.amber,
                    textTransform: 'capitalize',
                  }}>
                    {risk.type} Risk
                  </div>
                  <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{risk.detail}</div>
                </div>
              </div>
            ))
          ) : (
            <div style={{
              padding: '12px 14px', borderRadius: 10, background: C.sageLight,
              border: `1px solid ${C.sage}20`,
              fontSize: 12, color: C.sage, fontWeight: 500, textAlign: 'center',
            }}>
              No significant risks detected — strong opportunity profile
            </div>
          )}

          {/* Counter-evidence section */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.borderLight}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.charcoal, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              Counter-Evidence
            </div>
            {compValue > 60 && (
              <div style={{ fontSize: 11, color: C.slate, marginBottom: 4, display: 'flex', gap: 6 }}>
                <span style={{ color: C.rose }}>•</span>
                High competition ({compValue.toFixed(0)}) suggests established players dominate
              </div>
            )}
            {topic.stage === 'peaking' && (
              <div style={{ fontSize: 11, color: C.slate, marginBottom: 4, display: 'flex', gap: 6 }}>
                <span style={{ color: C.amber }}>•</span>
                Peaking stage — growth may slow from here
              </div>
            )}
            {dampenerApplied && (
              <div style={{ fontSize: 11, color: C.slate, marginBottom: 4, display: 'flex', gap: 6 }}>
                <span style={{ color: C.amber }}>•</span>
                Limited data history — predictions less reliable
              </div>
            )}
            {(!compValue || compValue <= 60) && topic.stage !== 'peaking' && !dampenerApplied && (
              <div style={{ fontSize: 11, color: C.sage, fontStyle: 'italic' }}>
                No strong counter-evidence found
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* ═══ TAB NAVIGATION ═══ */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 24, borderBottom: `1px solid ${C.border}`,
      }}>
        {tabs.map(tab => {
          const isActive = activeTab === tab.id
          const Icon = tab.icon
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px',
              fontSize: 13, fontWeight: isActive ? 600 : 500,
              color: isActive ? C.coral : C.stone,
              borderBottom: `2px solid ${isActive ? C.coral : 'transparent'}`,
              background: 'none', border: 'none', borderBottomStyle: 'solid',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <Icon style={{ width: 15, height: 15 }} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ═══ TAB CONTENT ═══ */}
      {activeTab === 'trend' && <TrendTab topicId={id!} />}
      {activeTab === 'competition' && <CompetitionTab topicId={id!} />}
      {activeTab === 'reviews' && <ReviewsTab topicId={id!} />}
      {activeTab === 'social' && <SocialSignalsTab topicId={id!} />}
      {activeTab === 'gennext' && <GenNextTab topicId={id!} />}
    </div>
  )
}


/* ─── Signal Convergence Panel ─── */
function SignalConvergencePanel({ topicId }: { topicId: string }) {
  const { data: ts } = useTimeseries(topicId)
  const sources = new Set((ts?.data || []).map((p: any) => p.source))

  const allSignals = [
    { key: 'google_trends', label: 'Google Trends', emoji: '📈', active: sources.has('google_trends') },
    { key: 'reddit', label: 'Reddit', emoji: '💬', active: sources.has('reddit') },
    { key: 'instagram', label: 'Instagram/FB', emoji: '📸', active: sources.has('instagram') || sources.has('facebook') },
    { key: 'tiktok', label: 'TikTok', emoji: '🎵', active: sources.has('tiktok') },
    { key: 'science', label: 'Science', emoji: '🔬', active: sources.has('science') || sources.has('bioRxiv') },
  ]

  const activeCount = allSignals.filter(s => s.active).length

  return (
    <>
      {allSignals.map(signal => (
        <div key={signal.key} style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
          borderRadius: 10, marginBottom: 4,
          background: signal.active ? C.sageLight : C.borderLight,
          border: `1px solid ${signal.active ? C.sage + '30' : 'transparent'}`,
        }}>
          <span style={{ fontSize: 16 }}>{signal.emoji}</span>
          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: signal.active ? C.sage : C.sand }}>
            {signal.label}
          </span>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: signal.active ? C.sage : C.sand + '40',
          }} />
        </div>
      ))}

      <div style={{
        marginTop: 12, padding: '10px 14px', borderRadius: 10,
        background: activeCount >= 3 ? C.sageLight : activeCount >= 2 ? C.amberLight : C.borderLight,
        border: `1px solid ${activeCount >= 3 ? C.sage + '20' : activeCount >= 2 ? C.amber + '20' : C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: i < activeCount ? C.coral : C.borderLight }} />
            ))}
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>
            {activeCount}/5
          </span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: activeCount >= 3 ? C.sage : activeCount >= 2 ? C.amber : C.stone }}>
          {activeCount >= 4 ? 'Strong convergence — high conviction signal'
            : activeCount >= 3 ? 'Good convergence — trend validated across sources'
              : activeCount >= 2 ? 'Partial convergence — monitor for confirmation'
                : activeCount === 1 ? 'Single source — early stage, needs validation'
                  : 'No signal data available yet'}
        </div>
      </div>
    </>
  )
}


/* ─── Trend Tab ─── */
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

  const historical = Object.entries(dateMap).sort(([a], [b]) => a.localeCompare(b)).map(([date, { sum, count, sources }]) => ({
    date, value: Math.round((sum / count) * 10) / 10,
    google: sources['google_trends'] || null, reddit: sources['reddit'] || null,
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
    ...(lastHistorical ? [{ date: lastHistorical.date, value: lastHistorical.value, google: null as number | null, reddit: null as number | null, yhat: lastHistorical.value, yhat_lower: lastHistorical.value, yhat_upper: lastHistorical.value }] : []),
    ...forecastData.map(f => ({ date: f.date, value: null as number | null, google: null as number | null, reddit: null as number | null, yhat: f.yhat, yhat_lower: f.yhat_lower, yhat_upper: f.yhat_upper })),
  ]

  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <SectionCard title="Search Interest Over Time" subtitle="Historical trend data with forecast projection" accentColor={C.coral}>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.borderLight} />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.stone }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11, fill: C.stone }} domain={[0, 'auto']} />
          <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="value" name="Actual (avg)" stroke={C.coral} fill={C.coralLight} strokeWidth={2} dot={false} connectNulls={false} />
          <Area type="monotone" dataKey="yhat_upper" name="Forecast CI" stroke="none" fill={C.coral} fillOpacity={0.08} dot={false} connectNulls={false} />
          <Area type="monotone" dataKey="yhat_lower" stroke="none" fill={C.card} fillOpacity={1} dot={false} connectNulls={false} />
          <Line type="monotone" dataKey="yhat" name="Forecast" stroke={C.coral} strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} />
          <ReferenceLine x={todayStr} stroke={C.sand} strokeDasharray="3 3" label={{ value: "Today", position: "top", fontSize: 11, fill: C.stone }} />
        </ComposedChart>
      </ResponsiveContainer>
      {forecast && (
        <p style={{ fontSize: 11, color: C.sand, marginTop: 8 }}>
          Forecast: {forecast.model_version} · {forecastData.length} points · Generated: {new Date(forecast.generated_at).toLocaleDateString()}
        </p>
      )}
    </SectionCard>
  )
}


/* ─── Competition Tab ─── */
function CompetitionTab({ topicId }: { topicId: string }) {
  const { data: comp } = useCompetition(topicId)
  if (!comp) return <div style={{ color: C.sand, padding: 20 }}>Loading competition data...</div>

  const metrics = [
    { label: 'Listings', value: comp.listing_count },
    { label: 'Median Price', value: comp.median_price ? `$${comp.median_price.toFixed(0)}` : '—' },
    { label: 'Median Reviews', value: comp.median_reviews },
    { label: 'Avg Rating', value: comp.avg_rating ? `${comp.avg_rating.toFixed(1)} ★` : '—' },
    { label: 'Brand Count', value: comp.brand_count },
    { label: 'Top 3 Share', value: comp.top3_brand_share ? `${(comp.top3_brand_share * 100).toFixed(0)}%` : '—' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12 }}>
        {metrics.map(m => (
          <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '16px 18px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{m.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.ink, marginTop: 4, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums' }}>{m.value ?? '—'}</div>
          </div>
        ))}
      </div>

      {comp.top_asins?.length > 0 && (
        <SectionCard title="Top Competing Products" subtitle={`${comp.top_asins.length} products analyzed`}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {comp.top_asins.map((a: any) => (
              <div key={a.asin} style={{
                display: 'flex', gap: 12, padding: '14px 16px', borderRadius: 10,
                border: `1px solid ${C.border}`, background: C.bg,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, lineClamp: 2, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>
                    {a.title || a.asin}
                  </div>
                  <div style={{ fontSize: 11, color: C.stone, marginTop: 4 }}>
                    {a.brand} · ${a.price} · {a.rating}★ · {a.review_count?.toLocaleString()} reviews
                  </div>
                </div>
                <span style={{ fontSize: 11, color: C.sand, fontWeight: 600 }}>#{a.rank}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  )
}


/* ─── Reviews Tab ─── */
function ReviewsTab({ topicId }: { topicId: string }) {
  const { data: reviews } = useReviewsSummary(topicId)
  if (!reviews) return <div style={{ color: C.sand, padding: 20 }}>Loading review insights...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 12, color: C.stone }}>
        Analyzed {reviews.total_reviews_analyzed?.toLocaleString()} reviews across {reviews.asins_covered} products
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="✓ Top Pros" accentColor={C.sage}>
          {reviews.pros.map((p: any, i: number) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < reviews.pros.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, textTransform: 'capitalize' }}>{p.aspect.replace('_', ' ')}</span>
                <span style={{ fontSize: 11, color: C.stone }}>{p.mention_count} mentions</span>
              </div>
              {p.sample && <p style={{ fontSize: 11, color: C.sand, marginTop: 3, fontStyle: 'italic' }}>"{p.sample}"</p>}
            </div>
          ))}
        </SectionCard>

        <SectionCard title="✗ Top Cons" accentColor={C.rose}>
          {reviews.cons.map((c: any, i: number) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < reviews.cons.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink, textTransform: 'capitalize' }}>{c.aspect.replace('_', ' ')}</span>
                <span style={{ fontSize: 11, color: C.stone }}>{c.mention_count} mentions</span>
              </div>
              {c.sample && <p style={{ fontSize: 11, color: C.sand, marginTop: 3, fontStyle: 'italic' }}>"{c.sample}"</p>}
            </div>
          ))}
        </SectionCard>
      </div>

      {reviews.top_pain_points?.length > 0 && (
        <SectionCard title="🔥 Top Pain Points">
          {reviews.top_pain_points.map((pp: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <div style={{ width: 80, height: 6, borderRadius: 3, background: C.borderLight, overflow: 'hidden', flexShrink: 0 }}>
                <div style={{ width: `${pp.severity}%`, height: '100%', borderRadius: 3, background: C.rose }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.ink, textTransform: 'capitalize', flex: 1 }}>
                {pp.aspect.replace('_', ' ')}
              </span>
              <span style={{ fontSize: 11, color: C.stone }}>{pp.evidence}</span>
            </div>
          ))}
        </SectionCard>
      )}
    </div>
  )
}


/* ─── Gen-Next Spec Tab ─── */
function GenNextTab({ topicId }: { topicId: string }) {
  const { data: spec, isLoading, error } = useGenNextSpec(topicId)
  if (isLoading) return <div style={{ color: C.sand, padding: 20 }}>Loading Gen-Next spec...</div>
  if (error) return (
    <SectionCard title="Gen-Next Product Specification">
      <div style={{ textAlign: 'center', padding: 20, color: C.stone, fontSize: 13 }}>
        Gen-Next spec not available. Upgrade to Pro for AI-generated product specifications.
      </div>
    </SectionCard>
  )
  if (!spec) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 11, color: C.sand }}>
        Version {spec.version} · Generated {new Date(spec.generated_at).toLocaleDateString()} · Model: {spec.model_used}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SectionCard title="🔧 Must Fix" accentColor={C.rose}>
          {spec.must_fix.map((item: any, i: number) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < spec.must_fix.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                  background: item.severity === 'critical' ? C.roseLight : C.amberLight,
                  color: item.severity === 'critical' ? C.rose : C.amber,
                }}>{item.severity}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{item.issue}</span>
              </div>
              <p style={{ fontSize: 11, color: C.stone, marginTop: 3 }}>{item.evidence}</p>
            </div>
          ))}
        </SectionCard>

        <SectionCard title="✨ Must Add" accentColor={C.sage}>
          {spec.must_add.map((item: any, i: number) => (
            <div key={i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: i < spec.must_add.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: C.coralLight, color: C.coral }}>
                  P{item.priority}
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{item.feature}</span>
              </div>
              <p style={{ fontSize: 11, color: C.stone, marginTop: 3 }}>{item.demand_signal}</p>
            </div>
          ))}
        </SectionCard>
      </div>

      <SectionCard title="💡 Differentiators" accentColor={C.plum}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {spec.differentiators.map((d: any, i: number) => (
            <div key={i} style={{ padding: '14px 16px', borderRadius: 10, background: C.plumLight }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{d.idea}</div>
              <div style={{ fontSize: 11, color: C.stone, marginTop: 3 }}>{d.rationale}</div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="🎯 Positioning">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
          {spec.positioning.target_price && (
            <div>
              <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600 }}>Target Price</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>${spec.positioning.target_price}</div>
            </div>
          )}
          {spec.positioning.target_rating && (
            <div>
              <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600 }}>Target Rating</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: C.amber, fontFamily: "'Inter', sans-serif", fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{spec.positioning.target_rating} ★</div>
            </div>
          )}
          {spec.positioning.tagline && (
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600 }}>Tagline</div>
              <div style={{ fontSize: 16, fontWeight: 600, fontStyle: 'italic', color: C.ink, marginTop: 4 }}>"{spec.positioning.tagline}"</div>
            </div>
          )}
          {spec.positioning.target_demographic && (
            <div style={{ gridColumn: 'span 4' }}>
              <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600 }}>Target Demographic</div>
              <div style={{ fontSize: 13, color: C.ink, marginTop: 4 }}>{spec.positioning.target_demographic}</div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}


/* ─── Social Signals Tab ─── */
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

  if (loading) return <div style={{ color: C.sand, padding: 20, textAlign: 'center' }}>Loading social signals...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {signals && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[
            { label: 'Instagram', value: signals.instagram_posts, sub: `${signals.instagram_engagement?.toLocaleString()} engagement`, color: '#E1306C' },
            { label: 'TikTok', value: signals.tiktok_videos, sub: `${signals.tiktok_views?.toLocaleString()} views`, color: '#00f2ea' },
            { label: 'Reddit', value: signals.reddit_mentions, sub: 'mentions', color: '#FF4500' },
            { label: 'Brand Mentions', value: signals.total_brand_mentions, sub: signals.avg_mention_sentiment > 0 ? `↑ ${(signals.avg_mention_sentiment * 100).toFixed(0)}% sentiment` : `↓ ${Math.abs(signals.avg_mention_sentiment * 100).toFixed(0)}% sentiment`, color: C.charcoal },
          ].map(m => (
            <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '18px 20px', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{m.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: m.color, marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
              <div style={{ fontSize: 10, color: C.sand, marginTop: 2 }}>{m.sub}</div>
            </div>
          ))}
        </div>
      )}

      <SectionCard title="Complaint Themes" subtitle={`${complaints.length} clusters detected`} icon={<AlertTriangle style={{ width: 14, height: 14, color: C.rose }} />} accentColor={C.rose}>
        {complaints.length > 0 ? complaints.map((c: any) => (
          <div key={c.cluster_id} style={{
            padding: '12px 14px', borderRadius: 10, marginBottom: 6,
            background: C.roseLight, borderLeft: `3px solid ${C.rose}`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{c.label}</span>
              <span style={{ fontSize: 11, color: C.stone }}>{c.size} mentions</span>
            </div>
            {c.representative_texts?.slice(0, 2).map((text: string, i: number) => (
              <p key={i} style={{ fontSize: 11, color: C.slate, fontStyle: 'italic', marginTop: 2 }}>"{text}"</p>
            ))}
          </div>
        )) : (
          <div style={{ fontSize: 12, color: C.sand, textAlign: 'center', padding: 16 }}>
            No complaint clusters found — data will appear after NLP pipeline runs
          </div>
        )}
      </SectionCard>

      <SectionCard title="Feature Requests" subtitle={`${featureRequests.length} requests detected`} icon={<Lightbulb style={{ width: 14, height: 14, color: C.plum }} />} accentColor={C.plum}>
        {featureRequests.length > 0 ? featureRequests.map((fr: any) => (
          <div key={fr.id} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px',
            borderRadius: 10, marginBottom: 4, background: C.plumLight,
          }}>
            <Lightbulb style={{ width: 14, height: 14, color: C.plum, marginTop: 2, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{fr.aspect}</div>
              {fr.evidence && <p style={{ fontSize: 11, color: C.slate, marginTop: 2, fontStyle: 'italic' }}>"{fr.evidence}"</p>}
            </div>
            {fr.review_stars && (
              <span style={{ fontSize: 11, color: C.amber, flexShrink: 0 }}>
                {'★'.repeat(fr.review_stars)}{'☆'.repeat(5 - fr.review_stars)}
              </span>
            )}
          </div>
        )) : (
          <div style={{ fontSize: 12, color: C.sand, textAlign: 'center', padding: 16 }}>
            No feature requests detected yet
          </div>
        )}
      </SectionCard>
    </div>
  )
}
