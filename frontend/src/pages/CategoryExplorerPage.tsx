import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { categoriesApi } from '../lib/api'
import { Grid3X3, ChevronRight, Search, TrendingUp, TrendingDown, Minus, Flame, Target } from 'lucide-react'

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', borderLight: '#F1F5F9',
  coral: '#E16A4A', coralLight: '#FEF0EB', sage: '#2ED3A5', sageLight: '#EAFAF5',
  amber: '#FFC857', amberLight: '#FFF8E6', rose: '#EF4444', roseLight: '#FEF2F2',
  plum: '#6B4EFF', charcoal: '#2C5282', charcoalDeep: '#1E3A5F',
  ink: '#0F172A', slate: '#475569', stone: '#64748B', sand: '#94A3B8',
}

const STAGE: Record<string, { bg: string; text: string; bar: string }> = {
  emerging: { bg: C.sageLight, text: C.sage, bar: C.sage },
  exploding: { bg: C.coralLight, text: C.coral, bar: C.coral },
  peaking: { bg: C.amberLight, text: C.amber, bar: C.amber },
  declining: { bg: C.roseLight, text: C.rose, bar: C.rose },
}

const EMOJI: Record<string, string> = {
  'Health': '💊', 'Electronics': '⚡', 'Fitness': '🏋️', 'Kitchen': '🍳',
  'Beauty': '✨', 'Home': '🏡', 'Baby': '👶', 'Pet': '🐾',
  'Outdoor': '🏕️', 'Outdoors': '🏕️', 'Office': '💼', 'Fashion': '👗',
}

interface CategoryItem {
  id: string; name: string; slug: string; level: number; icon: string | null;
  topic_count: number; avg_opportunity_score: number | null;
  avg_competition_index: number | null; growth_rate_4w: number | null;
  stage_distribution: Record<string, number> | null;
}

function GrowthBadge({ value, size = 'md' }: { value: number | null | undefined; size?: 'sm' | 'md' }) {
  if (value == null) return <span style={{ fontSize: size === 'sm' ? 10 : 12, color: C.sand }}>—</span>
  const isUp = value > 0
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus
  const fs = size === 'sm' ? 11 : 13
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fs, fontWeight: 600, color: isUp ? C.sage : value < 0 ? C.rose : C.stone }}>
      <Icon style={{ width: fs - 1, height: fs - 1 }} /> {isUp ? '+' : ''}{(value * 100).toFixed(1)}%
    </span>
  )
}

export default function CategoryExplorerPage() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState<CategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'hot' | 'score' | 'growth' | 'topics'>('hot')

  useEffect(() => {
    setLoading(true)
    categoriesApi.list().then(r => setCategories(r.data || []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false))
  }, [])

  // Derived stats
  const totalTopics = categories.reduce((s, c) => s + (c.topic_count || 0), 0)
  const totalExploding = categories.reduce((s, c) => s + (c.stage_distribution?.exploding || 0), 0)
  const totalEmerging = categories.reduce((s, c) => s + (c.stage_distribution?.emerging || 0), 0)
  const allScores = categories.filter(c => c.avg_opportunity_score).map(c => c.avg_opportunity_score as number)
  const avgScore = allScores.length > 0 ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0

  // Filter + sort
  const filtered = categories
    .filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'score') return (b.avg_opportunity_score || 0) - (a.avg_opportunity_score || 0)
      if (sortBy === 'growth') return (b.growth_rate_4w || 0) - (a.growth_rate_4w || 0)
      if (sortBy === 'topics') return (b.topic_count || 0) - (a.topic_count || 0)
      // 'hot' — by exploding + emerging count
      const aHot = (a.stage_distribution?.exploding || 0) + (a.stage_distribution?.emerging || 0)
      const bHot = (b.stage_distribution?.exploding || 0) + (b.stage_distribution?.emerging || 0)
      return bHot - aHot || (b.avg_opportunity_score || 0) - (a.avg_opportunity_score || 0)
    })

  if (loading) return <div style={{ padding: 40, color: C.coral, fontFamily: "'Inter', sans-serif" }}>Loading categories...</div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Inter', -apple-system, sans-serif", color: C.ink }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Grid3X3 style={{ width: 22, height: 22, color: C.coral }} />
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: C.charcoalDeep, fontFamily: "'Sora', sans-serif" }}>
            Category Intelligence
          </h1>
        </div>
        <p style={{ fontSize: 13, color: C.stone, marginLeft: 32 }}>
          {categories.length} categories · {totalTopics} topics · {totalExploding} exploding · {totalEmerging} emerging
        </p>
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Categories', value: categories.length, icon: <Grid3X3 style={{ width: 14, height: 14, color: C.coral }} />, color: C.coral },
          { label: 'Avg Opportunity', value: avgScore.toFixed(1), icon: <Target style={{ width: 14, height: 14, color: C.sage }} />, color: C.sage },
          { label: 'Exploding Topics', value: totalExploding, icon: <Flame style={{ width: 14, height: 14, color: C.coral }} />, color: C.coral },
          { label: 'Emerging Topics', value: totalEmerging, icon: <TrendingUp style={{ width: 14, height: 14, color: C.sage }} />, color: C.sage },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: m.color, opacity: 0.08 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>{m.icon}<span style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{m.label}</span></div>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.charcoalDeep, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Search + Sort */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.sand }} />
          <input type="text" placeholder="Search categories..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, color: C.ink, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, background: C.card, borderRadius: 10, padding: 3, border: `1px solid ${C.border}` }}>
          {([['hot', 'Hottest'], ['score', 'Top Score'], ['growth', 'Fastest Growing'], ['topics', 'Most Topics']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setSortBy(key)} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              background: sortBy === key ? C.coral : 'transparent', color: sortBy === key ? '#fff' : C.stone, transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Category Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 16 }}>
        {filtered.map(cat => {
          const emoji = EMOJI[cat.name] || cat.icon || '📦'
          const stages = cat.stage_distribution || {}
          const total = cat.topic_count || 1
          const hotCount = (stages.exploding || 0) + (stages.emerging || 0)
          const sc = cat.avg_opportunity_score
          const scoreColor = sc != null ? (sc >= 60 ? C.sage : sc >= 40 ? C.amber : C.rose) : C.stone

          return (
            <div key={cat.id} onClick={() => navigate(`/categories/${cat.id}`)}
              style={{
                background: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
                cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(42,37,32,0.04)',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.coral + '60'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(42,37,32,0.08)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(42,37,32,0.04)' }}
            >
              {/* Hot indicator strip */}
              {hotCount > 0 && <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${C.coral}, ${C.sage})` }} />}

              <div style={{ padding: '20px 24px' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 28 }}>{emoji}</span>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: C.charcoalDeep }}>{cat.name}</h3>
                      <p style={{ fontSize: 11, color: C.stone, margin: '2px 0 0' }}>
                        {cat.topic_count} topics{hotCount > 0 && <> · <span style={{ color: C.coral, fontWeight: 600 }}>{hotCount} hot</span></>}
                      </p>
                    </div>
                  </div>
                  <ChevronRight style={{ width: 18, height: 18, color: C.sand }} />
                </div>

                {/* 4-metric row */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: C.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>
                      {cat.avg_opportunity_score?.toFixed(1) || '—'}
                    </div>
                    <div style={{ fontSize: 8, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 1 }}>Opportunity</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: C.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.charcoal, fontFamily: "'JetBrains Mono', monospace" }}>
                      {cat.avg_competition_index?.toFixed(1) || '—'}
                    </div>
                    <div style={{ fontSize: 8, color: C.stone, textTransform: 'uppercase', marginTop: 1 }}>Competition</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: C.bg, borderRadius: 8 }}>
                    <GrowthBadge value={cat.growth_rate_4w} size="sm" />
                    <div style={{ fontSize: 8, color: C.stone, textTransform: 'uppercase', marginTop: 1 }}>4w Growth</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '8px 4px', background: C.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 17, fontWeight: 700, color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>
                      {cat.topic_count}
                    </div>
                    <div style={{ fontSize: 8, color: C.stone, textTransform: 'uppercase', marginTop: 1 }}>Topics</div>
                  </div>
                </div>

                {/* Stage distribution bar */}
                <div style={{ height: 6, borderRadius: 3, overflow: 'hidden', display: 'flex', background: C.borderLight, marginBottom: 8 }}>
                  {(['exploding', 'emerging', 'peaking', 'declining'] as const).map(stage => {
                    const count = stages[stage] || 0
                    if (count === 0) return null
                    return <div key={stage} style={{ width: `${(count / total) * 100}%`, background: STAGE[stage]?.bar || C.stone, transition: 'width 0.3s' }} />
                  })}
                </div>

                {/* Stage pills */}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(['exploding', 'emerging', 'peaking', 'declining'] as const).map(stage => {
                    const count = stages[stage] || 0
                    if (count === 0) return null
                    const s = STAGE[stage]
                    return (
                      <span key={stage} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 3,
                        fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                        background: s.bg, color: s.text, textTransform: 'capitalize',
                      }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.bar }} />{stage}: {count}
                      </span>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: C.sand }}>
          {search ? 'No categories match your search.' : 'No categories found. Categories are created when topics are imported.'}
        </div>
      )}
    </div>
  )
}
