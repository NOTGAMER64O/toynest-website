import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const isStandaloneProd = process.env.NODE_ENV === 'production' && !fs.existsSync('/etc/nginx/nginx.conf');
const PORT = isStandaloneProd ? (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000) : 3000;

// High payload limit for base64 image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

try {
  fs.mkdirSync(path.join(__dirname, 'public/toys'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'public/payment'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'public/resources'), { recursive: true });
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
} catch {}

const DB_PATH = process.env.VERCEL
  ? path.join('/tmp', 'store.json')
  : path.join(__dirname, 'data/store.json');

interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description: string;
  imageUrl: string;
  imageUrls: string[];
  available: boolean;
  createdAt: string;
}

interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  mode: 'Child' | 'Adult';
  productId: string;
  productName: string;
  productImageUrl: string;
  price: number;
  name: string;
  studentClass: string;
  section: string;
  phone: string;
  address: string;
  note: string;
  status: string;
  createdAt: string;
  paymentRecipientName?: string;
  paymentRecipientClass?: string;
  paymentRecipientSection?: string;
  ownerNote?: string;
  colour?: string;
  customerDeleted?: boolean;
}

interface Suggestion {
  id: string;
  suggestion: string;
  createdAt: string;
}

interface DB {
  products: Product[];
  orders: Order[];
  suggestions: Suggestion[];
  shopModes: {
    adultPublished: boolean;
    childPublished: boolean;
  };
  paymentQrUrl: string;
  ownerPin: string;
  colours: string[];
}

// Initial seed products
const defaultProducts: Product[] = [
  {
    id: "40ba4ba9-6434-4a5b-837a-c7a582847205",
    name: "Ferrari F40 & Competizion kit card",
    price: 79,
    category: "Cars",
    available: true,
    createdAt: "2026-10-17T13:01:36.978Z",
    description: "",
    imageUrl: "/toys/toy-40ba4ba9-1.jpg",
    imageUrls: [
      "/toys/toy-40ba4ba9-1.jpg",
      "/toys/toy-40ba4ba9-2.jpg",
      "/toys/toy-40ba4ba9-3.jpg",
      "/toys/toy-40ba4ba9-4.jpg"
    ]
  },
  {
    id: "78291ec9-cf52-4df8-ab72-7d4c0ab2d082",
    name: "Spider-Noir Sitting on Ledge Figure | Spiderman",
    price: 79,
    category: "Action figure",
    available: true,
    createdAt: "2026-10-19T05:43:34.974Z",
    description: "",
    imageUrl: "/toys/toy-78291ec9-1.jpg",
    imageUrls: [
      "/toys/toy-78291ec9-1.jpg",
      "/toys/toy-78291ec9-2.jpg",
      "/toys/toy-78291ec9-3.jpg"
    ]
  },
  {
    id: "7db6d4d5-075a-4953-9ed7-2aa46422f116",
    name: "Mini flower pot",
    price: 49,
    category: "Decorative",
    available: true,
    createdAt: "2026-10-17T03:52:43.766Z",
    description: "",
    imageUrl: "/toys/toy-7db6d4d5-1.jpg",
    imageUrls: [
      "/toys/toy-7db6d4d5-1.jpg",
      "/toys/toy-7db6d4d5-2.jpg"
    ]
  },
  {
    id: "8b48e410-debe-4755-a99b-8915fcb5b939",
    name: "Roman Battleship Kit Card",
    price: 69,
    category: "Decorative",
    available: true,
    createdAt: "2026-10-17T04:02:40.407Z",
    description: "",
    imageUrl: "/toys/toy-8b48e410-1.jpg",
    imageUrls: [
      "/toys/toy-8b48e410-1.jpg",
      "/toys/toy-8b48e410-2.jpg",
      "/toys/toy-8b48e410-3.jpg",
      "/toys/toy-8b48e410-4.jpg"
    ]
  },
  {
    id: "94189799-9004-4f29-ba0c-64fc8400619d",
    name: "Nissan 370z Kit Card",
    price: 79,
    category: "Cars",
    available: true,
    createdAt: "2026-10-17T04:04:14.938Z",
    description: "",
    imageUrl: "/toys/toy-94189799-1.jpg",
    imageUrls: [
      "/toys/toy-94189799-1.jpg",
      "/toys/toy-94189799-2.jpg",
      "/toys/toy-94189799-3.jpg",
      "/toys/toy-94189799-4.jpg"
    ]
  },
  {
    id: "f0acb428-9f95-4bab-94a5-6b57d2415b25",
    name: "Nissan GTR R34 Kit Card",
    price: 79,
    category: "Cars",
    available: true,
    createdAt: "2026-10-17T04:05:47.738Z",
    description: "",
    imageUrl: "/toys/toy-f0acb428-1.jpg",
    imageUrls: [
      "/toys/toy-f0acb428-1.jpg",
      "/toys/toy-f0acb428-2.jpg",
      "/toys/toy-f0acb428-3.jpg",
      "/toys/toy-f0acb428-4.jpg"
    ]
  }
];

function loadDB(): DB {
  try {
    if (fs.existsSync(DB_PATH)) {
      const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      if (!Array.isArray(data.colours)) {
        data.colours = [];
      }
      return data;
    }
  } catch (err) {
    console.error('Error reading DB, using defaults:', err);
  }
  const initial: DB = {
    products: defaultProducts,
    orders: [],
    suggestions: [],
    shopModes: {
      adultPublished: true,
      childPublished: true,
    },
    paymentQrUrl: '/payment/adult-qr.jpg',
    ownerPin: 'ANAND1904',
    colours: [],
  };
  saveDB(initial);
  return initial;
}

function saveDB(data: DB) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving DB:', err);
  }
}

let db = loadDB();

const DEFAULT_OWNER_PIN = 'ANAND1904';

function verifyPin(pin: unknown): boolean {
  if (!pin) return false;
  const p = String(pin).trim().toUpperCase();
  return p === DEFAULT_OWNER_PIN;
}

// Helper to compute queue positions accurately relative to all active orders
function computeQueuePositions(orders: Order[], allOrders: Order[] = orders) {
  const activeStatuses = ['New', 'Confirmed', 'Preparing', 'Dispatched', 'Ready for pickup', 'Contacted'];
  const activeOrders = allOrders
    .filter((o) => activeStatuses.includes(o.status))
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const positionMap = new Map<string, { queuePosition: number; peopleAhead: number }>();
  activeOrders.forEach((o, idx) => {
    positionMap.set(o.id, {
      queuePosition: idx + 1,
      peopleAhead: idx,
    });
  });

  return orders.map((o) => {
    const queueInfo = positionMap.get(o.id);
    return {
      ...o,
      queuePosition: queueInfo ? queueInfo.queuePosition : null,
      peopleAhead: queueInfo ? queueInfo.peopleAhead : 0,
    };
  });
}

// Static files from public
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.get('/api/products', (req, res) => {
  db = loadDB();
  const publishedProducts = db.products.filter((p) => p.available !== false);
  res.json({ products: publishedProducts });
});

app.get('/api/payment-qr', (req, res) => {
  db = loadDB();
  res.json({ url: db.paymentQrUrl });
});

app.get('/api/shop-modes', (req, res) => {
  db = loadDB();
  res.json(db.shopModes);
});

app.get('/api/orders/pending-summary', (req, res) => {
  db = loadDB();
  const newOrders = db.orders.filter((o) => o.status === 'New');
  const latestOrder = db.orders[0];
  res.json({
    newCount: newOrders.length,
    totalCount: db.orders.length,
    latestOrderId: latestOrder ? latestOrder.id : null,
    latestOrderTime: latestOrder ? latestOrder.createdAt : null,
  });
});

app.post('/api/orders', (req, res) => {
  db = loadDB();
  const { customerId, mode, productId, name, studentClass, section, phone, address, note, colour } = req.body;

  if (!productId || !name || !name.trim()) {
    return res.status(400).json({ error: 'Please enter your name and select a toy.' });
  }

  const product = db.products.find((p) => p.id === productId);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const orderId = 'ord_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const orderNumber = 'TN-' + (Math.floor(1000 + Math.random() * 9000));

  const newOrder: Order = {
    id: orderId,
    orderNumber,
    customerId: customerId || 'cust_' + Date.now(),
    mode: mode === 'Adult' ? 'Adult' : 'Child',
    productId,
    productName: product.name,
    productImageUrl: product.imageUrl || (product.imageUrls && product.imageUrls[0]) || '',
    price: product.price,
    name: name.trim(),
    studentClass: mode === 'Adult' ? '' : (studentClass || ''),
    section: mode === 'Adult' ? '' : (section || '').trim(),
    phone: mode === 'Adult' ? (phone || '').trim() : '',
    address: mode === 'Adult' ? (address || '').trim() : '',
    note: (note || '').trim(),
    status: 'New',
    createdAt: new Date().toISOString(),
    paymentRecipientName: '',
    paymentRecipientClass: '',
    paymentRecipientSection: '',
    ownerNote: '',
    colour: (colour || '').trim(),
  };

  db.orders.unshift(newOrder);
  saveDB(db);

  const [enrichedOrder] = computeQueuePositions([newOrder], db.orders);
  res.json({ success: true, order: enrichedOrder || newOrder });
});

app.post('/api/orders/mine', (req, res) => {
  db = loadDB();
  const { customerId } = req.body;
  if (!customerId) {
    return res.json({ orders: [] });
  }

  const userOrders = db.orders.filter((o) => o.customerId === customerId && !o.customerDeleted);
  const enrichedOrders = computeQueuePositions(userOrders, db.orders);
  res.json({ orders: enrichedOrders });
});

app.post('/api/orders/customer-delete', (req, res) => {
  db = loadDB();
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ error: 'Order ID is required' });
  }
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  const canDelete = ['Completed', 'Delivered', 'Collected', 'Cancelled'].includes(order.status);
  if (!canDelete) {
    return res.status(400).json({
      error: 'Only completed or cancelled orders can be removed from customer view.',
    });
  }
  order.customerDeleted = true;
  saveDB(db);
  res.json({ success: true });
});

app.post('/api/suggestions', (req, res) => {
  db = loadDB();
  const { suggestion } = req.body;
  if (!suggestion || !suggestion.trim()) {
    return res.status(400).json({ error: 'Suggestion cannot be empty.' });
  }

  const newSuggestion: Suggestion = {
    id: 'sug_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    suggestion: suggestion.trim(),
    createdAt: new Date().toISOString(),
  };

  db.suggestions.unshift(newSuggestion);
  saveDB(db);

  res.json({ success: true });
});

// OWNER ROUTES
app.post('/api/owner/verify', (req, res) => {
  const { pin } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }
  res.json({ success: true });
});

app.post('/api/owner/products/list', (req, res) => {
  const { pin } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }
  db = loadDB();
  res.json({ products: db.products });
});

app.post('/api/owner/products', (req, res) => {
  const { pin, name, price, description, category, images, available } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  if (!name || !name.trim() || !price || Number(price) <= 0) {
    return res.status(400).json({ error: 'Invalid product details.' });
  }

  db = loadDB();
  const productId = 'toy_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const imageUrls: string[] = [];

  if (Array.isArray(images) && images.length > 0) {
    images.forEach((img, idx) => {
      try {
        if (img && img.data) {
          const ext = img.contentType?.includes('png') ? 'png' : img.contentType?.includes('webp') ? 'webp' : 'jpg';
          const filename = `toy-${productId}-${idx + 1}.${ext}`;
          const filepath = path.join(__dirname, 'public/toys', filename);
          fs.writeFileSync(filepath, Buffer.from(img.data, 'base64'));
          imageUrls.push(`/toys/${filename}`);
        }
      } catch (err) {
        console.error('Error saving image:', err);
      }
    });
  }

  const newProduct: Product = {
    id: productId,
    name: name.trim(),
    price: Number(price),
    description: (description || '').trim(),
    category: (category || '').trim() || 'Other',
    imageUrl: imageUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
    imageUrls: imageUrls.length > 0 ? imageUrls : ['/toys/toy-40ba4ba9-1.jpg'],
    available: available !== false,
    createdAt: new Date().toISOString(),
  };

  db.products.unshift(newProduct);
  saveDB(db);

  res.json({ success: true, product: newProduct });
});

app.post('/api/owner/products/update', (req, res) => {
  const { pin, id, name, price, description, category, available, imageUrl, imageUrls, newImages } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  const product = db.products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  if (name !== undefined) product.name = name.trim();
  if (price !== undefined) product.price = Number(price);
  if (description !== undefined) product.description = description.trim();
  if (category !== undefined) product.category = category.trim() || 'Other';
  if (available !== undefined) product.available = Boolean(available);

  let currentUrls: string[] = Array.isArray(imageUrls)
    ? [...imageUrls]
    : product.imageUrls && product.imageUrls.length > 0
    ? [...product.imageUrls]
    : product.imageUrl
    ? [product.imageUrl]
    : [];

  if (Array.isArray(newImages) && newImages.length > 0) {
    newImages.forEach((img, idx) => {
      try {
        if (img && img.data) {
          const ext = img.contentType?.includes('png') ? 'png' : img.contentType?.includes('webp') ? 'webp' : 'jpg';
          const filename = `toy-${id}-${Date.now().toString(36)}-${idx + 1}.${ext}`;
          const filepath = path.join(__dirname, 'public/toys', filename);
          fs.writeFileSync(filepath, Buffer.from(img.data, 'base64'));
          currentUrls.push(`/toys/${filename}`);
        }
      } catch (err) {
        console.error('Error saving new edit image:', err);
      }
    });
  }

  if (currentUrls.length > 0) {
    product.imageUrls = currentUrls;
    product.imageUrl = currentUrls[0];
  } else if (imageUrl !== undefined) {
    product.imageUrl = imageUrl || '/toys/toy-40ba4ba9-1.jpg';
    product.imageUrls = [product.imageUrl];
  }

  saveDB(db);
  res.json({ success: true, product });
});

app.post('/api/owner/products/delete', (req, res) => {
  const { pin, id } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  db.products = db.products.filter((p) => p.id !== id);
  saveDB(db);

  res.json({ success: true });
});

app.post('/api/owner/orders', (req, res) => {
  const { pin } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  const enrichedOrders = computeQueuePositions(db.orders);
  res.json({ orders: enrichedOrders });
});

app.post('/api/owner/orders/status', (req, res) => {
  const { pin, id, status, paymentRecipientName, paymentRecipientClass, paymentRecipientSection, ownerNote } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  const order = db.orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found.' });
  }

  if (status !== undefined) order.status = status;
  if (paymentRecipientName !== undefined) order.paymentRecipientName = paymentRecipientName;
  if (paymentRecipientClass !== undefined) order.paymentRecipientClass = paymentRecipientClass;
  if (paymentRecipientSection !== undefined) order.paymentRecipientSection = paymentRecipientSection;
  if (ownerNote !== undefined) order.ownerNote = ownerNote;

  saveDB(db);
  res.json({ success: true, order });
});

app.post('/api/owner/orders/delete', (req, res) => {
  const { pin, id } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  if (!id) {
    return res.status(400).json({ error: 'Order ID is required.' });
  }

  db = loadDB();
  const order = db.orders.find((o) => o.id === id);
  if (!order) {
    return res.json({ success: true, message: 'Order was not found or already deleted.' });
  }

  const statusLower = (order.status || '').trim().toLowerCase();
  const allowed = ['completed', 'complete', 'delivered', 'collected', 'cancelled'];
  if (!allowed.includes(statusLower)) {
    return res.status(400).json({ error: 'Only completed, delivered, collected, or cancelled orders can be deleted.' });
  }

  db.orders = db.orders.filter((o) => o.id !== id);
  saveDB(db);

  res.json({ success: true });
});

app.post('/api/owner/earnings', (req, res) => {
  const { pin } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  const earnedStatuses = new Set(['completed', 'delivered', 'collected']);
  const seenIds = new Set<string>();
  let total = 0;
  let fulfilledCount = 0;

  for (const order of db.orders) {
    if (!order || !order.id || seenIds.has(order.id)) continue;
    seenIds.add(order.id);

    if (order.status && earnedStatuses.has(order.status.trim().toLowerCase())) {
      const p = Number(order.price);
      if (!isNaN(p) && isFinite(p) && p > 0) {
        total += p;
        fulfilledCount++;
      }
    }
  }

  res.json({ totalMoneyEarned: total, totalFulfilledOrders: fulfilledCount });
});

app.post('/api/owner/suggestions', (req, res) => {
  const { pin } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  res.json({ suggestions: db.suggestions });
});

app.post('/api/owner/suggestions/delete', (req, res) => {
  const { pin, id } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  db.suggestions = db.suggestions.filter((s) => s.id !== id);
  saveDB(db);

  res.json({ success: true });
});

app.post('/api/owner/shop-modes', (req, res) => {
  const { pin, adultPublished, childPublished } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  db = loadDB();
  db.shopModes = {
    adultPublished: adultPublished !== false,
    childPublished: childPublished !== false,
  };
  saveDB(db);

  res.json(db.shopModes);
});

app.post('/api/owner/payment-qr', (req, res) => {
  const { pin, data, contentType } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }

  if (!data) {
    return res.status(400).json({ error: 'No QR data provided.' });
  }

  try {
    const ext = contentType?.includes('png') ? 'png' : contentType?.includes('webp') ? 'webp' : 'jpg';
    const filename = `adult-qr.${ext}`;
    const filepath = path.join(__dirname, 'public/payment', filename);
    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));

    db = loadDB();
    db.paymentQrUrl = `/payment/${filename}?t=${Date.now()}`;
    saveDB(db);

    res.json({ url: db.paymentQrUrl });
  } catch (err) {
    console.error('Error saving QR code:', err);
    res.status(500).json({ error: 'Failed to save QR code.' });
  }
});

// Colour Management Routes
app.get('/api/colours', (req, res) => {
  db = loadDB();
  res.json({ colours: db.colours || [] });
});

app.post('/api/owner/colours/add', (req, res) => {
  const { pin, colour } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }
  const name = String(colour || '').trim();
  if (!name) {
    return res.status(400).json({ error: 'Please enter a colour name.' });
  }
  db = loadDB();
  if (!Array.isArray(db.colours)) db.colours = [];
  const exists = db.colours.some((c) => c.toLowerCase() === name.toLowerCase());
  if (exists) {
    return res.status(400).json({ error: `Colour "${name}" already exists.` });
  }
  db.colours.push(name);
  saveDB(db);
  res.json({ success: true, colours: db.colours });
});

app.post('/api/owner/colours/delete', (req, res) => {
  const { pin, colour } = req.body;
  if (!verifyPin(pin)) {
    return res.status(401).json({ error: 'Invalid owner PIN' });
  }
  const name = String(colour || '').trim();
  db = loadDB();
  if (!Array.isArray(db.colours)) db.colours = [];
  db.colours = db.colours.filter((c) => c.toLowerCase() !== name.toLowerCase());
  saveDB(db);
  res.json({ success: true, colours: db.colours });
});


// Setup Vite middleware or static serving
async function startServer() {
  if (process.env.VERCEL) {
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Playnix server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();

export default app;
