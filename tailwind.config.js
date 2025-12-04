/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: 'var(--color-primary)',
                'primary-hover': 'var(--color-primary-hover)',
                surface: 'var(--color-surface)',
                'surface-hover': 'var(--color-surface-hover)',
                border: 'var(--color-border)',
                'border-highlight': 'var(--color-border-highlight)',
                text: 'var(--color-text)',
                'text-muted': 'var(--color-text-muted)',
            },
            fontFamily: {
                sans: ['Inter', 'Noto Sans KR', 'sans-serif'],
            },
            animation: {
                'fade-in': 'fadeIn 0.5s ease-out',
                'bounce-subtle': 'bounceSubtle 2s infinite',
            },
            keyframes: {
                fadeIn: {
                    '0%': { opacity: '0', transform: 'translateY(10px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
                bounceSubtle: {
                    '0%, 100%': { transform: 'translateY(-5%)' },
                    '50%': { transform: 'translateY(0)' },
                }
            }
        },
    },
    plugins: [],
}
