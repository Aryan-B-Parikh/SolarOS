/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        action: '#1D4ED8',
        brand: '#F59E0B',
        success: '#15803D',
        warning: '#B45309',
        danger: '#B91C1C',
      },
    },
  },
  plugins: [],
};

