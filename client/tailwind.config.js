/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        app: {
          bg: 'rgb(var(--app-bg) / <alpha-value>)',
          panel: 'rgb(var(--app-panel) / <alpha-value>)',
          muted: 'rgb(var(--app-muted) / <alpha-value>)',
          border: 'rgb(var(--app-border) / <alpha-value>)',
          text: 'rgb(var(--app-text) / <alpha-value>)',
          subtle: 'rgb(var(--app-subtle) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 0 0 1px rgba(255,255,255,0.03)',
      },
    },
  },
  plugins: [],
};
