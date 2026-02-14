import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { authApi } from '../lib/api'
import { BarChart3 } from 'lucide-react'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore(s => s.login)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const { data } = await authApi.signup({ email, password, org_name: orgName || undefined })
      login(data.access_token, data.refresh_token, { id: '', email, role: 'admin' })
      navigate('/explore')
    } catch (err: any) { setError(err.response?.data?.detail || 'Signup failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-sand-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: '#E8714A' }}>
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl text-charcoal-800" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500, letterSpacing: '-0.02em' }}>NeuraNest</span>
        </div>
        <div className="bg-white rounded-xl border border-sand-300 shadow-sm p-8">
          <h2 className="text-xl text-charcoal-800 mb-1 text-center" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500 }}>Start your free trial</h2>
          <p className="text-sm text-sand-600 mb-6 text-center">7 days full access · No credit card required</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-rose-50 border border-rose-200 text-rose-400 text-sm p-3 rounded-lg">{error}</div>}
            <div>
              <label className="block text-xs text-sand-600 uppercase tracking-wider mb-1.5 font-medium">Organization</label>
              <input type="text" placeholder="Company name (optional)" value={orgName} onChange={e => setOrgName(e.target.value)} className="w-full px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-sand-600 uppercase tracking-wider mb-1.5 font-medium">Email</label>
              <input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} required className="w-full px-4 py-3 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-sand-600 uppercase tracking-wider mb-1.5 font-medium">Password</label>
              <input type="password" placeholder="Min 8 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} className="w-full px-4 py-3 text-sm" />
            </div>
            <button type="submit" disabled={loading} className="w-full py-3 bg-coral-400 text-white rounded-lg font-semibold hover:bg-coral-500 disabled:opacity-50 transition-colors text-sm">
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-sm text-sand-500 mt-5">Already have an account? <Link to="/auth/login" className="text-coral-400 hover:text-coral-500 font-medium">Sign in</Link></p>
        </div>
        <p className="text-center text-xs text-sand-400 mt-6"><Link to="/" className="hover:text-coral-400">← Back to home</Link></p>
      </div>
    </div>
  )
}
