import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import app, {
  SITE_BASE_URL,
  buildProductSeoMeta,
  findProductBySlugOrId,
  injectNotFoundSeoIntoHtml,
  injectProductSeoIntoHtml,
  loadCatalogProductsForSeo,
} from './api/index.ts';

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

    // Inject accurate per-product SEO metadata in dev mode on direct /products/:slug visits or refreshes
    app.get(['/products/:slug', '/products/:slug/'], async (req, res, next) => {
      try {
        const accept = String(req.headers.accept || '');
        if (!accept.includes('text/html') && accept !== '*/*' && accept !== '') {
          return next();
        }
        const rawTemplate = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawTemplate);

        const requestedSlug = String(req.params.slug || '').trim();
        const allProducts = await loadCatalogProductsForSeo();
        const matched = findProductBySlugOrId(requestedSlug, allProducts);

        const html = matched
          ? injectProductSeoIntoHtml(
              transformed,
              buildProductSeoMeta(matched, allProducts, { origin: SITE_BASE_URL })
            )
          : injectNotFoundSeoIntoHtml(transformed, requestedSlug, SITE_BASE_URL);

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.status(200).send(html);
      } catch (err) {
        return next(err);
      }
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
