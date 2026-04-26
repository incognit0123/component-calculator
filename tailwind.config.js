/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#0b1020',
          panel: '#131a33',
          elev: '#1a2246',
          line: '#232c54',
        },
        accent: '#8b5cf6',
        tier: {
          good: '#22c55e',
          better: '#3b82f6',
          excellent: '#a855f7',
          excellentPlus: '#c084fc',
          epic: '#eab308',
          epicPlus: '#facc15',
          legend: '#ef4444',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 0 2px rgba(234, 179, 8, 0.6), 0 0 14px rgba(234, 179, 8, 0.45)',
      },
    },
  },
  plugins: [],
}
