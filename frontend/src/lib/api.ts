import axios from 'axios'
import { useAuthStore } from './store'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

// Auth interceptor - attach token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Response interceptor - handle 401 but NOT on auth routes
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const url = error.config?.url || ''
    const isAuthRoute = url.includes('/auth/')
    const isOnLoginPage = window.location.pathname.includes('/auth/')

    // Only redirect on 401 if it's NOT an auth route and NOT already on login page
    if (error.response?.status === 401 && !isAuthRoute && !isOnLoginPage) {
      useAuthStore.getState().logout()
      window.location.href = '/auth/login'
    }
    return Promise.reject(error)
  }
)

// ─── API Functions ───
export const authApi = {
  signup: (data: { email: string; password: string; org_name?: string }) =>
    api.post('/auth/signup', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
}

export const topicsApi = {
  list: (params: Record<string, any>) => api.get('/topics', { params }),
  get: (id: string) => api.get(`/topics/${id}`),
  timeseries: (id: string, params?: Record<string, any>) =>
    api.get(`/topics/${id}/timeseries`, { params }),
  forecast: (id: string) => api.get(`/topics/${id}/forecast`),
  competition: (id: string) => api.get(`/topics/${id}/competition`),
  reviewsSummary: (id: string) => api.get(`/topics/${id}/reviews/summary`),
  genNext: (id: string) => api.get(`/topics/${id}/gen-next`),
}

export const watchlistApi = {
  list: () => api.get('/watchlist'),
  add: (topic_id: string) => api.post('/watchlist', { topic_id }),
  remove: (topic_id: string) => api.delete(`/watchlist/${topic_id}`),
}

export const alertsApi = {
  list: () => api.get('/alerts'),
  create: (data: any) => api.post('/alerts', data),
  delete: (id: string) => api.delete(`/alerts/${id}`),
  events: (id: string) => api.get(`/alerts/${id}/events`),
}

export const exportsApi = {
  topicsCsv: (params: Record<string, any>) =>
    api.get('/exports/topics.csv', { params, responseType: 'blob' }),
}

export const categoriesApi = {
  list: (params?: Record<string, any>) => api.get('/categories', { params }),
  overview: (id: string) => api.get(`/categories/${id}/overview`),
  subcategories: (id: string) => api.get(`/categories/${id}/subcategories`),
  opportunities: (id: string, params?: Record<string, any>) =>
    api.get(`/categories/${id}/opportunities`, { params }),
  voice: (id: string) => api.get(`/social/categories/${id}/voice`),
}

export const brandsApi = {
  list: (params?: Record<string, any>) => api.get('/brands', { params }),
  overview: (id: string, params?: Record<string, any>) =>
    api.get(`/brands/${id}/overview`, { params }),
  mentions: (id: string, params?: Record<string, any>) =>
    api.get(`/brands/${id}/mentions`, { params }),
}

export const socialApi = {
  topicSignals: (id: string, params?: Record<string, any>) =>
    api.get(`/social/topics/${id}/signals`, { params }),
  topicComplaints: (id: string) =>
    api.get(`/social/topics/${id}/complaints`),
  topicFeatureRequests: (id: string, params?: Record<string, any>) =>
    api.get(`/social/topics/${id}/feature-requests`, { params }),
}

export const whitespaceApi = {
  heatmap: (params?: Record<string, any>) => api.get('/whitespace', { params }),
  cell: (params: Record<string, any>) => api.get('/whitespace/cell', { params }),
}
