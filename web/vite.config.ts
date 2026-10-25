import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import path from 'path';

import fs from 'fs';

function handleResults(req: any, res: any, next: any) {
  if (req.url?.includes('?import')) {
    return next();
  }
  const cleanUrl = req.url?.split('?')[0]?.replace(/^\//, '') || '';
  const baseDir = typeof import.meta.dirname !== 'undefined' ? import.meta.dirname : process.cwd();
  const filePath = path.resolve(baseDir, '../results', cleanUrl);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.setHeader('Content-Type', 'application/json');
    fs.createReadStream(filePath).pipe(res);
  } else {
    next();
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'serve-results-middleware',
      configureServer(server) {
        server.middlewares.use('/results', handleResults);
      },
      configurePreviewServer(server) {
        server.middlewares.use('/results', handleResults);
      }
    }
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**']
  },
  server: {
    fs: {
      allow: ['..']
    }
  }
});


