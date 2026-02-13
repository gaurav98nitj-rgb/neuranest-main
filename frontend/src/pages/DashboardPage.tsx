import { useState, useEffect, useMemo } from 'react';

// ============================================================
// NeuraNest Dashboard — Updated for 194 Topics
// ============================================================
const API_BASE = 'http://localhost:8000/api/v1';

// --- Types ---
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
  id: string;
  name: string;
  slug: string;
  primary_category?: string;
  category?: string;
  stage: string;
  opportunity_score?: number;
  competition_score?: number;
  score?: number;
  opportunity?: number;
  competition?: number;
  sparkline?: number[];
}

interface TopicItem {
  id: string;
  name: string;
  slug: string;
  primary_category: string;
  stage: string;
  opportunity_score?: number;
  competition_index?: number;
  latest_scores?: { opportunity?: number; competition?: number };
  sparkline?: number[];
}

// --- Color Palette ---
const COLORS = {
  bg: '#0E2F44',
  card: '#133B55',
  cardHover: '#184A68',
  border: '#1E5570',
  accent: '#2E86C1',
  accentLight: '#5DADE2',
  emerald: '#00D2A0',
  amber: '#FDCB6E',
  rose: '#FD79A8',
  blue: '#0984E3',
  text: '#D6EAF8',
  textMuted: '#8B8FA3',
  textDim: '#5A5E73',
};

const STAGE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  emerging: { bg: 'rgba(108,92,231,0.15)', text: '#5DADE2', dot: '#2E86C1' },
  exploding: { bg: 'rgba(253,121,168,0.15)', text: '#FD79A8', dot: '#E84393' },
  peaking: { bg: 'rgba(253,203,110,0.15)', text: '#FDCB6E', dot: '#F39C12' },
  declining: { bg: 'rgba(99,110,114,0.15)', text: '#8B8FA3', dot: '#636E72' },
  unknown: { bg: 'rgba(99,110,114,0.1)', text: '#636E72', dot: '#4A4E5A' },
  stable: { bg: 'rgba(0,210,160,0.15)', text: '#00D2A0', dot: '#00B894' },
};

const CATEGORY_COLORS = [
  '#2E86C1', '#00D2A0', '#FD79A8', '#FDCB6E', '#0984E3',
  '#E17055', '#00CEC9', '#5DADE2', '#FAB1A0', '#81ECEC',
];

// --- Sparkline Component ---
function Sparkline({ data, color = '#00D2A0', width = 80, height = 28 }: {
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
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${height} ${points} ${width},${height}`}
        fill={`url(#sg-${color.replace('#','')})`}
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --- Stage Badge ---
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

// --- Stat Card ---
function StatCard({ icon, label, value, sub, color }: {
  icon: string; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div style={{
      background: COLORS.card, borderRadius: 16, padding: '20px 24px',
      border: `1px solid ${COLORS.border}`, flex: 1, minWidth: 180,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: -20, right: -20, width: 80, height: 80,
        borderRadius: '50%', background: color, opacity: 0.06,
      }} />
      <div style={{ fontSize: 22, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// --- Category Pill ---
function CategoryPill({ name, count, color, active, onClick }: {
  name: string; count: number; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 16px', borderRadius: 24,
      background: active ? color + '22' : COLORS.card,
      border: `1px solid ${active ? color : COLORS.border}`,
      color: active ? color : COLORS.textMuted,
      cursor: 'pointer', fontSize: 13, fontWeight: 500,
      transition: 'all 0.2s',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {name}
      <span style={{
        background: active ? color + '33' : COLORS.border,
        padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      }}>{count}</span>
    </button>
  );
}

// --- Donut Chart ---
function DonutChart({ data, colors }: { data: { name: string; value: number }[]; colors: string[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  let cumulative = 0;

  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      {data.map((item, i) => {
        const pct = item.value / total;
        const dashArray = `${pct * 377} ${377 - pct * 377}`;
        const offset = -cumulative * 377 + 94.25;
        cumulative += pct;
        return (
          <circle key={i} cx="70" cy="70" r="60" fill="none" stroke={colors[i % colors.length]}
            strokeWidth="18" strokeDasharray={dashArray} strokeDashoffset={offset}
            style={{ transition: 'stroke-dasharray 0.5s' }}
          />
        );
      })}
      <text x="70" y="66" textAnchor="middle" fill={COLORS.text} fontSize="22" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
        {total}
      </text>
      <text x="70" y="82" textAnchor="middle" fill={COLORS.textMuted} fontSize="10">
        topics
      </text>
    </svg>
  );
}

// --- Bar Chart ---
function BarChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 120, paddingTop: 10 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{d.value}</span>
          <div style={{
            width: '100%', maxWidth: 48,
            height: Math.max(4, (d.value / max) * 90),
            background: `linear-gradient(180deg, ${colors[i % colors.length]}, ${colors[i % colors.length]}88)`,
            borderRadius: '6px 6px 2px 2px',
            transition: 'height 0.4s ease',
          }} />
          <span style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' }}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// --- Topic Row ---
function TopicRow({ rank, topic, metric, metricLabel, metricColor }: {
  rank: number; topic: TopicScore; metric: number; metricLabel: string; metricColor: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderBottom: `1px solid ${COLORS.border}22`,
    }}>
      <span style={{
        width: 24, height: 24, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: COLORS.border, color: COLORS.textMuted, fontSize: 11, fontWeight: 700,
      }}>
        {rank}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{topic.name}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
          <StageBadge stage={topic.stage} />
          <span style={{ fontSize: 11, color: COLORS.textDim }}>{topic.category || topic.primary_category}</span>
        </div>
      </div>
      {topic.sparkline && <Sparkline data={topic.sparkline} color={metricColor} width={64} height={24} />}
      <div style={{ textAlign: 'right', minWidth: 50 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: metricColor, fontFamily: "'JetBrains Mono', monospace" }}>
          {metric.toFixed(1)}
        </div>
        <div style={{ fontSize: 9, color: COLORS.textDim, textTransform: 'uppercase' }}>{metricLabel}</div>
      </div>
    </div>
  );
}

// ============================================================
// MAIN DASHBOARD COMPONENT
// ============================================================
export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [allTopics, setAllTopics] = useState<TopicItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'overview' | 'categories'>('overview');

  // Fetch dashboard data
  useEffect(() => {
    const token = localStorage.getItem('access_token') || '';
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    Promise.all([
      fetch(`${API_BASE}/dashboard`, { headers }).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/topics?page_size=100`, { headers }).then(r => r.json()).catch(() => null),
    ]).then(([dash, topics]) => {
      if (dash && dash.summary) {
        const s = dash.summary;
        // Transform stages from object {emerging: 72} to array [{stage, count}]
        if (s.stages && !Array.isArray(s.stages)) {
          s.stages = Object.entries(s.stages).map(([stage, count]) => ({ stage, count: count as number }));
        }
        // Transform categories from API format
        s.categories = (dash.categories || []).map((c: any) => ({
          name: c.category || c.name,
          count: c.count,
        }));
        // Map top_movers — API returns 'score' field
        s.top_movers = (dash.top_movers || []).map((t: any) => ({
          ...t,
          opportunity_score: t.score || t.opportunity_score || 0,
          primary_category: t.category || t.primary_category,
        }));
        // Map low_competition — API returns 'opportunity' and 'competition'
        s.low_competition = (dash.low_competition_opportunities || []).map((t: any) => ({
          ...t,
          opportunity_score: t.opportunity || t.opportunity_score || 0,
          competition_score: t.competition || t.competition_score || 0,
        }));
        setSummary(s);
      }
      if (topics?.data) setAllTopics(topics.data);
      setLoading(false);
    });
  }, []);

  const categoryData = useMemo(() => {
    if (!summary?.categories) return [];
    return summary.categories
      .sort((a, b) => b.count - a.count)
      .map((c, i) => ({ ...c, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
  }, [summary]);

  const stageData = useMemo(() => {
    if (!summary?.stages) return [];
    const order = ['emerging', 'exploding', 'peaking', 'declining', 'unknown', 'stable'];
    return order
      .map(s => summary.stages.find(st => st.stage === s))
      .filter(Boolean) as { stage: string; count: number }[];
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: COLORS.bg }}>
        <div style={{ color: COLORS.accent, fontSize: 16 }}>Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh', background: COLORS.bg, color: COLORS.text,
      fontFamily: "'Satoshi', 'DM Sans', -apple-system, sans-serif",
      padding: '32px 40px',
    }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: '-0.5px',
          background: `linear-gradient(135deg, ${COLORS.text}, ${COLORS.accentLight})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          Trend Intelligence
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: 14, margin: '6px 0 0' }}>
          {summary?.total_topics || 194} topics tracked across {categoryData.length} categories
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard icon="📊" label="Topics Tracked" value={summary?.total_topics || 194} color={COLORS.accent} />
        <StatCard icon="🎯" label="Avg Opportunity" value={(summary?.avg_opportunity_score || 0).toFixed(1)} color={COLORS.emerald} />
        <StatCard icon="🚀" label="Emerging" value={stageData.find(s => s.stage === 'emerging')?.count || 0}
          sub={`${stageData.find(s => s.stage === 'exploding')?.count || 0} exploding`} color={COLORS.rose} />
        <StatCard icon="📈" label="Data Points" value={(summary?.data_points_tracked || 16425).toLocaleString()} color={COLORS.blue} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: COLORS.card, borderRadius: 10, padding: 3, width: 'fit-content' }}>
        {(['overview', 'categories'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
            background: viewMode === v ? COLORS.accent : 'transparent',
            color: viewMode === v ? '#fff' : COLORS.textMuted,
            transition: 'all 0.2s',
          }}>{v}</button>
        ))}
      </div>

      {viewMode === 'overview' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: COLORS.card, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: COLORS.text }}>Topics by Stage</h3>
              <BarChart
                data={stageData.map(s => ({ label: s.stage, value: s.count }))}
                colors={stageData.map(s => STAGE_COLORS[s.stage]?.dot || '#636E72')}
              />
            </div>
            <div style={{ background: COLORS.card, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: COLORS.text }}>Topics by Category</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <DonutChart data={categoryData.map(c => ({ name: c.name, value: c.count }))} colors={categoryData.map(c => c.color)} />
                <div style={{ flex: 1 }}>
                  {categoryData.slice(0, 7).map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                      <span style={{ flex: 1, fontSize: 12, color: COLORS.textMuted }}>{c.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.text }}>{c.count}</span>
                    </div>
                  ))}
                  {categoryData.length > 7 && (
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>+{categoryData.length - 7} more</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ background: COLORS.card, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: COLORS.text }}>🔥 Top Movers</h3>
              {(summary?.top_movers || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t}
                  metric={t.opportunity_score || t.score || 0} metricLabel="score" metricColor={COLORS.emerald} />
              ))}
            </div>
            <div style={{ background: COLORS.card, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: COLORS.text }}>💎 Low Competition</h3>
              {(summary?.low_competition || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t}
                  metric={t.competition_score || t.competition || 0} metricLabel="comp" metricColor={COLORS.blue} />
              ))}
            </div>
            <div style={{ background: COLORS.card, borderRadius: 16, padding: 24, border: `1px solid ${COLORS.border}` }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: COLORS.text }}>✨ Emerging Gems</h3>
              {emergingGems.slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1}
                  topic={{
                    id: t.id, name: t.name, slug: t.slug,
                    primary_category: t.primary_category, stage: t.stage,
                    opportunity_score: t.opportunity_score || t.latest_scores?.opportunity || 0,
                    competition_score: t.competition_index || t.latest_scores?.competition || 0,
                    sparkline: t.sparkline,
                  }}
                  metric={t.opportunity_score || t.latest_scores?.opportunity || 0} metricLabel="opp" metricColor={COLORS.accent} />
              ))}
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
            <button onClick={() => { setActiveCategory(null); setActiveStage(null); }} style={{
              padding: '8px 16px', borderRadius: 24,
              background: !activeCategory ? COLORS.accent + '22' : COLORS.card,
              border: `1px solid ${!activeCategory ? COLORS.accent : COLORS.border}`,
              color: !activeCategory ? COLORS.accent : COLORS.textMuted,
              cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}>All</button>
            {categoryData.map((c, i) => (
              <CategoryPill key={i} name={c.name} count={c.count} color={c.color}
                active={activeCategory === c.name}
                onClick={() => setActiveCategory(activeCategory === c.name ? null : c.name)} />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
            {['emerging', 'exploding', 'peaking', 'declining', 'unknown'].map(s => (
              <button key={s} onClick={() => setActiveStage(activeStage === s ? null : s)} style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                background: activeStage === s ? STAGE_COLORS[s].bg : 'transparent',
                color: activeStage === s ? STAGE_COLORS[s].text : COLORS.textDim,
                transition: 'all 0.2s',
              }}>{s}</button>
            ))}
          </div>

          <div style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>
            Showing {filteredTopics.length} topics
            {activeCategory && <> in <strong style={{ color: COLORS.text }}>{activeCategory}</strong></>}
            {activeStage && <> • <strong style={{ color: STAGE_COLORS[activeStage]?.text }}>{activeStage}</strong></>}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {filteredTopics.slice(0, 50).map(t => (
              <div key={t.id} style={{
                background: COLORS.card, borderRadius: 12, padding: '16px 18px',
                border: `1px solid ${COLORS.border}`, cursor: 'pointer', transition: 'all 0.2s',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 2 }}>{t.primary_category}</div>
                  </div>
                  <StageBadge stage={t.stage} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  {t.sparkline && <Sparkline data={t.sparkline} width={100} height={28} />}
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.emerald, fontFamily: "'JetBrains Mono', monospace" }}>
                      {(t.opportunity_score || t.latest_scores?.opportunity || 0).toFixed(1)}
                    </div>
                    <div style={{ fontSize: 9, color: COLORS.textDim, textTransform: 'uppercase' }}>opportunity</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {filteredTopics.length > 50 && (
            <div style={{ textAlign: 'center', padding: 20, color: COLORS.textMuted, fontSize: 13 }}>
              Showing 50 of {filteredTopics.length} topics. Use Explorer for full view.
            </div>
          )}
        </>
      )}
    </div>
  );
}
