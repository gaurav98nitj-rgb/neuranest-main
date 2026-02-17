import { useState, useEffect, useCallback } from 'react'
import { whitespaceApi, categoriesApi } from '../lib/api'
import { Map, TrendingUp, AlertTriangle, Lightbulb, ChevronRight, X, Package, DollarSign, Users, Flame } from 'lucide-react'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', border: '#E6E1DA', borderLight: '#F0ECE6',
  coral: '#E8714A', coralLight: '#FCEEE8', sage: '#1A8754', sageLight: '#E8F5EE',
  amber: '#D4930D', amberLight: '#FFF8E6', rose: '#C0392B', roseLight: '#FFF0F0',
  plum: '#7C3AED', plumLight: '#F3EEFF', charcoal: '#2D3E50', charcoalDeep: '#1A2A3A',
  ink: '#2A2520', slate: '#5C5549', stone: '#8B8479', sand: '#B8B2A8',
}

const STAGE: Record<string, { bg: string; text: string }> = {
  emerging: { bg: C.sageLight, text: C.sage }, exploding: { bg: C.coralLight, text: C.coral },
  peaking: { bg: C.amberLight, text: C.amber }, declining: { bg: C.roseLight, text: C.rose },
}

interface HeatmapCell { price_bucket: string; price_min: number; price_max: number; competition_bucket: string; competition_min: number; competition_max: number; topic_count: number; avg_dissatisfaction: number; avg_opportunity_score: number; avg_competition_index: number; white_space_score: number; intensity: number }
interface CellTopic { id: string; name: string; slug: string; stage: string; primary_category: string | null; opportunity_score: number | null; competition_index: number | null; dissatisfaction_pct: number | null; median_price: number | null; feature_requests: string[]; top_complaints: string[] }
interface ProductConcept { title: string; description: string; target_price: string; key_differentiators: string[]; unmet_needs: string[] }
interface CellDrillDown { price_bucket: string; competition_bucket: string; topics: CellTopic[]; product_concepts: ProductConcept[]; summary: string }

export default function WhiteSpacePage() {
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [priceBuckets, setPriceBuckets] = useState<string[]>([])
  const [compBuckets, setCompBuckets] = useState<string[]>([])
  const [totalTopics, setTotalTopics] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [selectedCell, setSelectedCell] = useState<{ price: string; comp: string } | null>(null)
  const [drillDown, setDrillDown] = useState<CellDrillDown | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  useEffect(() => { categoriesApi.list().then(r => setCategories(r.data || [])).catch(() => {}) }, [])

  const loadHeatmap = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {}; if (categoryFilter) params.category = categoryFilter
      const res = await whitespaceApi.heatmap(params)
      setCells(res.data.cells || []); setPriceBuckets(res.data.price_buckets || []); setCompBuckets(res.data.competition_buckets || []); setTotalTopics(res.data.total_topics || 0)
    } catch { setCells([]) }
    setLoading(false)
  }, [categoryFilter])

  useEffect(() => { loadHeatmap() }, [loadHeatmap])

  const openCell = async (priceB: string, compB: string) => {
    setSelectedCell({ price: priceB, comp: compB }); setDrillLoading(true)
    try {
      const params: Record<string, any> = { price_bucket: priceB, competition_bucket: compB }; if (categoryFilter) params.category = categoryFilter
      const res = await whitespaceApi.cell(params); setDrillDown(res.data)
    } catch { setDrillDown(null) }
    setDrillLoading(false)
  }

  const closeDrawer = () => { setSelectedCell(null); setDrillDown(null) }
  const getCell = (price: string, comp: string) => cells.find(c => c.price_bucket === price && c.competition_bucket === comp)

  const cellBg = (intensity: number, count: number) => {
    if (count === 0) return { bg: C.borderLight, border: 'transparent' }
    if (intensity > 0.75) return { bg: C.sage + '25', border: C.sage + '40' }
    if (intensity > 0.5) return { bg: C.sage + '15', border: C.sage + '20' }
    if (intensity > 0.25) return { bg: C.amber + '15', border: C.amber + '20' }
    return { bg: C.borderLight, border: C.border }
  }

  const hotCells = cells.filter(c => c.intensity > 0.6 && c.topic_count > 0)
  const avgDissatisfaction = cells.filter(c => c.topic_count > 0).length > 0
    ? cells.filter(c => c.topic_count > 0).reduce((s, c) => s + c.avg_dissatisfaction, 0) / cells.filter(c => c.topic_count > 0).length : 0
  const bestCell = cells.reduce((best, c) => (c.white_space_score > (best?.white_space_score || 0) ? c : best), cells[0])

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: C.ink }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Map style={{ width: 22, height: 22, color: C.sage }} />
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif" }}>White-Space Detection</h1>
        </div>
        <p style={{ fontSize: 13, color: C.stone, marginLeft: 32 }}>Identify market gaps where demand exists but supply is weak, quality is poor, or prices are misaligned.</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { icon: <Package style={{ width: 14, height: 14, color: C.charcoal }} />, label: 'Topics Analyzed', value: totalTopics, color: C.charcoal },
          { icon: <Flame style={{ width: 14, height: 14, color: C.sage }} />, label: 'Hot Zones', value: hotCells.length, sub: 'high opportunity cells', color: C.sage },
          { icon: <AlertTriangle style={{ width: 14, height: 14, color: C.amber }} />, label: 'Avg Dissatisfaction', value: `${avgDissatisfaction.toFixed(0)}%`, sub: 'negative review rate', color: C.amber },
          { icon: <TrendingUp style={{ width: 14, height: 14, color: C.coral }} />, label: 'Best Zone', value: bestCell ? `${bestCell.white_space_score.toFixed(0)}` : '—', sub: bestCell ? `${bestCell.price_bucket} / ${bestCell.competition_bucket}` : '', color: C.coral },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: m.color, opacity: 0.08 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>{m.icon}<span style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600 }}>{m.label}</span></div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 10, color: C.sand, marginTop: 2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Category Filter */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.stone }}>Filter by category:</label>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={{
          padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card,
          fontSize: 13, color: C.ink, outline: 'none', cursor: 'pointer',
        }}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Heatmap */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.sand }}>Loading heatmap...</div>
      ) : cells.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 14, padding: 40, textAlign: 'center', border: `1px solid ${C.border}` }}>
          <Package style={{ width: 40, height: 40, color: C.sand, margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>No heatmap data yet</p>
          <p style={{ fontSize: 12, color: C.stone }}>Run the white-space analysis pipeline to generate the opportunity heatmap.</p>
        </div>
      ) : (
        <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: C.charcoalDeep, margin: 0 }}>Opportunity Heatmap</h3>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: C.stone }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.sage + '35' }} /> High opportunity</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.amber + '25' }} /> Moderate</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.borderLight }} /> Low/Empty</span>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4 }}>
              <thead>
                <tr>
                  <th style={{ width: 100 }} />
                  {compBuckets.map(cb => (
                    <th key={cb} style={{ fontSize: 10, fontWeight: 600, color: C.stone, textTransform: 'uppercase', padding: '6px 4px', textAlign: 'center' }}>
                      {cb}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceBuckets.map(pb => (
                  <tr key={pb}>
                    <td style={{ fontSize: 10, fontWeight: 600, color: C.stone, paddingRight: 8, textAlign: 'right' }}>{pb}</td>
                    {compBuckets.map(cb => {
                      const cell = getCell(pb, cb)
                      const count = cell?.topic_count || 0
                      const intensity = cell?.intensity || 0
                      const colors = cellBg(intensity, count)
                      return (
                        <td key={cb}>
                          <button onClick={() => count > 0 && openCell(pb, cb)} disabled={count === 0} style={{
                            width: '100%', minHeight: 80, borderRadius: 10, border: `1px solid ${colors.border}`,
                            background: colors.bg, cursor: count > 0 ? 'pointer' : 'default',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            padding: 8, transition: 'all 0.15s',
                          }}>
                            <span style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? C.ink : C.sand, fontFamily: "'JetBrains Mono', monospace" }}>
                              {count > 0 ? (intensity * 100).toFixed(0) : '—'}
                            </span>
                            <span style={{ fontSize: 10, color: C.stone, marginTop: 2 }}>{count} {count === 1 ? 'topic' : 'topics'}</span>
                            {count > 0 && (
                              <div style={{ display: 'flex', gap: 6, marginTop: 4, fontSize: 10 }}>
                                <span style={{ color: C.amber }}>{cell?.avg_dissatisfaction.toFixed(0)}% pain</span>
                                <span style={{ color: C.sage }}>{cell?.avg_opportunity_score.toFixed(0)} opp</span>
                              </div>
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 11, color: C.stone, marginTop: 12 }}>Click any cell to see topics, pain points, and AI-generated product concepts for that zone.</p>
        </div>
      )}

      {/* How to Read */}
      <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, marginTop: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Lightbulb style={{ width: 14, height: 14, color: C.amber }} /> How to Read This Map
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 12, color: C.slate }}>
          <div><p style={{ fontWeight: 600, color: C.sage, marginBottom: 4 }}>Green (High Score)</p><p style={{ margin: 0 }}>Strong white-space: high demand + low competition + high customer pain. Best zones for new product launches.</p></div>
          <div><p style={{ fontWeight: 600, color: C.amber, marginBottom: 4 }}>Amber (Moderate)</p><p style={{ margin: 0 }}>Some opportunity exists but either competition is moderate or customer satisfaction is decent. Needs differentiation.</p></div>
          <div><p style={{ fontWeight: 600, color: C.stone, marginBottom: 4 }}>Gray (Low Score)</p><p style={{ margin: 0 }}>Saturated or well-served market. Existing products meet customer needs at current prices. Higher barrier to entry.</p></div>
        </div>
      </div>

      {/* Drawer */}
      {selectedCell && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={closeDrawer} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 540, background: C.card, borderLeft: `1px solid ${C.border}`, overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
            <div style={{ position: 'sticky', top: 0, background: C.card, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: C.charcoalDeep }}>{selectedCell.price} / {selectedCell.comp} Competition</h2>
                <p style={{ fontSize: 12, color: C.stone, margin: '2px 0 0' }}>Zone drill-down</p>
              </div>
              <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.stone }}><X style={{ width: 18, height: 18 }} /></button>
            </div>

            {drillLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: C.sand }}>Loading analysis...</div>
            ) : drillDown ? (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ background: C.bg, borderRadius: 10, padding: 14, border: `1px solid ${C.borderLight}` }}>
                  <p style={{ fontSize: 13, color: C.slate, lineHeight: 1.6, margin: 0 }}>{drillDown.summary}</p>
                </div>

                {drillDown.product_concepts.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: C.sage, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Lightbulb style={{ width: 14, height: 14 }} /> Product Concepts</h3>
                    {drillDown.product_concepts.map((concept, i) => (
                      <div key={i} style={{ background: C.sageLight, borderRadius: 10, padding: '14px 16px', marginBottom: 8, border: `1px solid ${C.sage}20` }}>
                        <h4 style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: '0 0 4px' }}>{concept.title}</h4>
                        <p style={{ fontSize: 11, color: C.slate, margin: '0 0 8px' }}>{concept.description}</p>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: C.sage + '20', color: C.sage, fontWeight: 600 }}>Target: {concept.target_price}</span>
                        {concept.key_differentiators.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 10, color: C.stone, marginBottom: 4 }}>Differentiators:</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {concept.key_differentiators.map((d, j) => <span key={j} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: C.borderLight, color: C.ink }}>{d}</span>)}
                            </div>
                          </div>
                        )}
                        {concept.unmet_needs.length > 0 && (
                          <div style={{ marginTop: 8 }}>
                            <p style={{ fontSize: 10, color: C.stone, marginBottom: 4 }}>Unmet needs:</p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {concept.unmet_needs.map((n, j) => <span key={j} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: C.amberLight, color: C.amber }}>{n}</span>)}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {drillDown.topics.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: C.charcoalDeep, marginBottom: 8 }}>Topics ({drillDown.topics.length})</h3>
                    {drillDown.topics.map(topic => {
                      const s = STAGE[topic.stage] || { bg: C.borderLight, text: C.stone }
                      return (
                        <a key={topic.id} href={`/topics/${topic.id}`} style={{
                          display: 'block', background: C.bg, borderRadius: 10, padding: '12px 14px',
                          border: `1px solid ${C.borderLight}`, marginBottom: 6, textDecoration: 'none', color: C.ink,
                          transition: 'border-color 0.15s',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{topic.name}</span>
                            <ChevronRight style={{ width: 14, height: 14, color: C.sand }} />
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                            <span style={{ fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: s.bg, color: s.text, textTransform: 'capitalize' }}>{topic.stage}</span>
                            {topic.opportunity_score != null && <span style={{ fontSize: 11, color: C.sage }}>Opp: {topic.opportunity_score.toFixed(0)}</span>}
                            {topic.median_price != null && <span style={{ fontSize: 11, color: C.slate }}>${topic.median_price.toFixed(0)}</span>}
                            {topic.dissatisfaction_pct != null && topic.dissatisfaction_pct > 0 && <span style={{ fontSize: 11, color: C.amber }}>{topic.dissatisfaction_pct.toFixed(0)}% pain</span>}
                          </div>
                          {topic.top_complaints.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                              {topic.top_complaints.slice(0, 3).map((c, i) => <span key={i} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: C.roseLight, color: C.rose }}>{c}</span>)}
                            </div>
                          )}
                        </a>
                      )
                    })}
                  </div>
                )}
              </div>
            ) : <div style={{ padding: 32, textAlign: 'center', color: C.sand }}>No data available for this cell.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
