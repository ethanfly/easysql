/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Windows Metro 深色主题配色
        metro: {
          dark: '#1a1a1a',      // 最深背景
          bg: '#252525',        // 主背景
          surface: '#2d2d2d',   // 表面
          card: '#323232',      // 卡片
          hover: '#3a3a3a',     // 悬停
          border: '#404040',    // 边框
          divider: '#333333',   // 分割线
        },
        // Metro 强调色 - Windows 11 风格
        accent: {
          blue: '#0078d4',      // 主强调色
          'blue-hover': '#1a86d9',
          'blue-light': '#60cdff',
          green: '#0f7b0f',     // 成功
          'green-hover': '#1c9a1c',
          red: '#c42b1c',       // 错误/删除
          'red-hover': '#d13d2d',
          orange: '#f7630c',    // 警告
          purple: '#886ce4',    // 紫色
          teal: '#00b294',      // 青色
          yellow: '#ffd800',    // 黄色
        },
        // 文字颜色
        text: {
          primary: '#ffffff',
          secondary: 'rgba(255, 255, 255, 0.7)',
          tertiary: 'rgba(255, 255, 255, 0.5)',
          disabled: 'rgba(255, 255, 255, 0.3)',
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'metro': '0 2px 4px rgba(0, 0, 0, 0.2)',
        'metro-lg': '0 4px 12px rgba(0, 0, 0, 0.3)',
        'metro-xl': '0 8px 24px rgba(0, 0, 0, 0.4)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease',
        'slide-up': 'slideUp 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-down': 'slideDown 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      transitionTimingFunction: {
        'metro': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
  plugins: [],
}
