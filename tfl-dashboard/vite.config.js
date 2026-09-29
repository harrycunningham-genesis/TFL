import react from '@vitejs/plugin-react'
// vitest/config re-exports Vite's own defineConfig plus a typed `test`
// field — this lets one config file serve both `vite build`/`vite dev` and
// `vitest run`, so `npm test` sees exactly the same env vars, aliases and
// plugins as the real app rather than a second, drifting config.
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    // TfL API calls in the contract-test suite go over real network — give
    // them room to breathe rather than flaking under the 5s default.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
})
