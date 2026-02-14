import { useState, useEffect, useMemo } from 'react';

const API_BASE = 'http://localhost:8000/api/v1';

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

// Warm palette
const C = {
  bg: '#F9F7F4',
  card: '#FFFFFF',
  border: '#E6E1DA',
  borderLight: '#F0ECE6',
  coral: '#E8714A',
  coralHover: '#D4623D',
  coralLight: '#FCEEE8',
  sage: '#1A8754',
  sageLight: '#E8F5EE',
  amber: '#D4930D',
  amberLight: '#FFF8E6',
  rose: '#C0392B',
  roseLight: '#FFF0F0',
  plum: '#7C3AED',
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

function CategoryPill({ name, count, color, active, onClick }: {
  name: string; count: number; color: string; active: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '8px 16px', borderRadius: 24,
      background: active ? color + '14' : C.card,
      border: `1px solid ${active ? color : C.border}`,
      color: active ? color : C.stone,
      cursor: 'pointer', fontSize: 13, fontWeight: 500, transition: 'all 0.2s',
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      {name}
      <span style={{
        background: active ? color + '22' : C.borderLight,
        padding: '1px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600,
        color: active ? color : C.stone,
      }}>{count}</span>
    </button>
  );
}

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
            style={{ transition: 'stroke-dasharray 0.5s' }} />
        );
      })}
      <text x="70" y="66" textAnchor="middle" fill={C.charcoalDeep} fontSize="22" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
        {total}
      </text>
      <text x="70" y="82" textAnchor="middle" fill={C.stone} fontSize="10">topics</text>
    </svg>
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

function TopicRow({ rank, topic, metric, metricLabel, metricColor }: {
  rank: number; topic: TopicScore; metric: number; metricLabel: string; metricColor: string;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      borderBottom: `1px solid ${C.borderLight}`,
    }}>
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

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [allTopics, setAllTopics] = useState<TopicItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'overview' | 'categories'>('overview');

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

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.ink,
      fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif",
      padding: '32px 40px',
    }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{
          fontSize: 32, fontWeight: 400, margin: 0, letterSpacing: '-0.02em',
          color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif",
        }}>
          Trend Intelligence
        </h1>
        <p style={{ color: C.stone, fontSize: 14, margin: '6px 0 0' }}>
          {summary?.total_topics || 194} topics tracked across {categoryData.length} categories
        </p>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <StatCard icon="📊" label="Topics Tracked" value={summary?.total_topics || 194} color={C.coral} />
        <StatCard icon="🎯" label="Avg Opportunity" value={(summary?.avg_opportunity_score || 0).toFixed(1)} color={C.sage} />
        <StatCard icon="🚀" label="Emerging" value={stageData.find(s => s.stage === 'emerging')?.count || 0}
          sub={`${stageData.find(s => s.stage === 'exploding')?.count || 0} exploding`} color={C.coral} />
        <StatCard icon="📈" label="Data Points" value={(summary?.data_points_tracked || 16425).toLocaleString()} color={C.charcoal} />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: C.card, borderRadius: 10, padding: 3, width: 'fit-content', border: `1px solid ${C.border}` }}>
        {(['overview', 'categories'] as const).map(v => (
          <button key={v} onClick={() => setViewMode(v)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: 600, textTransform: 'capitalize',
            background: viewMode === v ? C.coral : 'transparent',
            color: viewMode === v ? '#fff' : C.stone,
            transition: 'all 0.2s',
          }}>{v}</button>
        ))}
      </div>

      {viewMode === 'overview' ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: C.charcoalDeep, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Topics by Stage</h3>
              <BarChart data={stageData.map(s => ({ label: s.stage, value: s.count }))} colors={stageData.map(s => STAGE_COLORS[s.stage]?.dot || '#8B8479')} />
            </div>
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: C.charcoalDeep, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Topics by Category</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
                <DonutChart data={categoryData.map(c => ({ name: c.name, value: c.count }))} colors={categoryData.map(c => c.color)} />
                <div style={{ flex: 1 }}>
                  {categoryData.slice(0, 7).map((c, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                      <span style={{ flex: 1, fontSize: 12, color: C.slate }}>{c.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.ink }}>{c.count}</span>
                    </div>
                  ))}
                  {categoryData.length > 7 && (
                    <div style={{ fontSize: 11, color: C.sand, marginTop: 4 }}>+{categoryData.length - 7} more</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: C.charcoalDeep, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Top Movers</h3>
              {(summary?.top_movers || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t} metric={t.opportunity_score || t.score || 0} metricLabel="score" metricColor={C.sage} />
              ))}
            </div>
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: C.charcoalDeep, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Low Competition</h3>
              {(summary?.low_competition || []).slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1} topic={t} metric={t.competition_score || t.competition || 0} metricLabel="comp" metricColor={C.charcoal} />
              ))}
            </div>
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 16px', color: C.charcoalDeep, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Emerging Gems</h3>
              {emergingGems.slice(0, 6).map((t, i) => (
                <TopicRow key={t.id} rank={i + 1}
                  topic={{
                    id: t.id, name: t.name, slug: t.slug,
                    primary_category: t.primary_category, stage: t.stage,
                    opportunity_score: t.opportunity_score || t.latest_scores?.opportunity || 0,
                    competition_score: t.competition_index || t.latest_scores?.competition || 0,
                    sparkline: t.sparkline,
                  }}
                  metric={t.opportunity_score || t.latest_scores?.opportunity || 0} metricLabel="opp" metricColor={C.coral} />
              ))}
            </div>
          </div>
        </>
      ) : (
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
              <div key={t.id} style={{
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
