import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { brandsApi } from '../lib/api'
import { ArrowLeft, Search, Building2, TrendingUp, TrendingDown, Minus, MessageCircle, ChevronRight } from 'lucide-react'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', border: '#E6E1DA', borderLight: '#F0ECE6',
  coral: '#E8714A', coralLight: '#FCEEE8', sage: '#1A8754', sageLight: '#E8F5EE',
  amber: '#D4930D', amberLight: '#FFF8E6', rose: '#C0392B', roseLight: '#FFF0F0',
  plum: '#7C3AED', charcoal: '#2D3E50', charcoalDeep: '#1A2A3A',
  ink: '#2A2520', slate: '#5C5549', stone: '#8B8479', sand: '#B8B2A8',
}

function SentimentBadge({ value }: { value: number | null }) {
  if (value === null || value === undefined) return <span style={{ fontSize: 12, color: C.sand }}>—</span>
  const isPos = value > 0.05
  const isNeg = value < -0.05
  const color = isPos ? C.sage : isNeg ? C.rose : C.stone
  const bg = isPos ? C.sageLight : isNeg ? C.roseLight : C.borderLight
  const Icon = isPos ? TrendingUp : isNeg ? TrendingDown : Minus
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
      padding: '3px 10px', borderRadius: 12, background: bg, color,
    }}>
      <Icon style={{ width: 12, height: 12 }} />
      {(value * 100).toFixed(0)}%
    </span>
  )
}

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
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: C.ink }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Building2 style={{ width: 22, height: 22, color: C.charcoal }} />
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif" }}>Brand Monitor</h1>
        </div>
        <p style={{ fontSize: 13, color: C.stone, marginLeft: 32 }}>{brands.length} brands tracked</p>
      </div>

      <div style={{ position: 'relative', maxWidth: 400, marginBottom: 24 }}>
        <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.sand }} />
        <input type="text" placeholder="Search brands..." value={search} onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px 10px 38px', borderRadius: 10, border: `1px solid ${C.border}`,
            background: C.card, fontSize: 13, color: C.ink, outline: 'none',
          }}
        />
      </div>

      {loading ? (
        <div style={{ color: C.sand, padding: 20 }}>Loading brands...</div>
      ) : brands.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 14, padding: 40, textAlign: 'center', border: `1px solid ${C.border}` }}>
          <Building2 style={{ width: 40, height: 40, color: C.sand, margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: C.stone }}>No brands found. Brands are auto-created when social listening data is ingested.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {brands.map(brand => (
            <div key={brand.id} onClick={() => navigate(`/brands/${brand.id}`)}
              style={{
                background: C.card, borderRadius: 14, padding: '18px 22px', border: `1px solid ${C.border}`,
                cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 1px 3px rgba(42,37,32,0.04)',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.coral + '60'; e.currentTarget.style.transform = 'translateY(-2px)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = 'translateY(0)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {brand.logo_url ? (
                    <img src={brand.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover', background: C.bg }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: C.charcoal + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 700, color: C.charcoal }}>{brand.name[0]}</span>
                    </div>
                  )}
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0, color: C.ink }}>{brand.name}</h3>
                    {brand.category_name && <p style={{ fontSize: 11, color: C.stone, margin: '2px 0 0' }}>{brand.category_name}</p>}
                  </div>
                </div>
                <ChevronRight style={{ width: 16, height: 16, color: C.sand }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageCircle style={{ width: 13, height: 13, color: C.stone }} />
                  <span style={{ fontSize: 12, color: C.stone }}>{brand.total_mentions} mentions</span>
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

function BrandDetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [brand, setBrand] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    brandsApi.overview(id, { days: 30 }).then(r => setBrand(r.data)).catch(() => null).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ padding: 24, color: C.sand }}>Loading brand...</div>
  if (!brand) return <div style={{ padding: 24, color: C.rose }}>Brand not found</div>

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: C.ink }}>
      <button onClick={() => navigate('/brands')} style={{
        display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: C.stone,
        background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: 16,
      }}>
        <ArrowLeft style={{ width: 14, height: 14 }} /> Back to Brands
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 52, height: 52, borderRadius: 12, background: C.charcoal + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: C.charcoal }}>{brand.name[0]}</span>
        </div>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif" }}>{brand.name}</h1>
          <p style={{ fontSize: 13, color: C.stone, margin: '4px 0 0' }}>
            {brand.category_name || 'Uncategorized'}
            {brand.website && <> · <a href={brand.website} target="_blank" rel="noreferrer" style={{ color: C.coral }}>{brand.website}</a></>}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Mentions', value: brand.total_mentions, color: C.charcoal },
          { label: 'Avg Sentiment', value: null, color: C.sage, custom: <SentimentBadge value={brand.avg_sentiment} /> },
          { label: 'Share of Voice', value: brand.share_of_voice ? `${(brand.share_of_voice * 100).toFixed(1)}%` : '—', color: C.plum },
          { label: 'Complaints', value: brand.top_complaints?.length || 0, color: C.rose },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{m.label}</div>
            {m.custom || <div style={{ fontSize: 24, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>}
          </div>
        ))}
      </div>

      {/* Sentiment Trend */}
      {brand.sentiment_trend?.length > 0 && (
        <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, marginBottom: 14 }}>Sentiment Trend (30d)</h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 80 }}>
            {brand.sentiment_trend.map((d: any, i: number) => {
              const val = d.avg_sentiment ?? 0
              const height = Math.abs(val) * 100
              return (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%' }} title={`${d.date}: ${(val * 100).toFixed(0)}%`}>
                  <div style={{ width: '100%', borderRadius: '2px 2px 0 0', background: val > 0 ? C.sage + '70' : C.rose + '70', height: `${Math.max(height, 3)}%`, minHeight: 2 }} />
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ fontSize: 10, color: C.sand }}>{brand.sentiment_trend[0]?.date}</span>
            <span style={{ fontSize: 10, color: C.sand }}>{brand.sentiment_trend[brand.sentiment_trend.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Top Complaints */}
      {brand.top_complaints?.length > 0 && (
        <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}`, marginBottom: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
            <MessageCircle style={{ width: 14, height: 14, color: C.rose }} /> Top Complaints
          </h3>
          {brand.top_complaints.map((c: any, i: number) => (
            <div key={i} style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 6, background: C.roseLight, borderLeft: `3px solid ${C.rose}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase' }}>{c.source}</span>
                <span style={{ fontSize: 10, color: C.sand }}>{c.date}</span>
              </div>
              <p style={{ fontSize: 13, color: C.slate, margin: 0 }}>{c.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Recent Mentions */}
      {brand.recent_mentions?.length > 0 && (
        <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: C.charcoalDeep, marginBottom: 14 }}>Recent Mentions</h3>
          {brand.recent_mentions.map((m: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, marginBottom: 4, background: C.bg }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                background: m.sentiment === 'positive' ? C.sage : m.sentiment === 'negative' ? C.rose : C.stone,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, color: C.slate, margin: 0 }}>{m.text}</p>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase' }}>{m.source}</span>
                  <span style={{ fontSize: 10, color: C.sand }}>{m.date}</span>
                  {m.engagement > 0 && <span style={{ fontSize: 10, color: C.stone }}>♥ {m.engagement}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BrandMonitorPage() {
  const { id } = useParams<{ id: string }>()
  return id ? <BrandDetailView /> : <BrandListView />
}
