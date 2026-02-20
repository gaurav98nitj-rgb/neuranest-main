import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { Microscope, Zap, Sparkles, FileText, ChevronRight, X, Beaker, TrendingUp, Clock, Target, Check } from 'lucide-react'

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', borderLight: '#F1F5F9',
  coral: '#E16A4A', coralLight: '#FEF0EB', sage: '#2ED3A5', sageLight: '#EAFAF5',
  amber: '#FFC857', amberLight: '#FFF8E6', rose: '#EF4444', roseLight: '#FEF2F2',
  plum: '#6B4EFF', plumLight: '#F0EEFF', charcoal: '#2C5282', charcoalDeep: '#1E3A5F',
  ink: '#0F172A', slate: '#475569', stone: '#64748B', sand: '#94A3B8',
}

interface Cluster { id: string; label: string; description: string | null; item_count: number; velocity_score: number | null; novelty_score: number | null; avg_recency_days: number | null; top_keywords: string[]; opportunity_count: number }
interface Paper { id: string; source: string; title: string; abstract: string | null; authors: string[]; published_date: string | null; url: string | null; citation_count: number; categories: string[] }
interface Opportunity { id: string; cluster_id: string; cluster_label?: string; topic_id: string | null; title: string; hypothesis: string | null; target_category: string | null; confidence: number | null; status: string; created_at: string | null }
interface ClusterDetail { id: string; label: string; description: string | null; item_count: number; velocity_score: number | null; novelty_score: number | null; top_keywords: string[]; papers: Paper[]; opportunities: Opportunity[] }
interface Overview { total_papers: number; total_clusters: number; total_opportunities: number; avg_velocity: number; avg_novelty: number; top_clusters: { label: string; velocity: number; novelty: number; papers: number }[]; categories_covered: { category: string; count: number }[] }

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}`, position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -16, right: -16, width: 60, height: 60, borderRadius: '50%', background: color, opacity: 0.08 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {icon}
        <span style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.ink, fontFamily: "'JetBrains Mono', monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: C.sand, marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function ScorePill({ value, max = 100 }: { value: number | null; max?: number }) {
  if (value == null) return <span style={{ fontSize: 11, color: C.sand }}>—</span>
  const pct = value / max
  const color = pct > 0.6 ? C.sage : pct > 0.3 ? C.amber : C.stone
  const bg = pct > 0.6 ? C.sageLight : pct > 0.3 ? C.amberLight : C.borderLight
  return <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: bg, color, fontFamily: "'JetBrains Mono', monospace" }}>{typeof value === 'number' ? value.toFixed(1) : value}</span>
}

export default function ScienceRadarPage() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'clusters' | 'opportunities'>('clusters')
  const [selectedCluster, setSelectedCluster] = useState<ClusterDetail | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerLoading, setDrawerLoading] = useState(false)

  useEffect(() => { loadData() }, [])
  const loadData = async () => {
    setLoading(true)
    try {
      const [ov, cl, op] = await Promise.all([api.get('/science/overview'), api.get('/science/clusters?sort=-velocity'), api.get('/science/opportunities')])
      setOverview(ov.data); setClusters(cl.data); setOpportunities(op.data)
    } catch { }
    setLoading(false)
  }

  const openCluster = async (id: string) => {
    setDrawerOpen(true); setDrawerLoading(true)
    try { const res = await api.get(`/science/clusters/${id}`); setSelectedCluster(res.data) } catch { }
    setDrawerLoading(false)
  }

  const acceptOpp = async (id: string) => {
    try {
      await api.post(`/science/opportunities/${id}/accept`)
      setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: 'accepted' } : o))
      if (selectedCluster) setSelectedCluster({ ...selectedCluster, opportunities: selectedCluster.opportunities.map(o => o.id === id ? { ...o, status: 'accepted' } : o) })
    } catch { }
  }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}><div style={{ color: C.plum }}>Loading Science Radar...</div></div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Inter', -apple-system, sans-serif", color: C.ink }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Microscope style={{ width: 22, height: 22, color: C.plum }} />
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: C.charcoalDeep, fontFamily: "'Sora', sans-serif" }}>Science Radar</h1>
        </div>
        <p style={{ fontSize: 13, color: C.stone, marginLeft: 32 }}>Research → product opportunity mapping. Discover science-backed product ideas from arXiv, bioRxiv, and patents.</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        <KpiCard icon={<FileText style={{ width: 14, height: 14, color: C.plum }} />} label="Papers" value={overview?.total_papers || 0} color={C.plum} />
        <KpiCard icon={<Beaker style={{ width: 14, height: 14, color: C.charcoal }} />} label="Clusters" value={overview?.total_clusters || 0} color={C.charcoal} />
        <KpiCard icon={<Target style={{ width: 14, height: 14, color: C.sage }} />} label="Opportunities" value={overview?.total_opportunities || 0} color={C.sage} />
        <KpiCard icon={<Zap style={{ width: 14, height: 14, color: C.amber }} />} label="Avg Velocity" value={overview?.avg_velocity?.toFixed(1) || '0'} sub="papers/month" color={C.amber} />
        <KpiCard icon={<Sparkles style={{ width: 14, height: 14, color: C.coral }} />} label="Avg Novelty" value={overview?.avg_novelty?.toFixed(0) || '0'} sub="out of 100" color={C.coral} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 20, background: C.card, borderRadius: 10, padding: 3, width: 'fit-content', border: `1px solid ${C.border}` }}>
        {(['clusters', 'opportunities'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t ? (t === 'clusters' ? C.plum : C.sage) : 'transparent',
            color: tab === t ? '#fff' : C.stone, transition: 'all 0.2s',
          }}>
            {t === 'clusters' ? `Research Clusters (${clusters.length})` : `Product Opportunities (${opportunities.length})`}
          </button>
        ))}
      </div>

      {/* Clusters */}
      {tab === 'clusters' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {clusters.map(c => (
            <button key={c.id} onClick={() => openCluster(c.id)} style={{
              background: C.card, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.border}`,
              textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s', width: '100%',
              boxShadow: '0 1px 3px rgba(42,37,32,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: '0 0 4px' }}>{c.label}</h3>
                  <p style={{ fontSize: 11, color: C.stone, margin: 0 }}>{c.item_count} papers · {c.opportunity_count} opportunities</p>
                </div>
                <ChevronRight style={{ width: 16, height: 16, color: C.sand, flexShrink: 0 }} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Zap style={{ width: 11, height: 11, color: C.amber }} />
                  <ScorePill value={c.velocity_score} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Sparkles style={{ width: 11, height: 11, color: C.coral }} />
                  <ScorePill value={c.novelty_score} />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {c.top_keywords.slice(0, 4).map((kw, i) => (
                  <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: C.plumLight, color: C.plum, fontWeight: 500 }}>{kw}</span>
                ))}
              </div>
            </button>
          ))}
          {clusters.length === 0 && <div style={{ gridColumn: 'span 3', textAlign: 'center', padding: 60, color: C.sand }}>No research clusters yet. Run the Science Radar pipeline to discover opportunities.</div>}
        </div>
      )}

      {/* Opportunities */}
      {tab === 'opportunities' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opportunities.map(opp => (
            <div key={opp.id} style={{ background: C.card, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, color: C.ink, margin: 0 }}>{opp.title}</h3>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8,
                      background: opp.status === 'accepted' ? C.sageLight : opp.status === 'rejected' ? C.roseLight : C.amberLight,
                      color: opp.status === 'accepted' ? C.sage : opp.status === 'rejected' ? C.rose : C.amber,
                    }}>{opp.status}</span>
                  </div>
                  <p style={{ fontSize: 12, color: C.stone, margin: '0 0 6px' }}>{opp.hypothesis}</p>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                    {opp.target_category && <span style={{ color: C.plum }}>{opp.target_category}</span>}
                    {opp.confidence != null && <span style={{ color: C.sage }}>{(opp.confidence * 100).toFixed(0)}% confidence</span>}
                    {opp.cluster_label && <span style={{ color: C.sand }}>Cluster: {opp.cluster_label}</span>}
                  </div>
                </div>
                {opp.status === 'proposed' && (
                  <button onClick={() => acceptOpp(opp.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '6px 14px',
                    background: C.sage, color: '#fff', border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontSize: 12, fontWeight: 600, marginLeft: 12,
                  }}>
                    <Check style={{ width: 12, height: 12 }} /> Accept
                  </button>
                )}
              </div>
            </div>
          ))}
          {opportunities.length === 0 && <div style={{ textAlign: 'center', padding: 60, color: C.sand }}>No opportunities yet. Run the Science Radar pipeline to generate product ideas.</div>}
        </div>
      )}

      {/* Cluster Detail Drawer */}
      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)' }} onClick={() => setDrawerOpen(false)} />
          <div style={{ position: 'relative', width: '100%', maxWidth: 540, background: C.card, borderLeft: `1px solid ${C.border}`, overflowY: 'auto', boxShadow: '-4px 0 20px rgba(0,0,0,0.08)' }}>
            <div style={{ position: 'sticky', top: 0, background: C.card, borderBottom: `1px solid ${C.border}`, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, color: C.charcoalDeep }}>{selectedCluster?.label || 'Loading...'}</h2>
                <p style={{ fontSize: 12, color: C.stone, margin: '2px 0 0' }}>{selectedCluster?.item_count || 0} papers in cluster</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: C.stone }}>
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>

            {drawerLoading ? (
              <div style={{ padding: 32, textAlign: 'center', color: C.sand }}>Loading cluster...</div>
            ) : selectedCluster ? (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Velocity', value: selectedCluster.velocity_score, color: C.amber },
                    { label: 'Novelty', value: selectedCluster.novelty_score, color: C.coral },
                    { label: 'Papers', value: selectedCluster.item_count, color: C.charcoal },
                  ].map(m => (
                    <div key={m.label} style={{ background: C.bg, borderRadius: 10, padding: 12, textAlign: 'center', border: `1px solid ${C.borderLight}` }}>
                      <div style={{ fontSize: 10, color: C.stone, marginBottom: 4 }}>{m.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value ?? '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Keywords */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {selectedCluster.top_keywords.map((kw, i) => (
                    <span key={i} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: C.plumLight, color: C.plum }}>{kw}</span>
                  ))}
                </div>

                {/* Opportunities */}
                {selectedCluster.opportunities.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: C.sage, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Target style={{ width: 14, height: 14 }} /> Product Opportunities
                    </h3>
                    {selectedCluster.opportunities.map(opp => (
                      <div key={opp.id} style={{ background: C.sageLight, borderRadius: 10, padding: '12px 14px', marginBottom: 6, border: `1px solid ${C.sage}20` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>{opp.title}</p>
                            <p style={{ fontSize: 11, color: C.stone, margin: '3px 0 0' }}>{opp.hypothesis}</p>
                            {opp.confidence != null && <span style={{ fontSize: 11, color: C.sage, marginTop: 4, display: 'inline-block' }}>{(opp.confidence * 100).toFixed(0)}% confidence</span>}
                          </div>
                          {opp.status === 'proposed' ? (
                            <button onClick={() => acceptOpp(opp.id)} style={{ marginLeft: 8, padding: '4px 10px', background: C.sage, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Accept</button>
                          ) : opp.status === 'accepted' ? (
                            <span style={{ fontSize: 11, color: C.sage, marginLeft: 8 }}>Accepted</span>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Papers */}
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: C.charcoalDeep, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText style={{ width: 14, height: 14 }} /> Research Papers ({selectedCluster.papers.length})
                  </h3>
                  {selectedCluster.papers.map(paper => (
                    <div key={paper.id} style={{ background: C.bg, borderRadius: 10, padding: '12px 14px', marginBottom: 6, border: `1px solid ${C.borderLight}` }}>
                      <a href={paper.url || '#'} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, fontWeight: 600, color: C.coral, textDecoration: 'none' }}>
                        {paper.title}
                      </a>
                      <p style={{ fontSize: 11, color: C.stone, margin: '4px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' }}>{paper.abstract}</p>
                      <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: 10, color: C.sand }}>
                        <span style={{ padding: '1px 6px', borderRadius: 4, background: C.borderLight }}>{paper.source}</span>
                        {paper.published_date && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Clock style={{ width: 10, height: 10 }} />{paper.published_date}</span>}
                        <span>{paper.authors.slice(0, 2).join(', ')}{paper.authors.length > 2 ? ` +${paper.authors.length - 2}` : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
