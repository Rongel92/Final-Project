/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Royal→navy brand identity — used for links, active nav, brand chrome.
        brand: {
          50: '#eef0fb',
          100: '#dfe1f6',
          200: '#c2c6ee',
          300: '#9ea3e2',
          400: '#7a80d3',
          500: '#5155c4',
          600: '#3a3ea8',
          700: '#2f3288',
          800: '#23277a',
          900: '#191c5c',
          950: '#0c0e3a',
        },
        // Signature teal — primary actions / accents.
        accent: {
          50: '#e6faf7',
          100: '#c6f3ec',
          200: '#94e7db',
          300: '#6fe0d5',
          400: '#2fc9bd',
          500: '#12a99c',
          600: '#0f8f85',
          700: '#0c7269',
          800: '#0b5a53',
          900: '#083f3a',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg,#5155C4 0%,#23277A 55%,#0C0E3A 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
