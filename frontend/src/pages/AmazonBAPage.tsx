import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { Upload, Search, TrendingUp, Building2, Clock, CheckCircle2, XCircle, Loader2, BarChart3, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', border: '#E6E1DA', borderLight: '#F0ECE6',
  coral: '#E8714A', coralLight: '#FCEEE8', sage: '#1A8754', sageLight: '#E8F5EE',
  amber: '#D4930D', amberLight: '#FFF8E6', rose: '#C0392B', roseLight: '#FFF0F0',
  plum: '#7C3AED', plumLight: '#F3EEFF', charcoal: '#2D3E50', charcoalDeep: '#1A2A3A',
  ink: '#2A2520', slate: '#5C5549', stone: '#8B8479', sand: '#B8B2A8', cyan: '#0891B2',
}

interface ImportJob { id: string; filename: string; country: string; report_month: string | null; status: string; total_rows: number; rows_imported: number; rows_skipped: number; rows_error: number; error_message: string | null; created_at: string | null; completed_at: string | null }
interface BAStats { total_rows: number; countries: string[]; months: string[]; total_unique_terms: number; total_imports: number; latest_month: string | null }
interface TrendingTerm { search_term: string; current_rank: number; past_rank: number; rank_improvement: number; brand_1: string | null; category_1: string | null; click_share_1: number | null; conversion_share_1: number | null }
interface SearchResult { search_frequency_rank: number; search_term: string; brand_1: string | null; category_1: string | null; click_share_1: number | null; conversion_share_1: number | null; report_month: string; country: string }

const STATUS_ICON: Record<string, { color: string; label: string }> = {
  pending: { color: C.stone, label: 'PENDING' }, processing: { color: C.amber, label: 'PROCESSING' },
  completed: { color: C.sage, label: 'COMPLETED' }, failed: { color: C.rose, label: 'FAILED' },
}

export default function AmazonBAPage() {
  const [stats, setStats] = useState<BAStats | null>(null)
  const [jobs, setJobs] = useState<ImportJob[]>([])
  const [trending, setTrending] = useState<TrendingTerm[]>([])
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'upload' | 'search' | 'trending' | 'brands'>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadCountry, setUploadCountry] = useState('US')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])
  const loadData = async () => {
    setLoading(true)
    try {
      const [s, j] = await Promise.all([api.get('/amazon-ba/stats').catch(() => ({ data: null })), api.get('/amazon-ba/jobs').catch(() => ({ data: [] }))])
      setStats(s.data); setJobs(j.data || [])
      if (s.data?.total_rows > 0) { const t = await api.get('/amazon-ba/trending?limit=30').catch(() => ({ data: [] })); setTrending(t.data || []) }
    } catch {}
    setLoading(false)
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]; if (!file) return
    setUploading(true)
    try {
      const form = new FormData(); form.append('file', file); form.append('country', uploadCountry)
      const res = await api.post('/amazon-ba/upload', form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 600000 })
      alert(`Upload queued! Job ID: ${res.data.job_id}\nFile size: ${res.data.file_size_mb} MB`)
      if (fileRef.current) fileRef.current.value = ''; setTimeout(loadData, 2000)
    } catch (e: any) { alert(`Upload failed: ${e?.response?.data?.detail || e.message}`) }
    setUploading(false)
  }

  const handleSearch = async () => {
    if (searchQuery.length < 2) return
    try { const res = await api.get(`/amazon-ba/search?q=${encodeURIComponent(searchQuery)}&limit=100`); setSearchResults(res.data || []) } catch {}
  }

  const pollJobs = useCallback(async () => { const res = await api.get('/amazon-ba/jobs').catch(() => ({ data: [] })); setJobs(res.data || []) }, [])
  useEffect(() => {
    const hasProcessing = jobs.some(j => j.status === 'processing' || j.status === 'pending')
    if (!hasProcessing) return; const interval = setInterval(pollJobs, 3000); return () => clearInterval(interval)
  }, [jobs, pollJobs])

  const countries = ['US', 'UK', 'DE', 'JP', 'IN', 'AU', 'CA', 'MX', 'FR', 'IT', 'ES', 'BR']

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: C.bg }}><div style={{ color: C.amber }}>Loading Amazon Brand Analytics...</div></div>

  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 10, fontWeight: 600, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}` }
  const tdStyle: React.CSSProperties = { padding: '10px 14px', borderBottom: `1px solid ${C.borderLight}`, fontSize: 13 }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: C.ink }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <BarChart3 style={{ width: 22, height: 22, color: C.amber }} />
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif" }}>Amazon Brand Analytics</h1>
        </div>
        <p style={{ fontSize: 13, color: C.stone, marginLeft: 32 }}>Import, search, and analyze Amazon search term data. Upload monthly BA files to build the ML training dataset.</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Rows', value: (stats?.total_rows || 0).toLocaleString(), color: C.charcoal },
          { label: 'Unique Terms', value: (stats?.total_unique_terms || 0).toLocaleString(), color: C.cyan },
          { label: 'Countries', value: stats?.countries?.length || 0, sub: stats?.countries?.join(', ') || 'None yet', color: C.sage },
          { label: 'Months', value: stats?.months?.length || 0, color: C.plum },
          { label: 'Imports', value: stats?.total_imports || 0, sub: stats?.latest_month || 'No data', color: C.amber },
        ].map(m => (
          <div key={m.label} style={{ background: C.card, borderRadius: 12, padding: '16px 20px', border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.stone, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: m.color, fontFamily: "'JetBrains Mono', monospace" }}>{m.value}</div>
            {m.sub && <div style={{ fontSize: 10, color: C.sand, marginTop: 2 }}>{m.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 3, marginBottom: 20, background: C.card, borderRadius: 10, padding: 3, width: 'fit-content', border: `1px solid ${C.border}` }}>
        {(['overview', 'upload', 'search', 'trending', 'brands'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            textTransform: 'capitalize', background: tab === t ? C.amber : 'transparent', color: tab === t ? '#fff' : C.stone, transition: 'all 0.2s',
          }}>{t}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {trending.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: C.charcoalDeep, marginBottom: 14 }}>Top Rising Terms</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {trending.slice(0, 15).map((t, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 12px', borderRadius: 20, background: C.sageLight, color: C.sage, fontSize: 12, fontWeight: 500 }}>
                    <ArrowUpRight style={{ width: 12, height: 12 }} /> {t.search_term} <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>+{t.rank_improvement.toLocaleString()}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {jobs.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: C.charcoalDeep, margin: 0 }}>Import History</h3>
                <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: C.stone }}>
                  <RefreshCw style={{ width: 12, height: 12 }} /> Refresh
                </button>
              </div>
              {jobs.map(job => {
                const s = STATUS_ICON[job.status] || STATUS_ICON.pending
                return (
                  <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: `1px solid ${C.borderLight}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{job.filename}</div>
                      <div style={{ fontSize: 11, color: C.stone, marginTop: 2 }}>
                        {job.country} · {job.rows_imported.toLocaleString()} rows · {job.created_at ? new Date(job.created_at).toLocaleDateString() : ''}
                      </div>
                      {job.error_message && <div style={{ fontSize: 11, color: C.rose, marginTop: 2 }}>{job.error_message}</div>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: s.color }}>{s.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Upload */}
      {tab === 'upload' && (
        <div style={{ maxWidth: 600 }}>
          <div style={{ background: C.card, borderRadius: 14, padding: 24, border: `1px solid ${C.border}` }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: C.charcoalDeep, marginBottom: 6 }}>Upload Amazon Brand Analytics File</h2>
            <p style={{ fontSize: 12, color: C.stone, marginBottom: 20 }}>Upload your monthly Amazon Brand Analytics search term report. Supports XLSX and CSV files up to 1 GB.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 4 }}>Country</label>
                <select value={uploadCountry} onChange={e => setUploadCountry(e.target.value)} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, color: C.ink }}>
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.slate, marginBottom: 4 }}>File (.xlsx or .csv)</label>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" style={{ fontSize: 13 }} />
              </div>
              <button onClick={handleUpload} disabled={uploading} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: uploading ? C.sand : C.amber, color: '#fff',
                border: 'none', borderRadius: 10, cursor: uploading ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, width: 'fit-content',
              }}>
                {uploading ? <Loader2 style={{ width: 14, height: 14, animation: 'spin 1s linear infinite' }} /> : <Upload style={{ width: 14, height: 14 }} />}
                {uploading ? 'Uploading...' : 'Upload & Import'}
              </button>
            </div>
            <div style={{ marginTop: 20, padding: 14, background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: C.slate, marginBottom: 4 }}>Expected File Format (21 columns):</p>
              <p style={{ fontSize: 11, color: C.stone, margin: 0 }}>Search Frequency Rank | Search Term | Top Clicked Brand #1-3 | Top Clicked Category #1-3 | Top Clicked Product #1-3 (ASIN, Title, Click Share, Conversion Share) | Reporting Date</p>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {tab === 'search' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search Amazon BA terms (e.g., hydrogen water, skincare, tinnitus)..."
              style={{ flex: 1, padding: '10px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.card, fontSize: 13, color: C.ink, outline: 'none' }}
            />
            <button onClick={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: C.cyan, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              <Search style={{ width: 14, height: 14 }} /> Search
            </button>
          </div>
          {searchResults.length > 0 && (
            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Rank', 'Search Term', 'Brand #1', 'Category', 'Click %', 'Conv %', 'Month'].map((h, i) => <th key={i} style={{ ...thStyle, textAlign: i >= 4 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {searchResults.map((r, i) => (
                    <tr key={i} style={{ transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono', monospace", color: C.amber, fontWeight: 600 }}>{r.search_frequency_rank}</td>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.ink }}>{r.search_term}</td>
                      <td style={{ ...tdStyle, color: C.slate }}>{r.brand_1 || '-'}</td>
                      <td style={{ ...tdStyle, color: C.stone, fontSize: 11 }}>{r.category_1 || '-'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: C.cyan, fontFamily: "'JetBrains Mono', monospace" }}>{r.click_share_1?.toFixed(2) || '-'}%</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: C.sage, fontFamily: "'JetBrains Mono', monospace" }}>{r.conversion_share_1?.toFixed(2) || '-'}%</td>
                      <td style={{ ...tdStyle, color: C.sand, fontSize: 11 }}>{r.report_month?.slice(0, 7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {searchResults.length === 0 && searchQuery && <p style={{ textAlign: 'center', padding: 40, color: C.sand }}>No results. Try a different search term.</p>}
        </div>
      )}

      {/* Trending */}
      {tab === 'trending' && (
        <div>
          <p style={{ fontSize: 12, color: C.stone, marginBottom: 14 }}>Search terms with the biggest rank improvement (rising demand signals).</p>
          {trending.length > 0 ? (
            <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Search Term', 'Current Rank', 'Previous Rank', 'Improvement', 'Brand #1', 'Category'].map((h, i) => <th key={i} style={{ ...thStyle, textAlign: [1,2,3].includes(i) ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {trending.map((t, i) => (
                    <tr key={i} style={{ transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = C.bg} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ ...tdStyle, fontWeight: 600, color: C.ink }}>{t.search_term}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: C.sage }}>{t.current_rank.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", color: C.stone }}>{t.past_rank.toLocaleString()}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: C.sage, fontWeight: 600, fontSize: 13 }}>
                          <ArrowUpRight style={{ width: 12, height: 12 }} /> +{t.rank_improvement.toLocaleString()}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: C.slate }}>{t.brand_1 || '-'}</td>
                      <td style={{ ...tdStyle, color: C.stone, fontSize: 11 }}>{t.category_1 || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div style={{ textAlign: 'center', padding: 40, color: C.sand }}>Import at least 2 months of data to see trending terms.</div>}
        </div>
      )}

      {/* Brands */}
      {tab === 'brands' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Building2 style={{ width: 36, height: 36, color: C.sand, margin: '0 auto 12px' }} />
          <p style={{ fontSize: 13, color: C.stone }}>Brand analysis will appear after importing Amazon BA data.</p>
          <p style={{ fontSize: 11, color: C.sand }}>Shows brand concentration, click share dominance, and vulnerability signals.</p>
        </div>
      )}
    </div>
  )
}
