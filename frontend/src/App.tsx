import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './lib/store'
import Layout from './components/Layout'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import ExplorerPage from './pages/ExplorerPage'
import TopicDetailPage from './pages/TopicDetailPage'
import CategoryExplorerPage from './pages/CategoryExplorerPage'
import CategoryDetailPage from './pages/CategoryDetailPage'
import BrandMonitorPage from './pages/BrandMonitorPage'
import WatchlistPage from './pages/WatchlistPage'
import AlertsPage from './pages/AlertsPage'
import SettingsPage from './pages/SettingsPage'
import ScienceRadarPage from './pages/ScienceRadarPage'
import AmazonBAPage from './pages/AmazonBAPage'
import WhiteSpacePage from './pages/WhiteSpacePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useAuthStore((s) => s.isAuthenticated)
  if (!isAuth) return <Navigate to="/auth/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth/login" element={<LoginPage />} />
      <Route path="/auth/signup" element={<SignupPage />} />

      {/* Protected routes (with sidebar layout) */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/explore" element={<ExplorerPage />} />
        <Route path="/categories" element={<CategoryExplorerPage />} />
        <Route path="/categories/:id" element={<CategoryDetailPage />} />
        <Route path="/brands" element={<BrandMonitorPage />} />
        <Route path="/brands/:id" element={<BrandMonitorPage />} />
        <Route path="/topics/:id" element={<TopicDetailPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/whitespace" element={<WhiteSpacePage />} />
        <Route path="/science" element={<ScienceRadarPage />} />
        <Route path="/amazon-ba" element={<AmazonBAPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
