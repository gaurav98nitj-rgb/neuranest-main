import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { brandsApi } from '../lib/api'
import { ArrowLeft, Search, Building2, TrendingUp, TrendingDown, Minus, MessageCircle, ChevronRight } from 'lucide-react'
import clsx from 'clsx'

function SentimentBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span className="text-xs text-brand-500">—</span>
  const isPos = value > 0.05
  const isNeg = value < -0.05
  return (
    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1',
      isPos ? 'bg-emerald-900/60 text-emerald-300' : isNeg ? 'bg-red-900/60 text-red-300' : 'bg-brand-800 text-brand-400'
    )}>
      {isPos ? <TrendingUp className="h-3 w-3" /> : isNeg ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      {(value * 100).toFixed(0)}%
    </span>
  )
}

// Brand List View
function BrandListView() {
  const navigate = useNavigate()
  const [brands, setBrands] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    brandsApi.list({ search: search || undefined, limit: 100 })
      .then(r => setBrands(r.data || []))
      .catch(() => setBrands([]))
      .finally(() => setLoading(false))
  }, [search])

  return (
    <div className="p-6 min-h-screen">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="h-6 w-6 text-brand-400" /> Brand Monitor
        </h1>
        <p className="text-sm text-brand-400 mt-1">{brands.length} brands tracked</p>
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-500" />
        <input type="text" placeholder="Search brands..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-srf-1 border border-ln rounded-lg text-sm text-brand-200 placeholder-brand-600 focus:outline-none focus:border-brand-500"
        />
      </div>

      {loading ? (
        <div className="text-brand-400/40">Loading brands...</div>
      ) : brands.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="h-12 w-12 text-brand-600 mx-auto mb-3" />
          <p className="text-brand-400 text-sm">No brands found. Brands are auto-created when social listening data is ingested.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brands.map(brand => (
            <div key={brand.id} onClick={() => navigate(`/brands/${brand.id}`)}
              className="card p-5 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover bg-srf" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-brand-800 flex items-center justify-center">
                      <span className="text-lg font-bold text-brand-400">{brand.name[0]}</span>
                    </div>
                  )}
                  <div>
                    <h3 className="text-sm font-semibold text-brand-200">{brand.name}</h3>
                    {brand.category_name && <p className="text-xs text-brand-500">{brand.category_name}</p>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-brand-600 group-hover:text-brand-400 transition-colors" />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageCircle className="h-3.5 w-3.5 text-brand-500" />
                  <span className="text-xs text-brand-400">{brand.total_mentions} mentions</span>
                </div>
                <SentimentBadge value={brand.avg_sentiment} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Brand Detail View
function BrandDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [brand, setBrand] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    brandsApi.overview(id, { days: 30 })
      .then(r => setBrand(r.data))
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-6 text-brand-400/40">Loading brand...</div>
  if (!brand) return <div className="p-6 text-red-400">Brand not found</div>

  return (
    <div className="p-6 min-h-screen">
      {/* Header */}
      <button onClick={() => navigate('/brands')} className="flex items-center gap-1 text-sm text-brand-400/60 hover:text-brand-300 mb-3 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Back to Brands
      </button>
      <div className="flex items-center gap-4 mb-6">
        <div className="w-14 h-14 rounded-xl bg-brand-800 flex items-center justify-center">
          <span className="text-2xl font-bold text-brand-400">{brand.name[0]}</span>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{brand.name}</h1>
          <p className="text-sm text-brand-400">
            {brand.category_name || 'Uncategorized'}
            {brand.website && <> · <a href={brand.website} target="_blank" rel="noreferrer" className="text-brand-500 hover:text-brand-300">{brand.website}</a></>}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Total Mentions</p>
          <p className="text-2xl font-bold text-white">{brand.total_mentions}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Avg Sentiment</p>
          <div className="mt-1"><SentimentBadge value={brand.avg_sentiment} /></div>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Share of Voice</p>
          <p className="text-2xl font-bold text-brand-200">{brand.share_of_voice ? `${(brand.share_of_voice * 100).toFixed(1)}%` : '—'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-brand-500 uppercase mb-1">Complaints</p>
          <p className="text-2xl font-bold text-red-400">{brand.top_complaints?.length || 0}</p>
        </div>
      </div>

      {/* Sentiment Trend */}
      {brand.sentiment_trend && brand.sentiment_trend.length > 0 && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4">Sentiment Trend (30d)</h3>
          <div className="flex items-end gap-0.5 h-24">
            {brand.sentiment_trend.map((d: any, i: number) => {
              const val = d.avg_sentiment ?? 0
              const height = Math.abs(val) * 100
              const isPos = val > 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full" title={`${d.date}: ${(val * 100).toFixed(0)}%`}>
                  <div className={clsx('w-full rounded-t', isPos ? 'bg-emerald-500/60' : 'bg-red-500/60')}
                    style={{ height: `${Math.max(height, 2)}%`, minHeight: '2px' }} />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-[10px] text-brand-600">{brand.sentiment_trend[0]?.date}</span>
            <span className="text-[10px] text-brand-600">{brand.sentiment_trend[brand.sentiment_trend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Top Complaints */}
      {brand.top_complaints && brand.top_complaints.length > 0 && (
        <div className="card p-5 mb-6">
          <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4 flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-red-400" /> Top Complaints
          </h3>
          <div className="space-y-3">
            {brand.top_complaints.map((c: any, i: number) => (
              <div key={i} className="p-3 rounded-lg bg-srf border-l-2 border-red-500/50">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-brand-500 uppercase">{c.source}</span>
                  <span className="text-[10px] text-brand-600">{c.date}</span>
                </div>
                <p className="text-sm text-brand-300">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Mentions */}
      {brand.recent_mentions && brand.recent_mentions.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-brand-300 uppercase mb-4">Recent Mentions</h3>
          <div className="space-y-3">
            {brand.recent_mentions.map((m: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-srf">
                <div className={clsx('w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                  m.sentiment === 'positive' ? 'bg-emerald-400' : m.sentiment === 'negative' ? 'bg-red-400' : 'bg-brand-500'
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-brand-300">{m.text}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[10px] text-brand-500 uppercase">{m.source}</span>
                    <span className="text-[10px] text-brand-600">{m.date}</span>
                    {m.engagement > 0 && <span className="text-[10px] text-brand-500">♥ {m.engagement}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Router wrapper
export default function BrandMonitorPage() {
  const { id } = useParams<{ id: string }>()
  return id ? <BrandDetailView /> : <BrandListView />
}
