import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { topicsApi, watchlistApi, alertsApi } from '../lib/api'

export function useTopics(params: Record<string, any>) {
  return useQuery({
    queryKey: ['topics', params],
    queryFn: () => topicsApi.list(params).then(r => r.data),
  })
}

export function useTopic(id: string) {
  return useQuery({
    queryKey: ['topic', id],
    queryFn: () => topicsApi.get(id).then(r => r.data),
    enabled: !!id,
  })
}

export function useTimeseries(id: string, params?: Record<string, any>) {
  return useQuery({
    queryKey: ['timeseries', id, params],
    queryFn: () => topicsApi.timeseries(id, params).then(r => r.data),
    enabled: !!id,
  })
}

export function useForecast(id: string) {
  return useQuery({
    queryKey: ['forecast', id],
    queryFn: () => topicsApi.forecast(id).then(r => r.data),
    enabled: !!id,
  })
}

export function useCompetition(id: string) {
  return useQuery({
    queryKey: ['competition', id],
    queryFn: () => topicsApi.competition(id).then(r => r.data),
    enabled: !!id,
  })
}

export function useReviewsSummary(id: string) {
  return useQuery({
    queryKey: ['reviews', id],
    queryFn: () => topicsApi.reviewsSummary(id).then(r => r.data),
    enabled: !!id,
  })
}

export function useGenNextSpec(id: string) {
  return useQuery({
    queryKey: ['gen-next', id],
    queryFn: () => topicsApi.genNext(id).then(r => r.data),
    enabled: !!id,
  })
}

// ─── Watchlist ───
export function useWatchlist() {
  return useQuery({
    queryKey: ['watchlist'],
    queryFn: () => watchlistApi.list().then(r => r.data),
  })
}

export function useAddToWatchlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (topicId: string) => watchlistApi.add(topicId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  })
}

export function useRemoveFromWatchlist() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (topicId: string) => watchlistApi.remove(topicId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['watchlist'] }),
  })
}

// ─── Alerts ───
export function useAlerts() {
  return useQuery({
    queryKey: ['alerts'],
    queryFn: () => alertsApi.list().then(r => r.data),
  })
}

export function useCreateAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { topic_id: string | null; alert_type: string; config_json: Record<string, any> }) =>
      alertsApi.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useDeleteAlert() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (alertId: string) => alertsApi.delete(alertId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  })
}

export function useAlertEvents(alertId: string) {
  return useQuery({
    queryKey: ['alert-events', alertId],
    queryFn: () => alertsApi.events(alertId).then(r => r.data),
    enabled: !!alertId,
  })
}
