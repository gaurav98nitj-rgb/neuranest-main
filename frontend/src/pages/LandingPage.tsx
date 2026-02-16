import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import {
  TrendingUp, Zap, Shield, BarChart3, Bell, Download,
  ArrowRight, ChevronRight, Eye, Sparkles, Globe, Target,
  CheckCircle2, Star, ArrowUpRight
} from 'lucide-react'

// ─── Animated counter hook ───
function useCounter(end: number, duration = 2000) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    let start = 0
    const step = end / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= end) { setCount(end); clearInterval(timer) }
      else setCount(Math.floor(start))
    }, 16)
    return () => clearInterval(timer)
  }, [end, duration])
  return count
}

// ─── Sample trend data for hero chart ───
const SAMPLE_SPARKLINE = [12, 15, 14, 18, 22, 25, 28, 35, 42, 55, 68, 78, 85, 91]
const SAMPLE_TRENDS = [
  { name: 'Hydrogen Water Bottle', stage: 'exploding', score: 92, growth: '+312%', category: 'Health & Wellness' },
  { name: 'Mushroom Coffee', stage: 'exploding', score: 88, growth: '+245%', category: 'Functional Foods' },
  { name: 'Red Light Therapy Panel', stage: 'emerging', score: 81, growth: '+178%', category: 'Biohacking' },
  { name: 'Magnesium Glycinate', stage: 'emerging', score: 76, growth: '+134%', category: 'Supplements' },
  { name: 'Smart Ring Tracker', stage: 'peaking', score: 72, growth: '+89%', category: 'Wearable Tech' },
]

const FEATURES = [
  {
    icon: TrendingUp,
    title: '6-Layer Signal Propagation',
    description: 'Track trends from origin to marketplace across Science, Expert, Social, Search, Competition, and Amazon layers — detecting signals 6-18 months early.',
    color: '#2E86C1',
  },
  {
    icon: Zap,
    title: 'XGBoost Trend Predictor',
    description: 'ML model trained on 27.8M Amazon data points predicts which products will succeed. 102 features per topic, SHAP-explained predictions.',
    color: '#E67E22',
  },
  {
    icon: BarChart3,
    title: 'Science-to-Product Radar',
    description: '1,399 bioRxiv papers analyzed, 32 research clusters identified. Detect ingredient trends 18-36 months before they become Amazon bestsellers.',
    color: '#27AE60',
  },
  {
    icon: Shield,
    title: 'Brand & Competition Intel',
    description: 'Amazon click share trajectories, brand sentiment tracking, share-of-voice analysis, and white-space detection across 1,098 product topics.',
    color: '#8E44AD',
  },
  {
    icon: Target,
    title: 'Entity Resolution Engine',
    description: 'AI-powered matching links Amazon search terms to NeuraNest topics using embeddings, fuzzy matching, and semantic similarity — 55% match rate on 5K terms.',
    color: '#E74C3C',
  },
  {
    icon: Sparkles,
    title: 'AI Gen-Next Product Specs',
    description: 'GPT-powered 4-stage workflow: seed search, idea scoring, competitor analysis, and full product spec generation with market positioning.',
    color: '#F39C12',
  },
]

const stageBadge = (stage: string) => {
  const styles: Record<string, string> = {
    exploding: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    emerging: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    peaking: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    declining: 'bg-red-500/20 text-red-300 border-red-500/30',
  }
  return styles[stage] || 'bg-gray-500/20 text-gray-300 border-gray-500/30'
}

export default function LandingPage() {
  const navigate = useNavigate()
  const isAuth = useAuthStore((s) => s.isAuthenticated)
  const topicsCount = useCounter(1098)
  const dataPoints = useCounter(27800000)
  const sources = useCounter(8)

  return (
    <div className="min-h-screen bg-brand-900 text-white overflow-hidden">
      {/* ─── Subtle grid background ─── */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(46,134,193,0.08) 1px, transparent 0)`,
          backgroundSize: '48px 48px',
        }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-brand-500/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative z-10">
        {/* ─── NAV ─── */}
        <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <span style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif", fontWeight: 700, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>
              NeuraNest
            </span>
          </div>
          <div className="flex items-center gap-4">
            {isAuth ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-5 py-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/25"
              >
                Go to Dashboard <ArrowRight className="inline h-4 w-4 ml-1" />
              </button>
            ) : (
              <>
                <Link to="/auth/login" className="text-sm text-brand-200 hover:text-white transition-colors font-medium">
                  Log in
                </Link>
                <Link
                  to="/auth/signup"
                  className="px-5 py-2.5 bg-brand-500 hover:bg-brand-400 text-white rounded-lg text-sm font-semibold transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/25"
                >
                  Start Free <ArrowRight className="inline h-4 w-4 ml-1" />
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* ─── HERO ─── */}
        <section className="px-8 pt-16 pb-24 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-500/15 border border-brand-500/25 text-brand-300 text-xs font-medium mb-6"
                   style={{ animationDelay: '0.1s' }}>
                <Zap className="h-3.5 w-3.5" />
                Tracking 1,098 topics across 8 data sources — powered by 27.8M Amazon data points
              </div>

              <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.08] tracking-tight mb-6"
                  style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>
                Predict winning
                <br />
                products before
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">
                  the market knows.
                </span>
              </h1>

              <p className="text-lg text-brand-200/80 leading-relaxed mb-8 max-w-lg">
                NeuraNest detects product trends where they originate — in science papers,
                Reddit communities, and TikTok virality — 6 to 18 months before they reach
                Amazon. Our ML models fuse 8 data sources into one prediction score.
              </p>

              <div className="flex items-center gap-4 mb-10">
                <Link
                  to={isAuth ? '/dashboard' : '/auth/signup'}
                  className="group px-7 py-3.5 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-sm font-bold transition-all duration-200 hover:shadow-xl hover:shadow-brand-500/30 flex items-center gap-2"
                >
                  {isAuth ? 'Open Dashboard' : 'Get Started Free'}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link
                  to={isAuth ? '/explore' : '/auth/login'}
                  className="px-7 py-3.5 border border-brand-500/30 hover:border-brand-500/60 text-brand-200 hover:text-white rounded-xl text-sm font-semibold transition-all duration-200"
                >
                  Explore Trends
                </Link>
              </div>

              {/* Live stats */}
              <div className="flex items-center gap-8">
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">{topicsCount.toLocaleString()}</p>
                  <p className="text-xs text-brand-300/60 uppercase tracking-wider mt-0.5">Topics Tracked</p>
                </div>
                <div className="w-px h-8 bg-brand-700" />
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">{(dataPoints / 1000000).toFixed(1)}M+</p>
                  <p className="text-xs text-brand-300/60 uppercase tracking-wider mt-0.5">Amazon Data Points</p>
                </div>
                <div className="w-px h-8 bg-brand-700" />
                <div>
                  <p className="text-2xl font-bold text-white tabular-nums">{sources}</p>
                  <p className="text-xs text-brand-300/60 uppercase tracking-wider mt-0.5">Signal Sources</p>
                </div>
              </div>
            </div>

            {/* Right: Preview card */}
            <div className="relative">
              {/* Glow behind card */}
              <div className="absolute -inset-4 bg-brand-500/10 rounded-3xl blur-2xl" />

              <div className="relative bg-brand-800/60 backdrop-blur-sm border border-brand-700/50 rounded-2xl p-6 shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-semibold text-brand-200">Top Trending Products</h3>
                  <span className="text-[10px] text-brand-400 bg-brand-500/10 px-2 py-1 rounded-full">Live</span>
                </div>

                <div className="space-y-3">
                  {SAMPLE_TRENDS.map((trend, i) => (
                    <div
                      key={trend.name}
                      className="flex items-center gap-4 p-3 rounded-xl bg-brand-900/40 border border-brand-700/30 hover:border-brand-600/40 transition-colors group"
                      style={{ animationDelay: `${i * 0.1}s` }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-white truncate">{trend.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize font-medium ${stageBadge(trend.stage)}`}>
                            {trend.stage}
                          </span>
                        </div>
                        <p className="text-xs text-brand-400">{trend.category}</p>
                      </div>

                      {/* Mini sparkline */}
                      <div className="w-16 h-8 flex items-end gap-px">
                        {SAMPLE_SPARKLINE.slice(i, i + 8).map((v, j) => (
                          <div
                            key={j}
                            className="flex-1 rounded-sm bg-brand-400/40"
                            style={{ height: `${(v / 100) * 100}%`, minHeight: '2px' }}
                          />
                        ))}
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-400">{trend.growth}</p>
                        <p className="text-[10px] text-brand-400">Score: {trend.score}</p>
                      </div>

                      <ArrowUpRight className="h-4 w-4 text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  ))}
                </div>

                <div className="mt-4 pt-4 border-t border-brand-700/30 flex items-center justify-between">
                  <span className="text-[10px] text-brand-500">Updated daily from 8 signal sources</span>
                  <Link
                    to={isAuth ? '/explore' : '/auth/signup'}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 transition-colors"
                  >
                    View all 1,098 topics <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section className="px-8 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4"
                style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>
              Everything you need to find
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-300 to-brand-500">
                winning products
              </span>
            </h2>
            <p className="text-brand-200/60 max-w-xl mx-auto">
              From raw data signals to actionable product specs — NeuraNest handles the entire intelligence pipeline.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl bg-brand-800/30 border border-brand-700/30 hover:border-brand-600/50 transition-all duration-300 hover:bg-brand-800/50"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${feature.color}15`, border: `1px solid ${feature.color}30` }}
                >
                  <feature.icon className="h-5 w-5" style={{ color: feature.color }} />
                </div>
                <h3 className="text-base font-bold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-brand-300/60 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section className="px-8 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4"
                style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>
              From signal to decision in
              <span className="text-brand-400 ml-2">three steps</span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'We ingest 8 signal layers',
                description: 'Every day, our 15 pipelines pull data from Google Trends, Reddit, TikTok, Instagram, Amazon Brand Analytics, bioRxiv science papers, ad creatives, and Facebook — covering 1,098 product topics across 60 categories.',
                icon: Globe,
              },
              {
                step: '02',
                title: 'ML predicts winners',
                description: 'XGBoost model trained on 24 months of Amazon outcomes with 102 temporal features. UDSI v2 learned signal weights replace guesswork. Entity resolution links 27.8M Amazon rows to topics automatically.',
                icon: BarChart3,
              },
              {
                step: '03',
                title: 'You move first',
                description: 'Browse predicted opportunities with SHAP-explained scores. Detect white-space gaps, monitor brand vulnerabilities, and generate AI-powered product specs — all before your competitors see the trend.',
                icon: Target,
              },
            ].map((item, i) => (
              <div key={item.step} className="relative">
                {i < 2 && (
                  <div className="hidden md:block absolute top-12 left-full w-8 border-t border-dashed border-brand-700/50 -translate-y-1/2 z-0" style={{ width: 'calc(100% - 3rem)', left: '85%' }} />
                )}
                <div className="relative z-10 p-6">
                  <div className="text-5xl font-black text-brand-700/40 mb-4" style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>
                    {item.step}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-brand-500/15 border border-brand-500/25 flex items-center justify-center mb-4">
                    <item.icon className="h-5 w-5 text-brand-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-brand-300/60 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── PRICING ─── */}
        <section className="px-8 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4"
                style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>
              Simple, transparent pricing
            </h2>
            <p className="text-brand-200/60">Start free. Upgrade when you're ready to go deeper.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free Trial */}
            <div className="p-8 rounded-2xl bg-brand-800/30 border border-brand-700/30">
              <h3 className="text-lg font-bold text-white mb-1">Free Trial</h3>
              <p className="text-brand-400 text-sm mb-6">7 days full access</p>
              <p className="text-4xl font-extrabold text-white mb-6">$0<span className="text-base font-normal text-brand-400"> for 7 days</span></p>
              <ul className="space-y-3 mb-8">
                {[
                  'Full platform access for 7 days',
                  'Browse 1,098 trending topics',
                  'Trend detail with timeseries chart',
                  'ML-powered opportunity scores',
                  'Brand monitoring dashboard',
                  'No credit card required',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-brand-200/70">
                    <CheckCircle2 className="h-4 w-4 text-brand-500 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth/signup"
                className="block w-full py-3 text-center border border-brand-500/40 hover:border-brand-500/70 text-brand-300 hover:text-white rounded-xl text-sm font-semibold transition-all"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Pro */}
            <div className="p-8 rounded-2xl bg-gradient-to-b from-brand-700/40 to-brand-800/40 border border-brand-500/30 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-500 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">
                Popular
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Pro</h3>
              <p className="text-brand-300 text-sm mb-6">Full intelligence suite</p>
              <p className="text-4xl font-extrabold text-white mb-6">$99<span className="text-base font-normal text-brand-300">/mo</span></p>
              <ul className="space-y-3 mb-8">
                {[
                  'Everything in Free',
                  'SHAP-explained prediction scores',
                  'Amazon BA analytics (27.8M rows)',
                  'Science Radar (1,399 papers)',
                  'Gen-Next AI product specs (GPT)',
                  'White-space opportunity heatmap',
                  'Watchlist (up to 50 topics)',
                  'Alerts (up to 10 active)',
                  'CSV export',
                ].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-brand-100/80">
                    <CheckCircle2 className="h-4 w-4 text-brand-400 mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                to="/auth/signup"
                className="block w-full py-3 text-center bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-sm font-bold transition-all hover:shadow-lg hover:shadow-brand-500/25"
              >
                Start Pro Trial
              </Link>
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section className="px-8 py-24 max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-gradient-to-br from-brand-700/30 to-brand-800/30 border border-brand-600/20 relative overflow-hidden">
            <div className="absolute inset-0 bg-brand-500/5" style={{
              backgroundImage: `radial-gradient(circle at 50% 50%, rgba(46,134,193,0.12) 0%, transparent 70%)`,
            }} />
            <div className="relative z-10">
              <h2 className="text-3xl lg:text-4xl font-extrabold tracking-tight mb-4"
                  style={{ fontFamily: "'Instrument Sans', 'DM Sans', sans-serif" }}>
                Stop guessing. Start knowing.
              </h2>
              <p className="text-brand-200/60 mb-8 max-w-lg mx-auto">
                Join product researchers who use NeuraNest to discover winning niches backed by 27.8M data points, 8 signal sources, and ML-powered predictions.
              </p>
              <Link
                to={isAuth ? '/dashboard' : '/auth/signup'}
                className="inline-flex items-center gap-2 px-8 py-4 bg-brand-500 hover:bg-brand-400 text-white rounded-xl text-sm font-bold transition-all duration-200 hover:shadow-xl hover:shadow-brand-500/30"
              >
                {isAuth ? 'Go to Dashboard' : 'Create Free Account'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer className="px-8 py-8 max-w-7xl mx-auto border-t border-brand-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center">
                <TrendingUp className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-brand-400">NeuraNest</span>
            </div>
            <p className="text-xs text-brand-600">© 2026 NeuraNest. Trend Intelligence Platform.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
