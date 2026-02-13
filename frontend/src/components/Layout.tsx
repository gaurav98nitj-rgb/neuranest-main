import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../lib/store'
import { Eye, Bell, Search, LogOut, BarChart3, LayoutDashboard, Grid3X3, Settings, Building2, Map, Microscope } from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/dashboard',  label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/explore',    label: 'Explorer',     icon: Search },
  { to: '/categories', label: 'Categories',   icon: Grid3X3 },
  { to: '/brands',     label: 'Brands',       icon: Building2 },
  { to: '/whitespace', label: 'White Space',  icon: Map },
  { to: '/science', label: 'Science Radar', icon: Microscope },
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
    <div className="flex h-screen bg-srf">
      <aside className="w-64 bg-srf-1 border-r border-ln text-white flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-brand-400" />
          <div>
            <h1 className="text-lg font-bold text-white">NeuraNest</h1>
            <p className="text-xs text-brand-500">Trend Intelligence</p>
          </div>
        </div>
        <nav className="flex-1 px-3 mt-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-brand-700 text-brand-200'
                    : 'text-brand-300 hover:bg-brand-800 hover:text-brand-200'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 mb-2">
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-700 text-brand-200'
                  : 'text-brand-400 hover:bg-brand-800 hover:text-brand-300'
              )
            }
          >
            <Settings className="h-5 w-5" />
            Settings
          </NavLink>
        </div>
        <div className="p-4 border-t border-ln">
          <div className="flex items-center justify-between">
            <div className="text-sm min-w-0">
              <p className="font-medium truncate text-brand-200">{user?.email || 'User'}</p>
              <p className="text-brand-500 text-xs capitalize">{user?.role || 'viewer'}</p>
            </div>
            <button onClick={handleLogout} className="text-brand-500 hover:text-brand-300 p-1 transition-colors">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
