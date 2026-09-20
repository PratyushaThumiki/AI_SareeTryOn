import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d10',
        surface: '#12151a',
        panel: '#1a1f27',
        edge: '#2a323d',
        muted: '#8b96a3',
        accent: '#e8b04b',
        accentDim: '#a37b28',
        privacyOk: '#3ecf8e',
        danger: '#ef5b5b',
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['ui-serif', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};

export default config;
