import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#005c55',
        'primary-container': '#0f766e',
        'on-primary': '#ffffff',
        'on-primary-container': '#a3faef',
        'primary-fixed': '#9cf2e8',
        'primary-fixed-dim': '#80d5cb',
        'on-primary-fixed': '#00201d',
        'on-primary-fixed-variant': '#00504a',
        'inverse-primary': '#80d5cb',

        secondary: '#565e74',
        'secondary-container': '#dae2fd',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#5c647a',
        'secondary-fixed': '#dae2fd',
        'secondary-fixed-dim': '#bec6e0',
        'on-secondary-fixed': '#131b2e',
        'on-secondary-fixed-variant': '#3f465c',

        tertiary: '#a7000f',
        'tertiary-container': '#cf1b1e',
        'on-tertiary': '#ffffff',
        'on-tertiary-container': '#ffe4e1',
        'tertiary-fixed': '#ffdad6',
        'tertiary-fixed-dim': '#ffb4ab',
        'on-tertiary-fixed': '#410002',
        'on-tertiary-fixed-variant': '#93000b',

        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',

        surface: '#f8f9ff',
        'surface-bright': '#f8f9ff',
        'surface-dim': '#ccdbf4',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#eff4ff',
        'surface-container': '#e6eeff',
        'surface-container-high': '#dde9ff',
        'surface-container-highest': '#d5e3fd',
        'surface-variant': '#d5e3fd',
        'surface-tint': '#006a63',

        'on-surface': '#0d1c2f',
        'on-surface-variant': '#3e4947',
        'inverse-surface': '#233144',
        'inverse-on-surface': '#ebf1ff',

        outline: '#6e7977',
        'outline-variant': '#bdc9c6',

        background: '#f8f9ff',
        'on-background': '#0d1c2f',
      },
      borderRadius: {
        DEFAULT: '0.125rem',
        sm: '0.125rem',
        md: '0.25rem',
        lg: '0.375rem',
        xl: '0.5rem',
        '2xl': '0.75rem',
        full: '9999px',
      },
      spacing: {
        'space-xs': '0.25rem',
        'space-sm': '0.5rem',
        'space-md': '0.75rem',
        'space-lg': '1rem',
        'space-xl': '1.5rem',
        'space-2xl': '2rem',
        gutter: '1rem',
        'gutter-dense': '0.5rem',
        margin: '1.5rem',
        'margin-mobile': '0.75rem',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        inter: ['Inter', 'system-ui', 'sans-serif'],
        manrope: ['Manrope', 'system-ui', 'sans-serif'],
        'public-sans': ['Public Sans', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
