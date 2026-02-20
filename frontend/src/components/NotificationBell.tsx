import { useState, useEffect, useRef } from 'react'
import { Bell, X, TrendingUp, Zap, Users, DollarSign, Clock } from 'lucide-react'
import { api } from '../lib/api'

/* ─── Palette ─── */
const C = {
    ink: '#0F172A', slate: '#475569', sand: '#94A3B8',
    card: '#FFFFFF', border: '#E2E8F0', bg: '#F8FAFC',
    orange: '#E16A4A', orangeL: '#FEF0EB',
    mint: '#2ED3A5', mintL: '#EAFAF5',
    amber: '#FFC857', amberL: '#FFF8E6',
    purple: '#6B4EFF', purpleL: '#F0EEFF',
    rose: '#EF4444', roseL: '#FEF2F2',
}

interface NotifEvent {
    id: string
    alert_type: string
    topic_id: string | null
    triggered_at: string
    payload: Record<string, any>
    is_unread: boolean
}

const ALERT_META: Record<string, { icon: typeof Bell; color: string; bg: string; label: string }> = {
    stage_change: { icon: TrendingUp, color: C.mint, bg: C.mintL, label: 'Stage Change' },
    score_threshold: { icon: Zap, color: C.amber, bg: C.amberL, label: 'Score Spike' },
    new_competitor: { icon: Users, color: C.purple, bg: C.purpleL, label: 'New Competitor' },
    price_drop: { icon: DollarSign, color: C.orange, bg: C.orangeL, label: 'Price Drop' },
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
}

function NotifItem({ ev, onTopicClick }: { ev: NotifEvent; onTopicClick: (id: string) => void }) {
    const meta = ALERT_META[ev.alert_type] || { icon: Bell, color: C.orange, bg: C.orangeL, label: 'Alert' }
    const Icon = meta.icon
    const topicName = ev.payload?.topic_name || (ev.topic_id ? 'Topic' : 'All topics')

    return (
        <div style={{
            display: 'flex', gap: 12, padding: '12px 16px',
            background: ev.is_unread ? `${meta.color}08` : C.card,
            borderBottom: `1px solid ${C.border}`,
            cursor: ev.topic_id ? 'pointer' : 'default',
            transition: 'background 0.15s',
        }}
            onClick={() => ev.topic_id && onTopicClick(ev.topic_id)}>
            {/* Icon */}
            <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Icon style={{ width: 16, height: 16, color: meta.color }} />
            </div>
            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{
                        fontSize: 12, fontWeight: 700, color: meta.color,
                        background: meta.bg, padding: '2px 7px', borderRadius: 20
                    }}>
                        {meta.label}
                    </span>
                    {ev.is_unread && (
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.orange, flexShrink: 0 }} />
                    )}
                </div>
                <div style={{
                    fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                    {topicName}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                    <Clock style={{ width: 10, height: 10, color: C.sand }} />
                    <span style={{ fontSize: 11, color: C.sand }}>{timeAgo(ev.triggered_at)}</span>
                </div>
            </div>
        </div>
    )
}

export default function NotificationBell({ onNavigate }: { onNavigate?: (path: string) => void }) {
    const [open, setOpen] = useState(false)
    const [events, setEvents] = useState<NotifEvent[]>([])
    const [unread, setUnread] = useState(0)
    const [loading, setLoading] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const fetchNotifications = async () => {
        try {
            const res = await api.get('/alerts/notifications')
            setEvents(res.data.events || [])
            setUnread(res.data.unread_count || 0)
        } catch {
            // Not authenticated yet or no alerts — silently ignore
        }
    }

    // Poll every 60 seconds
    useEffect(() => {
        fetchNotifications()
        const interval = setInterval(fetchNotifications, 60_000)
        return () => clearInterval(interval)
    }, [])

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    const handleOpen = async () => {
        setOpen(o => !o)
        if (!open && unread > 0) {
            // Mark as read
            try { await api.post('/alerts/notifications/read') } catch { /* ignore */ }
            setUnread(0)
            setEvents(prev => prev.map(ev => ({ ...ev, is_unread: false })))
        }
    }

    const handleTopicClick = (topicId: string) => {
        setOpen(false)
        onNavigate?.(`/topics/${topicId}`)
    }

    return (
        <div ref={dropdownRef} style={{ position: 'relative' }}>
            {/* Bell button */}
            <button
                onClick={handleOpen}
                title="Notifications"
                style={{
                    position: 'relative', width: 36, height: 36, borderRadius: 10,
                    background: open ? `${C.orange}15` : 'transparent',
                    border: `1px solid ${open ? C.orange : 'transparent'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', transition: 'all 0.2s',
                }}>
                <Bell style={{ width: 18, height: 18, color: open ? C.orange : C.sand }} />
                {unread > 0 && (
                    <div style={{
                        position: 'absolute', top: -4, right: -4,
                        minWidth: 18, height: 18, borderRadius: 9,
                        background: C.orange, color: '#fff',
                        fontSize: 10, fontWeight: 800,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 4px', border: '2px solid #fff',
                        fontFamily: "'Inter', sans-serif",
                    }}>
                        {unread > 9 ? '9+' : unread}
                    </div>
                )}
            </button>

            {/* Dropdown */}
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                    width: 320, background: C.card, borderRadius: 16,
                    boxShadow: '0 8px 40px rgba(0,0,0,0.14)', border: `1px solid ${C.border}`,
                    zIndex: 200, overflow: 'hidden',
                    animation: 'nn-slide-down 0.15s ease',
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '14px 16px 12px', borderBottom: `1px solid ${C.border}`,
                    }}>
                        <div>
                            <span style={{
                                fontSize: 14, fontWeight: 700, color: C.ink,
                                fontFamily: "'Sora', sans-serif"
                            }}>Notifications</span>
                            {events.length > 0 && (
                                <span style={{ fontSize: 11, color: C.sand, marginLeft: 6 }}>
                                    {events.length} recent
                                </span>
                            )}
                        </div>
                        <button onClick={() => setOpen(false)} style={{
                            background: 'none', border: 'none', cursor: 'pointer', color: C.sand, padding: 4,
                        }}>
                            <X style={{ width: 14, height: 14 }} />
                        </button>
                    </div>

                    {/* Events list */}
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                        {loading && (
                            <div style={{ padding: 24, textAlign: 'center', color: C.sand, fontSize: 13 }}>Loading…</div>
                        )}
                        {!loading && events.length === 0 && (
                            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                                <div style={{ fontSize: 36, marginBottom: 10 }}>🔔</div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 4 }}>No alerts yet</div>
                                <div style={{ fontSize: 12, color: C.sand }}>
                                    Create alerts to get notified when your markets move
                                </div>
                            </div>
                        )}
                        {!loading && events.map(ev => (
                            <NotifItem key={ev.id} ev={ev} onTopicClick={handleTopicClick} />
                        ))}
                    </div>

                    {/* Footer */}
                    {events.length > 0 && (
                        <div style={{ padding: '10px 16px', borderTop: `1px solid ${C.border}`, textAlign: 'center' }}>
                            <button
                                onClick={() => { setOpen(false); onNavigate?.('/alerts') }}
                                style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600, color: C.orange,
                                }}>
                                View all alerts →
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
