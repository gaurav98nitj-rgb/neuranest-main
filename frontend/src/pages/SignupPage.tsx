import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { authApi } from '../lib/api'
import { TrendingUp, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react'

const NN = {
  orange: '#E16A4A', orangeL: '#F4876A',
  blue: '#0F172A', blueMid: '#1E3A5F',
  mint: '#2ED3A5', purple: '#6B4EFF',
  ink: '#1E293B', slate: '#64748B',
  mist: '#F8FAFC', border: '#E2E8F0',
}

const PRO_FEATURES = [
  'Full platform access for 7 days',
  'Browse 1,098 trending topics with ML scores',
  'Trend charts, forecasts & competition intel',
  'Science Radar — 1,399 bioRxiv papers analyzed',
  'Gen-Next AI product specs (GPT-powered)',
  'No credit card required',
]

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { data } = await authApi.signup({ email, password, org_name: orgName || undefined })
      login(data.access_token, data.refresh_token, { id: '', email, role: 'admin' })
      navigate('/onboarding')
    } catch (err: any) { setError(err.response?.data?.detail || 'Signup failed') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Left panel: Form ── */}
      <div style={{
        flex: 1, background: NN.mist,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 40px',
      }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          {/* Logo (mobile / standalone feel) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 36 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 9,
              background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrendingUp style={{ width: 17, height: 17, color: '#fff' }} />
            </div>
            <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: '1.1rem', color: NN.ink }}>
              NeuraNest
            </span>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: '1.75rem',
              color: NN.ink, letterSpacing: '-0.02em', marginBottom: 6,
            }}>
              Start your free trial
            </h1>
            <p style={{ fontSize: '0.875rem', color: NN.slate }}>
              7 days full access · No credit card required
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
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
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: NN.ink, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Organization <span style={{ color: NN.slate, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
              </label>
              <input
                type="text"
                placeholder="Company name"
                value={orgName}
                onChange={e => setOrgName(e.target.value)}
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
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: NN.ink, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: NN.ink, marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
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
                transition: 'all 0.2s', marginTop: 4, fontFamily: "'Inter', sans-serif",
              }}
            >
              {loading ? 'Creating account...' : (
                <><span>Create Free Account</span><ArrowRight style={{ width: 16, height: 16 }} /></>
              )}
            </button>

            <p style={{ fontSize: '0.72rem', color: NN.slate, textAlign: 'center', lineHeight: 1.5 }}>
              By creating an account you agree to our{' '}
              <span style={{ color: NN.orange, cursor: 'pointer' }}>Terms of Service</span>
              {' '}and{' '}
              <span style={{ color: NN.orange, cursor: 'pointer' }}>Privacy Policy</span>.
            </p>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.875rem', color: NN.slate, marginTop: 20 }}>
            Already have an account?{' '}
            <Link to="/auth/login" style={{ color: NN.orange, fontWeight: 600, textDecoration: 'none' }}>
              Sign in
            </Link>
          </p>

          <p style={{ textAlign: 'center', marginTop: 12 }}>
            <Link to="/" style={{ fontSize: '0.8rem', color: NN.slate, textDecoration: 'none' }}>
              ← Back to home
            </Link>
          </p>
        </div>
      </div>

      {/* ── Right panel: What you get ── */}
      <div style={{
        flex: '0 0 420px', background: `linear-gradient(160deg, ${NN.blue} 0%, ${NN.blueMid} 100%)`,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '48px 48px', position: 'relative', overflow: 'hidden',
      }}>
        {/* Glow */}
        <div style={{
          position: 'absolute', top: -80, left: -80, width: 320, height: 320,
          background: `radial-gradient(circle, rgba(107,78,255,0.15) 0%, transparent 70%)`,
          borderRadius: '50%', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, right: -60, width: 280, height: 280,
          background: `radial-gradient(circle, rgba(225,106,74,0.18) 0%, transparent 70%)`,
          borderRadius: '50%', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Trial badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            borderRadius: 999, background: 'rgba(225,106,74,0.15)', border: '1px solid rgba(225,106,74,0.3)',
            color: NN.orange, fontSize: '0.78rem', fontWeight: 700, marginBottom: 28,
            letterSpacing: '0.04em', textTransform: 'uppercase',
          }}>
            ✦ 7-Day Free Trial
          </div>

          <h2 style={{
            fontFamily: "'Sora', sans-serif", fontWeight: 800,
            fontSize: '1.65rem', color: '#fff', lineHeight: 1.25, marginBottom: 12, letterSpacing: '-0.02em',
          }}>
            Everything you need to find your next winning product
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', marginBottom: 32, lineHeight: 1.6 }}>
            Full access to all features, no credit card required.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {PRO_FEATURES.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <CheckCircle2 style={{ width: 16, height: 16, color: NN.mint, flexShrink: 0, marginTop: 2 }} />
                <span style={{ fontSize: '0.875rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Social proof */}
          <div style={{
            marginTop: 40, padding: '20px 24px', borderRadius: 14,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              {[...Array(5)].map((_, i) => (
                <span key={i} style={{ color: NN.orange, fontSize: '14px' }}>★</span>
              ))}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', lineHeight: 1.55 }}>
              "NeuraNest spotted the magnesium glycinate trend 8 months before it hit Amazon's top 10. We launched first."
            </p>
            <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', marginTop: 10 }}>
              — Product Researcher, Health & Wellness Brand
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
