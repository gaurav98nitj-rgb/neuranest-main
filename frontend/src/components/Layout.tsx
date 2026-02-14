import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { Eye, Bell, Search, LogOut, BarChart3, LayoutDashboard, Grid3X3, Settings, Building2, Map, Microscope, Sparkles } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/explore',    label: 'Explorer',     icon: Search },
  { to: '/categories', label: 'Categories',   icon: Grid3X3 },
  { to: '/brands',     label: 'Brands',       icon: Building2 },
  { to: '/whitespace', label: 'White Space',  icon: Map },
  { to: '/science',    label: 'Science Radar', icon: Microscope },
  { to: '/amazon-ba',  label: 'Amazon BA',    icon: BarChart3 },
  { to: '/product-intelligence', label: 'Product Intel', icon: Sparkles },
  { to: '/watchlist',  label: 'Watchlist',    icon: Eye },
  { to: '/alerts',     label: 'Alerts',       icon: Bell },
]

export default function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/auth/login')
  }

  return (
    <div className="flex h-screen bg-sand-100">
      <aside className="w-64 flex flex-col" style={{ background: '#1A2A3A' }}>
        {/* Logo */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: '#E8714A' }}>
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg text-white" style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500 }}>
              NeuraNest
            </h1>
            <p className="text-xs" style={{ color: '#B8B2A8' }}>Trend Intelligence</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 mt-2 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                  isActive
                    ? 'text-white'
                    : 'hover:text-white'
                )
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(232, 113, 74, 0.18)' : 'transparent',
                color: isActive ? '#FFFFFF' : '#8B9DB0',
                borderLeft: isActive ? '3px solid #E8714A' : '3px solid transparent',
              })}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Settings */}
        <div className="px-3 mb-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive ? 'text-white' : ''
              )
            }
            style={({ isActive }) => ({
              background: isActive ? 'rgba(232, 113, 74, 0.18)' : 'transparent',
              color: isActive ? '#FFFFFF' : '#5F7590',
            })}
          >
            <Settings className="h-[18px] w-[18px]" />
            Settings
          </NavLink>
        </div>

        {/* User */}
        <div className="p-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between">
            <div className="text-sm min-w-0">
              <p className="font-medium truncate text-white/90">{user?.email || 'User'}</p>
              <p className="text-xs capitalize" style={{ color: '#5F7590' }}>{user?.role || 'viewer'}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1 transition-colors rounded-md hover:bg-white/10"
              style={{ color: '#5F7590' }}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-sand-100">
        <Outlet />
      </main>
    </div>
  )
}
