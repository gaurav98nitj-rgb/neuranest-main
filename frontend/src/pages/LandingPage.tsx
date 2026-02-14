import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import {
  TrendingUp, Zap, Shield, BarChart3, Bell, Download,
  ArrowRight, ChevronRight, Eye, Sparkles, Globe, Target,
  CheckCircle2, Star, ArrowUpRight
} from 'lucide-react'

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

const SAMPLE_TRENDS = [
  { name: 'Portable Blender Pro', stage: 'exploding', score: 87, growth: '+245%', category: 'Kitchen' },
  { name: 'Smart Garden Kit', stage: 'exploding', score: 82, growth: '+189%', category: 'Home' },
  { name: 'Ashwagandha Gummies', stage: 'emerging', score: 76, growth: '+124%', category: 'Health' },
  { name: 'LED Face Mask', stage: 'emerging', score: 71, growth: '+98%', category: 'Beauty' },
  { name: 'Foldable Treadmill', stage: 'peaking', score: 68, growth: '+67%', category: 'Fitness' },
]

const FEATURES = [
  { icon: TrendingUp, title: 'Multi-Source Trend Detection', description: 'Aggregate signals from Google Trends, Reddit, and Amazon to identify product opportunities before they peak.', color: '#E8714A' },
  { icon: Zap, title: 'Exploding Topic Alerts', description: 'Get notified when a product niche hits escape velocity. Our ML models detect acceleration patterns in real-time.', color: '#D4930D' },
  { icon: BarChart3, title: 'Prophet Demand Forecasting', description: '3-6 month demand forecasts with confidence intervals. Know where a trend is heading before committing inventory.', color: '#1A8754' },
  { icon: Shield, title: 'Competition Intelligence', description: 'Amazon ASIN analysis, brand concentration, pricing gaps, and review sentiment — all in one view.', color: '#7C3AED' },
  { icon: Target, title: '7-Factor Opportunity Score', description: 'Weighted scoring across demand growth, acceleration, competition, cross-source confirmation, and more.', color: '#C0392B' },
  { icon: Sparkles, title: 'Gen-Next Product Specs', description: 'AI-generated product improvement roadmaps: must-fix issues, must-add features, and market positioning.', color: '#2D3E50' },
]

const stageBadge = (stage: string) => {
  const styles: Record<string, string> = {
    exploding: 'bg-coral-100 text-coral-500 border-coral-200',
    emerging: 'bg-sage-50 text-sage-400 border-sage-200',
    peaking: 'bg-amber-50 text-amber-300 border-amber-100',
    declining: 'bg-rose-50 text-rose-400 border-rose-100',
  }
  return styles[stage] || 'bg-sand-200 text-sand-600 border-sand-300'
}

export default function LandingPage() {
  const navigate = useNavigate()
  const isAuth = useAuthStore((s) => s.isAuthenticated)
  const topicsCount = useCounter(194)
  const dataPoints = useCounter(21500)
  const sources = useCounter(5)

  return (
    <div className="min-h-screen bg-sand-50 text-sand-900 overflow-hidden">
      {/* Subtle warm grid */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(232,113,74,0.06) 1px, transparent 0)`,
          backgroundSize: '48px 48px',
        }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] rounded-full blur-[120px]" style={{ background: 'rgba(232,113,74,0.06)' }} />
      </div>

      <div className="relative z-10">
        {/* NAV */}
        <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#E8714A' }}>
              <BarChart3 className="h-5 w-5 text-white" />
            </div>
            <span style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, fontSize: '1.25rem', letterSpacing: '-0.02em', color: '#1A2A3A' }}>
              NeuraNest
            </span>
          </div>
          <div className="flex items-center gap-4">
            {isAuth ? (
              <button onClick={() => navigate('/dashboard')}
                className="px-5 py-2.5 bg-coral-400 hover:bg-coral-500 text-white rounded-lg text-sm font-semibold transition-all duration-200">
                Go to Dashboard <ArrowRight className="inline h-4 w-4 ml-1" />
              </button>
            ) : (
              <>
                <Link to="/auth/login" className="text-sm text-sand-600 hover:text-charcoal-700 transition-colors font-medium">Log in</Link>
                <Link to="/auth/signup" className="px-5 py-2.5 bg-coral-400 hover:bg-coral-500 text-white rounded-lg text-sm font-semibold transition-all duration-200">
                  Start Free <ArrowRight className="inline h-4 w-4 ml-1" />
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* HERO */}
        <section className="px-8 pt-16 pb-24 max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-coral-50 border border-coral-200 text-coral-500 text-xs font-medium mb-6">
                <Zap className="h-3.5 w-3.5" />
                Tracking 194 product niches across 5 data sources
              </div>

              <h1 className="text-5xl lg:text-6xl leading-[1.08] tracking-tight mb-6"
                  style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, color: '#1A2A3A' }}>
                Spot exploding<br />product trends<br />
                <span style={{ color: '#E8714A' }}>months early.</span>
              </h1>

              <p className="text-lg text-sand-600 leading-relaxed mb-8 max-w-lg">
                NeuraNest ingests signals from Google Trends, Reddit, and Amazon — then scores, forecasts, and ranks product opportunities so you can move before the market catches on.
              </p>

              <div className="flex items-center gap-4 mb-10">
                <Link to={isAuth ? '/dashboard' : '/auth/signup'}
                  className="group px-7 py-3.5 bg-coral-400 hover:bg-coral-500 text-white rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2">
                  {isAuth ? 'Open Dashboard' : 'Get Started Free'}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Link>
                <Link to={isAuth ? '/explore' : '/auth/login'}
                  className="px-7 py-3.5 border border-sand-300 hover:border-coral-300 text-sand-700 hover:text-coral-500 rounded-xl text-sm font-semibold transition-all duration-200">
                  Explore Trends
                </Link>
              </div>

              <div className="flex items-center gap-8">
                <div>
                  <p className="text-2xl font-bold text-charcoal-800 tabular-nums">{topicsCount.toLocaleString()}</p>
                  <p className="text-xs text-sand-500 uppercase tracking-wider mt-0.5">Topics Tracked</p>
                </div>
                <div className="w-px h-8 bg-sand-300" />
                <div>
                  <p className="text-2xl font-bold text-charcoal-800 tabular-nums">{dataPoints.toLocaleString()}+</p>
                  <p className="text-xs text-sand-500 uppercase tracking-wider mt-0.5">Data Points</p>
                </div>
                <div className="w-px h-8 bg-sand-300" />
                <div>
                  <p className="text-2xl font-bold text-charcoal-800 tabular-nums">{sources}</p>
                  <p className="text-xs text-sand-500 uppercase tracking-wider mt-0.5">Data Sources</p>
                </div>
              </div>
            </div>

            {/* Preview card */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-3xl blur-2xl" style={{ background: 'rgba(232,113,74,0.08)' }} />
              <div className="relative bg-white border border-sand-300 rounded-2xl p-6 shadow-lg">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-semibold text-charcoal-700">Top Trending Products</h3>
                  <span className="text-[10px] text-coral-500 bg-coral-50 px-2 py-1 rounded-full">Live</span>
                </div>
                <div className="space-y-3">
                  {SAMPLE_TRENDS.map((trend, i) => (
                    <div key={trend.name}
                      className="flex items-center gap-4 p-3 rounded-xl bg-sand-50 border border-sand-200 hover:border-coral-200 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-sm font-semibold text-charcoal-800 truncate">{trend.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border capitalize font-medium ${stageBadge(trend.stage)}`}>
                            {trend.stage}
                          </span>
                        </div>
                        <p className="text-xs text-sand-500">{trend.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-sage-400">{trend.growth}</p>
                        <p className="text-[10px] text-sand-500">Score: {trend.score}</p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-sand-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-sand-200 flex items-center justify-between">
                  <span className="text-[10px] text-sand-500">Updated daily from 5 sources</span>
                  <Link to={isAuth ? '/explore' : '/auth/signup'} className="text-xs text-coral-400 hover:text-coral-500 font-medium flex items-center gap-1 transition-colors">
                    View all 194 topics <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="px-8 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl tracking-tight mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, color: '#1A2A3A' }}>
              Everything you need to find<br /><span style={{ color: '#E8714A' }}>winning products</span>
            </h2>
            <p className="text-sand-600 max-w-xl mx-auto">From raw data signals to actionable product specs — NeuraNest handles the entire intelligence pipeline.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="group p-6 rounded-2xl bg-white border border-sand-200 hover:border-coral-200 transition-all duration-300 hover:shadow-md">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: `${feature.color}10`, border: `1px solid ${feature.color}25` }}>
                  <feature.icon className="h-5 w-5" style={{ color: feature.color }} />
                </div>
                <h3 className="text-base font-bold text-charcoal-800 mb-2">{feature.title}</h3>
                <p className="text-sm text-sand-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="px-8 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl tracking-tight mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, color: '#1A2A3A' }}>
              From signal to decision in <span style={{ color: '#E8714A' }}>three steps</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { step: '01', title: 'We ingest signals', description: 'Every day, our pipelines pull search interest from Google Trends, social buzz from Reddit, and competitive data from Amazon — covering 194 product niches.', icon: Globe },
              { step: '02', title: 'ML scores & forecasts', description: 'Feature engineering computes growth rates, acceleration, and cross-source confirmation. Prophet models forecast demand 3-6 months ahead.', icon: BarChart3 },
              { step: '03', title: 'You act on insights', description: 'Browse scored opportunities, dive into competition analysis, read review intelligence, and get AI-generated product specs for your next winner.', icon: Target },
            ].map((item, i) => (
              <div key={item.step} className="relative p-6">
                <div className="text-5xl font-black mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif", color: 'rgba(232,113,74,0.15)' }}>{item.step}</div>
                <div className="w-11 h-11 rounded-xl bg-coral-50 border border-coral-200 flex items-center justify-center mb-4">
                  <item.icon className="h-5 w-5 text-coral-400" />
                </div>
                <h3 className="text-lg font-bold text-charcoal-800 mb-2">{item.title}</h3>
                <p className="text-sm text-sand-600 leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section className="px-8 py-24 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl tracking-tight mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, color: '#1A2A3A' }}>
              Simple, transparent pricing
            </h2>
            <p className="text-sand-600">Start free. Upgrade when you're ready to go deeper.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="p-8 rounded-2xl bg-white border border-sand-200">
              <h3 className="text-lg font-bold text-charcoal-800 mb-1">Free Trial</h3>
              <p className="text-sand-500 text-sm mb-6">7 days full access</p>
              <p className="text-4xl mb-6" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, color: '#1A2A3A' }}>$0<span className="text-base font-normal text-sand-500"> for 7 days</span></p>
              <ul className="space-y-3 mb-8">
                {['Full platform access for 7 days', 'Browse all trending topics', 'Trend detail with timeseries chart', 'Opportunity scores', 'No credit card required'].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-sand-700">
                    <CheckCircle2 className="h-4 w-4 text-coral-400 mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <Link to="/auth/signup" className="block w-full py-3 text-center border border-coral-300 hover:border-coral-400 text-coral-500 hover:text-coral-600 rounded-xl text-sm font-semibold transition-all">
                Start Free Trial
              </Link>
            </div>
            <div className="p-8 rounded-2xl bg-white border border-coral-200 relative shadow-md">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-coral-400 text-white text-[10px] font-bold uppercase tracking-wider rounded-full">Popular</div>
              <h3 className="text-lg font-bold text-charcoal-800 mb-1">Pro</h3>
              <p className="text-sand-600 text-sm mb-6">Full intelligence suite</p>
              <p className="text-4xl mb-6" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, color: '#1A2A3A' }}>$99<span className="text-base font-normal text-sand-500">/mo</span></p>
              <ul className="space-y-3 mb-8">
                {['Everything in Free', 'Score explanations & breakdowns', 'Forecast confidence intervals', 'Competition & review intelligence', 'Gen-Next AI product specs', 'Watchlist (up to 50 topics)', 'Alerts (up to 10 active)', 'CSV export'].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-sand-700">
                    <CheckCircle2 className="h-4 w-4 text-coral-400 mt-0.5 flex-shrink-0" />{f}
                  </li>
                ))}
              </ul>
              <Link to="/auth/signup" className="block w-full py-3 text-center bg-coral-400 hover:bg-coral-500 text-white rounded-xl text-sm font-bold transition-all">
                Start Pro Trial
              </Link>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-8 py-24 max-w-4xl mx-auto text-center">
          <div className="p-12 rounded-3xl bg-white border border-sand-200 relative overflow-hidden shadow-sm">
            <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 50% 50%, rgba(232,113,74,0.06) 0%, transparent 70%)` }} />
            <div className="relative z-10">
              <h2 className="text-3xl lg:text-4xl tracking-tight mb-4" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 400, color: '#1A2A3A' }}>
                Stop guessing. Start knowing.
              </h2>
              <p className="text-sand-600 mb-8 max-w-lg mx-auto">
                Join product researchers who use NeuraNest to find high-opportunity niches backed by data, not hunches.
              </p>
              <Link to={isAuth ? '/dashboard' : '/auth/signup'}
                className="inline-flex items-center gap-2 px-8 py-4 bg-coral-400 hover:bg-coral-500 text-white rounded-xl text-sm font-bold transition-all duration-200">
                {isAuth ? 'Go to Dashboard' : 'Create Free Account'}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="px-8 py-8 max-w-7xl mx-auto border-t border-sand-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: '#E8714A' }}>
                <BarChart3 className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-semibold text-sand-600">NeuraNest</span>
            </div>
            <p className="text-xs text-sand-400">© 2026 NeuraNest. Trend Intelligence Platform.</p>
          </div>
        </footer>
      </div>
    </div>
  )
}
