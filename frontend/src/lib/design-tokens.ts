/**
 * NeuraNest Design Token System
 * Single source of truth for all brand colors, typography, spacing.
 * All pages use `import { NN } from '../lib/design-tokens'` and reference
 * NN.orange, NN.blue, etc. instead of local const C objects.
 */

export const NN = {
    // ─── Backgrounds ────────────────────────────────────────────────────────
    bg: '#F8FAFC',   // Main page background (cool slate-white)
    bgDark: '#0F172A',   // Dark surface (sidebar, modals)
    card: '#FFFFFF',   // Card surface
    cardHover: '#F8FAFC',   // Card hover

    // ─── Neural Orange (Primary CTA / Highlights) ────────────────────────────
    orange: '#E16A4A',
    orangeHover: '#C85A3A',
    orangeLight: '#FEF0EB',
    orangeUltraLight: '#FFF7F5',
    orangeGlow: 'rgba(225,106,74,0.14)',

    // ─── Deep Intelligence Blue (Navigation / Structure) ─────────────────────
    blue: '#1E3A5F',
    blueMid: '#2C5282',
    blueLight: '#EBF4FF',
    blueUltraLight: '#F0F6FF',

    // ─── Signal Purple (AI Features / Innovation) ────────────────────────────
    purple: '#6B4EFF',
    purpleHover: '#5A3DE8',
    purpleLight: '#F0EEFF',
    purpleUltraLight: '#F7F5FF',

    // ─── Growth Mint (Success / Positive Metrics) ────────────────────────────
    mint: '#2ED3A5',
    mintHover: '#24B890',
    mintLight: '#EAFAF5',
    mintUltraLight: '#F0FBF8',

    // ─── Insight Gold (Analytics / Highlights) ───────────────────────────────
    gold: '#FFC857',
    goldHover: '#E6B34A',
    goldLight: '#FFF8E6',
    goldUltraLight: '#FFFCF0',

    // ─── Danger / Declining ──────────────────────────────────────────────────
    red: '#EF4444',
    redLight: '#FEF2F2',
    redUltraLight: '#FFF5F5',

    // ─── Neutral System ──────────────────────────────────────────────────────
    border: '#E2E8F0',   // Default border
    borderLight: '#F1F5F9',   // Subtle border
    body: '#475569',   // Body text
    heading: '#0F172A',   // Primary headings (darkest)
    ink: '#1E293B',   // Secondary headings
    muted: '#94A3B8',   // Muted / placeholder text
    subtle: '#64748B',   // Slightly less muted

    // ─── Hero Gradient ────────────────────────────────────────────────────────
    heroGrad: 'linear-gradient(90deg, #E16A4A 0%, #6B4EFF 100%)',

    // ─── Stage Colors ────────────────────────────────────────────────────────
    stage: {
        emerging: { bg: '#EAFAF5', text: '#2ED3A5', dot: '#2ED3A5', border: '#B5EFE0' },
        exploding: { bg: '#FEF0EB', text: '#E16A4A', dot: '#E16A4A', border: '#FBC4B0' },
        peaking: { bg: '#FFF8E6', text: '#E6B34A', dot: '#FFC857', border: '#FDEAB5' },
        declining: { bg: '#FEF2F2', text: '#EF4444', dot: '#EF4444', border: '#FCA5A5' },
        stable: { bg: '#F0EEFF', text: '#6B4EFF', dot: '#6B4EFF', border: '#C4B5FD' },
        unknown: { bg: '#F1F5F9', text: '#94A3B8', dot: '#94A3B8', border: '#E2E8F0' },
    },

    // ─── Typography ──────────────────────────────────────────────────────────
    fontHeading: "'Sora', -apple-system, sans-serif",
    fontBody: "'Inter', -apple-system, sans-serif",
    fontMono: "'JetBrains Mono', 'SF Mono', Consolas, monospace",

    // ─── Category Chart Colors ────────────────────────────────────────────────
    chartColors: [
        '#E16A4A', '#6B4EFF', '#2ED3A5', '#FFC857', '#1E3A5F',
        '#EF4444', '#2C5282', '#C85A3A', '#24B890', '#5A3DE8',
    ],
};

/**
 * Backward-compatible: pages that still use the old `coral/sage/plum` names.
 * Maps old tokens → new NN tokens for gradual migration.
 */
export const LEGACY: Record<string, string> = {
    coral: NN.orange,
    coralHover: NN.orangeHover,
    coralLight: NN.orangeLight,
    coralUltraLight: NN.orangeUltraLight,
    coralGlow: NN.orangeGlow,
    sage: NN.mint,
    sageLight: NN.mintLight,
    amber: NN.gold,
    amberLight: NN.goldLight,
    plum: NN.purple,
    plumLight: NN.purpleLight,
    charcoalDeep: NN.blue,
    charcoal: NN.blueMid,
    ink: NN.ink,
    stone: NN.subtle,
    sand: NN.muted,
    slate: NN.body,
    border: NN.border,
    borderLight: NN.borderLight,
    bg: NN.bg,
    card: NN.card,
};
