import { useState, useCallback, createContext, useContext } from 'react'

/* ─── Types ─── */
export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
    id: string
    type: ToastType
    title: string
    message?: string
    duration?: number
}

interface ToastContextValue {
    toasts: Toast[]
    addToast: (toast: Omit<Toast, 'id'>) => void
    removeToast: (id: string) => void
    success: (title: string, message?: string) => void
    error: (title: string, message?: string) => void
    info: (title: string, message?: string) => void
    warning: (title: string, message?: string) => void
}

/* ─── Context ─── */
const ToastContext = createContext<ToastContextValue | null>(null)

/* ─── Colors ─── */
const TOAST_STYLES: Record<ToastType, { bg: string; border: string; icon: string; iconColor: string; titleColor: string }> = {
    success: { bg: '#EAFAF5', border: '#2ED3A5', icon: '✓', iconColor: '#2ED3A5', titleColor: '#1A3A2A' },
    error: { bg: '#FEF2F2', border: '#EF4444', icon: '✕', iconColor: '#EF4444', titleColor: '#3A1A1A' },
    warning: { bg: '#FFF8E6', border: '#FFC857', icon: '⚠', iconColor: '#E6A800', titleColor: '#3A2C0A' },
    info: { bg: '#F0EEFF', border: '#6B4EFF', icon: 'i', iconColor: '#6B4EFF', titleColor: '#1A1240' },
}

/* ─── Provider ─── */
export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).slice(2)
        const newToast = { ...toast, id }
        setToasts(prev => [...prev.slice(-4), newToast]) // max 5 toasts
        const duration = toast.duration ?? 4000
        if (duration > 0) {
            setTimeout(() => removeToast(id), duration)
        }
    }, [removeToast])

    const success = useCallback((title: string, message?: string) => addToast({ type: 'success', title, message }), [addToast])
    const error = useCallback((title: string, message?: string) => addToast({ type: 'error', title, message }), [addToast])
    const info = useCallback((title: string, message?: string) => addToast({ type: 'info', title, message }), [addToast])
    const warning = useCallback((title: string, message?: string) => addToast({ type: 'warning', title, message }), [addToast])

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info, warning }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    )
}

/* ─── Hook ─── */
export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within a ToastProvider')
    return ctx
}

/* ─── Toast Container ─── */
function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
    if (toasts.length === 0) return null
    return (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
            display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
        }}>
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    )
}

/* ─── Single Toast ─── */
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
    const s = TOAST_STYLES[toast.type]
    return (
        <div
            style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '14px 16px', borderRadius: 12, minWidth: 300, maxWidth: 380,
                background: s.bg, border: `1px solid ${s.border}40`,
                boxShadow: `0 4px 16px rgba(0,0,0,0.08), 0 0 0 1px ${s.border}20`,
                pointerEvents: 'all', cursor: 'default',
                animation: 'toastSlideIn 0.25s ease',
                fontFamily: "'Inter', sans-serif",
            }}
        >
            <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: s.iconColor, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, marginTop: 1,
            }}>
                {s.icon}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: s.titleColor }}>{toast.title}</div>
                {toast.message && (
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 1.5 }}>{toast.message}</div>
                )}
            </div>
            <button
                onClick={() => onRemove(toast.id)}
                style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#94A3B8', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: '0 2px',
                }}
            >
                ×
            </button>
        </div>
    )
}
