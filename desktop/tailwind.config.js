/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/renderer/index.html',
    './src/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        tactical: {
          bg: '#0F172A',
          panel: '#1E293B',
          emerald: '#10B981',
          amber: '#F59E0B',
          sky: '#38BDF8',
        },
      },
    },
  },
  plugins: [],
};
