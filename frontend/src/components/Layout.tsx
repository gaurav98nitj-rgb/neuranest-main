import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import {
  LogOut, BarChart3, LayoutDashboard, Search, Grid3X3,
  Building2, Map, Microscope, Sparkles, Eye, Bell, Settings,
  Compass, Target, FileText, Activity
} from 'lucide-react'
import NotificationBell from './NotificationBell'

// NeuraNest brand sidebar tokens
const S = {
  bg: '#0F172A',   // Dark navy — Deep Intelligence Blue base
  bgInner: '#0A111E',   // Slightly deeper for header area
  orange: '#E16A4A',   // Neural Orange — active accent
  orangeGlow: 'rgba(225,106,74,0.13)',
  borderSubtle: 'rgba(255,255,255,0.06)',
  textActive: '#FFFFFF',
  textDefault: '#94A3B8',
  textMuted: '#64748B',
  sectionLabel: '#475569',
}

interface NavItem { to: string; label: string; icon: any }
interface NavSection { label: string; icon: any; items: NavItem[] }

const navSections: NavSection[] = [
  {
    label: 'Discover', icon: Compass,
    items: [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/explore', label: 'Trend Explorer', icon: Search },
      { to: '/science', label: 'Science Radar', icon: Microscope },
    ],
  },
  {
    label: 'Analyze', icon: Activity,
    items: [
      { to: '/categories', label: 'Categories', icon: Grid3X3 },
      { to: '/brands', label: 'Competition', icon: Building2 },
      { to: '/whitespace', label: 'White Space', icon: Map },
      { to: '/amazon-ba', label: 'Amazon BA', icon: BarChart3 },
    ],
  },
  {
    label: 'Decide', icon: Target,
    items: [
      { to: '/product-intelligence', label: 'Product Intel', icon: Sparkles },
      { to: '/product-brief', label: 'Product Brief', icon: FileText },
    ],
  },
  {
    label: 'Monitor', icon: Eye,
    items: [
      { to: '/watchlist', label: 'Watchlist', icon: Eye },
      { to: '/alerts', label: 'Alerts', icon: Bell },
    ],
  },
]

function NavItemLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 10px 7px 26px',
        borderRadius: 6,
        fontSize: 13,
        fontFamily: "'Inter', sans-serif",
        fontWeight: isActive ? 600 : 400,
        textDecoration: 'none',
        transition: 'all 0.15s ease',
        background: isActive ? S.orangeGlow : 'transparent',
        color: isActive ? S.textActive : S.textDefault,
        borderLeft: isActive ? `2px solid ${S.orange}` : '2px solid transparent',
        marginLeft: -2,
      })}
    >
      <item.icon style={{ width: 15, height: 15, flexShrink: 0, strokeWidth: 1.75 }} />
      {item.label}
    </NavLink>
  )
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F8FAFC', fontFamily: "'Inter', sans-serif" }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: 232,
        display: 'flex',
        flexDirection: 'column',
        background: S.bg,
        borderRight: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{
          padding: '18px 16px 14px',
          background: S.bgInner,
          borderBottom: `1px solid ${S.borderSubtle}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg, #E16A4A 0%, #6B4EFF 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <BarChart3 style={{ width: 16, height: 16, color: '#fff', strokeWidth: 2 }} />
            </div>
            <div>
              <div style={{
                fontSize: 15, fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2,
                fontFamily: "'Sora', sans-serif", letterSpacing: '-0.01em',
              }}>
                NeuraNest
              </div>
              <div style={{ fontSize: 10, color: S.textMuted, letterSpacing: '0.05em', marginTop: 1 }}>
                TREND INTELLIGENCE
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '8px 10px', overflowY: 'auto' }}>
          {navSections.map((section, si) => (
            <div key={section.label} style={{ marginBottom: 4 }}>
              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '8px 10px 4px 8px',
                fontSize: 9, fontWeight: 700, color: S.sectionLabel,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                fontFamily: "'Inter', sans-serif",
              }}>
                <section.icon style={{ width: 10, height: 10, strokeWidth: 2 }} />
                {section.label}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {section.items.map(item => (
                  <NavItemLink key={item.to} item={item} />
                ))}
              </div>

              {si < navSections.length - 1 && (
                <div style={{
                  height: 1, background: S.borderSubtle,
                  margin: '8px 8px 4px',
                }} />
              )}
            </div>
          ))}
        </nav>

        {/* Settings */}
        <div style={{ padding: '0 10px 6px' }}>
          <NavLink
            to="/settings"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '7px 10px',
              borderRadius: 6, fontSize: 13, fontWeight: isActive ? 600 : 400,
              fontFamily: "'Inter', sans-serif",
              textDecoration: 'none', transition: 'all 0.15s',
              background: isActive ? S.orangeGlow : 'transparent',
              color: isActive ? S.textActive : S.textMuted,
            })}
          >
            <Settings style={{ width: 15, height: 15, strokeWidth: 1.75 }} />
            Settings
          </NavLink>
        </div>

        {/* User footer */}
        <div style={{
          padding: '10px 14px',
          borderTop: `1px solid ${S.borderSubtle}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.85)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontFamily: "'Inter', sans-serif",
            }}>
              {user?.email || 'User'}
            </div>
            <div style={{
              fontSize: 10, marginTop: 2, color: S.textMuted,
              textTransform: 'capitalize', fontFamily: "'Inter', sans-serif",
            }}>
              {user?.role || 'viewer'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NotificationBell onNavigate={(path) => navigate(path)} />
            <button
              onClick={handleLogout}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: 6, borderRadius: 6, color: S.textMuted,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = '#fff'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = S.textMuted
              }}
            >
              <LogOut style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', background: '#F8FAFC' }}>
        <Outlet />
      </main>
    </div>
  )
}
