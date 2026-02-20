/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        // NeuraNest brand typography
        display: ['Sora', '-apple-system', 'sans-serif'],
        body: ['Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
        // Legacy aliases
        heading: ['Sora', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'sans-serif'],
      },
      colors: {
        // ============ NEURANEST BRAND PALETTE ============
        nn: {
          orange: '#E16A4A',
          'orange-light': '#FEF0EB',
          blue: '#1E3A5F',
          'blue-mid': '#2C5282',
          'blue-light': '#EBF4FF',
          purple: '#6B4EFF',
          'purple-light': '#F0EEFF',
          mint: '#2ED3A5',
          'mint-light': '#EAFAF5',
          gold: '#FFC857',
          'gold-light': '#FFF8E6',
          bg: '#F8FAFC',
          dark: '#0F172A',
          ink: '#1E293B',
          body: '#475569',
          muted: '#94A3B8',
          border: '#E2E8F0',
          'border-light': '#F1F5F9',
        },

        // ============ LEGACY COLOR ALIASES ============
        // These keep all old Tailwind class names working
        coral: {
          50: '#FFF7F5',
          100: '#FEF0EB',
          200: '#FBC4B0',
          300: '#F49B7E',
          400: '#E16A4A',
          500: '#C85A3A',
          600: '#A84830',
          700: '#8C3A26',
          800: '#6B2D1E',
          900: '#4A1F14',
        },
        charcoal: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#94A3B8',
          400: '#64748B',
          500: '#475569',
          600: '#2C5282',
          700: '#1E3A5F',
          800: '#162D4A',
          900: '#0F172A',
        },
        sand: {
          50: '#FDFCFB',
          100: '#F8FAFC',
          200: '#F1F5F9',
          300: '#E2E8F0',
          400: '#CBD5E1',
          500: '#94A3B8',
          600: '#64748B',
          700: '#475569',
          800: '#1E293B',
          900: '#0F172A',
        },
        sage: {
          50: '#EAFAF5',
          100: '#D0F4E8',
          200: '#B5EFE0',
          300: '#6EE4C7',
          400: '#2ED3A5',
          500: '#24B890',
          600: '#1A9E7C',
          700: '#148068',
        },
        plum: {
          50: '#F7F5FF',
          100: '#F0EEFF',
          200: '#DDD8FF',
          300: '#B8AAFF',
          400: '#6B4EFF',
          500: '#5A3DE8',
          600: '#4A30C7',
        },
        amber: {
          50: '#FFFCF0',
          100: '#FFF8E6',
          200: '#FDEAB5',
          300: '#FFC857',
          400: '#E6B34A',
          500: '#CC9A3D',
        },
        rose: {
          50: '#FFF5F5',
          100: '#FEF2F2',
          200: '#FCA5A5',
          300: '#F87171',
          400: '#EF4444',
          500: '#DC2626',
        },

        // Surface / card
        srf: {
          DEFAULT: '#FFFFFF',
          1: '#FFFFFF',
          2: '#F1F5F9',
        },
        surface: {
          1: '#FFFFFF',
          2: '#F1F5F9',
        },

        // Border
        ln: {
          DEFAULT: '#E2E8F0',
          lt: '#F1F5F9',
        },
        line: '#E2E8F0',

        // Legacy brand→NN remapping
        brand: {
          100: '#1E3A5F',
          200: '#2C5282',
          300: '#475569',
          400: '#64748B',
          500: '#E16A4A',
          600: '#C85A3A',
          700: '#E2E8F0',
          800: '#F1F5F9',
          900: '#F8FAFC',
        },
      },
    },
  },
  plugins: [],
}
