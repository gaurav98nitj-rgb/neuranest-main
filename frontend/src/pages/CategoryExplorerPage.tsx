import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTopics } from '../hooks/useData'
import { categoriesApi } from '../lib/api'
import { Grid3X3, ChevronRight, ArrowUpRight, ArrowLeft } from 'lucide-react'
import clsx from 'clsx'

const CATEGORY_META: Record<string, { emoji: string; accent: string }> = {
  'Health': { emoji: '💊', accent: 'text-emerald-400' }, 'Electronics': { emoji: '⚡', accent: 'text-blue-400' },
  'Fitness': { emoji: '🏋️', accent: 'text-orange-400' }, 'Kitchen': { emoji: '🍳', accent: 'text-red-400' },
  'Beauty': { emoji: '✨', accent: 'text-pink-400' }, 'Home': { emoji: '🏡', accent: 'text-amber-400' },
  'Baby': { emoji: '👶', accent: 'text-sky-400' }, 'Pet': { emoji: '🐾', accent: 'text-yellow-400' },
  'Outdoor': { emoji: '🏕️', accent: 'text-green-400' }, 'Outdoors': { emoji: '🏕️', accent: 'text-green-400' },
  'Office': { emoji: '💼', accent: 'text-indigo-400' }, 'Fashion': { emoji: '👗', accent: 'text-purple-400' },
}
const DEFAULT_META = { emoji: '📦', accent: 'text-brand-300' }

const STAGE_BADGE: Record<string, string> = {
  exploding: 'bg-orange-900/60 text-orange-300', emerging: 'bg-emerald-900/60 text-emerald-300',
  peaking: 'bg-yellow-900/60 text-yellow-300', declining: 'bg-red-900/60 text-red-300',
  unknown: 'bg-brand-800 text-brand-400',
}
const STAGE_BAR: Record<string, string> = {
  exploding: 'bg-orange-500', emerging: 'bg-emerald-500', peaking: 'bg-yellow-500', declining: 'bg-red-500', unknown: 'bg-brand-600',
}

interface TopicItem {
  id: string; name: string; slug: string; stage: string;
  primary_category: string; opportunity_score: number | null;
  competition_index: number | null; sparkline: number[] | null;
}

export default function CategoryExplorerPage() {
  const navigate = useNavigate()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [apiCategories, setApiCategories] = useState<Record<string, string>>({}) // name -> id mapping
  const { data: topicsData, isLoading } = useTopics({ page_size: 100 })
  const allTopics: TopicItem[] = topicsData?.data || []

  // Fetch real category IDs from API
  useEffect(() => {
    categoriesApi.list().then(r => {
      const map: Record<string, string> = {}
      for (const cat of r.data || []) {
        map[cat.name] = cat.id
      }
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

  if (isLoading) return <div className="p-6 text-brand-400">Loading categories...</div>

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Grid3X3 className="h-6 w-6 text-brand-400" /> Category Explorer
        </h1>
        <p className="text-sm text-brand-400 mt-1">
          {categories.length} categories · {allTopics.length} topics · {totalExploding} exploding · {totalEmerging} emerging
        </p>
      </div>

      {selectedCategory && (
        <button onClick={() => setSelectedCategory(null)}
          className="flex items-center gap-1.5 text-sm text-brand-400 hover:text-brand-200 font-medium mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to all categories
        </button>
      )}

      {!selectedCategory ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map(cat => (
            <div key={cat.name} onClick={() => {
                const catId = apiCategories[cat.name]
                if (catId) { navigate(`/categories/${catId}`) } else { setSelectedCategory(cat.name) }
              }}
              className="group card p-5 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.meta.emoji}</span>
                  <div>
                    <h3 className={clsx('font-bold text-base', cat.meta.accent)}>{cat.name}</h3>
                    <p className="text-xs text-brand-500">{cat.count} topics</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-brand-600 group-hover:text-brand-400 transition-colors" />
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 text-center p-2 bg-srf rounded-lg">
                  <p className="text-lg font-bold text-brand-200">{cat.avgScore.toFixed(1)}</p>
                  <p className="text-[10px] text-brand-500 uppercase">Avg Score</p>
                </div>
                {(cat.stages['exploding'] || 0) > 0 && (
                  <div className="flex-1 text-center p-2 bg-srf rounded-lg">
                    <p className="text-lg font-bold text-orange-400">{cat.stages['exploding']}</p>
                    <p className="text-[10px] text-brand-500 uppercase">Exploding</p>
                  </div>
                )}
                <div className="flex-1 text-center p-2 bg-srf rounded-lg">
                  <p className="text-lg font-bold text-emerald-400">{cat.stages['emerging'] || 0}</p>
                  <p className="text-[10px] text-brand-500 uppercase">Emerging</p>
                </div>
              </div>

              <div className="h-1.5 rounded-full overflow-hidden flex bg-srf mb-4">
                {['exploding', 'emerging', 'peaking', 'declining', 'unknown'].map(stage => {
                  const count = cat.stages[stage] || 0
                  if (count === 0) return null
                  return <div key={stage} className={STAGE_BAR[stage]} style={{ width: `${(count / cat.count) * 100}%` }} title={`${stage}: ${count}`} />
                })}
              </div>

              <div className="space-y-2">
                {cat.topTopics.map((t, i) => (
                  <div key={t.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] text-brand-600 w-4 text-right">{i + 1}.</span>
                      <span className="text-xs font-medium text-brand-200 truncate">{t.name}</span>
                      <span className={clsx('text-[9px] px-1.5 py-0.5 rounded-full font-medium capitalize flex-shrink-0', STAGE_BADGE[t.stage] || STAGE_BADGE.unknown)}>
                        {t.stage}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-brand-300 ml-2 tabular-nums">{t.opportunity_score?.toFixed(1) || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          {(() => {
            const cat = categories.find(c => c.name === selectedCategory)
            if (!cat) return null
            return (
              <div className="card p-6 mb-6">
                <div className="flex items-center gap-4 mb-4">
                  <span className="text-4xl">{cat.meta.emoji}</span>
                  <div>
                    <h2 className={clsx('text-2xl font-bold', cat.meta.accent)}>{selectedCategory}</h2>
                    <p className="text-sm text-brand-400">{cat.count} topics · Avg score: {cat.avgScore.toFixed(1)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {['exploding', 'emerging', 'peaking', 'declining', 'unknown'].map(stage => {
                    const count = cat.stages[stage] || 0
                    if (count === 0) return null
                    return <span key={stage} className={clsx('text-xs px-2.5 py-1 rounded-full font-medium capitalize', STAGE_BADGE[stage])}>{stage}: {count}</span>
                  })}
                </div>
              </div>
            )
          })()}

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ln bg-srf">
                  <th className="text-left text-xs text-brand-400 font-medium uppercase tracking-wider p-4 w-8">#</th>
                  <th className="text-left text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Topic</th>
                  <th className="text-left text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Stage</th>
                  <th className="text-right text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Opportunity</th>
                  <th className="text-right text-xs text-brand-400 font-medium uppercase tracking-wider p-4">Competition</th>
                  <th className="p-4 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {selectedTopics.map((t, i) => (
                  <tr key={t.id} onClick={() => navigate(`/topics/${t.id}`)}
                    className="cursor-pointer transition-colors hover:bg-srf-2 border-b border-ln/30">
                    <td className="p-4 text-xs text-brand-500 font-medium">{i + 1}</td>
                    <td className="p-4"><p className="text-sm font-semibold text-brand-100">{t.name}</p></td>
                    <td className="p-4"><span className={clsx('text-xs px-2.5 py-1 rounded-full font-medium capitalize', STAGE_BADGE[t.stage] || STAGE_BADGE.unknown)}>{t.stage}</span></td>
                    <td className="p-4 text-right">
                      <span className={clsx('text-sm font-bold tabular-nums', (t.opportunity_score || 0) >= 70 ? 'text-emerald-400' : (t.opportunity_score || 0) >= 40 ? 'text-yellow-400' : 'text-red-400')}>
                        {t.opportunity_score?.toFixed(1) || '—'}
                      </span>
                    </td>
                    <td className="p-4 text-right"><span className="text-sm text-brand-300 tabular-nums">{t.competition_index?.toFixed(1) || '—'}</span></td>
                    <td className="p-4"><ArrowUpRight className="h-4 w-4 text-brand-600" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selectedTopics.length === 0 && <div className="p-12 text-center text-brand-500 text-sm">No topics found in this category.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
