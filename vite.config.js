import { defineConfig } from 'vite';
import localRosterPlugin from './scripts/dev-roster.js';

export default defineConfig({
  plugins: [localRosterPlugin()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
});
