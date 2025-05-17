/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/**/*.{html,js}", // Scan HTML and JS files in the public folder
    "./api/**/*.js",         // Scan JS files in the api folder (for any dynamic HTML returned)
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
