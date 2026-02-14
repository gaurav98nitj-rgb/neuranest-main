import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { Upload, Search, TrendingUp, Building2, Clock, CheckCircle2, XCircle, Loader2, BarChart3, ArrowUpRight, ArrowDownRight, ChevronRight, X, RefreshCw } from 'lucide-react'

interface ImportJob {
  id: string; filename: string; country: string; report_month: string | null
  status: string; total_rows: number; rows_imported: number; rows_skipped: number
  rows_error: number; error_message: string | null; created_at: string | null; completed_at: string | null
}

interface BAStats {
  total_rows: number; countries: string[]; months: string[]
  total_unique_terms: number; total_imports: number; latest_month: string | null
}

interface TrendingTerm {
  search_term: string; current_rank: number; past_rank: number; rank_improvement: number
  brand_1: string | null; category_1: string | null; click_share_1: number | null; conversion_share_1: number | null
}

interface SearchResult {
  search_frequency_rank: number; search_term: string; brand_1: string | null
  category_1: string | null; click_share_1: number | null; conversion_share_1: number | null
  report_month: string; country: string
}

const STATUS_ICONS: Record<string, JSX.Element> = {
  pending: <Clock className="h-4 w-4 text-brand-400" />,
  processing: <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />,
  completed: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  failed: <XCircle className="h-4 w-4 text-red-400" />,
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
      const [s, j] = await Promise.all([
        api.get('/amazon-ba/stats').catch(() => ({ data: null })),
        api.get('/amazon-ba/jobs').catch(() => ({ data: [] })),
      ])
      setStats(s.data)
      setJobs(j.data || [])

      // Load trending if data exists
      if (s.data && s.data.total_rows > 0) {
        const t = await api.get('/amazon-ba/trending?limit=30').catch(() => ({ data: [] }))
        setTrending(t.data || [])
      }
    } catch { }
    setLoading(false)
  }

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('country', uploadCountry)
      const res = await api.post('/amazon-ba/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 600000,
      })
      alert(`Upload queued! Job ID: ${res.data.job_id}\nFile size: ${res.data.file_size_mb} MB`)
      if (fileRef.current) fileRef.current.value = ''
      setTimeout(loadData, 2000)
    } catch (e: any) {
      alert(`Upload failed: ${e?.response?.data?.detail || e.message}`)
    }
    setUploading(false)
  }

  const handleSearch = async () => {
    if (searchQuery.length < 2) return
    try {
      const res = await api.get(`/amazon-ba/search?q=${encodeURIComponent(searchQuery)}&limit=100`)
      setSearchResults(res.data || [])
    } catch { }
  }

  const pollJobs = useCallback(async () => {
    const res = await api.get('/amazon-ba/jobs').catch(() => ({ data: [] }))
    setJobs(res.data || [])
  }, [])

  // Poll for processing jobs
  useEffect(() => {
    const hasProcessing = jobs.some(j => j.status === 'processing' || j.status === 'pending')
    if (!hasProcessing) return
    const interval = setInterval(pollJobs, 3000)
    return () => clearInterval(interval)
  }, [jobs, pollJobs])

  const countries = ['US', 'UK', 'DE', 'JP', 'IN', 'AU', 'CA', 'MX', 'FR', 'IT', 'ES', 'BR']

  if (loading) {
    return <div className="min-h-screen bg-srf p-6 flex items-center justify-center">
      <div className="animate-pulse text-brand-400">Loading Amazon Brand Analytics...</div>
    </div>
  }

  return (
    <div className="min-h-screen bg-srf p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="h-7 w-7 text-amber-400" />
          <h1 className="text-2xl font-bold text-white">Amazon Brand Analytics</h1>
        </div>
        <p className="text-brand-300 text-sm ml-10">
          Import, search, and analyze Amazon search term data. Upload monthly BA files to build the ML training dataset.
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <p className="text-xs text-brand-400 mb-1">Total Rows</p>
          <p className="text-2xl font-bold text-white">{(stats?.total_rows || 0).toLocaleString()}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <p className="text-xs text-brand-400 mb-1">Unique Terms</p>
          <p className="text-2xl font-bold text-cyan-300">{(stats?.total_unique_terms || 0).toLocaleString()}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <p className="text-xs text-brand-400 mb-1">Countries</p>
          <p className="text-2xl font-bold text-emerald-300">{stats?.countries?.length || 0}</p>
          <p className="text-xs text-brand-500">{stats?.countries?.join(', ') || 'None yet'}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <p className="text-xs text-brand-400 mb-1">Months</p>
          <p className="text-2xl font-bold text-violet-300">{stats?.months?.length || 0}</p>
        </div>
        <div className="bg-srf-1 rounded-xl p-4 border border-ln">
          <p className="text-xs text-brand-400 mb-1">Imports</p>
          <p className="text-2xl font-bold text-amber-300">{stats?.total_imports || 0}</p>
          <p className="text-xs text-brand-500">{stats?.latest_month || 'No data'}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-srf-1 rounded-lg p-1 w-fit border border-ln">
        {(['overview', 'upload', 'search', 'trending', 'brands'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition-colors ${
              tab === t ? 'bg-amber-600 text-white' : 'text-brand-300 hover:text-white'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* ─── Overview Tab ─── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Import Jobs</h2>
            <button onClick={loadData} className="text-xs text-brand-400 hover:text-white flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
          {jobs.length === 0 ? (
            <div className="bg-srf-1 rounded-xl p-12 border border-ln text-center">
              <Upload className="h-10 w-10 text-brand-500 mx-auto mb-3" />
              <p className="text-brand-300 mb-2">No imports yet</p>
              <p className="text-xs text-brand-500">Go to the Upload tab to import your first Amazon BA file</p>
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.map(job => (
                <div key={job.id} className="bg-srf-1 rounded-xl p-4 border border-ln flex items-center gap-4">
                  {STATUS_ICONS[job.status] || STATUS_ICONS.pending}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{job.filename}</p>
                    <p className="text-xs text-brand-500">
                      {job.country} · {job.report_month || 'auto-detect'} · {job.created_at?.slice(0, 16).replace('T', ' ')}
                    </p>
                  </div>
                  <div className="text-right">
                    {job.status === 'processing' && (
                      <p className="text-sm text-amber-300">{job.rows_imported.toLocaleString()} / {job.total_rows.toLocaleString()} rows</p>
                    )}
                    {job.status === 'completed' && (
                      <p className="text-sm text-emerald-300">{job.rows_imported.toLocaleString()} imported</p>
                    )}
                    {job.status === 'failed' && (
                      <p className="text-xs text-red-400 max-w-xs truncate">{job.error_message}</p>
                    )}
                    <p className={`text-xs font-medium ${
                      job.status === 'completed' ? 'text-emerald-400' :
                      job.status === 'failed' ? 'text-red-400' :
                      job.status === 'processing' ? 'text-amber-400' : 'text-brand-400'
                    }`}>{job.status.toUpperCase()}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Upload Tab ─── */}
      {tab === 'upload' && (
        <div className="max-w-2xl">
          <div className="bg-srf-1 rounded-xl p-6 border border-ln">
            <h2 className="text-lg font-semibold text-white mb-4">Upload Amazon Brand Analytics File</h2>
            <p className="text-sm text-brand-400 mb-6">
              Upload your monthly Amazon Brand Analytics search term report. Supports XLSX and CSV files up to 1 GB.
              The report month is auto-detected from the Reporting Date column.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-brand-300 mb-1">Country</label>
                <select value={uploadCountry} onChange={e => setUploadCountry(e.target.value)}
                  className="bg-srf border border-ln rounded-lg px-3 py-2 text-white text-sm w-40">
                  {countries.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm text-brand-300 mb-1">File (.xlsx or .csv)</label>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv"
                  className="block w-full text-sm text-brand-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-600 file:text-white hover:file:bg-amber-500 cursor-pointer" />
              </div>

              <button onClick={handleUpload} disabled={uploading}
                className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Uploading...' : 'Upload & Import'}
              </button>
            </div>

            <div className="mt-6 p-4 bg-srf rounded-lg border border-ln">
              <p className="text-xs font-medium text-brand-300 mb-2">Expected File Format (21 columns):</p>
              <p className="text-xs text-brand-500">
                Search Frequency Rank | Search Term | Top Clicked Brand #1-3 | Top Clicked Category #1-3 |
                Top Clicked Product #1-3 (ASIN, Title, Click Share, Conversion Share) | Reporting Date
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Search Tab ─── */}
      {tab === 'search' && (
        <div>
          <div className="flex gap-2 mb-4">
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Search Amazon BA terms (e.g., hydrogen water, skincare, tinnitus)..."
              className="flex-1 bg-srf-1 border border-ln rounded-lg px-4 py-2.5 text-white text-sm placeholder-brand-500" />
            <button onClick={handleSearch}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium flex items-center gap-2">
              <Search className="h-4 w-4" /> Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="bg-srf-1 rounded-xl border border-ln overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ln">
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Rank</th>
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Search Term</th>
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Brand #1</th>
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Category</th>
                    <th className="text-right px-4 py-3 text-xs text-brand-400 font-medium">Click %</th>
                    <th className="text-right px-4 py-3 text-xs text-brand-400 font-medium">Conv %</th>
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Month</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((r, i) => (
                    <tr key={i} className="border-b border-ln/50 hover:bg-srf">
                      <td className="px-4 py-2.5 font-mono text-amber-300">{r.search_frequency_rank}</td>
                      <td className="px-4 py-2.5 text-white font-medium">{r.search_term}</td>
                      <td className="px-4 py-2.5 text-brand-300">{r.brand_1 || '-'}</td>
                      <td className="px-4 py-2.5 text-brand-400 text-xs">{r.category_1 || '-'}</td>
                      <td className="px-4 py-2.5 text-right text-cyan-300">{r.click_share_1?.toFixed(2) || '-'}%</td>
                      <td className="px-4 py-2.5 text-right text-emerald-300">{r.conversion_share_1?.toFixed(2) || '-'}%</td>
                      <td className="px-4 py-2.5 text-brand-500 text-xs">{r.report_month?.slice(0, 7)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {searchResults.length === 0 && searchQuery && (
            <p className="text-center py-12 text-brand-400">No results. Try a different search term.</p>
          )}
        </div>
      )}

      {/* ─── Trending Tab ─── */}
      {tab === 'trending' && (
        <div>
          <p className="text-sm text-brand-400 mb-4">Search terms with the biggest rank improvement (rising demand signals).</p>
          {trending.length > 0 ? (
            <div className="bg-srf-1 rounded-xl border border-ln overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ln">
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Search Term</th>
                    <th className="text-right px-4 py-3 text-xs text-brand-400 font-medium">Current Rank</th>
                    <th className="text-right px-4 py-3 text-xs text-brand-400 font-medium">Previous Rank</th>
                    <th className="text-right px-4 py-3 text-xs text-brand-400 font-medium">Improvement</th>
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Brand #1</th>
                    <th className="text-left px-4 py-3 text-xs text-brand-400 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {trending.map((t, i) => (
                    <tr key={i} className="border-b border-ln/50 hover:bg-srf">
                      <td className="px-4 py-2.5 text-white font-medium">{t.search_term}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-emerald-300">{t.current_rank.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-brand-400">{t.past_rank.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <ArrowUpRight className="h-3 w-3" />
                          +{t.rank_improvement.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-brand-300">{t.brand_1 || '-'}</td>
                      <td className="px-4 py-2.5 text-brand-400 text-xs">{t.category_1 || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-brand-400">
              Import at least 2 months of data to see trending terms.
            </div>
          )}
        </div>
      )}

      {/* ─── Brands Tab ─── */}
      {tab === 'brands' && (
        <div className="text-center py-12 text-brand-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 text-brand-500" />
          <p>Brand analysis will appear after importing Amazon BA data.</p>
          <p className="text-xs text-brand-500 mt-1">Shows brand concentration, click share dominance, and vulnerability signals.</p>
        </div>
      )}
    </div>
  )
}
