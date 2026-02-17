import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = 'http://localhost:8000/api/v1';

/* ─── Types ─── */
interface DashboardSummary {
  total_topics: number;
  avg_opportunity_score: number;
  data_points_tracked: number;
  categories: { name: string; count: number }[];
  stages: { stage: string; count: number }[];
  top_movers: TopicScore[];
  low_competition: TopicScore[];
}

interface TopicScore {
  id: string; name: string; slug: string;
  primary_category?: string; category?: string; stage: string;
  opportunity_score?: number; competition_score?: number;
  score?: number; opportunity?: number; competition?: number;
  sparkline?: number[];
}

interface TopicItem {
  id: string; name: string; slug: string; primary_category: string; stage: string;
  opportunity_score?: number; competition_index?: number;
  latest_scores?: { opportunity?: number; competition?: number };
  sparkline?: number[];
}

interface DailyIntelligence {
  rising: ScoreDelta[];
  falling: ScoreDelta[];
  exploding_topics: { id: string; name: string; category: string; score: number }[];
  category_momentum: { category: string; avg_score: number; topic_count: number }[];
  funnel: { signal: number; emerging: number; exploding: number; peaking: number };
}

interface ScoreDelta {
  id: string; name: string; stage: string; category: string;
  current_score: number; prev_score: number; delta: number;
}

/* ─── Warm palette ─── */
const C = {
  bg: '#F9F7F4',
  card: '#FFFFFF',
  border: '#E6E1DA',
  borderLight: '#F0ECE6',
  coral: '#E8714A',
  coralHover: '#D4623D',
  coralLight: '#FCEEE8',
  coralUltraLight: '#FFF6F3',
  sage: '#1A8754',
  sageLight: '#E8F5EE',
  amber: '#D4930D',
  amberLight: '#FFF8E6',
  rose: '#C0392B',
  roseLight: '#FFF0F0',
  plum: '#7C3AED',
  plumLight: '#F3EEFF',
  charcoal: '#2D3E50',
  charcoalDeep: '#1A2A3A',
  ink: '#2A2520',
  slate: '#5C5549',
  stone: '#8B8479',
  sand: '#B8B2A8',
};

const STAGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  emerging:  { bg: '#E8F5EE', text: '#1A8754', dot: '#1A8754' },
  exploding: { bg: '#FCEEE8', text: '#E8714A', dot: '#E8714A' },
  peaking:   { bg: '#FFF8E6', text: '#D4930D', dot: '#D4930D' },
  declining: { bg: '#FFF0F0', text: '#C0392B', dot: '#C0392B' },
  unknown:   { bg: '#F0ECE6', text: '#8B8479', dot: '#8B8479' },
  stable:    { bg: '#F3EEFF', text: '#7C3AED', dot: '#7C3AED' },
};

const CATEGORY_COLORS = [
  '#E8714A', '#1A8754', '#7C3AED', '#D4930D', '#2D3E50',
  '#C0392B', '#425B73', '#B8502F', '#136B42', '#6025C7',
];

/* ─── Shared Sub-components ─── */

function Sparkline({ data, color = '#1A8754', width = 80, height = 28 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${points} ${width},${height}`} fill={`url(#sg-${color.replace('#','')})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StageBadge({ stage }: { stage: string }) {
  const s = STAGE_COLORS[stage] || STAGE_COLORS.unknown;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.text, textTransform: 'capitalize', letterSpacing: '0.3px',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.dot }} />
      {stage}
    </span>
  );
}

function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div style={{
      background: C.card, borderRadius: 14, padding: '20px 24px',
      border: `1px solid ${C.border}`, flex: 1, minWidth: 180,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(42,37,32,0.06)',
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: color, opacity: 0.08,
      }} />
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 11, color: C.stone, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: C.charcoalDeep, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.sand, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120, paddingTop: 10 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.charcoalDeep, marginBottom: 4 }}>{d.value}</span>
          <div style={{
            width: '100%', maxWidth: 48,
            height: Math.max(4, (d.value / max) * 90),
            background: colors[i % colors.length],
            borderRadius: '6px 6px 2px 2px', transition: 'height 0.4s ease', opacity: 0.85,
          }} />
          <span style={{ fontSize: 10, color: C.stone, marginTop: 6, textAlign: 'center', textTransform: 'capitalize' }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function TopicRow({ rank, topic, metric, metricLabel, metricColor, onClick }: {
  rank: number; topic: TopicScore; metric: number; metricLabel: string; metricColor: string; onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
        borderBottom: `1px solid ${C.borderLight}`,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background 0.1s',
      }}
    >
      <span style={{
        width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: C.borderLight, color: C.stone, fontSize: 11, fontWeight: 700,
      }}>{rank}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{topic.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
          <StageBadge stage={topic.stage} />
          <span style={{ fontSize: 11, color: C.sand }}>{topic.category || topic.primary_category}</span>
        </div>
      </div>
      {topic.sparkline && <Sparkline data={topic.sparkline} color={metricColor} width={64} height={24} />}
      <div style={{ textAlign: 'right', minWidth: 50 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: metricColor, fontFamily: "'JetBrains Mono', monospace" }}>
          {metric.toFixed(1)}
        </div>
        <div style={{ fontSize: 9, color: C.sand, textTransform: 'uppercase' }}>{metricLabel}</div>
      </div>
    </div>
  );
}

/* ─── NEW: Opportunity Funnel ─── */
function OpportunityFunnel({ funnel }: { funnel: DailyIntelligence['funnel'] }) {
  const steps = [
    { key: 'signal', label: 'Signal', count: funnel.signal, color: C.stone, emoji: '📡' },
    { key: 'emerging', label: 'Emerging', count: funnel.emerging, color: C.sage, emoji: '🌱' },
    { key: 'exploding', label: 'Exploding', count: funnel.exploding, color: C.coral, emoji: '🚀' },
    { key: 'peaking', label: 'Peaking', count: funnel.peaking, color: C.amber, emoji: '⭐' },
  ];
  const maxCount = Math.max(...steps.map(s => s.count), 1);

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, padding: '10px 0' }}>
      {steps.map((step, i) => {
        const barH = Math.max(20, (step.count / maxCount) * 110);
        // Funnel narrowing: wider on left, narrower on right
        const barW = 100 - i * 12;
        return (
          <div key={step.key} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 4,
          }}>
            <span style={{ fontSize: 10, marginBottom: 2 }}>{step.emoji}</span>
            <span style={{
              fontSize: 16, fontWeight: 700, color: step.color,
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              {step.count}
            </span>
            <div style={{
              width: `${barW}%`, height: barH, borderRadius: '8px 8px 4px 4px',
              background: `linear-gradient(180deg, ${step.color}20 0%, ${step.color}50 100%)`,
              border: `2px solid ${step.color}40`,
              transition: 'height 0.4s ease',
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                height: '60%', borderRadius: '0 0 2px 2px',
                background: `linear-gradient(180deg, transparent, ${step.color}30)`,
              }} />
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, color: step.color,
              textTransform: 'uppercase', letterSpacing: '0.03em',
            }}>
              {step.label}
            </span>
            {i < steps.length - 1 && (
              <div style={{
                position: 'absolute', right: -8, top: '50%',
                color: C.sand, fontSize: 12,
              }}>→</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── NEW: Score Delta Row ─── */
function DeltaRow({ item, onClick }: { item: ScoreDelta; onClick?: () => void }) {
  const isUp = item.delta > 0;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
        borderRadius: 10, marginBottom: 4, cursor: onClick ? 'pointer' : 'default',
        background: isUp ? C.sageLight + '80' : C.roseLight + '80',
        border: `1px solid ${isUp ? C.sage + '20' : C.rose + '20'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{
        width: 28, height: 28, borderRadius: 8,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: isUp ? C.sage + '18' : C.rose + '18',
        fontSize: 14,
      }}>
        {isUp ? '↑' : '↓'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.name}
        </div>
        <div style={{ fontSize: 10, color: C.stone, marginTop: 1 }}>{item.category}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{
          fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
          color: isUp ? C.sage : C.rose,
        }}>
          {isUp ? '+' : ''}{item.delta.toFixed(1)}
        </div>
        <div style={{ fontSize: 9, color: C.sand }}>
          {item.prev_score.toFixed(0)} → {item.current_score.toFixed(0)}
        </div>
      </div>
    </div>
  );
}

/* ─── NEW: Category Momentum Bar ─── */
function CategoryMomentumBar({ category, avg_score, topic_count, maxScore, color }: {
  category: string; avg_score: number; topic_count: number; maxScore: number; color: string;
}) {
  const pct = maxScore > 0 ? (avg_score / maxScore) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 12, color: C.slate, width: 110, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {category}
      </span>
      <div style={{ flex: 1, height: 8, borderRadius: 4, background: C.borderLight, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 4,
          background: `linear-gradient(90deg, ${color}90, ${color})`,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{
        fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: "'JetBrains Mono', monospace",
        width: 36, textAlign: 'right',
      }}>
        {avg_score.toFixed(1)}
      </span>
      <span style={{ fontSize: 10, color: C.sand, width: 40, textAlign: 'right' }}>
        {topic_count}t
      </span>
    </div>
  );
}

/* ─── Section Card wrapper ─── */
function SectionCard({ title, subtitle, children, accentColor }: {
  title: string; subtitle?: string; children: React.ReactNode; accentColor?: string;
}) {
  return (
    <div style={{
      background: C.card, borderRadius: 14, padding: 24,
      border: `1px solid ${C.border}`,
      boxShadow: '0 1px 3px rgba(42,37,32,0.04)',
      position: 'relative', overflow: 'hidden',
    }}>
      {accentColor && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, ${accentColor}, ${accentColor}60)`,
        }} />
      )}
      <div style={{ marginBottom: 16 }}>
        <h3 style={{
          fontSize: 15, fontWeight: 600, margin: 0, color: C.charcoalDeep,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>{title}</h3>
        {subtitle && (
          <p style={{ fontSize: 11, color: C.stone, margin: '4px 0 0' }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}


/* ═══════════════════════════════════════════════
   MAIN DASHBOARD PAGE
   ═══════════════════════════════════════════════ */
export default function DashboardPage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [allTopics, setAllTopics] = useState<TopicItem[]>([]);
  const [dailyIntel, setDailyIntel] = useState<DailyIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'intelligence' | 'overview' | 'categories'>('intelligence');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('access_token') || '';
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch(`${API_BASE}/dashboard`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/topics?page_size=100`, { headers }).then(r => r.json()).catch(() => null),
    ]).then(([dash, topics]) => {
      if (dash && dash.summary) {
        const s = dash.summary;
        if (s.stages && !Array.isArray(s.stages)) {
          s.stages = Object.entries(s.stages).map(([stage, count]) => ({ stage, count: count as number }));
        }
        s.categories = (dash.categories || []).map((c: any) => ({ name: c.category || c.name, count: c.count }));
        s.top_movers = (dash.top_movers || []).map((t: any) => ({
          ...t, opportunity_score: t.score || t.opportunity_score || 0,
          primary_category: t.category || t.primary_category,
        }));
        s.low_competition = (dash.low_competition_opportunities || []).map((t: any) => ({
          ...t, opportunity_score: t.opportunity || t.opportunity_score || 0,
          competition_score: t.competition || t.competition_score || 0,
        }));
        setSummary(s);

        // Parse daily intelligence
        if (dash.daily_intelligence) {
          setDailyIntel(dash.daily_intelligence);
        }
      }
      if (topics?.data) setAllTopics(topics.data);
      setLoading(false);
    });
  }, []);

  const categoryData = useMemo(() => {
    if (!summary?.categories) return [];
    return summary.categories.sort((a, b) => b.count - a.count).map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [summary]);

  const stageData = useMemo(() => {
    if (!summary?.stages) return [];
    const order = ['emerging', 'exploding', 'peaking', 'declining', 'unknown', 'stable'];
    return order.map(s => summary.stages.find(st => st.stage === s)).filter(Boolean) as { stage: string; count: number }[];
  }, [summary]);

  const filteredTopics = useMemo(() => {
    let topics = allTopics;
    if (activeCategory) topics = topics.filter(t => t.primary_category === activeCategory);
    if (activeStage) topics = topics.filter(t => t.stage === activeStage);
    return topics;
  }, [allTopics, activeCategory, activeStage]);

  const emergingGems = useMemo(() => {
    return allTopics
      .filter(t => t.stage === 'emerging' && (t.opportunity_score || t.latest_scores?.opportunity || 0) > 40)
      .sort((a, b) => (b.opportunity_score || b.latest_scores?.opportunity || 0) - (a.opportunity_score || a.latest_scores?.opportunity || 0))
      .slice(0, 8);
  }, [allTopics]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}>
        <div style={{ color: C.coral, fontSize: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Loading dashboard...</div>
      </div>
    );
  }

  // Funnel defaults
  const funnel = dailyIntel?.funnel || { signal: 0, emerging: 0, exploding: 0, peaking: 0 };
  const catMomentum = dailyIntel?.category_momentum || [];
  const maxCatScore = catMomentum.length > 0 ? Math.max(...catMomentum.map(c => c.avg_score)) : 1;

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.ink,
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      padding: '28px 36px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 30, fontWeight: 400, margin: 0, letterSpacing: '-0.02em',
          color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif",
        }}>
          Trend Intelligence
        </h1>
        <p style={{ color: C.stone, fontSize: 13, margin: '6px 0 0' }}>
          {summary?.total_topics || 0} topics tracked across {categoryData.length} categories
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard icon="📊" label="Topics Tracked" value={summary?.total_topics || 0} color={C.coral} />
        <StatCard icon="🎯" label="Avg Opportunity" value={(summary?.avg_opportunity_score || 0).toFixed(1)} color={C.sage} />
        <StatCard icon="🚀" label="Emerging" value={stageData.find(s => s.stage === 'emerging')?.count || 0}
          sub={`${stageData.find(s => s.stage === 'exploding')?.count || 0} exploding`} color={C.coral} />
        <StatCard icon="📈" label="Data Points" value={(summary?.data_points_tracked || 0).toLocaleString()} color={C.charcoal} />
      </div>

      {/* View Mode Tabs */}
      <div style={{
        display: 'flex', gap: 3, marginBottom: 24, background: C.card,
        borderRadius: 10, padding: 3, width: 'fit-content', border: `1px solid ${C.border}`,
      }}>
        {(['intelligence', 'overview', 'categories'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            background: viewMode === v ? C.coral : 'transparent',
            color: viewMode === v ? '#fff' : C.stone,
            transition: 'all 0.2s',
          }}>
            {v === 'intelligence' ? '⚡ Intelligence' : v === 'overview' ? 'Overview' : 'Categories'}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════
          TAB 1: DAILY INTELLIGENCE (NEW!)
          ═══════════════════════════════════════ */}
      {viewMode === 'intelligence' && (
        <>
          {/* Row 1: Opportunity Funnel + Category Momentum */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <SectionCard title="Opportunity Funnel" subtitle="Topics flowing through the trend lifecycle" accentColor={C.coral}>
              <OpportunityFunnel funnel={funnel} />
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8,
                padding: '10px 0', borderTop: `1px solid ${C.borderLight}`,
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.coral, fontFamily: "'JetBrains Mono', monospace" }}>
                    {funnel.emerging + funnel.exploding}
                  </div>
                  <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Active Opportunities
                  </div>
                </div>
                <div style={{ width: 1, background: C.borderLight }} />
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.sage, fontFamily: "'JetBrains Mono', monospace" }}>
                    {summary?.total_topics || 0}
                  </div>
                  <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Total Pipeline
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Category Momentum" subtitle="Average opportunity score by category" accentColor={C.sage}>
              {catMomentum.length > 0 ? (
                catMomentum.map((cat, i) => (
                  <CategoryMomentumBar
                    key={cat.category}
                    category={cat.category}
                    avg_score={cat.avg_score}
                    topic_count={cat.topic_count}
                    maxScore={maxCatScore}
                    color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  />
                ))
              ) : (
                <div style={{ fontSize: 12, color: C.sand, fontStyle: 'italic', padding: 20, textAlign: 'center' }}>
                  Category momentum data will appear after scoring runs
                </div>
              )}
            </SectionCard>
          </div>

          {/* Row 2: Rising + Falling + Exploding */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
            <SectionCard title="📈 Rising Scores" subtitle="Biggest score increases" accentColor={C.sage}>
              {(dailyIntel?.rising || []).length > 0 ? (
                dailyIntel!.rising.map(item => (
                  <DeltaRow key={item.id} item={item} onClick={() => navigate(`/topics/${item.id}`)} />
                ))
              ) : (
                <div style={{ fontSize: 12, color: C.sand, fontStyle: 'italic', padding: 16, textAlign: 'center' }}>
                  Score changes will appear after multiple scoring cycles
                </div>
              )}
            </SectionCard>

            <SectionCard title="📉 Declining Scores" subtitle="Topics losing momentum" accentColor={C.rose}>
              {(dailyIntel?.falling || []).length > 0 ? (
                dailyIntel!.falling.map(item => (
                  <DeltaRow key={item.id} item={item} onClick={() => navigate(`/topics/${item.id}`)} />
                ))
              ) : (
                <div style={{ fontSize: 12, color: C.sand, fontStyle: 'italic', padding: 16, textAlign: 'center' }}>
                  Score changes will appear after multiple scoring cycles
                </div>
              )}
            </SectionCard>

            <SectionCard title="🚀 Exploding Now" subtitle="Highest-scoring explosive trends" accentColor={C.coral}>
              {(dailyIntel?.exploding_topics || []).length > 0 ? (
                dailyIntel!.exploding_topics.map((item, i) => (
                  <div
                    key={item.id}
                    onClick={() => navigate(`/topics/${item.id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      borderRadius: 10, marginBottom: 4, cursor: 'pointer',
                      background: C.coralUltraLight, border: `1px solid ${C.coral}20`,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{
                      width: 24, height: 24, borderRadius: 6, display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      background: C.coralLight, color: C.coral, fontSize: 11, fontWeight: 700,
                    }}>
                      {i + 1}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: 10, color: C.stone }}>{item.category}</div>
                    </div>
                    <div style={{
                      fontSize: 16, fontWeight: 700, color: C.coral,
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {item.score.toFixed(1)}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, color: C.sand, fontStyle: 'italic', padding: 16, textAlign: 'center' }}>
                  No exploding topics detected yet
                </div>
              )}
            </SectionCard>
          </div>

          {/* Row 3: Existing Top Movers + Low Competition + Emerging Gems */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <SectionCard title="Top Movers" subtitle="Highest opportunity scores">
              {(summary?.top_movers || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t} metric={t.opportunity_score || t.score || 0}
                  metricLabel="score" metricColor={C.sage}
                  onClick={() => navigate(`/topics/${t.id}`)} />
              ))}
            </SectionCard>
            <SectionCard title="Low Competition" subtitle="High opportunity, low competition">
              {(summary?.low_competition || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t} metric={t.competition_score || t.competition || 0}
                  metricLabel="comp" metricColor={C.charcoal}
                  onClick={() => navigate(`/topics/${t.id}`)} />
              ))}
            </SectionCard>
            <SectionCard title="Emerging Gems" subtitle="Early-stage high-potential topics">
              {emergingGems.slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1}
                  topic={{
                    id: t.id, name: t.name, slug: t.slug,
                    primary_category: t.primary_category, stage: t.stage,
                    opportunity_score: t.opportunity_score || t.latest_scores?.opportunity || 0,
                    competition_score: t.competition_index || t.latest_scores?.competition || 0,
                    sparkline: t.sparkline,
                  }}
                  metric={t.opportunity_score || t.latest_scores?.opportunity || 0}
                  metricLabel="opp" metricColor={C.coral}
                  onClick={() => navigate(`/topics/${t.id}`)} />
              ))}
            </SectionCard>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          TAB 2: OVERVIEW (preserved from before)
          ═══════════════════════════════════════ */}
      {viewMode === 'overview' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <SectionCard title="Topics by Stage">
              <BarChart data={stageData.map(s => ({ label: s.stage, value: s.count }))} colors={stageData.map(s => STAGE_COLORS[s.stage]?.dot || '#8B8479')} />
            </SectionCard>
            <SectionCard title="Category Momentum" subtitle="Ranked by average opportunity score" accentColor={C.sage}>
              {catMomentum.length > 0 ? (
                catMomentum.map((cat, i) => (
                  <CategoryMomentumBar
                    key={cat.category}
                    category={cat.category}
                    avg_score={cat.avg_score}
                    topic_count={cat.topic_count}
                    maxScore={maxCatScore}
                    color={CATEGORY_COLORS[i % CATEGORY_COLORS.length]}
                  />
                ))
              ) : (
                categoryData.slice(0, 8).map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                    <span style={{ flex: 1, fontSize: 12, color: C.slate }}>{c.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{c.count}</span>
                  </div>
                ))
              )}
            </SectionCard>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <SectionCard title="Top Movers">
              {(summary?.top_movers || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t} metric={t.opportunity_score || t.score || 0}
                  metricLabel="score" metricColor={C.sage}
                  onClick={() => navigate(`/topics/${t.id}`)} />
              ))}
            </SectionCard>
            <SectionCard title="Low Competition">
              {(summary?.low_competition || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t} metric={t.competition_score || t.competition || 0}
                  metricLabel="comp" metricColor={C.charcoal}
                  onClick={() => navigate(`/topics/${t.id}`)} />
              ))}
            </SectionCard>
            <SectionCard title="Emerging Gems">
              {emergingGems.slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1}
                  topic={{
                    id: t.id, name: t.name, slug: t.slug,
                    primary_category: t.primary_category, stage: t.stage,
                    opportunity_score: t.opportunity_score || t.latest_scores?.opportunity || 0,
                    competition_score: t.competition_index || t.latest_scores?.competition || 0,
                    sparkline: t.sparkline,
                  }}
                  metric={t.opportunity_score || t.latest_scores?.opportunity || 0}
                  metricLabel="opp" metricColor={C.coral}
                  onClick={() => navigate(`/topics/${t.id}`)} />
              ))}
            </SectionCard>
          </div>
        </>
      )}

      {/* ═══════════════════════════════════════
          TAB 3: CATEGORIES (preserved from before)
          ═══════════════════════════════════════ */}
      {viewMode === 'categories' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            <button onClick={() => { setActiveCategory(null); setActiveStage(null); }} style={{
              padding: '8px 16px', borderRadius: 24,
              background: !activeCategory ? C.coralLight : C.card,
              border: `1px solid ${!activeCategory ? C.coral : C.border}`,
              color: !activeCategory ? C.coral : C.stone,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>All</button>
            {categoryData.map((c, i) => (
              <button key={i} onClick={() => setActiveCategory(activeCategory === c.name ? null : c.name)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '8px 16px', borderRadius: 24,
                background: activeCategory === c.name ? c.color + '14' : C.card,
                border: `1px solid ${activeCategory === c.name ? c.color : C.border}`,
                color: activeCategory === c.name ? c.color : C.stone,
                cursor: 'pointer', fontSize: 13, fontWeight: 500,
              }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.color }} />
                {c.name}
                <span style={{
                  padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                  background: activeCategory === c.name ? c.color + '22' : C.borderLight,
                  color: activeCategory === c.name ? c.color : C.stone,
                }}>{c.count}</span>
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
            {['emerging', 'exploding', 'peaking', 'declining', 'unknown'].map(s => (
              <button key={s} onClick={() => setActiveStage(activeStage === s ? null : s)} style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                background: activeStage === s ? STAGE_COLORS[s].bg : 'transparent',
                color: activeStage === s ? STAGE_COLORS[s].text : C.sand,
                transition: 'all 0.2s',
              }}>{s}</button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: C.stone, marginBottom: 16 }}>
            Showing {filteredTopics.length} topics
            {activeCategory && <> in <strong style={{ color: C.ink }}>{activeCategory}</strong></>}
            {activeStage && <> • <strong style={{ color: STAGE_COLORS[activeStage]?.text }}>{activeStage}</strong></>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filteredTopics.slice(0, 50).map(t => (
              <div key={t.id} onClick={() => navigate(`/topics/${t.id}`)} style={{
                background: C.card, borderRadius: 12, padding: '16px 18px',
                border: `1px solid ${C.border}`, cursor: 'pointer', transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: C.sand, marginTop: 2 }}>{t.primary_category}</div>
                  </div>
                  <StageBadge stage={t.stage} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  {t.sparkline && <Sparkline data={t.sparkline} width={100} height={28} />}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.sage, fontFamily: "'JetBrains Mono', monospace" }}>
                      {(t.opportunity_score || t.latest_scores?.opportunity || 0).toFixed(1)}
                    </div>
                    <div style={{ fontSize: 9, color: C.sand, textTransform: 'uppercase' }}>opportunity</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredTopics.length > 50 && (
            <div style={{ textAlign: 'center', padding: 20, color: C.stone, fontSize: 13 }}>
              Showing 50 of {filteredTopics.length} topics. Use Explorer for full view.
            </div>
          )}
        </>
      )}
    </div>
  );
}
