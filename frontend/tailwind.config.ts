/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ['Newsreader', 'Georgia', 'Times New Roman', 'serif'],
        body: ['Plus Jakarta Sans', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'Consolas', 'monospace'],
      },
      colors: {
        // Primary
        coral: {
          50:  '#FFF6F3',
          100: '#FCEEE8',
          200: '#F8D4C6',
          300: '#F0AD94',
          400: '#E8714A',
          500: '#D4623D',
          600: '#B8502F',
          700: '#8C3D24',
          800: '#6B2E1A',
          900: '#4A1F12',
        },
        // Charcoal (dark base)
        charcoal: {
          50:  '#F4F6F8',
          100: '#E2E7EC',
          200: '#C5CED8',
          300: '#8B9DB0',
          400: '#5F7590',
          500: '#425B73',
          600: '#2D3E50',
          700: '#1A2A3A',
          800: '#111D29',
          900: '#0A1219',
        },
        // Warm neutrals (Claude's cream tones)
        sand: {
          50:  '#FDFCFB',
          100: '#F9F7F4',
          200: '#F0ECE6',
          300: '#E6E1DA',
          400: '#D4CEC5',
          500: '#B8B2A8',
          600: '#8B8479',
          700: '#5C5549',
          800: '#3D3832',
          900: '#2A2520',
        },
        // Success green
        sage: {
          50:  '#E8F5EE',
          100: '#D1EBDD',
          200: '#A3D7BB',
          300: '#4CAF7B',
          400: '#1A8754',
          500: '#136B42',
          600: '#0D4F31',
        },
        // Warning amber
        amber: {
          50:  '#FFF8E6',
          100: '#FFEDB3',
          200: '#FFD966',
          300: '#D4930D',
          400: '#B07A0A',
          500: '#8C6108',
        },
        // Error rose
        rose: {
          50:  '#FFF0F0',
          100: '#FDDCDC',
          200: '#F5A3A3',
          300: '#E06060',
          400: '#C0392B',
          500: '#962D22',
        },
        // AI / intelligence accent
        plum: {
          50:  '#F3EEFF',
          100: '#E4D8FF',
          200: '#C9AAFF',
          300: '#A678F5',
          400: '#7C3AED',
          500: '#6025C7',
        },
      },
    },
  },
  plugins: [],
}
