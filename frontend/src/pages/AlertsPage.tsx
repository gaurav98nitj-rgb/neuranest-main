import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useAlerts, useCreateAlert, useDeleteAlert, useAlertEvents, useTopics,
} from '../hooks/useData'
import {
  Bell, Plus, Trash2, X, Clock, AlertTriangle, TrendingUp, Zap,
  DollarSign, Users, RefreshCw, AlertCircle, ChevronDown, ChevronRight,
  CheckCircle2, ExternalLink, Pause, Play,
} from 'lucide-react'
import clsx from 'clsx'

/* ── Alert type definitions ────────────────────────────── */
const ALERT_TYPES = [
  { value: 'stage_change',    label: 'Stage Change',    desc: 'When a topic changes trend stage',  icon: TrendingUp,  color: 'text-emerald-400', bg: 'bg-emerald-900/40' },
  { value: 'score_threshold', label: 'Score Threshold',  desc: 'When score crosses a value',        icon: Zap,         color: 'text-yellow-400',  bg: 'bg-yellow-900/40' },
  { value: 'new_competitor',  label: 'New Competitor',   desc: 'When new brands enter the market',  icon: Users,       color: 'text-blue-400',    bg: 'bg-blue-900/40' },
  { value: 'price_drop',     label: 'Price Drop',       desc: 'When median price drops',           icon: DollarSign,  color: 'text-purple-400',  bg: 'bg-purple-900/40' },
]

function getAlertType(value: string) {
  return ALERT_TYPES.find(x => x.value === value) || ALERT_TYPES[0]
}

/* ── Create alert modal ───────────────────────────────── */
function CreateAlertModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [alertType, setAlertType] = useState('')
  const [topicId, setTopicId] = useState('')
  const [threshold, setThreshold] = useState(70)
  const [direction, setDirection] = useState('above')
  const [topicSearch, setTopicSearch] = useState('')
  const { data: topicsData } = useTopics({ per_page: 100, sort: '-opportunity_score' })
  const topics = topicsData?.data || []
  const filtered = topicSearch
    ? topics.filter((t: any) => t.name.toLowerCase().includes(topicSearch.toLowerCase()))
    : topics
  const createMut = useCreateAlert()

  const handleCreate = () => {
    const config: Record<string, any> = {}
    if (alertType === 'score_threshold') {
      config.threshold = threshold
      config.direction = direction
      config.score_type = 'opportunity'
    } else if (alertType === 'stage_change') {
      config.notify_on = ['emerging', 'exploding']
    } else if (alertType === 'price_drop') {
      config.pct_threshold = 10
    } else if (alertType === 'new_competitor') {
      config.min_new_brands = 1
    }
    createMut.mutate(
      { topic_id: topicId || null, alert_type: alertType, config_json: config },
      { onSuccess: () => { onCreated(); onClose() } }
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="card w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ln">
          <h2 className="text-lg font-semibold text-white">Create Alert</h2>
          <button onClick={onClose} className="p-1 text-brand-500 hover:text-brand-300 rounded transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Step 1: Alert type */}
          <div>
            <label className="block text-sm font-medium text-brand-200 mb-2">Alert Type</label>
            <div className="grid grid-cols-2 gap-2">
              {ALERT_TYPES.map(type => (
                <button key={type.value} onClick={() => setAlertType(type.value)}
                  className={clsx(
                    'flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all',
                    alertType === type.value
                      ? 'border-brand-500 bg-brand-900/50'
                      : 'border-ln hover:border-ln-lt'
                  )}>
                  <div className={clsx('p-1.5 rounded-lg shrink-0', type.bg, type.color)}>
                    <type.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-brand-100">{type.label}</p>
                    <p className="text-xs text-brand-500 mt-0.5">{type.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Topic selection */}
          {alertType && (
            <div>
              <label className="block text-sm font-medium text-brand-200 mb-2">
                Topic <span className="text-brand-500 font-normal">(optional — leave blank for all topics)</span>
              </label>
              <input
                type="text"
                placeholder="Search topics..."
                value={topicSearch}
                onChange={(e) => setTopicSearch(e.target.value)}
                className="w-full px-3 py-2 text-sm mb-2"
              />
              <div className="max-h-36 overflow-y-auto border border-ln rounded-lg divide-y divide-ln/50">
                <button onClick={() => setTopicId('')}
                  className={clsx(
                    'w-full text-left px-3 py-2 text-sm hover:bg-srf-2 transition-colors',
                    !topicId ? 'bg-brand-800/50 text-brand-200 font-medium' : 'text-brand-300'
                  )}>
                  All Topics (global alert)
                </button>
                {filtered.slice(0, 50).map((t: any) => (
                  <button key={t.id} onClick={() => setTopicId(t.id)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-srf-2 flex items-center justify-between transition-colors',
                      topicId === t.id ? 'bg-brand-800/50 text-brand-200 font-medium' : 'text-brand-300'
                    )}>
                    <span className="truncate">{t.name}</span>
                    {t.lifecycle_status && (
                      <span className="text-[10px] text-brand-500 uppercase ml-2 shrink-0">{t.lifecycle_status}</span>
                    )}
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-brand-600">No topics match your search</div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Config for score threshold */}
          {alertType === 'score_threshold' && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-brand-200">Threshold Configuration</label>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-brand-400">Notify when score is</span>
                <select value={direction} onChange={(e) => setDirection(e.target.value)}
                  className="px-2 py-1.5 text-sm">
                  <option value="above">above</option>
                  <option value="below">below</option>
                </select>
                <input type="number" min={0} max={100} value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="w-20 px-2 py-1.5 text-sm text-center"
                />
              </div>
              <input type="range" min={0} max={100} value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-[10px] text-brand-600">
                <span>0 (very low)</span>
                <span>50 (medium)</span>
                <span>100 (very high)</span>
              </div>
            </div>
          )}

          {/* Stage change config */}
          {alertType === 'stage_change' && (
            <div className="p-3 bg-srf rounded-lg border border-ln">
              <p className="text-xs text-brand-400">
                You'll be notified when any tracked topic transitions to <span className="text-emerald-400 font-medium">emerging</span> or{' '}
                <span className="text-orange-400 font-medium">exploding</span> stage.
              </p>
            </div>
          )}

          {alertType === 'price_drop' && (
            <div className="p-3 bg-srf rounded-lg border border-ln">
              <p className="text-xs text-brand-400">
                You'll be notified when median price drops by more than <span className="text-purple-400 font-medium">10%</span> in the tracked topic's competitive set.
              </p>
            </div>
          )}

          {alertType === 'new_competitor' && (
            <div className="p-3 bg-srf rounded-lg border border-ln">
              <p className="text-xs text-brand-400">
                You'll be notified when <span className="text-blue-400 font-medium">new brands</span> are detected entering the market for the tracked topic.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-ln">
          <button onClick={onClose} className="px-4 py-2 text-sm text-brand-500 hover:text-brand-300 transition-colors">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={!alertType || createMut.isPending}
            className="px-5 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            {createMut.isPending ? 'Creating...' : 'Create Alert'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── Alert card ───────────────────────────────────────── */
function AlertCard({
  alert, isExpanded, onToggleExpand, onDelete,
}: {
  alert: any; isExpanded: boolean; onToggleExpand: () => void; onDelete: (id: string) => void
}) {
  const navigate = useNavigate()
  const t = getAlertType(alert.alert_type)
  const Icon = t.icon
  const [showConfirm, setShowConfirm] = useState(false)

  const summary = () => {
    const c = alert.config_json || {}
    if (alert.alert_type === 'score_threshold') return `Score ${c.direction || 'above'} ${c.threshold || 70}`
    if (alert.alert_type === 'stage_change') return `Stages: ${(c.notify_on || ['emerging', 'exploding']).join(', ')}`
    if (alert.alert_type === 'price_drop') return `Price drop > ${c.pct_threshold || 10}%`
    if (alert.alert_type === 'new_competitor') return `Min ${c.min_new_brands || 1} new brand(s)`
    return ''
  }

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex items-center">
        {/* Icon bar */}
        <div className={clsx('p-4 self-stretch flex items-center', t.bg)}>
          <Icon className={clsx('h-5 w-5', t.color)} />
        </div>

        {/* Content */}
        <div className="flex-1 px-4 py-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-brand-100">{t.label}</span>
            <span className={clsx(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
              alert.is_active ? 'bg-emerald-900/60 text-emerald-300' : 'bg-brand-800 text-brand-500'
            )}>
              {alert.is_active ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="text-xs text-brand-500 mt-0.5">{summary()}</p>
          {(alert.topic_name || alert.topic?.name) && (
            <button
              onClick={() => navigate(`/topics/${alert.topic_id}`)}
              className="text-xs text-brand-400 mt-0.5 hover:text-brand-200 inline-flex items-center gap-1 transition-colors"
            >
              Topic: {alert.topic_name || alert.topic?.name}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
          <p className="text-[10px] text-brand-600 mt-1">
            Created {new Date(alert.created_at).toLocaleDateString()}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 pr-4">
          <button onClick={onToggleExpand}
            className="p-2 text-brand-500 hover:text-brand-300 hover:bg-srf-2 rounded-lg transition-colors"
            title="View events">
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {showConfirm ? (
            <div className="flex items-center gap-1">
              <button onClick={() => { onDelete(alert.id); setShowConfirm(false) }}
                className="px-2 py-1 text-xs font-medium text-red-300 bg-red-900/50 hover:bg-red-900/80 rounded transition-colors">
                Delete
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="px-2 py-1 text-xs text-brand-500 hover:text-brand-300">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setShowConfirm(true)}
              className="p-2 text-brand-600 hover:text-red-400 hover:bg-srf-2 rounded-lg transition-colors"
              title="Delete alert">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Expanded event timeline */}
      {isExpanded && (
        <div className="border-t border-ln">
          <EventTimeline alertId={alert.id} />
        </div>
      )}
    </div>
  )
}

/* ── Event timeline ───────────────────────────────────── */
function EventTimeline({ alertId }: { alertId: string }) {
  const { data: events, isLoading, isError } = useAlertEvents(alertId)

  if (isLoading) {
    return (
      <div className="p-4 space-y-2 animate-pulse">
        <div className="h-4 w-3/4 bg-brand-800 rounded" />
        <div className="h-3 w-1/2 bg-brand-800 rounded" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="p-4 text-center text-sm text-brand-500">
        <AlertCircle className="h-4 w-4 inline mr-1" />
        Could not load events
      </div>
    )
  }

  if (!events?.length) {
    return (
      <div className="p-6 text-center">
        <Clock className="h-8 w-8 text-brand-700 mx-auto mb-2" />
        <p className="text-sm text-brand-500">No events triggered yet</p>
        <p className="text-[10px] text-brand-600 mt-1">Events will appear here when alert conditions are met.</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Event History</h4>
      {events.map((e: any, i: number) => (
        <div key={e.id || i} className="flex items-start gap-3 text-sm">
          <div className={clsx(
            'w-2.5 h-2.5 mt-1.5 rounded-full shrink-0',
            e.delivered || e.is_read ? 'bg-emerald-400' : 'bg-yellow-400'
          )} />
          <div className="flex-1 min-w-0">
            <p className="text-brand-200">{e.message || e.payload_json?.message || 'Alert triggered'}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-brand-600">
                {new Date(e.triggered_at || e.created_at).toLocaleString()}
              </span>
              {(e.delivered || e.is_read) && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-500">
                  <CheckCircle2 className="h-3 w-3" /> Delivered
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main page ────────────────────────────────────────── */
export default function AlertsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data: alerts, isLoading, isError, refetch } = useAlerts()
  const delMut = useDeleteAlert()
  const activeCount = (alerts || []).filter((a: any) => a.is_active).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-sm text-brand-400 mt-1">
            {activeCount} active alert{activeCount !== 1 ? 's' : ''} · Pro plan: 20 max
          </p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-400 text-sm font-medium transition-colors">
          <Plus className="h-4 w-4" /> New Alert
        </button>
      </div>

      {/* Error state */}
      {isError && (
        <div className="card p-6 flex items-center gap-4 border border-red-900/50 mb-4">
          <AlertCircle className="h-8 w-8 text-red-400 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-brand-200">Failed to load alerts</p>
            <p className="text-xs text-brand-500 mt-0.5">Check your connection and try again.</p>
          </div>
          <button onClick={() => refetch()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-300 border border-ln rounded-lg hover:bg-srf-2 transition-colors">
            <RefreshCw className="h-3 w-3" /> Retry
          </button>
        </div>
      )}

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-brand-700 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 bg-brand-700 rounded" />
                  <div className="h-3 w-64 bg-brand-800 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>

      /* Empty state */
      ) : !alerts?.length && !isError ? (
        <div className="card p-12 text-center">
          <Bell className="h-16 w-16 text-brand-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-brand-200 mb-2">No alerts configured</h3>
          <p className="text-sm text-brand-400 mb-6 max-w-md mx-auto">
            Create alerts to get notified when trends change stage, scores spike, or new competitors appear in your tracked topics.
          </p>
          <button onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-500 text-white rounded-lg hover:bg-brand-400 text-sm font-medium transition-colors">
            <Plus className="h-4 w-4" /> Create Your First Alert
          </button>
        </div>

      /* Alert list */
      ) : (
        <div className="space-y-3">
          {alerts!.map((a: any) => (
            <AlertCard
              key={a.id}
              alert={a}
              isExpanded={expanded === a.id}
              onToggleExpand={() => setExpanded(expanded === a.id ? null : a.id)}
              onDelete={(id) => delMut.mutate(id)}
            />
          ))}
        </div>
      )}

      {/* How it works section */}
      {alerts && alerts.length > 0 && (
        <div className="mt-8 p-5 card">
          <h3 className="text-sm font-semibold text-brand-200 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-400" /> How Alerts Work
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-brand-400">
            <div className="p-3 bg-srf rounded-lg border border-ln">
              <p className="font-medium text-brand-300 mb-1 flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 text-brand-500" /> Evaluation
              </p>
              <p>Alerts are evaluated daily against the latest scores and pipeline data.</p>
            </div>
            <div className="p-3 bg-srf rounded-lg border border-ln">
              <p className="font-medium text-brand-300 mb-1 flex items-center gap-1.5">
                <Bell className="h-3 w-3 text-brand-500" /> Delivery
              </p>
              <p>Notifications shown in-app. Email delivery coming in next update.</p>
            </div>
            <div className="p-3 bg-srf rounded-lg border border-ln">
              <p className="font-medium text-brand-300 mb-1 flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-brand-500" /> Limits
              </p>
              <p>Pro plan supports up to 20 active alerts across all topics.</p>
            </div>
          </div>
        </div>
      )}

      {/* Capacity indicator */}
      {alerts && alerts.length > 0 && (
        <div className="mt-4 px-1">
          <div className="flex justify-between text-xs text-brand-600 mb-1">
            <span>{activeCount} / 20 active alerts</span>
            <span>{20 - activeCount} remaining</span>
          </div>
          <div className="h-1.5 bg-brand-800 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full transition-all"
              style={{ width: `${Math.min((activeCount / 20) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {showCreate && <CreateAlertModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  )
}
