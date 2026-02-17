import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import {
  LogOut, BarChart3, LayoutDashboard, Search, Grid3X3,
  Building2, Map, Microscope, Sparkles, Eye, Bell, Settings,
  Compass, Target, FileText, Activity
} from 'lucide-react'

const C = {
  sidebarBg: '#1A2A3A',
  sidebarDark: '#111D29',
  coral: '#E8714A',
  coralGlow: 'rgba(232,113,74,0.18)',
  textActive: '#FFFFFF',
  textDefault: '#8B9DB0',
  textMuted: '#5F7590',
  sectionLabel: '#5F7590',
  borderSubtle: 'rgba(255,255,255,0.06)',
}

interface NavItem {
  to: string
  label: string
  icon: any
}

interface NavSection {
  label: string
  icon: any
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: 'Discover',
    icon: Compass,
    items: [
      { to: '/dashboard',  label: 'Dashboard',     icon: LayoutDashboard },
      { to: '/explore',    label: 'Trend Explorer', icon: Search },
      { to: '/science',    label: 'Science Radar',  icon: Microscope },
    ],
  },
  {
    label: 'Analyze',
    icon: Activity,
    items: [
      { to: '/categories', label: 'Categories',    icon: Grid3X3 },
      { to: '/brands',     label: 'Competition',   icon: Building2 },
      { to: '/whitespace', label: 'White Space',   icon: Map },
      { to: '/amazon-ba',  label: 'Amazon BA',     icon: BarChart3 },
    ],
  },
  {
    label: 'Decide',
    icon: Target,
    items: [
      { to: '/product-intelligence', label: 'Product Intel', icon: Sparkles },
    ],
  },
  {
    label: 'Monitor',
    icon: Eye,
    items: [
      { to: '/watchlist',  label: 'Watchlist',     icon: Eye },
      { to: '/alerts',     label: 'Alerts',        icon: Bell },
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
        gap: 10,
        padding: '8px 12px 8px 28px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: isActive ? 600 : 500,
        textDecoration: 'none',
        transition: 'all 0.15s ease',
        background: isActive ? C.coralGlow : 'transparent',
        color: isActive ? C.textActive : C.textDefault,
        borderLeft: isActive ? `3px solid ${C.coral}` : '3px solid transparent',
        marginLeft: -3,
      })}
    >
      <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} />
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
    <div style={{ display: 'flex', height: '100vh', background: '#F9F7F4' }}>
      {/* Sidebar */}
      <aside style={{
        width: 240,
        display: 'flex',
        flexDirection: 'column',
        background: C.sidebarBg,
        borderRight: '1px solid rgba(255,255,255,0.04)',
        flexShrink: 0,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, display: 'flex',
            alignItems: 'center', justifyContent: 'center', background: C.coral,
          }}>
            <BarChart3 style={{ width: 18, height: 18, color: '#fff' }} />
          </div>
          <div>
            <h1 style={{
              fontSize: 17, fontWeight: 500, margin: 0, color: '#fff',
              fontFamily: "'Newsreader', Georgia, serif",
            }}>
              NeuraNest
            </h1>
            <p style={{ fontSize: 10, margin: 0, color: C.textMuted, letterSpacing: '0.04em' }}>
              Trend Intelligence
            </p>
          </div>
        </div>

        {/* Navigation sections */}
        <nav style={{ flex: 1, padding: '4px 12px', overflowY: 'auto' }}>
          {navSections.map((section, si) => (
            <div key={section.label} style={{ marginBottom: 16 }}>
              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px 6px 8px',
                fontSize: 10, fontWeight: 700, color: C.sectionLabel,
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                <section.icon style={{ width: 11, height: 11 }} />
                {section.label}
              </div>

              {/* Section items */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {section.items.map(item => (
                  <NavItemLink key={item.to} item={item} />
                ))}
              </div>

              {/* Divider between sections */}
              {si < navSections.length - 1 && (
                <div style={{
                  height: 1, background: C.borderSubtle,
                  margin: '12px 12px 0',
                }} />
              )}
            </div>
          ))}
        </nav>

        {/* Settings */}
        <div style={{ padding: '0 12px 8px' }}>
          <NavLink
            to="/settings"
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px',
              borderRadius: 8, fontSize: 13, fontWeight: 500,
              textDecoration: 'none', transition: 'all 0.15s',
              background: isActive ? C.coralGlow : 'transparent',
              color: isActive ? C.textActive : C.textMuted,
            })}
          >
            <Settings style={{ width: 16, height: 16 }} />
            Settings
          </NavLink>
        </div>

        {/* User footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: `1px solid ${C.borderSubtle}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{
              fontSize: 12, fontWeight: 500, margin: 0, color: 'rgba(255,255,255,0.9)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user?.email || 'User'}
            </p>
            <p style={{
              fontSize: 10, margin: '2px 0 0', color: C.textMuted,
              textTransform: 'capitalize',
            }}>
              {user?.role || 'viewer'}
            </p>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: 4, borderRadius: 6, color: C.textMuted,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
              e.currentTarget.style.color = '#fff'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.color = C.textMuted
            }}
          >
            <LogOut style={{ width: 15, height: 15 }} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, overflowY: 'auto', background: '#F9F7F4' }}>
        <Outlet />
      </main>
    </div>
  )
}
