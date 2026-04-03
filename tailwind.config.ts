import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0f172a',
        paper: '#f8fafc',
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          300: '#93c5fd',
          500: '#3b82f6',
          700: '#1d4ed8',
          900: '#1e3a8a',
        },
        success: {
          50: '#ecfdf5',
          200: '#a7f3d0',
          500: '#10b981',
          700: '#047857',
        },
        danger: {
          50: '#fef2f2',
          200: '#fecaca',
          500: '#ef4444',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Avenir Next', 'Segoe UI', 'Helvetica Neue', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 45px rgba(15, 23, 42, 0.08)',
      },
      backgroundImage: {
        halo:
          'radial-gradient(circle at top left, rgba(59,130,246,0.16), transparent 28%), radial-gradient(circle at top right, rgba(16,185,129,0.12), transparent 24%), linear-gradient(180deg, #eff6ff 0%, #f8fafc 42%, #ffffff 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
