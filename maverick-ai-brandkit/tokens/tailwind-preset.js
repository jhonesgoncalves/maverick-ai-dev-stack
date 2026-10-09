/** Maverick AI Tailwind token reference. Merge into your existing config. */
module.exports = {
  theme: {
    extend: {
      colors: {
        maverick: {
          50: '#FFF4E8',
          100: '#FFE2C2',
          300: '#FFB15A',
          400: '#FF8A1A',
          500: '#FF6B00',
          600: '#E85D00',
          700: '#C84E00',
          950: '#140700'
        },
        ink: {
          950: '#050505',
          900: '#070707',
          850: '#0E0E0E',
          800: '#151515',
          750: '#1C1C1C',
          700: '#292929'
        }
      },
      boxShadow: {
        'maverick-glow': '0 0 34px rgba(255, 107, 0, 0.18)'
      },
      borderRadius: {
        'maverick': '12px'
      }
    }
  }
}
