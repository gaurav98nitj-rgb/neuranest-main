import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import {
  TrendingUp, Zap, Shield, BarChart3, Bell, Download,
  ArrowRight, ChevronRight, Eye, Sparkles, Globe, Target,
  CheckCircle2, Star, ArrowUpRight
} from 'lucide-react'

// ─── NeuraNest brand tokens ───
const NN = {
  orange: '#E16A4A',
  orangeL: '#F4876A',
  blue: '#0F172A',
  blueMid: '#1E3A5F',
  mint: '#2ED3A5',
  purple: '#6B4EFF',
  gold: '#FFC857',
  ink: '#1E293B',
  slate: '#64748B',
  mist: '#F8FAFC',
  border: '#E2E8F0',
  // backgrounds used on dark card
  cardBg: '#FFFFFF',
}

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

// ─── Sample trend data for hero card ───
const SAMPLE_SPARKLINE = [12, 15, 14, 18, 22, 25, 28, 35, 42, 55, 68, 78, 85, 91]
const SAMPLE_TRENDS = [
  { name: 'Hydrogen Water Bottle', stage: 'exploding', score: 92, growth: '+312%', category: 'Health & Wellness' },
  { name: 'Mushroom Coffee', stage: 'exploding', score: 88, growth: '+245%', category: 'Functional Foods' },
  { name: 'Red Light Therapy', stage: 'emerging', score: 81, growth: '+178%', category: 'Biohacking' },
  { name: 'Magnesium Glycinate', stage: 'emerging', score: 76, growth: '+134%', category: 'Supplements' },
  { name: 'Smart Ring Tracker', stage: 'peaking', score: 72, growth: '+89%', category: 'Wearable Tech' },
]

const STAGE_BADGE: Record<string, { bg: string; text: string; border: string }> = {
  exploding: { bg: '#FFF3EE', text: '#E16A4A', border: '#F4B8A4' },
  emerging: { bg: '#EDFAF5', text: '#17A37A', border: '#9FE5CE' },
  peaking: { bg: '#FFFBEA', text: '#B07D00', border: '#F4D98B' },
  declining: { bg: '#FFF0F0', text: '#C0392B', border: '#F4ACAC' },
}

const FEATURES = [
  {
    icon: TrendingUp,
    title: '6-Layer Signal Propagation',
    description: 'Track trends from origin to marketplace across Science, Expert, Social, Search, Competition, and Amazon layers — detecting signals 6–18 months early.',
    color: NN.orange,
  },
  {
    icon: Zap,
    title: 'XGBoost Trend Predictor',
    description: 'ML model trained on 27.8M Amazon data points predicts which products will succeed. 102 features per topic, SHAP-explained predictions.',
    color: NN.purple,
  },
  {
    icon: BarChart3,
    title: 'Science-to-Product Radar',
    description: '1,399 bioRxiv papers analyzed, 32 research clusters identified. Detect ingredient trends 18–36 months before they become Amazon bestsellers.',
    color: NN.mint,
  },
  {
    icon: Shield,
    title: 'Brand & Competition Intel',
    description: 'Amazon click share trajectories, brand sentiment tracking, share-of-voice analysis, and white-space detection across 1,098 product topics.',
    color: NN.blueMid,
  },
  {
    icon: Target,
    title: 'Entity Resolution Engine',
    description: 'AI-powered matching links Amazon search terms to NeuraNest topics using embeddings, fuzzy matching, and semantic similarity — 55% match rate on 5K terms.',
    color: NN.gold,
  },
  {
    icon: Sparkles,
    title: 'AI Gen-Next Product Specs',
    description: 'GPT-powered 4-stage workflow: seed search, idea scoring, competitor analysis, and full product spec generation with market positioning.',
    color: NN.orange,
  },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const isAuth = useAuthStore((s) => s.isAuthenticated)
  const topicsCount = useCounter(1098)
  const dataPoints = useCounter(27800000)
  const sources = useCounter(8)

  return (
    <div style={{ minHeight: '100vh', background: NN.mist, color: NN.ink, fontFamily: "'Inter', sans-serif", overflowX: 'hidden' }}>

      {/* ─── Subtle dot-grid background ─── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `radial-gradient(circle at 1px 1px, rgba(15,23,42,0.06) 1px, transparent 0)`,
          backgroundSize: '40px 40px',
        }} />
        {/* Hero orange-blue glow */}
        <div style={{
          position: 'absolute', top: '-80px', right: '-120px',
          width: '600px', height: '600px',
          background: `radial-gradient(circle, rgba(225,106,74,0.12) 0%, transparent 70%)`,
          borderRadius: '50%',
        }} />
        <div style={{
          position: 'absolute', top: '200px', left: '-100px',
          width: '400px', height: '400px',
          background: `radial-gradient(circle, rgba(107,78,255,0.07) 0%, transparent 70%)`,
          borderRadius: '50%',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ─── NAV ─── */}
        <nav style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 40px', maxWidth: '1280px', margin: '0 auto',
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`,
            }}>
              <TrendingUp style={{ width: 18, height: 18, color: '#fff' }} />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: '1.2rem', letterSpacing: '-0.02em', color: NN.ink }}>
              NeuraNest
            </span>
          </div>

          {/* Nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isAuth ? (
              <button
                onClick={() => navigate('/dashboard')}
                style={{
                  padding: '10px 22px', background: NN.orange, color: '#fff',
                  border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 600,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = NN.orangeL)}
                onMouseLeave={e => (e.currentTarget.style.background = NN.orange)}
              >
                Go to Dashboard <ArrowRight style={{ width: 15, height: 15 }} />
              </button>
            ) : (
              <>
                <Link
                  to="/auth/login"
                  style={{ fontSize: '0.875rem', color: NN.slate, textDecoration: 'none', fontWeight: 500, padding: '10px 16px' }}
                >
                  Log in
                </Link>
                <Link
                  to="/auth/signup"
                  style={{
                    padding: '10px 22px', background: NN.orange, color: '#fff',
                    borderRadius: 8, fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  Start Free <ArrowRight style={{ width: 15, height: 15 }} />
                </Link>
              </>
            )}
          </div>
        </nav>

        {/* ─── HERO ─── */}
        <section style={{ padding: '60px 40px 80px', maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>

            {/* Left: Copy */}
            <div>
              {/* Pill badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '6px 14px', borderRadius: 999,
                background: `rgba(225,106,74,0.1)`, border: `1px solid rgba(225,106,74,0.25)`,
                color: NN.orange, fontSize: '0.75rem', fontWeight: 600, marginBottom: 24,
              }}>
                <Zap style={{ width: 13, height: 13 }} />
                Tracking 1,098 topics across 8 data sources — powered by 27.8M Amazon data points
              </div>

              <h1 style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 'clamp(2.4rem, 4.5vw, 3.6rem)',
                fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em',
                color: NN.ink, marginBottom: 24,
              }}>
                Predict winning<br />
                products before<br />
                <span style={{
                  background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                }}>
                  the market knows.
                </span>
              </h1>

              <p style={{ fontSize: '1.05rem', color: NN.slate, lineHeight: 1.7, marginBottom: 36, maxWidth: 460 }}>
                NeuraNest detects product trends where they originate — in science papers,
                Reddit communities, and TikTok virality — 6 to 18 months before they reach
                Amazon. Our ML models fuse 8 data sources into one prediction score.
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 48 }}>
                <Link
                  to={isAuth ? '/dashboard' : '/auth/signup'}
                  style={{
                    padding: '14px 28px', background: NN.orange, color: '#fff',
                    borderRadius: 10, fontSize: '0.9rem', fontWeight: 700, textDecoration: 'none',
                    display: 'flex', alignItems: 'center', gap: 8,
                    boxShadow: `0 4px 20px rgba(225,106,74,0.30)`,
                  }}
                >
                  {isAuth ? 'Open Dashboard' : 'Get Started Free'}
                  <ArrowRight style={{ width: 16, height: 16 }} />
                </Link>
                <Link
                  to={isAuth ? '/explore' : '/auth/login'}
                  style={{
                    padding: '14px 28px',
                    border: `1.5px solid ${NN.border}`,
                    background: '#fff',
                    color: NN.ink, borderRadius: 10, fontSize: '0.9rem', fontWeight: 600,
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  Explore Trends
                </Link>
              </div>

              {/* Live stats */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                <div>
                  <p style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.6rem', fontWeight: 800, color: NN.ink, lineHeight: 1 }}>
                    {topicsCount.toLocaleString()}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: NN.slate, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Topics Tracked</p>
                </div>
                <div style={{ width: 1, height: 36, background: NN.border }} />
                <div>
                  <p style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.6rem', fontWeight: 800, color: NN.ink, lineHeight: 1 }}>
                    {(dataPoints / 1000000).toFixed(1)}M+
                  </p>
                  <p style={{ fontSize: '0.7rem', color: NN.slate, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Amazon Data Points</p>
                </div>
                <div style={{ width: 1, height: 36, background: NN.border }} />
                <div>
                  <p style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.6rem', fontWeight: 800, color: NN.ink, lineHeight: 1 }}>
                    {sources}
                  </p>
                  <p style={{ fontSize: '0.7rem', color: NN.slate, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>Signal Sources</p>
                </div>
              </div>
            </div>

            {/* Right: Preview card */}
            <div style={{ position: 'relative' }}>
              {/* Card glow */}
              <div style={{
                position: 'absolute', inset: -20,
                background: `radial-gradient(circle, rgba(225,106,74,0.08) 0%, transparent 70%)`,
                borderRadius: 32,
              }} />
              <div style={{
                position: 'relative',
                background: '#fff',
                border: `1px solid ${NN.border}`,
                borderRadius: 20,
                padding: 24,
                boxShadow: '0 20px 60px rgba(15,23,42,0.12)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                  <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: '0.875rem', fontWeight: 700, color: NN.ink }}>
                    Top Trending Products
                  </h3>
                  <span style={{
                    fontSize: '0.65rem', color: NN.mint, background: 'rgba(46,211,165,0.1)',
                    border: `1px solid rgba(46,211,165,0.25)`, padding: '3px 10px', borderRadius: 999,
                    fontWeight: 600, letterSpacing: '0.05em',
                  }}>
                    ● LIVE
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {SAMPLE_TRENDS.map((trend, i) => {
                    const badge = STAGE_BADGE[trend.stage] || { bg: '#F8FAFC', text: NN.slate, border: NN.border }
                    return (
                      <div
                        key={trend.name}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                          borderRadius: 12, background: NN.mist,
                          border: `1px solid ${NN.border}`,
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                            <p style={{ fontSize: '0.8rem', fontWeight: 600, color: NN.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {trend.name}
                            </p>
                            <span style={{
                              fontSize: '0.65rem', padding: '2px 8px', borderRadius: 999,
                              background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`,
                              fontWeight: 600, textTransform: 'capitalize', whiteSpace: 'nowrap',
                            }}>
                              {trend.stage}
                            </span>
                          </div>
                          <p style={{ fontSize: '0.7rem', color: NN.slate }}>{trend.category}</p>
                        </div>

                        {/* Mini sparkline */}
                        <div style={{ width: 56, height: 28, display: 'flex', alignItems: 'flex-end', gap: 1 }}>
                          {SAMPLE_SPARKLINE.slice(i, i + 8).map((v, j) => (
                            <div
                              key={j}
                              style={{
                                flex: 1, borderRadius: 2,
                                background: trend.stage === 'declining' ? `rgba(192,57,43,0.5)` : `rgba(225,106,74,0.5)`,
                                height: `${(v / 100) * 100}%`, minHeight: 2,
                              }}
                            />
                          ))}
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: '0.8rem', fontWeight: 700, color: NN.mint }}>{trend.growth}</p>
                          <p style={{ fontSize: '0.65rem', color: NN.slate }}>Score: {trend.score}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div style={{
                  marginTop: 16, paddingTop: 16, borderTop: `1px solid ${NN.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontSize: '0.7rem', color: NN.slate }}>Updated daily from 8 signal sources</span>
                  <Link
                    to={isAuth ? '/explore' : '/auth/signup'}
                    style={{ fontSize: '0.75rem', color: NN.orange, textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    View all 1,098 <ChevronRight style={{ width: 12, height: 12 }} />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section style={{ padding: '80px 40px', background: '#fff', borderTop: `1px solid ${NN.border}`, borderBottom: `1px solid ${NN.border}` }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: NN.ink, marginBottom: 16 }}>
                Everything you need to find{' '}
                <span style={{ background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  winning products
                </span>
              </h2>
              <p style={{ color: NN.slate, maxWidth: 520, margin: '0 auto', lineHeight: 1.7 }}>
                From raw data signals to actionable product specs — NeuraNest handles the entire intelligence pipeline.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  style={{
                    padding: 24, borderRadius: 16,
                    background: NN.mist, border: `1px solid ${NN.border}`,
                    transition: 'box-shadow 0.2s, transform 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 32px rgba(15,23,42,0.10)'
                      ; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                      ; (e.currentTarget as HTMLDivElement).style.transform = 'none'
                  }}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${feature.color}15`, border: `1px solid ${feature.color}30`, marginBottom: 16,
                  }}>
                    <feature.icon style={{ width: 20, height: 20, color: feature.color }} />
                  </div>
                  <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: '0.95rem', fontWeight: 700, color: NN.ink, marginBottom: 8 }}>
                    {feature.title}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: NN.slate, lineHeight: 1.65 }}>{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section style={{ padding: '80px 40px', maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: NN.ink, marginBottom: 16 }}>
              From signal to decision in{' '}
              <span style={{ color: NN.orange }}>three steps</span>
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, position: 'relative' }}>
            {[
              {
                step: '01', title: 'We ingest 8 signal layers', icon: Globe,
                description: 'Every day, 15 pipelines pull data from Google Trends, Reddit, TikTok, Instagram, Amazon Brand Analytics, bioRxiv science papers, ad creatives, and Facebook — covering 1,098 product topics.',
              },
              {
                step: '02', title: 'ML predicts winners', icon: BarChart3,
                description: 'XGBoost model trained on 24 months of Amazon outcomes with 102 temporal features. UDSI v2 learned signal weights replace guesswork. Entity resolution links 27.8M Amazon rows to topics automatically.',
              },
              {
                step: '03', title: 'You move first', icon: Target,
                description: 'Browse predicted opportunities with SHAP-explained scores. Detect white-space gaps, monitor brand vulnerabilities, and generate AI-powered product specs — before your competitors see the trend.',
              },
            ].map((item, i) => (
              <div key={item.step} style={{ position: 'relative' }}>
                {/* Connector line */}
                {i < 2 && (
                  <div style={{
                    display: 'none', // responsive hidden via media query workaround
                    position: 'absolute', top: 52, left: '80%', width: '60%',
                    borderTop: `1px dashed ${NN.border}`, zIndex: 0,
                  }} />
                )}
                <div style={{ position: 'relative', zIndex: 1, padding: '28px 28px 28px 0' }}>
                  <div style={{
                    fontFamily: "'Sora', sans-serif", fontSize: '3rem', fontWeight: 900,
                    color: `rgba(15,23,42,0.08)`, lineHeight: 1, marginBottom: 16,
                  }}>
                    {item.step}
                  </div>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `rgba(225,106,74,0.08)`, border: `1px solid rgba(225,106,74,0.2)`, marginBottom: 16,
                  }}>
                    <item.icon style={{ width: 20, height: 20, color: NN.orange }} />
                  </div>
                  <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: '1rem', fontWeight: 700, color: NN.ink, marginBottom: 10 }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: NN.slate, lineHeight: 1.65 }}>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── PRICING ─── */}
        <section style={{ padding: '80px 40px', background: '#fff', borderTop: `1px solid ${NN.border}`, borderBottom: `1px solid ${NN.border}` }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 60 }}>
              <h2 style={{ fontFamily: "'Sora', sans-serif", fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 800, letterSpacing: '-0.03em', color: NN.ink, marginBottom: 12 }}>
                Simple, transparent pricing
              </h2>
              <p style={{ color: NN.slate }}>Start free. Upgrade when you're ready to go deeper.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, maxWidth: 760, margin: '0 auto' }}>
              {/* Free Trial */}
              <div style={{ padding: 32, borderRadius: 20, border: `1px solid ${NN.border}`, background: NN.mist }}>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: NN.ink, marginBottom: 4 }}>Free Trial</h3>
                <p style={{ fontSize: '0.875rem', color: NN.slate, marginBottom: 24 }}>7 days full access</p>
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: '2.2rem', fontWeight: 800, color: NN.ink, marginBottom: 24 }}>
                  $0 <span style={{ fontSize: '0.9rem', fontWeight: 400, color: NN.slate }}>for 7 days</span>
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, paddingLeft: 0, listStyle: 'none' }}>
                  {[
                    'Full platform access for 7 days',
                    'Browse 1,098 trending topics',
                    'Trend detail with timeseries chart',
                    'ML-powered opportunity scores',
                    'Brand monitoring dashboard',
                    'No credit card required',
                  ].map(f => (
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.875rem', color: NN.slate }}>
                      <CheckCircle2 style={{ width: 16, height: 16, color: NN.mint, marginTop: 2, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth/signup"
                  style={{
                    display: 'block', width: '100%', padding: '12px 0', textAlign: 'center',
                    border: `1.5px solid ${NN.border}`, color: NN.ink, borderRadius: 10,
                    fontSize: '0.875rem', fontWeight: 600, textDecoration: 'none',
                    background: '#fff',
                  }}
                >
                  Start Free Trial
                </Link>
              </div>

              {/* Pro */}
              <div style={{
                padding: 32, borderRadius: 20, position: 'relative',
                border: `2px solid ${NN.orange}`,
                background: `linear-gradient(160deg, #fff 0%, #FFF8F5 100%)`,
                boxShadow: `0 8px 40px rgba(225,106,74,0.15)`,
              }}>
                <div style={{
                  position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                  padding: '4px 14px', background: NN.orange, color: '#fff',
                  fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                  borderRadius: 999,
                }}>
                  Popular
                </div>
                <h3 style={{ fontFamily: "'Sora', sans-serif", fontSize: '1.1rem', fontWeight: 700, color: NN.ink, marginBottom: 4 }}>Pro</h3>
                <p style={{ fontSize: '0.875rem', color: NN.slate, marginBottom: 24 }}>Full intelligence suite</p>
                <p style={{ fontFamily: "'Sora', sans-serif", fontSize: '2.2rem', fontWeight: 800, color: NN.ink, marginBottom: 24 }}>
                  $99 <span style={{ fontSize: '0.9rem', fontWeight: 400, color: NN.slate }}>/mo</span>
                </p>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28, paddingLeft: 0, listStyle: 'none' }}>
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
                    <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.875rem', color: NN.slate }}>
                      <CheckCircle2 style={{ width: 16, height: 16, color: NN.orange, marginTop: 2, flexShrink: 0 }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  to="/auth/signup"
                  style={{
                    display: 'block', width: '100%', padding: '12px 0', textAlign: 'center',
                    background: NN.orange, color: '#fff', borderRadius: 10,
                    fontSize: '0.875rem', fontWeight: 700, textDecoration: 'none',
                    boxShadow: `0 4px 16px rgba(225,106,74,0.35)`,
                  }}
                >
                  Start Pro Trial
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ─── CTA BANNER ─── */}
        <section style={{ padding: '80px 40px', maxWidth: '1280px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{
            padding: '64px 40px', borderRadius: 28,
            background: `linear-gradient(135deg, ${NN.blue} 0%, ${NN.blueMid} 100%)`,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Glow overlay */}
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `radial-gradient(circle at 50% 120%, rgba(225,106,74,0.25) 0%, transparent 60%)`,
            }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <h2 style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: 'clamp(1.8rem, 3vw, 2.8rem)',
                fontWeight: 800, letterSpacing: '-0.03em',
                color: '#fff', marginBottom: 16,
              }}>
                Stop guessing. Start knowing.
              </h2>
              <p style={{ color: 'rgba(255,255,255,0.65)', marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
                Join product researchers who use NeuraNest to discover winning niches backed by 27.8M data points, 8 signal sources, and ML-powered predictions.
              </p>
              <Link
                to={isAuth ? '/dashboard' : '/auth/signup'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  padding: '16px 36px', background: NN.orange, color: '#fff',
                  borderRadius: 12, fontSize: '0.95rem', fontWeight: 700, textDecoration: 'none',
                  boxShadow: `0 8px 32px rgba(225,106,74,0.45)`,
                }}
              >
                {isAuth ? 'Go to Dashboard' : 'Create Free Account'}
                <ArrowRight style={{ width: 17, height: 17 }} />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer style={{
          padding: '28px 40px', maxWidth: '1280px', margin: '0 auto',
          borderTop: `1px solid ${NN.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`,
            }}>
              <TrendingUp style={{ width: 14, height: 14, color: '#fff' }} />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontSize: '0.875rem', fontWeight: 700, color: NN.slate }}>NeuraNest</span>
          </div>
          <p style={{ fontSize: '0.75rem', color: NN.slate }}>© 2026 NeuraNest. Trend Intelligence Platform.</p>
        </footer>

      </div>
    </div>
  )
}
