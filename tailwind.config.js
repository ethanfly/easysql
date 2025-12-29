/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Windows Metro 风格配色
        metro: {
          dark: '#1f1f1f',
          bg: '#2d2d2d',
          surface: '#3d3d3d',
          hover: '#4d4d4d',
          border: '#5d5d5d',
        },
        // Metro 强调色
        accent: {
          blue: '#0078d4',
          green: '#107c10',
          red: '#e81123',
          orange: '#ff8c00',
          purple: '#886ce4',
          teal: '#00b294',
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
