import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTopics } from '../hooks/useData'
import { categoriesApi } from '../lib/api'
import { Grid3X3, ChevronRight, ArrowUpRight, ArrowLeft } from 'lucide-react'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', border: '#E6E1DA', borderLight: '#F0ECE6',
  coral: '#E8714A', coralLight: '#FCEEE8', sage: '#1A8754', sageLight: '#E8F5EE',
  amber: '#D4930D', amberLight: '#FFF8E6', rose: '#C0392B', roseLight: '#FFF0F0',
  plum: '#7C3AED', plumLight: '#F3EEFF', charcoal: '#2D3E50', charcoalDeep: '#1A2A3A',
  ink: '#2A2520', slate: '#5C5549', stone: '#8B8479', sand: '#B8B2A8',
}

const CATEGORY_META: Record<string, { emoji: string; color: string }> = {
  'Health': { emoji: '💊', color: C.sage }, 'Electronics': { emoji: '⚡', color: C.charcoal },
  'Fitness': { emoji: '🏋️', color: C.coral }, 'Kitchen': { emoji: '🍳', color: C.rose },
  'Beauty': { emoji: '✨', color: C.plum }, 'Home': { emoji: '🏡', color: C.amber },
  'Baby': { emoji: '👶', color: '#2E86C1' }, 'Pet': { emoji: '🐾', color: C.amber },
  'Outdoor': { emoji: '🏕️', color: C.sage }, 'Outdoors': { emoji: '🏕️', color: C.sage },
  'Office': { emoji: '💼', color: C.charcoal }, 'Fashion': { emoji: '👗', color: C.plum },
}
const DEFAULT_META = { emoji: '📦', color: C.stone }

const STAGE: Record<string, { bg: string; text: string; dot: string; bar: string }> = {
  emerging:  { bg: C.sageLight, text: C.sage, dot: C.sage, bar: C.sage },
  exploding: { bg: C.coralLight, text: C.coral, dot: C.coral, bar: C.coral },
  peaking:   { bg: C.amberLight, text: C.amber, dot: C.amber, bar: C.amber },
  declining: { bg: C.roseLight, text: C.rose, dot: C.rose, bar: C.rose },
  unknown:   { bg: C.borderLight, text: C.stone, dot: C.stone, bar: C.stone },
}

interface TopicItem {
  id: string; name: string; slug: string; stage: string;
  primary_category: string; opportunity_score: number | null;
  competition_index: number | null; sparkline: number[] | null;
}

export default function CategoryExplorerPage() {
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [apiCategories, setApiCategories] = useState<Record<string, string>>({})
  const { data: topicsData, isLoading } = useTopics({ page_size: 100 })
  const allTopics: TopicItem[] = topicsData?.data || []

  useEffect(() => {
    categoriesApi.list().then(r => {
      const map: Record<string, string> = {}
      for (const cat of r.data || []) map[cat.name] = cat.id
      setApiCategories(map)
    }).catch(() => {})
  }, [])

  const categories = useMemo(() => {
    const catMap: Record<string, TopicItem[]> = {}
    for (const t of allTopics) {
      const cat = t.primary_category || 'Uncategorized'
      if (!catMap[cat]) catMap[cat] = []
      catMap[cat].push(t)
    }
    return Object.entries(catMap).map(([name, topics]) => {
      const scores = topics.map(t => t.opportunity_score).filter((s): s is number => s !== null)
      const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
      const stages = topics.reduce((acc, t) => { acc[t.stage] = (acc[t.stage] || 0) + 1; return acc }, {} as Record<string, number>)
      const topTopics = [...topics].sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0)).slice(0, 3)
      return { name, count: topics.length, avgScore, stages, topTopics, hotCount: (stages['exploding'] || 0) + (stages['emerging'] || 0), meta: CATEGORY_META[name] || DEFAULT_META }
    }).sort((a, b) => b.hotCount - a.hotCount || b.avgScore - a.avgScore)
  }, [allTopics])

  const selectedTopics = useMemo(() => {
    if (!selectedCategory) return []
    return allTopics.filter(t => t.primary_category === selectedCategory).sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0))
  }, [allTopics, selectedCategory])

  const totalExploding = allTopics.filter(t => t.stage === 'exploding').length
  const totalEmerging = allTopics.filter(t => t.stage === 'emerging').length

  if (isLoading) return <div style={{ padding: 24, color: C.coral, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Loading categories...</div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: C.ink }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Grid3X3 style={{ width: 22, height: 22, color: C.coral }} />
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif", letterSpacing: '-0.02em' }}>
            Category Explorer
          </h1>
        </div>
        <p style={{ fontSize: 13, color: C.stone, marginLeft: 32 }}>
          {categories.length} categories · {allTopics.length} topics · {totalExploding} exploding · {totalEmerging} emerging
        </p>
      </div>

      {selectedCategory && (
        <button onClick={() => setSelectedCategory(null)} style={{
          display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: C.stone,
          background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16,
        }}>
          <ArrowLeft style={{ width: 14, height: 14 }} /> Back to all categories
        </button>
      )}

      {!selectedCategory ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {categories.map(cat => (
            <div key={cat.name} onClick={() => {
                const catId = apiCategories[cat.name]
                if (catId) navigate(`/categories/${catId}`); else setSelectedCategory(cat.name)
              }}
              style={{
                background: C.card, borderRadius: 14, padding: '20px 24px', border: `1px solid ${C.border}`,
                cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(42,37,32,0.04)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.coral + '60'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 26 }}>{cat.meta.emoji}</span>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: cat.meta.color }}>{cat.name}</h3>
                    <p style={{ fontSize: 11, color: C.stone, margin: '2px 0 0' }}>{cat.count} topics</p>
                  </div>
                </div>
                <ChevronRight style={{ width: 18, height: 18, color: C.sand }} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: C.bg, borderRadius: 8 }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: C.ink, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{cat.avgScore.toFixed(1)}</p>
                  <p style={{ fontSize: 9, color: C.stone, margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Avg Score</p>
                </div>
                {(cat.stages['exploding'] || 0) > 0 && (
                  <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: C.bg, borderRadius: 8 }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: C.coral, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{cat.stages['exploding']}</p>
                    <p style={{ fontSize: 9, color: C.stone, margin: '2px 0 0', textTransform: 'uppercase' }}>Exploding</p>
                  </div>
                )}
                <div style={{ flex: 1, textAlign: 'center', padding: '8px 0', background: C.bg, borderRadius: 8 }}>
                  <p style={{ fontSize: 18, fontWeight: 700, color: C.sage, margin: 0, fontFamily: "'JetBrains Mono', monospace" }}>{cat.stages['emerging'] || 0}</p>
                  <p style={{ fontSize: 9, color: C.stone, margin: '2px 0 0', textTransform: 'uppercase' }}>Emerging</p>
                </div>
              </div>

              {/* Stage bar */}
              <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', background: C.borderLight, marginBottom: 14 }}>
                {['exploding', 'emerging', 'peaking', 'declining', 'unknown'].map(stage => {
                  const count = cat.stages[stage] || 0
                  if (count === 0) return null
                  return <div key={stage} style={{ width: `${(count / cat.count) * 100}%`, background: STAGE[stage]?.bar || C.stone }} />
                })}
              </div>

              {/* Top topics */}
              {cat.topTopics.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 10, color: C.sand, width: 14, textAlign: 'right' }}>{i + 1}.</span>
                    <span style={{ fontSize: 12, fontWeight: 500, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: '1px 7px', borderRadius: 10, textTransform: 'capitalize',
                      background: (STAGE[t.stage] || STAGE.unknown).bg, color: (STAGE[t.stage] || STAGE.unknown).text,
                    }}>{t.stage}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.slate, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8 }}>
                    {t.opportunity_score?.toFixed(1) || '—'}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div>
          {(() => {
            const cat = categories.find(c => c.name === selectedCategory)
            if (!cat) return null
            return (
              <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <span style={{ fontSize: 36 }}>{cat.meta.emoji}</span>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 400, margin: 0, color: cat.meta.color, fontFamily: "'Newsreader', Georgia, serif" }}>{selectedCategory}</h2>
                    <p style={{ fontSize: 13, color: C.stone, margin: '4px 0 0' }}>{cat.count} topics · Avg score: {cat.avgScore.toFixed(1)}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['exploding', 'emerging', 'peaking', 'declining', 'unknown'].map(stage => {
                    const count = cat.stages[stage] || 0
                    if (count === 0) return null
                    const s = STAGE[stage] || STAGE.unknown
                    return <span key={stage} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 12, background: s.bg, color: s.text, textTransform: 'capitalize' }}>{stage}: {count}</span>
                  })}
                </div>
              </div>
            )
          })()}

          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                  {['#', 'Topic', 'Stage', 'Opportunity', 'Competition', ''].map((h, i) => (
                    <th key={i} style={{
                      textAlign: i >= 3 ? 'right' : 'left', padding: '12px 16px',
                      fontSize: 10, fontWeight: 600, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedTopics.map((t, i) => {
                  const sc = (t.opportunity_score || 0)
                  const scoreColor = sc >= 70 ? C.sage : sc >= 40 ? C.amber : C.rose
                  return (
                    <tr key={t.id} onClick={() => navigate(`/topics/${t.id}`)}
                      style={{ borderBottom: `1px solid ${C.borderLight}`, cursor: 'pointer', transition: 'background 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.background = C.bg}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '12px 16px', fontSize: 12, color: C.sand, fontWeight: 600 }}>{i + 1}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: C.ink }}>{t.name}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 12, textTransform: 'capitalize',
                          background: (STAGE[t.stage] || STAGE.unknown).bg, color: (STAGE[t.stage] || STAGE.unknown).text,
                        }}>{t.stage}</span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 14, fontWeight: 700, color: scoreColor, fontFamily: "'JetBrains Mono', monospace" }}>
                        {t.opportunity_score?.toFixed(1) || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 13, color: C.slate, fontFamily: "'JetBrains Mono', monospace" }}>
                        {t.competition_index?.toFixed(1) || '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}><ArrowUpRight style={{ width: 14, height: 14, color: C.sand }} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {selectedTopics.length === 0 && <div style={{ padding: 40, textAlign: 'center', color: C.sand, fontSize: 13 }}>No topics found in this category.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
