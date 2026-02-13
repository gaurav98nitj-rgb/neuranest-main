import { useState, useEffect, useCallback } from 'react'
import { api } from '../lib/api'
import { Microscope, Zap, Sparkles, FileText, ChevronRight, X, Beaker, TrendingUp, Clock, Target, Check } from 'lucide-react'

interface Cluster {
  id: string; label: string; description: string | null
  item_count: number; velocity_score: number | null; novelty_score: number | null
  avg_recency_days: number | null; top_keywords: string[]; opportunity_count: number
}

interface Paper {
  id: string; source: string; title: string; abstract: string | null
  authors: string[]; published_date: string | null; url: string | null
  citation_count: number; categories: string[]
}

interface Opportunity {
  id: string; cluster_id: string; cluster_label?: string; topic_id: string | null
  title: string; hypothesis: string | null; target_category: string | null
  confidence: number | null; status: string; created_at: string | null
}

interface ClusterDetail {
  id: string; label: string; description: string | null
  item_count: number; velocity_score: number | null; novelty_score: number | null
  top_keywords: string[]; papers: Paper[]; opportunities: Opportunity[]
}

interface Overview {
  total_papers: number; total_clusters: number; total_opportunities: number
  avg_velocity: number; avg_novelty: number
  top_clusters: { label: string; velocity: number; novelty: number; papers: number }[]
  categories_covered: { category: string; count: number }[]
}

const scoreBg = (val: number | null, max: number = 100) => {
  if (val == null) return 'bg-brand-800'
  const pct = val / max
  if (pct > 0.6) return 'bg-emerald-500/30 text-emerald-300'
  if (pct > 0.3) return 'bg-amber-500/25 text-amber-300'
  return 'bg-brand-800 text-brand-300'
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

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [ov, cl, op] = await Promise.all([
        api.get('/science/overview'),
        api.get('/science/clusters?sort=-velocity'),
        api.get('/science/opportunities'),
      ])
      setOverview(ov.data)
      setClusters(cl.data)
      setOpportunities(op.data)
    } catch { }
    setLoading(false)
  }

  const openCluster = async (id: string) => {
    setDrawerOpen(true)
    setDrawerLoading(true)
    try {
      const res = await api.get(`/science/clusters/${id}`)
      setSelectedCluster(res.data)
    } catch { }
    setDrawerLoading(false)
  }

  const acceptOpp = async (id: string) => {
    try {
      await api.post(`/science/opportunities/${id}/accept`)
      setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: 'accepted' } : o))
      if (selectedCluster) {
        setSelectedCluster({
          ...selectedCluster,
          opportunities: selectedCluster.opportunities.map(o => o.id === id ? { ...o, status: 'accepted' } : o),
        })
      }
    } catch { }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-srf p-6 flex items-center justify-center">
        <div className="animate-pulse text-brand-400">Loading Science Radar...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-srf p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Microscope className="h-7 w-7 text-violet-400" />
          <h1 className="text-2xl font-bold text-white">Science Radar</h1>
        </div>
        <p className="text-brand-300 text-sm ml-10">
          Research → product opportunity mapping. Discover science-backed product ideas from arXiv, bioRxiv, and patents.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-violet-400 text-xs mb-2">
            <FileText className="h-4 w-4" />
            Papers
          </div>
          <p className="text-2xl font-bold text-white">{overview?.total_papers || 0}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-blue-400 text-xs mb-2">
            <Beaker className="h-4 w-4" />
            Clusters
          </div>
          <p className="text-2xl font-bold text-white">{overview?.total_clusters || 0}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-emerald-400 text-xs mb-2">
            <Target className="h-4 w-4" />
            Opportunities
          </div>
          <p className="text-2xl font-bold text-emerald-300">{overview?.total_opportunities || 0}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-amber-400 text-xs mb-2">
            <Zap className="h-4 w-4" />
            Avg Velocity
          </div>
          <p className="text-2xl font-bold text-amber-300">{overview?.avg_velocity?.toFixed(1) || 0}</p>
          <p className="text-brand-500 text-xs">papers/month</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-pink-400 text-xs mb-2">
            <Sparkles className="h-4 w-4" />
            Avg Novelty
          </div>
          <p className="text-2xl font-bold text-pink-300">{overview?.avg_novelty?.toFixed(0) || 0}</p>
          <p className="text-brand-500 text-xs">out of 100</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-srf-1 rounded-lg p-1 w-fit border border-ln">
        <button
          onClick={() => setTab('clusters')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'clusters' ? 'bg-violet-600 text-white' : 'text-brand-300 hover:text-white'}`}
        >
          Research Clusters ({clusters.length})
        </button>
        <button
          onClick={() => setTab('opportunities')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'opportunities' ? 'bg-emerald-600 text-white' : 'text-brand-300 hover:text-white'}`}
        >
          Product Opportunities ({opportunities.length})
        </button>
      </div>

      {/* Clusters Tab */}
      {tab === 'clusters' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusters.map((c) => (
            <button
              key={c.id}
              onClick={() => openCluster(c.id)}
              className="bg-srf-1 rounded-xl p-5 border border-ln hover:border-violet-500/50 transition-all text-left group"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-semibold text-white leading-snug pr-2">{c.label}</h3>
                <ChevronRight className="h-4 w-4 text-brand-500 group-hover:text-violet-400 flex-shrink-0 mt-0.5" />
              </div>
              <p className="text-xs text-brand-400 mb-3 line-clamp-2">{c.description}</p>

              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded ${scoreBg(c.velocity_score, 10)}`}>
                  <Zap className="h-3 w-3 inline mr-1" />
                  Vel: {c.velocity_score ?? '-'}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded ${scoreBg(c.novelty_score)}`}>
                  <Sparkles className="h-3 w-3 inline mr-1" />
                  Nov: {c.novelty_score?.toFixed(0) ?? '-'}
                </span>
                <span className="text-xs bg-brand-800 text-brand-300 px-2 py-0.5 rounded">
                  {c.item_count} papers
                </span>
                {c.opportunity_count > 0 && (
                  <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                    {c.opportunity_count} opps
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {c.top_keywords.slice(0, 4).map((kw, i) => (
                  <span key={i} className="text-xs bg-violet-500/15 text-violet-300 px-1.5 py-0.5 rounded">
                    {kw}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {clusters.length === 0 && (
            <div className="col-span-3 text-center py-16 text-brand-400">
              No research clusters yet. Run the Science Radar pipeline to discover opportunities.
            </div>
          )}
        </div>
      )}

      {/* Opportunities Tab */}
      {tab === 'opportunities' && (
        <div className="space-y-3">
          {opportunities.map((opp) => (
            <div key={opp.id} className="bg-srf-1 rounded-xl p-5 border border-ln">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-white">{opp.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded ${opp.status === 'accepted' ? 'bg-emerald-500/20 text-emerald-300' : opp.status === 'rejected' ? 'bg-red-500/20 text-red-300' : 'bg-amber-500/20 text-amber-300'}`}>
                      {opp.status}
                    </span>
                  </div>
                  <p className="text-xs text-brand-400 mb-2">{opp.hypothesis}</p>
                  <div className="flex items-center gap-3 text-xs">
                    {opp.target_category && (
                      <span className="text-violet-300">{opp.target_category}</span>
                    )}
                    {opp.confidence != null && (
                      <span className="text-emerald-400">{(opp.confidence * 100).toFixed(0)}% confidence</span>
                    )}
                    {opp.cluster_label && (
                      <span className="text-brand-500">Cluster: {opp.cluster_label}</span>
                    )}
                  </div>
                </div>
                {opp.status === 'proposed' && (
                  <button
                    onClick={() => acceptOpp(opp.id)}
                    className="ml-3 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded-lg transition-colors flex items-center gap-1"
                  >
                    <Check className="h-3 w-3" />
                    Accept
                  </button>
                )}
              </div>
            </div>
          ))}
          {opportunities.length === 0 && (
            <div className="text-center py-16 text-brand-400">
              No opportunities yet. Run the Science Radar pipeline to generate product ideas.
            </div>
          )}
        </div>
      )}

      {/* Cluster Detail Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div className="relative w-full max-w-xl bg-srf-1 border-l border-ln overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-srf-1 border-b border-ln p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">{selectedCluster?.label || 'Loading...'}</h2>
                <p className="text-sm text-brand-400">{selectedCluster?.item_count || 0} papers in cluster</p>
              </div>
              <button onClick={() => setDrawerOpen(false)} className="p-2 text-brand-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            {drawerLoading ? (
              <div className="p-8 text-center animate-pulse text-brand-400">Loading cluster...</div>
            ) : selectedCluster ? (
              <div className="p-4 space-y-6">
                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-srf rounded-lg p-3 border border-ln text-center">
                    <p className="text-xs text-brand-400 mb-1">Velocity</p>
                    <p className="text-lg font-bold text-amber-300">{selectedCluster.velocity_score ?? '-'}</p>
                  </div>
                  <div className="bg-srf rounded-lg p-3 border border-ln text-center">
                    <p className="text-xs text-brand-400 mb-1">Novelty</p>
                    <p className="text-lg font-bold text-pink-300">{selectedCluster.novelty_score?.toFixed(0) ?? '-'}</p>
                  </div>
                  <div className="bg-srf rounded-lg p-3 border border-ln text-center">
                    <p className="text-xs text-brand-400 mb-1">Papers</p>
                    <p className="text-lg font-bold text-white">{selectedCluster.item_count}</p>
                  </div>
                </div>

                {/* Keywords */}
                <div className="flex flex-wrap gap-1">
                  {selectedCluster.top_keywords.map((kw, i) => (
                    <span key={i} className="text-xs bg-violet-500/15 text-violet-300 px-2 py-0.5 rounded">{kw}</span>
                  ))}
                </div>

                {/* Opportunities */}
                {selectedCluster.opportunities.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-300 mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Product Opportunities
                    </h3>
                    {selectedCluster.opportunities.map((opp) => (
                      <div key={opp.id} className="bg-srf rounded-lg p-3 border border-emerald-500/20 mb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="text-sm font-medium text-white">{opp.title}</p>
                            <p className="text-xs text-brand-400 mt-1">{opp.hypothesis}</p>
                            {opp.confidence != null && (
                              <span className="text-xs text-emerald-400 mt-1 inline-block">
                                {(opp.confidence * 100).toFixed(0)}% confidence
                              </span>
                            )}
                          </div>
                          {opp.status === 'proposed' && (
                            <button
                              onClick={() => acceptOpp(opp.id)}
                              className="ml-2 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs rounded transition-colors"
                            >
                              Accept
                            </button>
                          )}
                          {opp.status === 'accepted' && (
                            <span className="text-xs text-emerald-400 ml-2">Accepted</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Papers */}
                <div>
                  <h3 className="text-sm font-semibold text-brand-200 mb-2 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Research Papers ({selectedCluster.papers.length})
                  </h3>
                  {selectedCluster.papers.map((paper) => (
                    <div key={paper.id} className="bg-srf rounded-lg p-3 border border-ln mb-2">
                      <a
                        href={paper.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-blue-300 hover:text-blue-200"
                      >
                        {paper.title}
                      </a>
                      <p className="text-xs text-brand-400 mt-1 line-clamp-2">{paper.abstract}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-brand-500">
                        <span className="bg-brand-800 px-1.5 py-0.5 rounded">{paper.source}</span>
                        {paper.published_date && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {paper.published_date}
                          </span>
                        )}
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
