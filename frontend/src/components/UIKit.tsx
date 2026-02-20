/* ─── Shared UI Primitives: Skeleton + EmptyState ─── */

const NN = {
    border: '#E2E8F0', mist: '#F8FAFC', slate: '#64748B',
    stone: '#94A3B8', orange: '#E16A4A', ink: '#0F172A',
}

/* ═══ Skeleton ══════════════════════════════════════════
   Drop-in shimmer placeholder for loading states.
   Usage: <Skeleton width="100%" height={20} />
         <Skeleton variant="circle" size={40} />
         <Skeleton variant="card" />
═══════════════════════════════════════════════════════ */
type SkeletonVariant = 'rect' | 'circle' | 'text' | 'card'

interface SkeletonProps {
    variant?: SkeletonVariant
    width?: number | string
    height?: number | string
    size?: number          // for circles
    borderRadius?: number
    style?: React.CSSProperties
}

const shimmerKeyframes = `
@keyframes shimmer {
  0%   { background-position: -468px 0 }
  100% { background-position: 468px 0 }
}
`

function injectStyles() {
    if (typeof document !== 'undefined' && !document.getElementById('nn-skeleton-styles')) {
        const style = document.createElement('style')
        style.id = 'nn-skeleton-styles'
        style.textContent = shimmerKeyframes + `
      .nn-skeleton {
        background: linear-gradient(90deg, ${NN.border} 25%, #f0f4f8 50%, ${NN.border} 75%);
        background-size: 936px 104px;
        animation: shimmer 1.4s infinite linear;
        border-radius: 6px;
      }
      @keyframes toastSlideIn {
        from { opacity: 0; transform: translateX(16px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `
        document.head.appendChild(style)
    }
}

export function Skeleton({ variant = 'rect', width, height, size, borderRadius, style }: SkeletonProps) {
    injectStyles()

    if (variant === 'circle') {
        const s = size || 40
        return <div className="nn-skeleton" style={{ width: s, height: s, borderRadius: '50%', flexShrink: 0, ...style }} />
    }
    if (variant === 'card') {
        return (
            <div style={{ background: '#fff', borderRadius: 14, border: `1px solid ${NN.border}`, padding: 24, ...style }}>
                <Skeleton height={16} width="60%" style={{ marginBottom: 8 }} />
                <Skeleton height={12} width="90%" style={{ marginBottom: 6 }} />
                <Skeleton height={12} width="75%" style={{ marginBottom: 20 }} />
                <Skeleton height={80} />
            </div>
        )
    }
    if (variant === 'text') {
        return <div className="nn-skeleton" style={{ width: width || '100%', height: height || 14, borderRadius: 4, ...style }} />
    }
    return (
        <div
            className="nn-skeleton"
            style={{ width: width || '100%', height: height || 20, borderRadius: borderRadius ?? 6, ...style }}
        />
    )
}

/* Convenience: rows of text skeletons */
export function SkeletonText({ lines = 3, lastLineWidth = '60%' }: { lines?: number; lastLineWidth?: string }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} variant="text" width={i === lines - 1 ? lastLineWidth : '100%'} />
            ))}
        </div>
    )
}

/* Convenience: grid of card skeletons */
export function SkeletonGrid({ count = 6, columns = 3 }: { count?: number; columns?: number }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 16 }}>
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} variant="card" />
            ))}
        </div>
    )
}

/* ═══ EmptyState ══════════════════════════════════════════
   Standardized zero-data states with an icon, headline,
   description, and optional CTA button.
═══════════════════════════════════════════════════════ */
interface EmptyStateProps {
    emoji?: string
    title: string
    description?: string
    cta?: { label: string; onClick: () => void }
    compact?: boolean
    style?: React.CSSProperties
}

export function EmptyState({ emoji = '🔍', title, description, cta, compact = false, style }: EmptyStateProps) {
    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: compact ? '24px 20px' : '48px 32px', textAlign: 'center',
            fontFamily: "'Inter', sans-serif",
            ...style,
        }}>
            <div style={{
                width: compact ? 48 : 64, height: compact ? 48 : 64, borderRadius: '50%',
                background: NN.mist, border: `1.5px solid ${NN.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: compact ? 22 : 28, marginBottom: compact ? 12 : 16,
            }}>
                {emoji}
            </div>
            <h3 style={{
                fontFamily: "'Sora', sans-serif", fontWeight: 700,
                fontSize: compact ? 14 : 17, color: NN.ink,
                margin: '0 0 6px',
            }}>
                {title}
            </h3>
            {description && (
                <p style={{
                    fontSize: compact ? 12 : 13, color: NN.slate, lineHeight: 1.6,
                    margin: '0 0 16px', maxWidth: 320,
                }}>
                    {description}
                </p>
            )}
            {cta && (
                <button
                    onClick={cta.onClick}
                    style={{
                        padding: '10px 20px', background: NN.orange, color: '#fff',
                        border: 'none', borderRadius: 10, fontWeight: 600,
                        fontSize: compact ? 12 : 13, cursor: 'pointer',
                        boxShadow: '0 3px 10px rgba(225,106,74,0.25)',
                        fontFamily: "'Inter', sans-serif",
                    }}
                >
                    {cta.label}
                </button>
            )}
        </div>
    )
}

/* Specific presets */
export function NoResultsState({ onClear }: { onClear?: () => void }) {
    return (
        <EmptyState
            emoji="🔍"
            title="No results found"
            description="Try adjusting your filters or search terms to find what you're looking for."
            cta={onClear ? { label: 'Clear Filters', onClick: onClear } : undefined}
        />
    )
}

export function NoDataState({ message }: { message?: string }) {
    return (
        <EmptyState
            emoji="📊"
            title="No data yet"
            description={message || 'Data will appear here once the pipeline has run.'}
        />
    )
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
    return (
        <EmptyState
            emoji="⚠️"
            title="Something went wrong"
            description={message || 'Unable to load data. Please try again.'}
            cta={onRetry ? { label: 'Retry', onClick: onRetry } : undefined}
        />
    )
}
