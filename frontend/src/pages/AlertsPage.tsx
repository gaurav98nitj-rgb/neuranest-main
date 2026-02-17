import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlerts, useCreateAlert, useDeleteAlert, useAlertEvents, useTopics } from '../hooks/useData'
import { Bell, Plus, Trash2, X, Clock, AlertTriangle, TrendingUp, Zap, DollarSign, Users, RefreshCw, AlertCircle, ChevronDown, ChevronRight, CheckCircle2, Pause, Play } from 'lucide-react'

const C = {
  bg: '#F9F7F4', card: '#FFFFFF', border: '#E6E1DA', borderLight: '#F0ECE6',
  coral: '#E8714A', coralLight: '#FCEEE8', coralUltraLight: '#FFF6F3',
  sage: '#1A8754', sageLight: '#E8F5EE', amber: '#D4930D', amberLight: '#FFF8E6',
  rose: '#C0392B', roseLight: '#FFF0F0', plum: '#7C3AED', plumLight: '#F3EEFF',
  charcoal: '#2D3E50', charcoalDeep: '#1A2A3A',
  ink: '#2A2520', slate: '#5C5549', stone: '#8B8479', sand: '#B8B2A8',
}

const ALERT_TYPES = [
  { value: 'stage_change', label: 'Stage Change', desc: 'When a topic changes trend stage', icon: TrendingUp, color: C.sage, bg: C.sageLight },
  { value: 'score_threshold', label: 'Score Threshold', desc: 'When score crosses a value', icon: Zap, color: C.amber, bg: C.amberLight },
  { value: 'new_competitor', label: 'New Competitor', desc: 'When new brands enter the market', icon: Users, color: C.charcoal, bg: C.borderLight },
  { value: 'price_drop', label: 'Price Drop', desc: 'When median price drops', icon: DollarSign, color: C.plum, bg: C.plumLight },
]
function getAlertType(value: string) { return ALERT_TYPES.find(x => x.value === value) || ALERT_TYPES[0] }

function CreateAlertModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [alertType, setAlertType] = useState('')
  const [topicId, setTopicId] = useState('')
  const [threshold, setThreshold] = useState(70)
  const [direction, setDirection] = useState('above')
  const [topicSearch, setTopicSearch] = useState('')
  const { data: topicsData } = useTopics({ per_page: 100, sort: '-opportunity_score' })
  const topics = topicsData?.data || []
  const filtered = topicSearch ? topics.filter((t: any) => t.name.toLowerCase().includes(topicSearch.toLowerCase())) : topics
  const createMut = useCreateAlert()

  const handleCreate = () => {
    const config: Record<string, any> = {}
    if (alertType === 'score_threshold') { config.threshold = threshold; config.direction = direction; config.score_type = 'opportunity' }
    else if (alertType === 'stage_change') { config.notify_on = ['emerging', 'exploding'] }
    else if (alertType === 'price_drop') { config.pct_threshold = 10 }
    else if (alertType === 'new_competitor') { config.min_new_brands = 1 }
    createMut.mutate({ topic_id: topicId || null, alert_type: alertType, config_json: config }, { onSuccess: () => { onCreated(); onClose() } })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)', padding: 16 }}>
      <div style={{ background: C.card, borderRadius: 16, width: '100%', maxWidth: 520, overflow: 'hidden', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: C.charcoalDeep, margin: 0 }}>Create Alert</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.stone, padding: 4 }}><X style={{ width: 18, height: 18 }} /></button>
        </div>
        <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>Alert Type</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {ALERT_TYPES.map(type => {
                const Icon = type.icon; const selected = alertType === type.value
                return (
                  <button key={type.value} onClick={() => setAlertType(type.value)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 10, textAlign: 'left',
                    border: `2px solid ${selected ? C.coral : C.border}`, background: selected ? C.coralUltraLight : C.card, cursor: 'pointer',
                  }}>
                    <div style={{ padding: 6, borderRadius: 8, background: type.bg, color: type.color, flexShrink: 0 }}><Icon style={{ width: 14, height: 14 }} /></div>
                    <div><p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>{type.label}</p><p style={{ fontSize: 11, color: C.stone, margin: '2px 0 0' }}>{type.desc}</p></div>
                  </button>
                )
              })}
            </div>
          </div>

          {alertType && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8 }}>Topic <span style={{ fontWeight: 400, color: C.stone, fontSize: 11 }}>(optional)</span></label>
              <input type="text" placeholder="Search topics..." value={topicSearch} onChange={e => setTopicSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.ink, marginBottom: 6, outline: 'none' }} />
              <div style={{ maxHeight: 140, overflowY: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div onClick={() => setTopicId('')} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${C.borderLight}`, background: !topicId ? C.coralUltraLight : C.card, color: !topicId ? C.coral : C.slate, fontWeight: !topicId ? 600 : 400 }}>All Topics (global)</div>
                {filtered.slice(0, 50).map((t: any) => (
                  <div key={t.id} onClick={() => setTopicId(t.id)} style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: `1px solid ${C.borderLight}`, background: topicId === t.id ? C.coralUltraLight : C.card, color: topicId === t.id ? C.coral : C.slate, fontWeight: topicId === t.id ? 600 : 400 }}>{t.name}</div>
                ))}
              </div>
            </div>
          )}

          {alertType === 'score_threshold' && (
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 8, display: 'block' }}>Threshold</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.slate }}>
                <span>Notify when score is</span>
                <select value={direction} onChange={e => setDirection(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13 }}><option value="above">above</option><option value="below">below</option></select>
                <input type="number" min={0} max={100} value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: 60, padding: '6px 10px', borderRadius: 6, border: `1px solid ${C.border}`, textAlign: 'center', fontSize: 13 }} />
              </div>
              <input type="range" min={0} max={100} value={threshold} onChange={e => setThreshold(Number(e.target.value))} style={{ width: '100%', marginTop: 8 }} />
            </div>
          )}

          {alertType === 'stage_change' && <div style={{ padding: 12, background: C.sageLight, borderRadius: 10, fontSize: 12, color: C.sage }}>You'll be notified when any tracked topic transitions to <strong>emerging</strong> or <strong>exploding</strong> stage.</div>}
          {alertType === 'price_drop' && <div style={{ padding: 12, background: C.plumLight, borderRadius: 10, fontSize: 12, color: C.plum }}>You'll be notified when median price drops by 10% or more within a week.</div>}
          {alertType === 'new_competitor' && <div style={{ padding: 12, background: C.borderLight, borderRadius: 10, fontSize: 12, color: C.charcoal }}>You'll be notified when a new brand appears in competition data.</div>}
        </div>
        <div style={{ padding: '12px 20px 20px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.stone, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleCreate} disabled={!alertType || createMut.isPending} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: !alertType ? C.sand : C.coral, color: '#fff', fontSize: 13, fontWeight: 600, cursor: !alertType ? 'not-allowed' : 'pointer', opacity: !alertType ? 0.5 : 1 }}>Create Alert</button>
        </div>
      </div>
    </div>
  )
}

function AlertCard({ alert: a, isExpanded, onToggleExpand, onDelete }: { alert: any; isExpanded: boolean; onToggleExpand: () => void; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  const type = getAlertType(a.alert_type)
  const Icon = type.icon

  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden', boxShadow: '0 1px 3px rgba(42,37,32,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
        <div style={{ padding: 8, borderRadius: 10, background: type.bg, color: type.color, flexShrink: 0 }}><Icon style={{ width: 16, height: 16 }} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>{type.label}</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 8, background: a.is_active ? C.sageLight : C.borderLight, color: a.is_active ? C.sage : C.stone }}>{a.is_active ? 'Active' : 'Paused'}</span>
          </div>
          <div style={{ fontSize: 12, color: C.stone, marginTop: 2 }}>
            {a.topic_name ? <span onClick={() => navigate(`/topics/${a.topic_id}`)} style={{ color: C.coral, cursor: 'pointer' }}>{a.topic_name}</span> : 'All topics'}
            {a.config_json?.threshold && <> · Score {a.config_json.direction} {a.config_json.threshold}</>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={onToggleExpand} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: C.stone }}>
            {isExpanded ? <ChevronDown style={{ width: 16, height: 16 }} /> : <ChevronRight style={{ width: 16, height: 16 }} />}
          </button>
          <button onClick={() => onDelete(a.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: C.sand }}>
            <Trash2 style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </div>
      {isExpanded && <AlertEventHistory alertId={a.id} />}
    </div>
  )
}

function AlertEventHistory({ alertId }: { alertId: string }) {
  const { data: events, isLoading } = useAlertEvents(alertId)

  if (isLoading) return <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.borderLight}` }}><div style={{ display: 'flex', gap: 8 }}>{[1,2,3].map(i => <div key={i} style={{ height: 8, width: 60 + i * 20, background: C.borderLight, borderRadius: 4 }} />)}</div></div>

  if (!events?.length) return (
    <div style={{ padding: '16px 18px', borderTop: `1px solid ${C.borderLight}`, textAlign: 'center' }}>
      <Clock style={{ width: 18, height: 18, color: C.sand, margin: '0 auto 4px' }} />
      <p style={{ fontSize: 12, color: C.sand, margin: 0 }}>No events triggered yet</p>
    </div>
  )

  return (
    <div style={{ padding: '12px 18px', borderTop: `1px solid ${C.borderLight}` }}>
      <h4 style={{ fontSize: 10, fontWeight: 700, color: C.stone, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Event History</h4>
      {events.map((e: any, i: number) => (
        <div key={e.id || i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 8, fontSize: 13 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0, background: (e.delivered || e.is_read) ? C.sage : C.amber }} />
          <div style={{ flex: 1 }}>
            <p style={{ color: C.ink, margin: 0 }}>{e.message || e.payload_json?.message || 'Alert triggered'}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 10 }}>
              <span style={{ color: C.sand }}>{new Date(e.triggered_at || e.created_at).toLocaleString()}</span>
              {(e.delivered || e.is_read) && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: C.sage }}><CheckCircle2 style={{ width: 10, height: 10 }} /> Delivered</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AlertsPage() {
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const { data: alerts, isLoading, isError, refetch } = useAlerts()
  const delMut = useDeleteAlert()
  const activeCount = (alerts || []).filter((a: any) => a.is_active).length

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '28px 36px', fontFamily: "'Plus Jakarta Sans', -apple-system, sans-serif", color: C.ink, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, color: C.charcoalDeep, fontFamily: "'Newsreader', Georgia, serif" }}>Alerts</h1>
          <p style={{ fontSize: 13, color: C.stone, margin: '6px 0 0' }}>{activeCount} active alert{activeCount !== 1 ? 's' : ''} · Pro plan: 20 max</p>
        </div>
        <button onClick={() => setShowCreate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '10px 18px', background: C.coral, color: '#fff',
          border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
        }}>
          <Plus style={{ width: 14, height: 14 }} /> New Alert
        </button>
      </div>

      {isError && (
        <div style={{ background: C.card, borderRadius: 14, padding: '16px 20px', border: `1px solid ${C.rose}30`, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <AlertCircle style={{ width: 20, height: 20, color: C.rose, flexShrink: 0 }} />
          <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 600, color: C.ink, margin: 0 }}>Failed to load alerts</p><p style={{ fontSize: 11, color: C.stone, margin: '2px 0 0' }}>Check your connection and try again.</p></div>
          <button onClick={() => refetch()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', border: `1px solid ${C.border}`, borderRadius: 8, background: C.card, fontSize: 12, fontWeight: 600, color: C.slate, cursor: 'pointer' }}>
            <RefreshCw style={{ width: 12, height: 12 }} /> Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => <div key={i} style={{ background: C.card, borderRadius: 14, padding: 16, border: `1px solid ${C.border}`, height: 60, opacity: 0.5 }} />)}
        </div>
      ) : !alerts?.length && !isError ? (
        <div style={{ background: C.card, borderRadius: 14, padding: 40, textAlign: 'center', border: `1px solid ${C.border}` }}>
          <Bell style={{ width: 48, height: 48, color: C.sand, margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: 16, fontWeight: 600, color: C.ink, margin: '0 0 6px' }}>No alerts configured</h3>
          <p style={{ fontSize: 13, color: C.stone, marginBottom: 16 }}>Create alerts to get notified when trends change stage, scores spike, or new competitors appear.</p>
          <button onClick={() => setShowCreate(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 20px', background: C.coral, color: '#fff', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            <Plus style={{ width: 14, height: 14 }} /> Create Your First Alert
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {alerts!.map((a: any) => (
            <AlertCard key={a.id} alert={a} isExpanded={expanded === a.id} onToggleExpand={() => setExpanded(expanded === a.id ? null : a.id)} onDelete={id => delMut.mutate(id)} />
          ))}
        </div>
      )}

      {/* How it works */}
      {alerts && alerts.length > 0 && (
        <div style={{ marginTop: 28, background: C.card, borderRadius: 14, padding: 20, border: `1px solid ${C.border}` }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: C.charcoalDeep, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangle style={{ width: 14, height: 14, color: C.amber }} /> How Alerts Work</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            {[
              { icon: <RefreshCw style={{ width: 12, height: 12, color: C.stone }} />, title: 'Evaluation', text: 'Alerts are evaluated daily against the latest scores and pipeline data.' },
              { icon: <Bell style={{ width: 12, height: 12, color: C.stone }} />, title: 'Delivery', text: 'Notifications shown in-app. Email delivery coming in next update.' },
              { icon: <Zap style={{ width: 12, height: 12, color: C.stone }} />, title: 'Limits', text: 'Pro plan supports up to 20 active alerts across all topics.' },
            ].map(item => (
              <div key={item.title} style={{ padding: 12, background: C.bg, borderRadius: 10, border: `1px solid ${C.borderLight}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, fontSize: 12, fontWeight: 600, color: C.slate }}>{item.icon} {item.title}</div>
                <p style={{ fontSize: 11, color: C.stone, margin: 0 }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Capacity */}
      {alerts && alerts.length > 0 && (
        <div style={{ marginTop: 12, padding: '0 2px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.sand, marginBottom: 4 }}><span>{activeCount} / 20 active alerts</span><span>{20 - activeCount} remaining</span></div>
          <div style={{ height: 5, background: C.borderLight, borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: C.coral, borderRadius: 3, transition: 'width 0.3s', width: `${Math.min((activeCount / 20) * 100, 100)}%` }} />
          </div>
        </div>
      )}

      {showCreate && <CreateAlertModal onClose={() => setShowCreate(false)} onCreated={() => refetch()} />}
    </div>
  )
}
