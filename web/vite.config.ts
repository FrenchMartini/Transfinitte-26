import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  root: '.',
  server: {
    port: 5173,
    fs: {
      allow: ['..']
    }
  },
  plugins: [
    {
      name: 'serve-results-middleware',
      configureServer(server) {
        server.middlewares.use('/results', (req, res, next) => {
          if (req.url?.includes('?import')) {
            return next();
          }
          const cleanUrl = req.url?.split('?')[0]?.replace(/^\//, '') || '';
          const filePath = path.resolve(__dirname, '../results', cleanUrl);
          if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(filePath).pipe(res);
          } else {
            next();
          }
        });
      }
    }
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});
