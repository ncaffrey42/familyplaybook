/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Brand v1 palette (design/redesign-v1/brand-guide.html)
        mulberry: { DEFAULT: '#5C2A3E', hover: '#47202F' },
        raspberry: { DEFAULT: '#C25065', hover: '#A83E53' },
        coral: { DEFAULT: '#F0705A', hover: '#DC5A44' },
        apricot: { DEFAULT: '#F4A259' },
        blush: { DEFAULT: '#F6DFD3' },
        cream: { DEFAULT: '#FDF8F3' },
        ink: { DEFAULT: '#3D2530' },
        // Derived values, sampled from the kit
        'body-copy': '#5E3D4C',
        'muted-copy': '#A9798A',
        'placeholder-copy': '#C9A6B2',
        chevron: '#D8B9C4',
        'card-border': '#F0E2D8',
        'row-divider': '#F6EBE3',
        'checkbox-ring': '#E3CFC4',
        'meter-track': '#F1E0D6',
        'blush-copy': '#8A5A45',
        'row-hover': '#FEFAF7',
        'hover-border': '#E0C6B8',
        'halo-apricot': '#FDEEE0',
        'halo-raspberry': '#F7DEE3',
        'halo-mulberry': '#EEE0E5',
        'halo-coral': '#FBE0DA',
        'emergency-bg': '#FDEEE9',
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'sans-serif'],
        display: ['Fraunces', 'serif'],
      },
      borderRadius: {
        lg: "var(--radius)",           // 18px — cards and rows
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        "2xl": "1.375rem",             // 22px — larger containers
        "3xl": "2rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
      boxShadow: {
        // One card shadow only, per the brand guide
        soft: '0 1px 2px rgba(92,42,62,.04)',
        card: '0 1px 2px rgba(92,42,62,.04)',
        fab: '0 8px 20px -6px rgba(194,80,101,.7)',
      },
    },
  },
  plugins: [import("tailwindcss-animate")],
}