import type { Config } from 'tailwindcss'

/** Brand values live in @reelforge/shared/constants/brand.ts; mirrored here for Tailwind. */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}', '../../packages/video/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // shadcn/ui semantic tokens, driven by the CSS variables in globals.css
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        // brand palette
        cream: '#F4EBDA',
        indigo: {
          DEFAULT: '#1A2A46',
          deep: '#121D31',
        },
        terracotta: '#BE5F3A',
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        body: ['Marcellus', 'Georgia', 'serif'],
        caption: ['Poppins', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}

export default config
