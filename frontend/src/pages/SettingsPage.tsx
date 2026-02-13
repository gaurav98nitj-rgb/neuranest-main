import { useState } from 'react'
import { useAuthStore } from '../lib/store'
import {
  User, Shield, Bell, CreditCard, LogOut, Check, Crown, Mail,
} from 'lucide-react'
import clsx from 'clsx'

const PLAN_FEATURES = {
  free: [
    { label: 'Browse & search trends', included: true },
    { label: '50 detail views/day', included: true },
    { label: 'Opportunity score (value only)', included: true },
    { label: 'Watchlist (5 topics)', included: false },
    { label: 'Alerts', included: false },
    { label: 'Score explanations', included: false },
    { label: 'CSV export', included: false },
    { label: 'Amazon upload', included: false },
  ],
  pro: [
    { label: 'Unlimited trend views', included: true },
    { label: 'Full opportunity score + explanation', included: true },
    { label: 'Watchlist (50 topics)', included: true },
    { label: 'Alerts (20 active)', included: true },
    { label: 'CSV export', included: true },
    { label: 'Amazon data upload', included: true },
    { label: 'Forecast CI bands', included: true },
    { label: 'Gen-Next product specs', included: true },
  ],
}

export default function SettingsPage() {
  const { user, logout } = useAuthStore()
  const [activeTab, setActiveTab] = useState<'profile' | 'plan' | 'notifications'>('profile')
  const [displayName, setDisplayName] = useState(user?.display_name || user?.email?.split('@')[0] || '')
  const [saved, setSaved] = useState(false)

  const role = user?.role || 'viewer'
  const plan = role === 'admin' ? 'admin' : 'free' // Derive from role for now
  const email = user?.email || 'Unknown'

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'plan' as const, label: 'Plan & Billing', icon: CreditCard },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ]

  const handleSaveProfile = () => {
    // TODO: API call to update profile
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-ln pb-px">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors -mb-px',
              activeTab === tab.id
                ? 'text-brand-200 border-b-2 border-brand-500 bg-srf-1'
                : 'text-brand-500 hover:text-brand-300'
            )}>
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="card p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">Profile Information</h2>

            {/* Avatar placeholder */}
            <div className="flex items-center gap-4 mb-6">
              <div className="h-16 w-16 rounded-full bg-brand-700 flex items-center justify-center text-brand-300 text-2xl font-bold">
                {email.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-brand-200">{email}</p>
                <p className="text-xs text-brand-500 capitalize flex items-center gap-1 mt-0.5">
                  <Shield className="h-3 w-3" /> {role}
                </p>
              </div>
            </div>

            {/* Display name */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-brand-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 text-sm max-w-sm"
                  placeholder="Your display name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  disabled
                  className="w-full px-3 py-2 text-sm max-w-sm opacity-50 cursor-not-allowed"
                />
                <p className="text-[10px] text-brand-600 mt-1">Email cannot be changed</p>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button onClick={handleSaveProfile}
                className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-400 transition-colors">
                Save Changes
              </button>
              {saved && (
                <span className="text-sm text-emerald-400 flex items-center gap-1">
                  <Check className="h-4 w-4" /> Saved
                </span>
              )}
            </div>
          </div>

          {/* Danger zone */}
          <div className="pt-6 border-t border-ln">
            <h3 className="text-sm font-semibold text-red-400 mb-3">Danger Zone</h3>
            <button onClick={logout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-400 border border-red-900/50 rounded-lg hover:bg-red-900/20 transition-colors">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Plan Tab */}
      {activeTab === 'plan' && (
        <div className="space-y-4">
          {/* Current plan */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Current Plan</h2>
                <p className="text-sm text-brand-400 mt-0.5">
                  {plan === 'admin' ? 'Admin access — all features enabled' : 'Free tier'}
                </p>
              </div>
              <div className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-1.5',
                plan === 'admin'
                  ? 'bg-purple-900/50 text-purple-300'
                  : 'bg-brand-800 text-brand-400'
              )}>
                {plan === 'admin' && <Crown className="h-4 w-4" />}
                {plan === 'admin' ? 'Admin' : 'Free'}
              </div>
            </div>

            {plan !== 'admin' && (
              <div className="p-4 bg-srf rounded-lg border border-ln">
                <p className="text-sm text-brand-200 font-medium mb-1">Upgrade to Pro — $49/month</p>
                <p className="text-xs text-brand-500">Unlock watchlists, alerts, CSV export, score explanations, and more.</p>
                <button className="mt-3 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-400 transition-colors">
                  Upgrade to Pro
                </button>
              </div>
            )}
          </div>

          {/* Feature comparison */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-brand-200 mb-4">Your Features</h3>
            <div className="space-y-2">
              {(PLAN_FEATURES[plan === 'admin' ? 'pro' : 'free'] || PLAN_FEATURES.free).map((f, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <div className={clsx(
                    'h-5 w-5 rounded-full flex items-center justify-center shrink-0',
                    f.included || plan === 'admin'
                      ? 'bg-emerald-900/50 text-emerald-400'
                      : 'bg-brand-800 text-brand-600'
                  )}>
                    <Check className="h-3 w-3" />
                  </div>
                  <span className={clsx(
                    f.included || plan === 'admin' ? 'text-brand-200' : 'text-brand-600 line-through'
                  )}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Notification Preferences</h2>

          <div className="space-y-4">
            <NotifToggle
              icon={Bell}
              title="Alert Notifications"
              desc="In-app notifications when alert conditions are triggered"
              defaultOn
            />
            <NotifToggle
              icon={Mail}
              title="Email Digest"
              desc="Weekly summary of watchlist changes and top movers"
              defaultOn={false}
              disabled
              disabledNote="Coming soon"
            />
            <NotifToggle
              icon={TrendingUp}
              title="Trend Stage Changes"
              desc="Notify when a watchlisted topic changes stage"
              defaultOn
            />
          </div>

          <div className="mt-6 p-3 bg-srf rounded-lg border border-ln">
            <p className="text-xs text-brand-500">
              Email notifications are not yet available. Currently all notifications are delivered in-app via the Alerts page.
              Email delivery via AWS SES is planned for the next update.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Toggle component ─────────────────────────────────── */
function NotifToggle({
  icon: Icon, title, desc, defaultOn = true, disabled = false, disabledNote,
}: {
  icon: any; title: string; desc: string; defaultOn?: boolean; disabled?: boolean; disabledNote?: string
}) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className={clsx('flex items-center gap-4 p-3 rounded-lg border transition-colors',
      disabled ? 'border-ln/50 opacity-60' : 'border-ln hover:border-ln-lt'
    )}>
      <div className="p-2 bg-srf rounded-lg text-brand-400 shrink-0">
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-brand-200 flex items-center gap-2">
          {title}
          {disabledNote && (
            <span className="text-[10px] bg-brand-800 text-brand-500 px-1.5 py-0.5 rounded">{disabledNote}</span>
          )}
        </p>
        <p className="text-xs text-brand-500 mt-0.5">{desc}</p>
      </div>
      <button
        disabled={disabled}
        onClick={() => !disabled && setOn(!on)}
        className={clsx(
          'relative w-10 h-6 rounded-full transition-colors shrink-0',
          on && !disabled ? 'bg-brand-500' : 'bg-brand-800',
          disabled && 'cursor-not-allowed'
        )}
      >
        <div className={clsx(
          'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
          on && !disabled ? 'translate-x-5' : 'translate-x-1'
        )} />
      </button>
    </div>
  )
}
