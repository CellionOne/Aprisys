/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#f5f4f0', 900: '#1a1a1a' },
        deals: { bg: '#0f1117', card: '#1a1d24', sidebar: '#0a0d12', border: '#2a2d35' },
        teal: { DEFAULT: '#1D9E75', dark: '#0F6E56', light: '#E1F5EE' },
      },
    },
  },
  plugins: [],
};
