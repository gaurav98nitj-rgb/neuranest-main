import { useState } from 'react'
import { useAuthStore } from '../lib/store'
import {
  User, Bell, Shield, CreditCard, Palette, Database,
  ChevronRight, Check, LogOut, Save, Eye, EyeOff,
} from 'lucide-react'

/* ─── NeuraNest Brand Palette ─── */
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', borderLight: '#F1F5F9',
  coral: '#E16A4A', coralLight: '#FEF0EB',
  sage: '#2ED3A5', sageLight: '#EAFAF5',
  plum: '#6B4EFF', plumLight: '#F0EEFF',
  ink: '#0F172A', slate: '#475569', stone: '#64748B', sand: '#94A3B8',
  charcoalDeep: '#1E3A5F',
}

const TABS = [
  { id: 'profile', icon: <User size={15} />, label: 'Profile' },
  { id: 'notifications', icon: <Bell size={15} />, label: 'Notifications' },
  { id: 'security', icon: <Shield size={15} />, label: 'Security' },
  { id: 'billing', icon: <CreditCard size={15} />, label: 'Billing' },
  { id: 'appearance', icon: <Palette size={15} />, label: 'Appearance' },
  { id: 'data', icon: <Database size={15} />, label: 'Data & Privacy' },
]

function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24, background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      <div style={{ padding: '14px 24px', borderBottom: `1px solid ${C.borderLight}`, background: C.bg }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.stone, letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: "'Sora', sans-serif" }}>
          {title}
        </h3>
      </div>
      <div style={{ padding: '20px 24px' }}>{children}</div>
    </div>
  )
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 16, marginBottom: 16, borderBottom: `1px solid ${C.borderLight}` }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: "'Inter', sans-serif" }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: C.stone, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: value ? C.coral : C.border,
        position: 'relative', transition: 'background 0.2s',
        padding: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 23 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)', transition: 'left 0.2s',
      }} />
    </button>
  )
}

function FieldInput({ value, onChange, type = 'text', placeholder = '' }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  const [show, setShow] = useState(false)
  const inputType = type === 'password' ? (show ? 'text' : 'password') : type
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={inputType}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: 240, padding: '8px 12px', borderRadius: 8, fontSize: 13,
          border: `1px solid ${C.border}`, background: C.bg,
          color: C.ink, fontFamily: "'Inter', sans-serif",
          outline: 'none', paddingRight: type === 'password' ? 36 : 12,
        }}
      />
      {type === 'password' && (
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.stone }}
        >
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const logout = useAuthStore(s => s.logout)
  const [activeTab, setActiveTab] = useState('profile')
  const [saved, setSaved] = useState(false)

  // Profile state
  const [name, setName] = useState('Demo User')
  const [email, setEmail] = useState('demo@neuranest.ai')
  const [company, setCompany] = useState('Acme Corp')

  // Notifications state
  const [emailAlerts, setEmailAlerts] = useState(true)
  const [weeklyReport, setWeeklyReport] = useState(true)
  const [stageChanges, setStageChanges] = useState(true)
  const [newOpps, setNewOpps] = useState(false)

  // Security state
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [twoFactor, setTwoFactor] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Inter', sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.03em', color: C.charcoalDeep, fontFamily: "'Sora', sans-serif" }}>
            Settings
          </h1>
          <p style={{ color: C.stone, fontSize: 13, margin: '4px 0 0' }}>Manage your account, preferences, and integrations</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {saved && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, color: C.sage, fontWeight: 600 }}>
              <Check size={14} /> Saved
            </span>
          )}
          <button
            onClick={handleSave}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '9px 18px', background: C.coral, color: '#fff',
              border: 'none', borderRadius: 10, fontWeight: 600, fontSize: 13,
              cursor: 'pointer', boxShadow: '0 3px 10px rgba(225,106,74,0.25)',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <Save size={14} /> Save Changes
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        {/* Sidebar */}
        <div>
          <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: activeTab === tab.id ? C.coralLight : 'transparent',
                  borderLeft: activeTab === tab.id ? `3px solid ${C.coral}` : '3px solid transparent',
                  color: activeTab === tab.id ? C.coral : C.slate,
                  fontWeight: activeTab === tab.id ? 600 : 500,
                  fontSize: 13, fontFamily: "'Inter', sans-serif",
                  transition: 'all 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && <ChevronRight size={12} style={{ marginLeft: 'auto' }} />}
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${C.borderLight}`, marginTop: 4 }}>
              <button
                onClick={logout}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: 'transparent', color: '#EF4444',
                  fontWeight: 500, fontSize: 13, fontFamily: "'Inter', sans-serif",
                }}
              >
                <LogOut size={15} /> Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div>
          {activeTab === 'profile' && (
            <>
              <SettingSection title="Personal Information">
                <SettingRow label="Full Name" sub="Your display name across the platform">
                  <FieldInput value={name} onChange={setName} />
                </SettingRow>
                <SettingRow label="Email Address" sub="Used for sign-in and notifications">
                  <FieldInput value={email} onChange={setEmail} type="email" />
                </SettingRow>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Company</div>
                    <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Optional — helps personalise recommendations</div>
                  </div>
                  <FieldInput value={company} onChange={setCompany} />
                </div>
              </SettingSection>

              <SettingSection title="Plan & Usage">
                <SettingRow label="Current Plan" sub="Free tier — 5 watchlist slots, 30-day history">
                  <span style={{ padding: '4px 12px', background: C.sageLight, color: '#1A8754', borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
                    Free
                  </span>
                </SettingRow>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Upgrade to Pro</div>
                    <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Unlimited topics, 12-month history, AI briefs & more</div>
                  </div>
                  <button style={{ padding: '9px 18px', background: C.plum, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: "'Inter', sans-serif" }}>
                    Upgrade ✦
                  </button>
                </div>
              </SettingSection>
            </>
          )}

          {activeTab === 'notifications' && (
            <SettingSection title="Email Notifications">
              <SettingRow label="Alert Notifications" sub="Receive emails when your alert conditions are triggered">
                <Toggle value={emailAlerts} onChange={setEmailAlerts} />
              </SettingRow>
              <SettingRow label="Weekly Intelligence Report" sub="Get a curated summary of top trends every Monday">
                <Toggle value={weeklyReport} onChange={setWeeklyReport} />
              </SettingRow>
              <SettingRow label="Stage Change Alerts" sub="Notify when a watched topic moves lifecycle stages">
                <Toggle value={stageChanges} onChange={setStageChanges} />
              </SettingRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>New Opportunity Alerts</div>
                  <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Be notified of newly detected high-score emerging topics</div>
                </div>
                <Toggle value={newOpps} onChange={setNewOpps} />
              </div>
            </SettingSection>
          )}

          {activeTab === 'security' && (
            <>
              <SettingSection title="Change Password">
                <SettingRow label="Current Password" sub="">
                  <FieldInput value={currentPw} onChange={setCurrentPw} type="password" placeholder="••••••••" />
                </SettingRow>
                <SettingRow label="New Password" sub="Min. 8 characters">
                  <FieldInput value={newPw} onChange={setNewPw} type="password" placeholder="••••••••" />
                </SettingRow>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Confirm New Password</div>
                  </div>
                  <FieldInput value={confirmPw} onChange={setConfirmPw} type="password" placeholder="••••••••" />
                </div>
              </SettingSection>
              <SettingSection title="Two-Factor Authentication">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Enable 2FA</div>
                    <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Add an extra layer of security with an authenticator app</div>
                  </div>
                  <Toggle value={twoFactor} onChange={setTwoFactor} />
                </div>
              </SettingSection>
            </>
          )}

          {activeTab === 'billing' && (
            <SettingSection title="Billing Information">
              <div style={{ textAlign: 'center', padding: '32px 0', color: C.stone }}>
                <CreditCard size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>No payment method on file</div>
                <div style={{ fontSize: 13, marginBottom: 20 }}>You're on the Free plan — no billing required.</div>
                <button style={{ padding: '10px 24px', background: C.plum, color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  Upgrade to Pro
                </button>
              </div>
            </SettingSection>
          )}

          {activeTab === 'appearance' && (
            <SettingSection title="Theme">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {['Light', 'Dark'].map(theme => (
                  <div key={theme} style={{
                    padding: '16px', borderRadius: 10, border: `2px solid ${theme === 'Light' ? C.coral : C.border}`,
                    background: theme === 'Light' ? C.coralLight : '#0F172A',
                    cursor: 'pointer', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme === 'Light' ? C.coral : '#fff' }}>
                      {theme} {theme === 'Light' && '✓'}
                    </div>
                    <div style={{ fontSize: 11, color: theme === 'Light' ? C.stone : '#94A3B8', marginTop: 4 }}>
                      {theme === 'Light' ? 'Current theme' : 'Coming soon'}
                    </div>
                  </div>
                ))}
              </div>
            </SettingSection>
          )}

          {activeTab === 'data' && (
            <SettingSection title="Data & Privacy">
              <SettingRow label="Export My Data" sub="Download a copy of all your watchlist, alert, and activity data">
                <button style={{ padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: C.card, color: C.slate, fontFamily: "'Inter', sans-serif" }}>
                  Export CSV
                </button>
              </SettingRow>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#EF4444' }}>Delete Account</div>
                  <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>Permanently remove your account and all data. This cannot be undone.</div>
                </div>
                <button style={{ padding: '8px 16px', border: '1px solid #EF4444', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: '#FEF2F2', color: '#EF4444', fontFamily: "'Inter', sans-serif" }}>
                  Delete Account
                </button>
              </div>
            </SettingSection>
          )}
        </div>
      </div>
    </div>
  )
}
