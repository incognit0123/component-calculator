/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#21222c',
          panel: '#333543',
          elev: '#3a3c49',
          line: '#5c5c6d',
        },
        accent: '#4a93e8',
        tier: {
          good: '#22c55e',
          better: '#4f8cff',
          excellent: '#b667ff',
          excellentPlus: '#cf9bff',
          epic: '#f6bd1a',
          epicPlus: '#ffd95c',
          legend: '#ff5876',
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
