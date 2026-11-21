import { type ProductSeoMeta, SITE_BASE_URL } from './productSlug';

export function escapeHtmlAttr(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeJsonLd(obj: unknown): string {
  return JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
}

function replaceMetaOrLink(
  html: string,
  pattern: RegExp,
  replacement: string,
  fallbackAnchor: string = '</head>'
): string {
  if (pattern.test(html)) {
    return html.replace(pattern, replacement);
  }
  return html.replace(fallbackAnchor, `    ${replacement}\n  ${fallbackAnchor}`);
}

export function injectProductSeoIntoHtml(baseHtml: string, seo: ProductSeoMeta): string {
  let html = baseHtml;

  const escapedTitle = escapeHtmlAttr(seo.title);
  const escapedDesc = escapeHtmlAttr(seo.description);
  const escapedCanonical = escapeHtmlAttr(seo.canonicalUrl);
  const escapedOgTitle = escapeHtmlAttr(seo.ogTitle);
  const escapedOgDesc = escapeHtmlAttr(seo.ogDescription);
  const escapedOgImage = escapeHtmlAttr(seo.ogImage);
  const escapedOgImageAlt = escapeHtmlAttr(seo.ogImageAlt);
  const escapedRobots = escapeHtmlAttr(seo.robots);

  html = replaceMetaOrLink(html, /<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`);
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="description"[^>]*>/i,
    `<meta name="description" content="${escapedDesc}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="robots"[^>]*>/i,
    `<meta name="robots" content="${escapedRobots}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${escapedCanonical}" />`
  );

  html = replaceMetaOrLink(
    html,
    /<meta\s+property="og:type"[^>]*>/i,
    `<meta property="og:type" content="${seo.ogType}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+property="og:url"[^>]*>/i,
    `<meta property="og:url" content="${escapedCanonical}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${escapedOgTitle}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${escapedOgDesc}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+property="og:image"[^>]*>/i,
    `<meta property="og:image" content="${escapedOgImage}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+property="og:image:alt"[^>]*>/i,
    `<meta property="og:image:alt" content="${escapedOgImageAlt}" />`
  );

  html = replaceMetaOrLink(
    html,
    /<meta\s+name="twitter:title"[^>]*>/i,
    `<meta name="twitter:title" content="${escapedOgTitle}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="twitter:description"[^>]*>/i,
    `<meta name="twitter:description" content="${escapedOgDesc}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="twitter:image"[^>]*>/i,
    `<meta name="twitter:image" content="${escapedOgImage}" />`
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="twitter:image:alt"[^>]*>/i,
    `<meta name="twitter:image:alt" content="${escapedOgImageAlt}" />`
  );

  const jsonLdScript = `<script id="playnix-product-jsonld" type="application/ld+json">\n${escapeJsonLd(seo.jsonLd)}\n    </script>`;
  if (/<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/i.test(html)) {
    html = html.replace(
      /<script[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/i,
      jsonLdScript
    );
  } else {
    html = html.replace('</head>', `    ${jsonLdScript}\n  </head>`);
  }

  return html;
}

export function injectNotFoundSeoIntoHtml(
  baseHtml: string,
  requestedSlug: string,
  origin: string = SITE_BASE_URL
): string {
  const cleanOrigin = (origin || SITE_BASE_URL).replace(/\/+$/, '');
  const cleanUrl = `${cleanOrigin}/products/${encodeURIComponent(requestedSlug)}`;
  let html = baseHtml;
  html = replaceMetaOrLink(
    html,
    /<title>[\s\S]*?<\/title>/i,
    '<title>Product Not Found – Playnix</title>'
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="description"[^>]*>/i,
    '<meta name="description" content="This toy could not be found on Playnix. Browse our catalog of affordable toys and creative 3D-printed products." />'
  );
  html = replaceMetaOrLink(
    html,
    /<meta\s+name="robots"[^>]*>/i,
    '<meta name="robots" content="noindex, follow" />'
  );
  html = replaceMetaOrLink(
    html,
    /<link\s+rel="canonical"[^>]*>/i,
    `<link rel="canonical" href="${escapeHtmlAttr(cleanUrl)}" />`
  );
  return html;
}
