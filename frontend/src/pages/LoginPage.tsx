import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { authApi } from '../lib/api'
import { TrendingUp, ArrowRight, Eye, EyeOff, BarChart3, Zap, Shield } from 'lucide-react'

const NN = {
  orange: '#E16A4A', orangeL: '#F4876A',
  blue: '#0F172A', blueMid: '#1E3A5F',
  mint: '#2ED3A5', purple: '#6B4EFF',
  ink: '#1E293B', slate: '#64748B',
  mist: '#F8FAFC', border: '#E2E8F0',
}

const TRUST_STATS = [
  { value: '1,098', label: 'Topics Tracked' },
  { value: '27.8M', label: 'Amazon Data Points' },
  { value: '8', label: 'Signal Sources' },
]

const HIGHLIGHTS = [
  { icon: TrendingUp, text: 'Detect product trends 6–18 months early' },
  { icon: Zap, text: 'ML-powered opportunity scores on 102 features' },
  { icon: Shield, text: 'Brand intelligence across 1,098 niches' },
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { data } = await authApi.login({ email, password })
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      const { data: user } = await authApi.me()
      login(data.access_token, data.refresh_token, user)
      navigate('/explore')
    } catch (err: any) { setError(err.response?.data?.detail || 'Login failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Left panel: Brand ── */}
      <div style={{
        flex: '0 0 440px', background: `linear-gradient(160deg, ${NN.blue} 0%, ${NN.blueMid} 100%)`,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '48px 48px 48px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Background glow */}
        <div style={{
          position: 'absolute', bottom: -80, right: -80, width: 400, height: 400,
          background: `radial-gradient(circle, rgba(225,106,74,0.18) 0%, transparent 70%)`,
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: 80, left: -60, width: 280, height: 280,
          background: `radial-gradient(circle, rgba(107,78,255,0.12) 0%, transparent 70%)`,
          borderRadius: '50%', pointerEvents: 'none',
        }} />

        {/* Logo */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 56 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrendingUp style={{ width: 19, height: 19, color: '#fff' }} />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: '1.15rem', color: '#fff' }}>
              NeuraNest
            </span>
          </div>

          <h2 style={{
            fontFamily: "'Sora', sans-serif", fontWeight: 800,
            fontSize: '2rem', color: '#fff', lineHeight: 1.2, marginBottom: 16, letterSpacing: '-0.02em',
          }}>
            Predict winning<br />
            <span style={{ color: NN.orange }}>products</span> before<br />
            the market knows.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem', lineHeight: 1.65, marginBottom: 40 }}>
            NeuraNest fuses 8 signal layers into one ML-powered score — giving you 6–18 months ahead of the market.
          </p>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {HIGHLIGHTS.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: 'rgba(225,106,74,0.15)', border: '1px solid rgba(225,106,74,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <h.icon style={{ width: 15, height: 15, color: NN.orange }} />
                </div>
                <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.75)' }}>{h.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 24, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          {TRUST_STATS.map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: '1.3rem', color: '#fff' }}>{s.value}</div>
              <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: Form ── */}
      <div style={{
        flex: 1, background: NN.mist,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{
              fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: '1.75rem',
              color: NN.ink, letterSpacing: '-0.02em', marginBottom: 8,
            }}>
              Welcome back
            </h1>
            <p style={{ fontSize: '0.9rem', color: NN.slate }}>
              Sign in to your trend intelligence dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {error && (
              <div style={{
                padding: '12px 16px', borderRadius: 10,
                background: '#FFF0F0', border: '1px solid #F4ACAC',
                color: '#C0392B', fontSize: '0.85rem',
              }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: NN.ink, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Email
              </label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{
                  width: '100%', padding: '12px 16px', borderRadius: 10, boxSizing: 'border-box',
                  border: `1.5px solid ${NN.border}`, background: '#fff', fontSize: '0.9rem',
                  color: NN.ink, outline: 'none', fontFamily: "'Inter', sans-serif",
                }}
                onFocus={e => (e.target.style.borderColor = NN.orange)}
                onBlur={e => (e.target.style.borderColor = NN.border)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: NN.ink, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%', padding: '12px 44px 12px 16px', borderRadius: 10, boxSizing: 'border-box',
                    border: `1.5px solid ${NN.border}`, background: '#fff', fontSize: '0.9rem',
                    color: NN.ink, outline: 'none', fontFamily: "'Inter', sans-serif",
                  }}
                  onFocus={e => (e.target.style.borderColor = NN.orange)}
                  onBlur={e => (e.target.style.borderColor = NN.border)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: NN.slate, display: 'flex',
                  }}
                >
                  {showPassword ? <EyeOff style={{ width: 16, height: 16 }} /> : <Eye style={{ width: 16, height: 16 }} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '14px', background: loading ? NN.slate : NN.orange,
                color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.9rem',
                fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : `0 4px 16px rgba(225,106,74,0.3)`,
                transition: 'all 0.2s', fontFamily: "'Inter', sans-serif",
              }}
            >
              {loading ? 'Signing in...' : (
                <><span>Sign In</span><ArrowRight style={{ width: 16, height: 16 }} /></>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: NN.slate, marginTop: 24 }}>
            No account?{' '}
            <Link to="/auth/signup" style={{ color: NN.orange, fontWeight: 600, textDecoration: 'none' }}>
              Start free trial
            </Link>
          </p>

          <p style={{ textAlign: 'center', marginTop: 16 }}>
            <Link to="/" style={{ fontSize: '0.8rem', color: NN.slate, textDecoration: 'none' }}>
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
