import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, Bookmark, Bell, ArrowRight, CheckCircle2, Sparkles, X } from 'lucide-react'
import { watchlistApi, alertsApi, topicsApi } from '../lib/api'

/* ─── Brand palette ─── */
const NN = {
    ink: '#0F172A', blue: '#1E3A5F', slate: '#475569', sand: '#94A3B8',
    mist: '#F8FAFC', card: '#FFFFFF', border: '#E2E8F0', borderLight: '#F1F5F9',
    orange: '#E16A4A', orangeL: '#FEF0EB', orangeXL: '#FFF7F5',
    mint: '#2ED3A5', mintL: '#EAFAF5',
    purple: '#6B4EFF', purpleL: '#F0EEFF',
    amber: '#FFC857', amberL: '#FFF8E6',
}

/* ─── Step indicator ─── */
function StepBar({ current, total }: { current: number; total: number }) {
    return (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 36 }}>
            {Array.from({ length: total }).map((_, i) => (
                <div key={i} style={{
                    height: 4, flex: 1, maxWidth: 64, borderRadius: 9999,
                    background: i < current ? NN.orange : i === current ? NN.orange : NN.border,
                    opacity: i <= current ? 1 : 0.3,
                    transition: 'all 0.3s ease',
                }} />
            ))}
        </div>
    )
}

/* ─── Niche categories ─── */
const NICHES = [
    { id: 'health', label: 'Health & Wellness', emoji: '💊', color: NN.mint },
    { id: 'beauty', label: 'Beauty & Skincare', emoji: '✨', color: NN.orange },
    { id: 'home', label: 'Home & Garden', emoji: '🏡', color: NN.amber },
    { id: 'pets', label: 'Pets & Animals', emoji: '🐾', color: NN.purple },
    { id: 'fitness', label: 'Fitness & Sports', emoji: '🏋️', color: NN.mint },
    { id: 'food', label: 'Food & Nutrition', emoji: '🍃', color: NN.amber },
    { id: 'tech', label: 'Tech & Gadgets', emoji: '⚡', color: NN.purple },
    { id: 'baby', label: 'Baby & Kids', emoji: '🧸', color: NN.orange },
    { id: 'outdoor', label: 'Outdoor & Survival', emoji: '🏕️', color: NN.mint },
    { id: 'sleep', label: 'Sleep & Recovery', emoji: '🌙', color: NN.purple },
]

/* ─── Step 1: Pick niches ─── */
function Step1Niches({ selected, onToggle }: { selected: Set<string>; onToggle: (id: string) => void }) {
    return (
        <div>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, color: NN.ink, margin: '0 0 8px' }}>
                What markets are you targeting?
            </h2>
            <p style={{ color: NN.slate, fontSize: 15, margin: '0 0 28px' }}>
                Pick up to 3 niches — we'll personalise your trend feed.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12 }}>
                {NICHES.map(n => {
                    const isSelected = selected.has(n.id)
                    const isDisabled = !isSelected && selected.size >= 3
                    return (
                        <button key={n.id} onClick={() => !isDisabled && onToggle(n.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
                                borderRadius: 12, border: `2px solid ${isSelected ? n.color : NN.border}`,
                                background: isSelected ? `${n.color}15` : NN.card,
                                cursor: isDisabled ? 'not-allowed' : 'pointer',
                                opacity: isDisabled ? 0.4 : 1,
                                textAlign: 'left', transition: 'all 0.2s',
                            }}>
                            <span style={{ fontSize: 22 }}>{n.emoji}</span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: isSelected ? n.color : NN.ink }}>{n.label}</div>
                            </div>
                            {isSelected && <CheckCircle2 style={{ width: 16, height: 16, color: n.color, marginLeft: 'auto' }} />}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

/* ─── Step 2: Watchlist topics ─── */
function Step2Watchlist({
    niches, added, onAdd,
}: { niches: Set<string>; added: Set<string>; onAdd: (id: string, name: string) => void }) {
    const [topics, setTopics] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        setLoading(true)
        const category = Array.from(niches)[0] || ''
        topicsApi.list({ per_page: 8, sort: '-opportunity_score', search: category })
            .then(r => setTopics(r.data?.data || []))
            .catch(() => setTopics([]))
            .finally(() => setLoading(false))
    }, [niches])

    return (
        <div>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, color: NN.ink, margin: '0 0 8px' }}>
                Add your first topics to watch
            </h2>
            <p style={{ color: NN.slate, fontSize: 15, margin: '0 0 28px' }}>
                These are top opportunities in your niches. Tap to track them.
            </p>
            {loading ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} style={{
                            height: 80, borderRadius: 12, background: NN.border, opacity: 0.4,
                            animation: 'nn-shimmer 1.5s infinite'
                        }} />
                    ))}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {topics.map((t: any) => {
                        const isAdded = added.has(t.id)
                        return (
                            <button key={t.id} onClick={() => onAdd(t.id, t.name)}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                    padding: '14px 16px', borderRadius: 12, textAlign: 'left',
                                    border: `2px solid ${isAdded ? NN.orange : NN.border}`,
                                    background: isAdded ? NN.orangeXL : NN.card,
                                    cursor: 'pointer', transition: 'all 0.2s', gap: 6,
                                }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                    <span style={{
                                        fontSize: 12, fontWeight: 600, color: NN.orange,
                                        background: NN.orangeL, padding: '2px 8px', borderRadius: 20
                                    }}>
                                        {t.opportunity_score?.toFixed(0) ?? '--'} pts
                                    </span>
                                    {isAdded
                                        ? <CheckCircle2 style={{ width: 15, height: 15, color: NN.orange }} />
                                        : <Bookmark style={{ width: 15, height: 15, color: NN.sand }} />}
                                </div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: NN.ink, lineHeight: 1.3 }}>{t.name}</div>
                                {t.trend_stage && (
                                    <div style={{ fontSize: 11, color: NN.slate }}>
                                        {t.trend_stage.charAt(0).toUpperCase() + t.trend_stage.slice(1)} trend
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

/* ─── Step 3: First alert ─── */
const ALERT_OPTIONS = [
    { type: 'stage_change', label: 'Stage Change', desc: 'Notify me when a topic enters Exploding', emoji: '📊', color: NN.mint },
    { type: 'score_threshold', label: 'Score Spike', desc: 'When opportunity score crosses 75', emoji: '⚡', color: NN.amber },
    { type: 'new_competitor', label: 'New Competitor', desc: 'When new brands enter tracked niches', emoji: '👥', color: NN.purple },
    { type: 'price_drop', label: 'Price Drop', desc: 'When median price drops 10%+', emoji: '💰', color: NN.orange },
]

function Step3Alert({ selected, onSelect }: { selected: string; onSelect: (type: string) => void }) {
    return (
        <div>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 26, color: NN.ink, margin: '0 0 8px' }}>
                Set your first alert
            </h2>
            <p style={{ color: NN.slate, fontSize: 15, margin: '0 0 28px' }}>
                NeuraNest will notify you the moment your market moves. Pick one to start.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {ALERT_OPTIONS.map(opt => {
                    const isSelected = selected === opt.type
                    return (
                        <button key={opt.type} onClick={() => onSelect(opt.type)} style={{
                            display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px',
                            borderRadius: 14, border: `2px solid ${isSelected ? opt.color : NN.border}`,
                            background: isSelected ? `${opt.color}12` : NN.card,
                            cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
                        }}>
                            <div style={{
                                width: 42, height: 42, borderRadius: 12,
                                background: `${opt.color}20`, display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: 20, flexShrink: 0
                            }}>
                                {opt.emoji}
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: isSelected ? opt.color : NN.ink }}>{opt.label}</div>
                                <div style={{ fontSize: 12, color: NN.slate, marginTop: 2 }}>{opt.desc}</div>
                            </div>
                            {isSelected && <CheckCircle2 style={{ width: 18, height: 18, color: opt.color, flexShrink: 0 }} />}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

/* ─── Completion screen ─── */
function CompletionScreen() {
    return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 72, marginBottom: 20 }}>🎉</div>
            <h2 style={{ fontFamily: "'Sora', sans-serif", fontWeight: 800, fontSize: 28, color: NN.ink, margin: '0 0 12px' }}>
                You're all set!
            </h2>
            <p style={{ color: NN.slate, fontSize: 15, maxWidth: 340, margin: '0 auto 28px' }}>
                Your dashboard is personalised, your watchlist is live, and your first alert is active.
                Time to spot your next winning product.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                {['Topics tracked', 'ML signals', 'Alert active'].map((label, i) => (
                    <div key={label} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
                        borderRadius: 24, background: [NN.mintL, NN.orangeXL, NN.purpleL][i],
                        border: `1px solid ${[NN.mint, NN.orange, NN.purple][i]}30`,
                    }}>
                        <CheckCircle2 style={{ width: 14, height: 14, color: [NN.mint, NN.orange, NN.purple][i] }} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: [NN.mint, NN.orange, NN.purple][i] }}>{label}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

/* ─── Main OnboardingPage ─── */
export default function OnboardingPage() {
    const navigate = useNavigate()
    const [step, setStep] = useState(0) // 0: niches, 1: watchlist, 2: alert, 3: done
    const [selectedNiches, setSelectedNiches] = useState<Set<string>>(new Set())
    const [addedTopics, setAddedTopics] = useState<Set<string>>(new Set())
    const [selectedAlert, setSelectedAlert] = useState('')
    const [saving, setSaving] = useState(false)

    const toggleNiche = (id: string) => {
        setSelectedNiches(prev => {
            const next = new Set(prev)
            next.has(id) ? next.delete(id) : next.add(id)
            return next
        })
    }

    const addTopic = async (id: string, _name: string) => {
        if (addedTopics.has(id)) return
        setAddedTopics(prev => new Set([...prev, id]))
        try { await watchlistApi.add(id) } catch { /* ignore — topic may already be added */ }
    }

    const canNext = () => {
        if (step === 0) return selectedNiches.size > 0
        if (step === 1) return true // watchlist is optional
        if (step === 2) return selectedAlert !== ''
        return true
    }

    const handleNext = async () => {
        if (step === 2) {
            // Create alert
            setSaving(true)
            try {
                const configMap: Record<string, any> = {
                    score_threshold: { threshold: 75, direction: 'above', score_type: 'opportunity' },
                    stage_change: { notify_on: ['exploding', 'peaking'] },
                    new_competitor: { min_new_brands: 1 },
                    price_drop: { pct_threshold: 10 },
                }
                await alertsApi.create({
                    topic_id: null,
                    alert_type: selectedAlert,
                    config_json: configMap[selectedAlert] || {},
                })
            } catch { /* best-effort */ }
            setSaving(false)
            setStep(3)
            return
        }
        if (step === 3) {
            localStorage.setItem('onboarding_complete', 'true')
            navigate('/dashboard')
            return
        }
        setStep(s => s + 1)
    }

    const handleSkip = () => {
        localStorage.setItem('onboarding_complete', 'true')
        navigate('/dashboard')
    }

    return (
        <div style={{
            minHeight: '100vh', background: NN.mist, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            padding: 24, fontFamily: "'Inter', sans-serif",
        }}>
            <div style={{
                width: '100%', maxWidth: 680, background: NN.card,
                borderRadius: 20, boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px 32px 0', display: 'flex',
                    alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: `linear-gradient(135deg, ${NN.orange}, ${NN.purple})`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Sparkles style={{ width: 16, height: 16, color: '#fff' }} />
                        </div>
                        <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: 15, color: NN.ink }}>
                            NeuraNest Setup
                        </span>
                    </div>
                    {step < 3 && (
                        <button onClick={handleSkip} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: NN.sand, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                            Skip setup <X style={{ width: 14, height: 14 }} />
                        </button>
                    )}
                </div>

                {/* Progress bar */}
                <div style={{ padding: '20px 32px 0' }}>
                    {step < 3 && <StepBar current={step} total={3} />}
                </div>

                {/* Step content */}
                <div style={{ padding: '8px 32px 32px' }}>
                    {step === 0 && <Step1Niches selected={selectedNiches} onToggle={toggleNiche} />}
                    {step === 1 && <Step2Watchlist niches={selectedNiches} added={addedTopics} onAdd={addTopic} />}
                    {step === 2 && <Step3Alert selected={selectedAlert} onSelect={setSelectedAlert} />}
                    {step === 3 && <CompletionScreen />}

                    {/* CTA */}
                    <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                        {step > 0 && step < 3 && (
                            <button onClick={() => setStep(s => s - 1)} style={{
                                padding: '11px 22px', borderRadius: 10, border: `1px solid ${NN.border}`,
                                background: NN.card, color: NN.slate, fontWeight: 600, fontSize: 14, cursor: 'pointer',
                            }}>
                                Back
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            disabled={!canNext() || saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '11px 28px', borderRadius: 10, border: 'none',
                                background: canNext() && !saving ? NN.orange : NN.border,
                                color: canNext() && !saving ? '#fff' : NN.sand,
                                fontWeight: 700, fontSize: 14, cursor: canNext() && !saving ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s',
                            }}>
                            {saving ? 'Saving…' : step === 3 ? 'Go to Dashboard' : step === 2 ? 'Activate Alert' : 'Continue'}
                            {!saving && step < 3 && <ArrowRight style={{ width: 16, height: 16 }} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
