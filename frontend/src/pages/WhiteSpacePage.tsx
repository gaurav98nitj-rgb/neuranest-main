import { useState, useEffect, useCallback } from 'react'
import { whitespaceApi, categoriesApi } from '../lib/api'
import { Map, TrendingUp, AlertTriangle, Lightbulb, ChevronRight, X, Package, DollarSign, Users, Flame } from 'lucide-react'

interface HeatmapCell {
  price_bucket: string
  price_min: number
  price_max: number
  competition_bucket: string
  competition_min: number
  competition_max: number
  topic_count: number
  avg_dissatisfaction: number
  avg_opportunity_score: number
  avg_competition_index: number
  white_space_score: number
  intensity: number
}

interface CellTopic {
  id: string
  name: string
  slug: string
  stage: string
  primary_category: string | null
  opportunity_score: number | null
  competition_index: number | null
  dissatisfaction_pct: number | null
  median_price: number | null
  feature_requests: string[]
  top_complaints: string[]
}

interface ProductConcept {
  title: string
  description: string
  target_price: string
  key_differentiators: string[]
  unmet_needs: string[]
}

interface CellDrillDown {
  price_bucket: string
  competition_bucket: string
  topics: CellTopic[]
  product_concepts: ProductConcept[]
  summary: string
}

const stageBadge: Record<string, string> = {
  emerging: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  exploding: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
  peaking: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  declining: 'bg-red-500/20 text-red-300 border border-red-500/30',
}

export default function WhiteSpacePage() {
  const [cells, setCells] = useState<HeatmapCell[]>([])
  const [priceBuckets, setPriceBuckets] = useState<string[]>([])
  const [compBuckets, setCompBuckets] = useState<string[]>([])
  const [totalTopics, setTotalTopics] = useState(0)
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [selectedCell, setSelectedCell] = useState<{ price: string; comp: string } | null>(null)
  const [drillDown, setDrillDown] = useState<CellDrillDown | null>(null)
  const [drillLoading, setDrillLoading] = useState(false)

  // Load categories for filter
  useEffect(() => {
    categoriesApi.list().then((res) => {
      setCategories(res.data || [])
    }).catch(() => {})
  }, [])

  // Load heatmap data
  const loadHeatmap = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, any> = {}
      if (categoryFilter) params.category = categoryFilter
      const res = await whitespaceApi.heatmap(params)
      setCells(res.data.cells || [])
      setPriceBuckets(res.data.price_buckets || [])
      setCompBuckets(res.data.competition_buckets || [])
      setTotalTopics(res.data.total_topics || 0)
    } catch {
      setCells([])
    } finally {
      setLoading(false)
    }
  }, [categoryFilter])

  useEffect(() => {
    loadHeatmap()
  }, [loadHeatmap])

  // Load cell drill-down
  const openCell = async (priceB: string, compB: string) => {
    setSelectedCell({ price: priceB, comp: compB })
    setDrillLoading(true)
    try {
      const params: Record<string, any> = {
        price_bucket: priceB,
        competition_bucket: compB,
      }
      if (categoryFilter) params.category = categoryFilter
      const res = await whitespaceApi.cell(params)
      setDrillDown(res.data)
    } catch {
      setDrillDown(null)
    } finally {
      setDrillLoading(false)
    }
  }

  const closeDrawer = () => {
    setSelectedCell(null)
    setDrillDown(null)
  }

  // Get cell data
  const getCell = (price: string, comp: string) =>
    cells.find((c) => c.price_bucket === price && c.competition_bucket === comp)

  // Heatmap color: intensity 0-1 → green (white-space) to gray (no opportunity)
  const cellColor = (intensity: number, count: number) => {
    if (count === 0) return 'bg-brand-900/30'
    if (intensity > 0.75) return 'bg-emerald-500/40 hover:bg-emerald-500/50 border-emerald-500/40'
    if (intensity > 0.5) return 'bg-emerald-600/30 hover:bg-emerald-600/40 border-emerald-500/25'
    if (intensity > 0.25) return 'bg-amber-600/25 hover:bg-amber-600/35 border-amber-500/20'
    return 'bg-brand-800/40 hover:bg-brand-800/50 border-brand-700/30'
  }

  // Summary stats
  const hotCells = cells.filter((c) => c.intensity > 0.6 && c.topic_count > 0)
  const avgDissatisfaction = cells.length > 0
    ? cells.reduce((s, c) => s + c.avg_dissatisfaction, 0) / cells.filter(c => c.topic_count > 0).length || 0
    : 0
  const bestCell = cells.reduce((best, c) => (c.white_space_score > (best?.white_space_score || 0) ? c : best), cells[0])

  return (
    <div className="min-h-screen bg-srf p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Map className="h-7 w-7 text-emerald-400" />
          <h1 className="text-2xl font-bold text-white">White-Space Detection</h1>
        </div>
        <p className="text-brand-300 text-sm ml-10">
          Identify market gaps where demand exists but supply is weak, quality is poor, or prices are misaligned.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-brand-400 text-xs mb-2">
            <Package className="h-4 w-4" />
            Topics Analyzed
          </div>
          <p className="text-2xl font-bold text-white">{totalTopics}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-emerald-400 text-xs mb-2">
            <Flame className="h-4 w-4" />
            Hot Zones
          </div>
          <p className="text-2xl font-bold text-emerald-300">{hotCells.length}</p>
          <p className="text-brand-500 text-xs">high opportunity cells</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-amber-400 text-xs mb-2">
            <AlertTriangle className="h-4 w-4" />
            Avg Dissatisfaction
          </div>
          <p className="text-2xl font-bold text-amber-300">{avgDissatisfaction.toFixed(0)}%</p>
          <p className="text-brand-500 text-xs">negative review rate</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <div className="flex items-center gap-2 text-blue-400 text-xs mb-2">
            <TrendingUp className="h-4 w-4" />
            Best Zone
          </div>
          <p className="text-lg font-bold text-blue-300 truncate">
            {bestCell ? `${bestCell.price_bucket} / ${bestCell.competition_bucket}` : '-'}
          </p>
          <p className="text-brand-500 text-xs">
            {bestCell ? `score: ${bestCell.white_space_score.toFixed(0)}` : ''}
          </p>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex items-center gap-3 mb-6">
        <label className="text-sm text-brand-300">Filter by category:</label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-srf-1 border border-ln rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Heatmap Grid */}
      {loading ? (
        <div className="bg-srf-1 rounded-xl border border-ln p-16 text-center">
          <div className="animate-pulse text-brand-400">Loading white-space analysis...</div>
        </div>
      ) : (
        <div className="bg-srf-1 rounded-xl border border-ln p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Market Opportunity Heatmap</h2>
            <div className="flex items-center gap-4 text-xs text-brand-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-brand-800/40 border border-brand-700/30" />
                Low opportunity
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-amber-600/25 border border-amber-500/20" />
                Moderate
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-emerald-500/40 border border-emerald-500/40" />
                High white-space
              </span>
            </div>
          </div>

          {/* Grid */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="text-left text-xs text-brand-400 font-medium pb-2 pr-3 w-28">
                    <div className="flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      Price ↓ / Comp →
                    </div>
                  </th>
                  {compBuckets.map((cb) => (
                    <th key={cb} className="text-center text-xs text-brand-400 font-medium pb-2 px-2">
                      <div className="flex items-center justify-center gap-1">
                        <Users className="h-3 w-3" />
                        {cb}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {priceBuckets.map((pb) => (
                  <tr key={pb}>
                    <td className="text-sm font-medium text-brand-200 py-1 pr-3">{pb}</td>
                    {compBuckets.map((cb) => {
                      const cell = getCell(pb, cb)
                      const intensity = cell?.intensity || 0
                      const count = cell?.topic_count || 0
                      return (
                        <td key={cb} className="p-1">
                          <button
                            onClick={() => count > 0 && openCell(pb, cb)}
                            className={`w-full rounded-lg border p-4 transition-all ${cellColor(intensity, count)} ${count > 0 ? 'cursor-pointer' : 'cursor-default opacity-50'}`}
                          >
                            <div className="text-center">
                              <p className="text-xl font-bold text-white">
                                {count > 0 ? cell?.white_space_score.toFixed(0) : '-'}
                              </p>
                              <p className="text-xs text-brand-300 mt-1">
                                {count} {count === 1 ? 'topic' : 'topics'}
                              </p>
                              {count > 0 && (
                                <div className="flex items-center justify-center gap-2 mt-2 text-xs">
                                  <span className="text-amber-400">{cell?.avg_dissatisfaction.toFixed(0)}% pain</span>
                                  <span className="text-brand-500">·</span>
                                  <span className="text-emerald-400">{cell?.avg_opportunity_score.toFixed(0)} opp</span>
                                </div>
                              )}
                            </div>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-brand-500 mt-4">
            Click any cell to see topics, pain points, and AI-generated product concepts for that zone.
          </p>
        </div>
      )}

      {/* How to Read */}
      <div className="mt-6 bg-srf-1 rounded-xl border border-ln p-6">
        <h3 className="text-sm font-semibold text-brand-200 mb-3 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-amber-400" />
          How to Read This Map
        </h3>
        <div className="grid grid-cols-3 gap-4 text-sm text-brand-300">
          <div>
            <p className="font-medium text-emerald-300 mb-1">Green (High Score)</p>
            <p>Strong white-space: high demand + low competition + high customer pain. Best zones for new product launches.</p>
          </div>
          <div>
            <p className="font-medium text-amber-300 mb-1">Amber (Moderate)</p>
            <p>Some opportunity exists but either competition is moderate or customer satisfaction is decent. Needs differentiation.</p>
          </div>
          <div>
            <p className="font-medium text-brand-400 mb-1">Gray (Low Score)</p>
            <p>Saturated or well-served market. Existing products meet customer needs at current prices. Higher barrier to entry.</p>
          </div>
        </div>
      </div>

      {/* Slide-over Drawer */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={closeDrawer} />
          <div className="relative w-full max-w-xl bg-srf-1 border-l border-ln overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-srf-1 border-b border-ln p-4 flex items-center justify-between z-10">
              <div>
                <h2 className="text-lg font-bold text-white">
                  {selectedCell.price} / {selectedCell.comp} Competition
                </h2>
                <p className="text-sm text-brand-400">Zone drill-down</p>
              </div>
              <button onClick={closeDrawer} className="p-2 text-brand-400 hover:text-white transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {drillLoading ? (
              <div className="p-8 text-center text-brand-400 animate-pulse">Loading analysis...</div>
            ) : drillDown ? (
              <div className="p-4 space-y-6">
                {/* Summary */}
                <div className="bg-srf rounded-lg p-4 border border-ln">
                  <p className="text-sm text-brand-200 leading-relaxed">{drillDown.summary}</p>
                </div>

                {/* Product Concepts */}
                {drillDown.product_concepts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-emerald-300 mb-3 flex items-center gap-2">
                      <Lightbulb className="h-4 w-4" />
                      Product Concepts
                    </h3>
                    <div className="space-y-3">
                      {drillDown.product_concepts.map((concept, i) => (
                        <div key={i} className="bg-srf rounded-lg p-4 border border-emerald-500/20">
                          <h4 className="text-sm font-semibold text-white mb-1">{concept.title}</h4>
                          <p className="text-xs text-brand-300 mb-3">{concept.description}</p>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                              Target: {concept.target_price}
                            </span>
                          </div>
                          {concept.key_differentiators.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-brand-400 mb-1">Differentiators:</p>
                              <div className="flex flex-wrap gap-1">
                                {concept.key_differentiators.map((d, j) => (
                                  <span key={j} className="text-xs bg-brand-800 text-brand-200 px-2 py-0.5 rounded">
                                    {d}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {concept.unmet_needs.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-brand-400 mb-1">Unmet needs:</p>
                              <div className="flex flex-wrap gap-1">
                                {concept.unmet_needs.map((n, j) => (
                                  <span key={j} className="text-xs bg-amber-500/15 text-amber-300 px-2 py-0.5 rounded">
                                    {n}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Topics in this cell */}
                {drillDown.topics.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-brand-200 mb-3">
                      Topics ({drillDown.topics.length})
                    </h3>
                    <div className="space-y-2">
                      {drillDown.topics.map((topic) => (
                        <a
                          key={topic.id}
                          href={`/topics/${topic.id}`}
                          className="block bg-srf rounded-lg p-3 border border-ln hover:border-brand-500 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-white">{topic.name}</span>
                            <ChevronRight className="h-4 w-4 text-brand-500" />
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs px-2 py-0.5 rounded ${stageBadge[topic.stage] || 'bg-brand-800 text-brand-300'}`}>
                              {topic.stage}
                            </span>
                            {topic.opportunity_score != null && (
                              <span className="text-xs text-emerald-400">
                                Opp: {topic.opportunity_score.toFixed(0)}
                              </span>
                            )}
                            {topic.median_price != null && (
                              <span className="text-xs text-brand-400">
                                ${topic.median_price.toFixed(0)}
                              </span>
                            )}
                            {topic.dissatisfaction_pct != null && topic.dissatisfaction_pct > 0 && (
                              <span className="text-xs text-amber-400">
                                {topic.dissatisfaction_pct.toFixed(0)}% pain
                              </span>
                            )}
                          </div>
                          {topic.top_complaints.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {topic.top_complaints.slice(0, 3).map((c, i) => (
                                <span key={i} className="text-xs bg-red-500/10 text-red-300 px-1.5 py-0.5 rounded">
                                  {c}
                                </span>
                              ))}
                            </div>
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-brand-500">No data available for this cell.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
