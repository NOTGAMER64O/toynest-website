import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import app from './api/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isStandaloneProd =
  process.env.NODE_ENV === 'production' && !fs.existsSync('/etc/nginx/nginx.conf');
const PORT = isStandaloneProd ? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000) : 3000;

// Static files from public for local/Cloud Run server
app.use(express.static(path.join(__dirname, 'public')));

async function startServer() {
  if (process.env.VERCEL) {
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Playnix server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

export default app;
