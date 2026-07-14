/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: "#0B0C10",
          card: "#1F2833",
          border: "#45A29E",
        },
        brand: {
          cyan: "#66FCF1",
          teal: "#45A29E",
          red: "#C51162",
          yellow: "#FFD600",
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow-cyan': 'glowCyan 2s ease-in-out infinite alternate',
        'glow-red': 'glowRed 1.5s ease-in-out infinite alternate',
        'shake': 'shake 0.5s linear infinite',
        'collapse': 'collapse 0.8s ease-out forwards',
      },
      keyframes: {
        glowCyan: {
          '0%': { boxShadow: '0 0 5px #66FCF1, 0 0 10px #66FCF1' },
          '100%': { boxShadow: '0 0 20px #66FCF1, 0 0 35px #66FCF1' }
        },
        glowRed: {
          '0%': { boxShadow: '0 0 5px #C51162, 0 0 10px #C51162' },
          '100%': { boxShadow: '0 0 15px #C51162, 0 0 25px #C51162' }
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-4px) rotate(-1deg)' },
          '75%': { transform: 'translateX(4px) rotate(1deg)' }
        },
        collapse: {
          '0%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
          '50%': { transform: 'scale(0.8) rotate(5deg)', opacity: '0.7' },
          '100%': { transform: 'scale(0) rotate(15deg)', opacity: '0', filter: 'blur(4px)' }
        }
      }
    },
  },
  plugins: [],
}
