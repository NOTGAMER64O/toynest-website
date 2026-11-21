export const SITE_BASE_URL = 'https://playnixshop-website.vercel.app';

export interface SlugProductLike {
  id: string;
  name: string;
  slug?: string;
}

export interface SeoProductInput extends SlugProductLike {
  price: number;
  category?: string;
  description?: string;
  imageUrl?: string;
  imageUrls?: string[];
  available?: boolean;
  createdAt?: string;
}

export interface ProductSeoMeta {
  slug: string;
  path: string;
  canonicalUrl: string;
  title: string;
  description: string;
  ogType: 'product' | 'website';
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogImageAlt: string;
  robots: string;
  images: string[];
  jsonLd: Record<string, any>;
}

const RESERVED_PRODUCT_SLUGS = new Set(['new', 'edit', 'all', 'index', 'api', 'admin']);

export function slugifyProductName(name: string): string {
  const cleaned = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 72)
    .replace(/-+$/g, '');

  if (!cleaned || RESERVED_PRODUCT_SLUGS.has(cleaned)) {
    return cleaned ? `${cleaned}-toy` : 'toy';
  }
  return cleaned;
}

export function getShortProductIdSuffix(id: string): string {
  const alnum = String(id || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!alnum) return 'item';
  return alnum.slice(-6);
}

function isValidExplicitSlug(slug?: string): slug is string {
  return Boolean(
    slug &&
      typeof slug === 'string' &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim()) &&
      !RESERVED_PRODUCT_SLUGS.has(slug.trim())
  );
}

export function getUniqueProductSlug(
  product: SlugProductLike,
  allProducts: SlugProductLike[] = []
): string {
  const explicit = typeof product.slug === 'string' ? product.slug.trim().toLowerCase() : '';
  if (isValidExplicitSlug(explicit)) {
    const collides = allProducts.some(
      (other) =>
        other &&
        other.id !== product.id &&
        typeof other.slug === 'string' &&
        other.slug.trim().toLowerCase() === explicit
    );
    if (!collides) {
      return explicit;
    }
  }

  const base = slugifyProductName(product.name);
  const siblingsWithSameBase = allProducts.filter((other) => {
    if (!other) return false;
    const otherExplicit = typeof other.slug === 'string' ? other.slug.trim().toLowerCase() : '';
    if (isValidExplicitSlug(otherExplicit) && otherExplicit !== base) {
      return false;
    }
    return slugifyProductName(other.name) === base;
  });

  if (siblingsWithSameBase.length <= 1) {
    return base;
  }

  return `${base}-${getShortProductIdSuffix(product.id)}`;
}

export function generateProductSlugForCreate(
  name: string,
  existingProducts: SlugProductLike[],
  productId: string
): string {
  const base = slugifyProductName(name);
  const taken = new Set<string>(
    (existingProducts || []).map((p) => getUniqueProductSlug(p, existingProducts))
  );

  if (!taken.has(base)) {
    return base;
  }

  const withId = `${base}-${getShortProductIdSuffix(productId)}`;
  if (!taken.has(withId)) {
    return withId;
  }

  let counter = 2;
  while (taken.has(`${withId}-${counter}`)) {
    counter += 1;
  }
  return `${withId}-${counter}`;
}

export function getProductPath(
  product: SlugProductLike,
  allProducts: SlugProductLike[] = []
): string {
  return `/products/${encodeURIComponent(getUniqueProductSlug(product, allProducts))}`;
}

export function getProductCanonicalUrl(
  product: SlugProductLike,
  allProducts: SlugProductLike[] = [],
  origin: string = SITE_BASE_URL
): string {
  const cleanOrigin = (origin || SITE_BASE_URL).replace(/\/+$/, '');
  return `${cleanOrigin}${getProductPath(product, allProducts)}`;
}

export function parseProductSlugFromPath(pathname: string): string | null {
  if (!pathname) return null;
  const cleanPath = pathname.split('?')[0].split('#')[0];
  const match = cleanPath.match(/^\/products\/([^/]+)\/?$/i);
  if (!match || !match[1]) return null;
  try {
    const decoded = decodeURIComponent(match[1]).trim();
    return decoded || null;
  } catch {
    return match[1].trim() || null;
  }
}

export function findProductBySlugOrId<T extends SlugProductLike>(
  slugOrId: string,
  allProducts: T[]
): T | undefined {
  if (!slugOrId || !Array.isArray(allProducts) || allProducts.length === 0) {
    return undefined;
  }

  let normalizedTarget = slugOrId.trim();
  try {
    normalizedTarget = decodeURIComponent(normalizedTarget);
  } catch {}
  normalizedTarget = normalizedTarget.replace(/\/+$/, '').trim().toLowerCase();
  if (!normalizedTarget) return undefined;

  // 1. Exact computed unique slug match
  const exactComputed = allProducts.find(
    (p) => p && getUniqueProductSlug(p, allProducts).toLowerCase() === normalizedTarget
  );
  if (exactComputed) return exactComputed;

  // 2. Exact stored slug field match
  const exactStoredSlug = allProducts.find(
    (p) => p && typeof p.slug === 'string' && p.slug.trim().toLowerCase() === normalizedTarget
  );
  if (exactStoredSlug) return exactStoredSlug;

  // 3. Exact product ID match (supports direct ID URLs too)
  const exactId = allProducts.find((p) => p && String(p.id).toLowerCase() === normalizedTarget);
  if (exactId) return exactId;

  // 4. Slugified name match (in case duplicate disambiguation changed or wasn't needed)
  const byNameSlug = allProducts.find(
    (p) => p && slugifyProductName(p.name) === normalizedTarget
  );
  if (byNameSlug) return byNameSlug;

  // 5. Fallback: suffix match (`name-shortid`)
  const suffixMatch = normalizedTarget.match(/^(.+)-([a-z0-9]{4,8})$/);
  if (suffixMatch) {
    const [, prefixSlug, idSuffix] = suffixMatch;
    const matched = allProducts.find(
      (p) =>
        p &&
        getShortProductIdSuffix(p.id) === idSuffix &&
        slugifyProductName(p.name) === prefixSlug
    );
    if (matched) return matched;
  }

  return undefined;
}

export function resolveAbsoluteImageUrl(
  imgUrl: string | undefined,
  origin: string = SITE_BASE_URL
): string | null {
  if (!imgUrl || typeof imgUrl !== 'string') return null;
  const trimmed = imgUrl.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const cleanOrigin = (origin || SITE_BASE_URL).replace(/\/+$/, '');
  if (trimmed.startsWith('/')) {
    return `${cleanOrigin}${trimmed}`;
  }
  return `${cleanOrigin}/${trimmed}`;
}

export function getCrawlableProductImages(
  product: SeoProductInput,
  origin: string = SITE_BASE_URL
): string[] {
  const cleanOrigin = (origin || SITE_BASE_URL).replace(/\/+$/, '');
  const candidates = Array.isArray(product.imageUrls) && product.imageUrls.length > 0
    ? product.imageUrls
    : product.imageUrl
    ? [product.imageUrl]
    : [];

  const resolved = candidates
    .map((u) => resolveAbsoluteImageUrl(u, cleanOrigin))
    .filter((u): u is string => Boolean(u));

  const unique = Array.from(new Set(resolved));
  if (unique.length > 0) return unique;
  return [`${cleanOrigin}/resources/toynest-logo.png`];
}

function truncateAtWordBoundary(text: string, maxLen: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  const sliced = clean.slice(0, maxLen - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const cut = lastSpace > Math.floor(maxLen * 0.65) ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.replace(/[.,;:\-\s]+$/, '')}…`;
}

export function buildProductSeoMeta(
  product: SeoProductInput,
  allProducts: SeoProductInput[] = [],
  options: {
    effectivePrice?: number;
    activeOfferTitle?: string;
    origin?: string;
  } = {}
): ProductSeoMeta {
  const origin = (options.origin || SITE_BASE_URL).replace(/\/+$/, '');
  const slug = getUniqueProductSlug(product, allProducts);
  const path = `/products/${encodeURIComponent(slug)}`;
  const canonicalUrl = `${origin}${path}`;

  const cleanName = String(product.name || 'Playnix Toy').trim();
  const cleanCategory = String(product.category || 'Toys').trim();
  const displayPrice =
    typeof options.effectivePrice === 'number' && isFinite(options.effectivePrice) && options.effectivePrice > 0
      ? options.effectivePrice
      : Number(product.price) || 0;
  const priceLabel = displayPrice > 0 ? `₹${Math.round(displayPrice)}` : '';
  const isAvailable = product.available !== false;

  // Concise unique SEO Title
  const fullCandidate = cleanCategory && cleanCategory.toLowerCase() !== 'other'
    ? `${cleanName} (${cleanCategory}) – Playnix`
    : `${cleanName} – Playnix`;
  const title =
    fullCandidate.length <= 68
      ? fullCandidate
      : `${truncateAtWordBoundary(cleanName, 54)} – Playnix`;

  // Unique Meta Description per product (never duplicate across products)
  const rawDesc = String(product.description || '').replace(/\s+/g, ' ').trim();
  let description = '';
  if (rawDesc) {
    const prefix = priceLabel
      ? `Buy ${cleanName} for ${priceLabel} at Playnix.`
      : `Buy ${cleanName} at Playnix.`;
    description = truncateAtWordBoundary(`${prefix} ${rawDesc}`, 160);
  } else {
    const availabilityPhrase = isAvailable
      ? 'In stock and ready to order online.'
      : 'Check availability on Playnix.';
    const pricePhrase = priceLabel ? ` priced at ${priceLabel}` : '';
    const offerPhrase = options.activeOfferTitle ? ` ${options.activeOfferTitle}.` : '';
    description = truncateAtWordBoundary(
      `Buy ${cleanName} (${cleanCategory})${pricePhrase} at Playnix.${offerPhrase} ${availabilityPhrase} Affordable toys and creative 3D-printed products.`,
      160
    );
  }

  const images = getCrawlableProductImages(product, origin);
  const ogImage = images[0];
  const robots = 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${canonicalUrl}#product`,
        name: cleanName,
        description,
        sku: product.id,
        url: canonicalUrl,
        category: cleanCategory,
        image: images,
        brand: {
          '@type': 'Brand',
          name: 'Playnix',
        },
        offers: {
          '@type': 'Offer',
          url: canonicalUrl,
          priceCurrency: 'INR',
          price: String(displayPrice),
          availability: isAvailable
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
          seller: {
            '@type': 'Organization',
            name: 'Playnix',
            url: `${origin}/`,
          },
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Playnix Home',
            item: `${origin}/`,
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: cleanName,
            item: canonicalUrl,
          },
        ],
      },
    ],
  };

  return {
    slug,
    path,
    canonicalUrl,
    title,
    description,
    ogType: 'product',
    ogTitle: title,
    ogDescription: description,
    ogImage,
    ogImageAlt: cleanName,
    robots,
    images,
    jsonLd,
  };
}
