/** @type {import('tailwindcss').Config} */
export default {
  // Resolve globs relative to this config file, not the shell's working directory.
  content: {
    relative: true,
    files: [
      './src/renderer/index.html',
      './src/renderer/src/**/*.{js,ts,jsx,tsx}',
    ],
  },
  plugins: [],
};
