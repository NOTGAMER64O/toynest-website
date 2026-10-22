import React, { useState, useEffect } from 'react';
import {
  Menu,
  Boxes,
  PackageCheck,
  ShieldCheck,
  X,
  ShoppingBag,
  MessageSquare,
  ArrowLeft,
  RefreshCw,
  Store,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Share2,
  FileText,
} from 'lucide-react';

const da = (val: number | string) => '₹' + Number(val).toLocaleString('en-IN');

function getCustomerKey(): string {
  const KEY = 'toynest_customer_key';
  let val = localStorage.getItem(KEY);
  if (!val) {
    val =
      typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(KEY, val);
  }
  return val;
}

function getSeenOrderStatuses(): Record<string, string> {
  try {
    const raw = localStorage.getItem('toynest_seen_order_statuses');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSeenOrderStatuses(statuses: Record<string, string>) {
  try {
    localStorage.setItem('toynest_seen_order_statuses', JSON.stringify(statuses));
  } catch {}
}

function getSeenOwnerLatestOrder(): string {
  try {
    return localStorage.getItem('toynest_seen_owner_latest_order') || '';
  } catch {
    return '';
  }
}

function saveSeenOwnerLatestOrder(orderId: string) {
  try {
    localStorage.setItem('toynest_seen_owner_latest_order', orderId);
  } catch {}
}

const api = {
  async get(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    return { data };
  },
  async post(url: string, body: any) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP error ${res.status}`);
    }
    const data = await res.json();
    return { data };
  },
};

import {
  DEFAULT_PRODUCTS,
  DEFAULT_OWNER_PIN,
  type Product,
  type Order,
  type Suggestion,
} from './defaultData';

function getStoredProducts(): Product[] {
  try {
    const raw = localStorage.getItem('toynest_local_products');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_PRODUCTS;
}

function saveStoredProducts(products: Product[]) {
  try {
    localStorage.setItem('toynest_local_products', JSON.stringify(products));
  } catch {}
}

function getStoredOrders(): Order[] {
  try {
    const raw = localStorage.getItem('toynest_local_orders');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

function saveStoredOrders(orders: Order[]) {
  try {
    localStorage.setItem('toynest_local_orders', JSON.stringify(orders));
  } catch {}
}

export default function App() {
  const [page, setPage] = useState<'home' | 'buy' | 'myOrders' | 'suggestions' | 'ownerLogin' | 'owner'>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('All categories');
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [ownerOrders, setOwnerOrders] = useState<Order[]>([]);
  const [ownerPin, setOwnerPin] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSideMenuOpen, setIsSideMenuOpen] = useState<boolean>(false);
  const [selectedProductForBuy, setSelectedProductForBuy] = useState<Product | null>(null);
  const [galleryProduct, setGalleryProduct] = useState<Product | null>(null);
  const [galleryImageIndex, setGalleryImageIndex] = useState<number>(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [ownerTab, setOwnerTab] = useState<
    'products' | 'drafts' | 'orders' | 'suggestions' | 'sections' | 'payment'
  >('products');
  const [productFilter, setProductFilter] = useState<'all' | 'published' | 'drafts'>('all');
  const [checkoutMode, setCheckoutMode] = useState<'Child' | 'Adult' | null>(null);
  const [adultPublished, setAdultPublished] = useState<boolean>(true);
  const [childPublished, setChildPublished] = useState<boolean>(true);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string>('');
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [ownerSuggestions, setOwnerSuggestions] = useState<Suggestion[]>([]);
  const [customerSuggestion, setCustomerSuggestion] = useState<string>('');
  const [submittingSuggestion, setSubmittingSuggestion] = useState<boolean>(false);
  const [suggestionSuccess, setSuggestionSuccess] = useState<string>('');
  const [orderStatusFilter, setOrderStatusFilter] = useState<'Pending' | 'Completed' | 'Cancelled'>('Pending');
  const [checkoutForm, setCheckoutForm] = useState({
    name: '',
    studentClass: '',
    section: '',
    phone: '',
    address: '',
    note: '',
  });
  const [productForm, setProductForm] = useState({
    name: '',
    price: '',
    description: '',
    category: '',
  });
  const [productImages, setProductImages] = useState<File[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [customerId] = useState<string>(() => getCustomerKey());
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [myOrdersLoading, setMyOrdersLoading] = useState<boolean>(false);
  const [myOrdersError, setMyOrdersError] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [hasStatusUpdateNotification, setHasStatusUpdateNotification] = useState<boolean>(false);
  const [hasOwnerOrderNotification, setHasOwnerOrderNotification] = useState<boolean>(false);
  const [ownerNewOrdersCount, setOwnerNewOrdersCount] = useState<number>(0);

  const shareShop = async () => {
    const url = 'https://tinyurl.com/toynest';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'ToyNest - Toy Shop',
          text: 'Browse the toy shelf and order on ToyNest!',
          url,
        });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {}
  };

  const loadProducts = async () => {
    try {
      const res = await api.get('/api/products');
      if (res.data?.products && Array.isArray(res.data.products) && res.data.products.length > 0) {
        setProducts(res.data.products);
        saveStoredProducts(res.data.products);
        return;
      }
    } catch {}
    setProducts(getStoredProducts());
  };

  const loadOwnerProducts = async () => {
    try {
      const res = await ownerPost('/api/owner/products/list', {});
      if (res.data?.products && Array.isArray(res.data.products)) {
        setProducts(res.data.products);
        saveStoredProducts(res.data.products);
        return;
      }
    } catch {}
    setProducts(getStoredProducts());
  };

  const loadOwnerSuggestions = async () => {
    try {
      const res = await api.post('/api/owner/suggestions', { pin: ownerPin });
      setOwnerSuggestions(res.data.suggestions || []);
    } catch {}
  };

  const loadOwnerOrders = async () => {
    try {
      const res = await api.post('/api/owner/orders', { pin: ownerPin });
      if (res.data?.orders && Array.isArray(res.data.orders)) {
        const orders: Order[] = res.data.orders;
        setOwnerOrders(orders);
        saveStoredOrders(orders);
        if (orders.length > 0) {
          saveSeenOwnerLatestOrder(orders[0].id);
        }
        setHasOwnerOrderNotification(false);
        return;
      }
    } catch {}
    const localOrders = getStoredOrders();
    setOwnerOrders(localOrders);
    setHasOwnerOrderNotification(false);
  };

  const loadPaymentQr = async () => {
    try {
      const res = await api.get('/api/payment-qr');
      if (res.data?.url) {
        setPaymentQrUrl(res.data.url);
        return;
      }
    } catch {}
    setPaymentQrUrl(localStorage.getItem('toynest_payment_qr') || '/payment/adult-qr.jpg');
  };

  const loadShopModes = async () => {
    try {
      const res = await api.get('/api/shop-modes');
      if (res.data) {
        setAdultPublished(res.data.adultPublished !== false);
        setChildPublished(res.data.childPublished !== false);
        return;
      }
    } catch {}
    try {
      const local = localStorage.getItem('toynest_shop_modes');
      if (local) {
        const parsed = JSON.parse(local);
        setAdultPublished(parsed.adultPublished !== false);
        setChildPublished(parsed.childPublished !== false);
        return;
      }
    } catch {}
    setAdultPublished(true);
    setChildPublished(true);
  };

  const saveShopModes = async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      await ownerPost('/api/owner/shop-modes', {
        adultPublished,
        childPublished,
      });
    } catch {}
    localStorage.setItem(
      'toynest_shop_modes',
      JSON.stringify({ adultPublished, childPublished })
    );
    if (
      (checkoutMode === 'Adult' && !adultPublished) ||
      (checkoutMode === 'Child' && !childPublished)
    ) {
      setCheckoutMode(null);
    }
    setSuccessMessage(
      'Shop sections saved. Draft sections are hidden from customers and can be published again anytime.'
    );
    setLoading(false);
  };

  const savePaymentQr = async () => {
    if (!qrFile) {
      setErrorMessage('Choose a QR code image first.');
      return;
    }
    if (qrFile.size > 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(qrFile.type)) {
      setErrorMessage('Choose a JPG, PNG or WebP QR image under 1 MB.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.onerror = reject;
        reader.readAsDataURL(qrFile);
      });
      const res = await ownerPost('/api/owner/payment-qr', {
        data: base64Data,
        contentType: qrFile.type,
      });
      setPaymentQrUrl(res.data.url || '');
      setQrFile(null);
      setSuccessMessage('Adult payment QR code saved.');
    } catch {
      setErrorMessage('Could not save the QR code. Please try another image.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
    loadPaymentQr();
    loadShopModes();
  }, []);

  const checkOrderUpdates = async () => {
    if (!customerId) return;
    try {
      const res = await api.post('/api/orders/mine', { customerId });
      const orders: Order[] = res.data.orders || [];
      const seen = getSeenOrderStatuses();
      let hasUpdate = false;

      orders.forEach((o) => {
        if (o.status === 'Confirmed' || o.status === 'Dispatched') {
          if (seen[o.id] !== o.status) {
            hasUpdate = true;
          }
        }
      });

      setHasStatusUpdateNotification(hasUpdate);
    } catch {}
  };

  const checkOwnerOrderUpdates = async () => {
    try {
      const res = await api.get('/api/orders/pending-summary');
      const { newCount, latestOrderId } = res.data;
      setOwnerNewOrdersCount(newCount || 0);

      const seenId = getSeenOwnerLatestOrder();
      if (newCount > 0 && latestOrderId && seenId !== latestOrderId) {
        setHasOwnerOrderNotification(true);
      } else if (newCount === 0) {
        setHasOwnerOrderNotification(false);
      }
    } catch {}
  };

  useEffect(() => {
    checkOrderUpdates();
    checkOwnerOrderUpdates();
    const interval = setInterval(() => {
      checkOrderUpdates();
      checkOwnerOrderUpdates();
    }, 15000);
    const handleFocus = () => {
      checkOrderUpdates();
      checkOwnerOrderUpdates();
    };
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [customerId]);

  const loadMyOrders = async () => {
    setMyOrdersLoading(true);
    setMyOrdersError('');
    try {
      await loadPaymentQr();
      const res = await api.post('/api/orders/mine', { customerId });
      if (res.data?.orders && Array.isArray(res.data.orders)) {
        const orders: Order[] = res.data.orders;
        setMyOrders(orders);

        const seen = getSeenOrderStatuses();
        orders.forEach((o) => {
          seen[o.id] = o.status;
        });
        saveSeenOrderStatuses(seen);
        setHasStatusUpdateNotification(false);
        return;
      }
    } catch {}
    const localOrders = getStoredOrders().filter((o) => o.customerId === customerId);
    setMyOrders(localOrders);
    setMyOrdersLoading(false);
  };

  useEffect(() => {
    if (page === 'myOrders') {
      loadMyOrders();
    }
  }, [page, customerId]);

  // Preload images when viewing gallery
  useEffect(() => {
    if (!galleryProduct) return;
    const urls =
      galleryProduct.imageUrls && galleryProduct.imageUrls.length
        ? galleryProduct.imageUrls
        : galleryProduct.imageUrl
        ? [galleryProduct.imageUrl]
        : [];
    urls.forEach((u) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = u;
      if (typeof img.decode === 'function') {
        img.decode().catch(() => {});
      }
    });
  }, [galleryProduct]);

  const ownerPost = async (url: string, body: any) => {
    return api.post(url, { ...body, pin: ownerPin });
  };

  const refreshShop = async () => {
    setIsRefreshing(true);
    setErrorMessage('');
    try {
      await Promise.all([loadProducts(), loadShopModes()]);
      setSuccessMessage('Shop refreshed. You are seeing the latest published toys.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshOwnerDashboard = async () => {
    setIsRefreshing(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      await Promise.all([loadOwnerProducts(), loadOwnerOrders()]);
      if (ownerTab === 'suggestions') await loadOwnerSuggestions();
      if (ownerTab === 'sections') await loadShopModes();
      if (ownerTab === 'payment') await loadPaymentQr();
      setSuccessMessage('Dashboard refreshed with the latest data.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const verifyOwnerLogin = async () => {
    setLoading(true);
    setErrorMessage('');
    const enteredPin = ownerPin.trim();
    const normalizedEntered = enteredPin.toUpperCase();

    // Strictly only allow fixed owner PIN 'ANAND1904' (case-insensitive)
    const isPinValid = normalizedEntered === DEFAULT_OWNER_PIN;

    if (isPinValid) {
      try {
        localStorage.removeItem('toynest_custom_owner_pin');
      } catch {}
      try {
        await ownerPost('/api/owner/verify', {});
      } catch (err) {
        console.warn('Backend verification call skipped or offline on host:', err);
      }
      setErrorMessage('');
      setPage('owner');
      setOwnerTab('products');
      loadOwnerProducts().catch(() => {});
      loadOwnerOrders().catch(() => {});
      setLoading(false);
      return;
    }

    try {
      await ownerPost('/api/owner/verify', {});
      setErrorMessage('');
      setPage('owner');
      setOwnerTab('products');
      await loadOwnerProducts();
      await loadOwnerOrders();
    } catch {
      setErrorMessage('Incorrect PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const visibilityVal =
      submitter?.value === 'draft' ? false : submitter?.value === 'published' ? true : undefined;

    setErrorMessage('');
    setSuccessMessage('');
    if (!productForm.name.trim() || !productForm.price || Number(productForm.price) <= 0) {
      setErrorMessage('Enter a toy name and a valid price.');
      return;
    }
    setLoading(true);
    try {
      if (editingProductId) {
        try {
          await ownerPost('/api/owner/products/update', {
            id: editingProductId,
            name: productForm.name.trim(),
            price: Number(productForm.price),
            description: productForm.description.trim(),
            category: productForm.category.trim() || 'Other',
            ...(typeof visibilityVal === 'boolean' ? { available: visibilityVal } : {}),
          });
        } catch {}
        const currentProducts = getStoredProducts();
        const updated = currentProducts.map((p) =>
          p.id === editingProductId
            ? {
                ...p,
                name: productForm.name.trim(),
                price: Number(productForm.price),
                description: productForm.description.trim(),
                category: productForm.category.trim() || 'Other',
                ...(typeof visibilityVal === 'boolean' ? { available: visibilityVal } : {}),
              }
            : p
        );
        saveStoredProducts(updated);
        setProducts(updated);
        setEditingProductId(null);
        setProductForm({ name: '', price: '', description: '', category: '' });
        setSuccessMessage('Toy details updated!');
        setLoading(false);
        return;
      }

      const imagesData = await Promise.all(
        productImages.map(
          (file) =>
            new Promise<{ data: string; contentType: string }>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  data: String(reader.result).split(',')[1] || '',
                  contentType: file.type,
                });
              reader.onerror = reject;
              reader.readAsDataURL(file);
            })
        )
      );

      let newProduct: Product | null = null;
      try {
        const res = await ownerPost('/api/owner/products', {
          name: productForm.name.trim(),
          price: Number(productForm.price),
          description: productForm.description.trim(),
          category: productForm.category.trim() || 'Other',
          images: imagesData,
          available: visibilityVal !== false,
        });
        if (res.data?.product) {
          newProduct = res.data.product;
        }
      } catch {}

      if (!newProduct) {
        const fallbackUrls = imagesData.map(
          (img) => `data:${img.contentType};base64,${img.data}`
        );
        newProduct = {
          id: `toy_${Date.now().toString(36)}`,
          name: productForm.name.trim(),
          price: Number(productForm.price),
          description: productForm.description.trim(),
          category: productForm.category.trim() || 'Other',
          imageUrl: fallbackUrls[0] || '/toys/toy-40ba4ba9-1.jpg',
          imageUrls: fallbackUrls.length > 0 ? fallbackUrls : ['/toys/toy-40ba4ba9-1.jpg'],
          available: visibilityVal !== false,
          createdAt: new Date().toISOString(),
        };
      }

      const updated = [newProduct, ...getStoredProducts()];
      saveStoredProducts(updated);
      setProducts(updated);
      setProductForm({ name: '', price: '', description: '', category: '' });
      setProductImages([]);
      setSuccessMessage(
        visibilityVal === false
          ? 'Toy saved as a draft. Customers cannot see it yet.'
          : 'Toy published in your shop!'
      );
    } catch {
      setErrorMessage('Could not add toy. Check the image file and try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleProductVisibility = async (p: Product) => {
    try {
      await ownerPost('/api/owner/products/update', {
        id: p.id,
        name: p.name,
        price: p.price,
        description: p.description || '',
        category: p.category || 'Other',
        available: p.available === false,
      });
    } catch {}
    const updated = getStoredProducts().map((item) =>
      item.id === p.id ? { ...item, available: item.available === false } : item
    );
    saveStoredProducts(updated);
    setProducts(updated);
    setSuccessMessage(
      p.available === false
        ? 'Toy published in your shop.'
        : 'Toy moved to drafts and hidden from customers.'
    );
    setErrorMessage('');
  };

  const startEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProductForm({
      name: p.name,
      price: String(p.price),
      description: p.description || '',
      category: p.category || 'Other',
    });
    setProductImages([]);
    setErrorMessage('');
    setSuccessMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setProductForm({ name: '', price: '', description: '', category: '' });
    setProductImages([]);
    setErrorMessage('');
  };

  const deleteProduct = async (id: string) => {
    if (confirm('Remove this toy from the shop?')) {
      try {
        await ownerPost('/api/owner/products/delete', { id });
      } catch {}
      const updated = getStoredProducts().filter((p) => p.id !== id);
      saveStoredProducts(updated);
      setProducts(updated);
      setSuccessMessage('Toy removed.');
    }
  };

  const handleSuggestionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuggestionSuccess('');
    setErrorMessage('');
    const val = customerSuggestion.trim();
    if (!val) {
      setErrorMessage('Please write a suggestion before submitting.');
      return;
    }
    setSubmittingSuggestion(true);
    try {
      await api.post('/api/suggestions', { suggestion: val });
      setCustomerSuggestion('');
      setSuggestionSuccess('Thanks! Your suggestion has been sent.');
    } catch {
      setErrorMessage('Could not send your suggestion. Please try again.');
    } finally {
      setSubmittingSuggestion(false);
    }
  };


  const handlePlaceOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMessage('');
    if (!selectedProductForBuy || !checkoutForm.name.trim()) {
      setErrorMessage('Please enter your name.');
      return;
    }
    if (checkoutMode === 'Adult') {
      const phoneDigits = checkoutForm.phone.replace(/\D/g, '').length;
      if (phoneDigits < 7 || phoneDigits > 15) {
        setErrorMessage('Enter a valid phone number.');
        return;
      }
      if (!checkoutForm.address.trim()) {
        setErrorMessage('Please enter your delivery address.');
        return;
      }
    } else {
      if (!checkoutForm.studentClass || !checkoutForm.section.trim()) {
        setErrorMessage('Please fill in class and section.');
        return;
      }
    }

    setLoading(true);
    try {
      const res = await api.post('/api/orders', {
        customerId,
        mode: checkoutMode || 'Child',
        productId: selectedProductForBuy.id,
        name: checkoutForm.name.trim(),
        studentClass: checkoutMode === 'Adult' ? '' : checkoutForm.studentClass,
        section: checkoutMode === 'Adult' ? '' : checkoutForm.section.trim(),
        phone: checkoutMode === 'Adult' ? checkoutForm.phone.trim() : '',
        address: checkoutMode === 'Adult' ? checkoutForm.address.trim() : '',
        note: checkoutForm.note.trim(),
      });
      if (res.data?.order) {
        saveStoredOrders([res.data.order, ...getStoredOrders()]);
      }
    } catch {
      const localOrder: Order = {
        id: `ord_${Date.now().toString(36)}`,
        orderNumber: `TN-${Math.floor(1000 + Math.random() * 9000)}`,
        customerId,
        mode: checkoutMode || 'Child',
        productId: selectedProductForBuy.id,
        productName: selectedProductForBuy.name,
        productImageUrl: selectedProductForBuy.imageUrl || (selectedProductForBuy.imageUrls && selectedProductForBuy.imageUrls[0]) || '',
        price: selectedProductForBuy.price,
        name: checkoutForm.name.trim(),
        studentClass: checkoutMode === 'Adult' ? '' : checkoutForm.studentClass,
        section: checkoutMode === 'Adult' ? '' : checkoutForm.section.trim(),
        phone: checkoutMode === 'Adult' ? checkoutForm.phone.trim() : '',
        address: checkoutMode === 'Adult' ? checkoutForm.address.trim() : '',
        note: checkoutForm.note.trim(),
        status: 'New',
        createdAt: new Date().toISOString(),
      };
      saveStoredOrders([localOrder, ...getStoredOrders()]);
    } finally {
      setSuccessMessage('');
      setPage('myOrders');
      await loadMyOrders();
      setCheckoutForm({ name: '', studentClass: '', section: '', phone: '', address: '', note: '' });
      setSelectedProductForBuy(null);
      setLoading(false);
    }
  };

  const updateOrderStatus = async (order: Order, newStatus: string) => {
    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: newStatus,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: order.ownerNote || '',
      });
    } catch {}
    const updated = getStoredOrders().map((o) => (o.id === order.id ? { ...o, status: newStatus } : o));
    saveStoredOrders(updated);
    setOwnerOrders(updated);
    setSuccessMessage('Order status updated.');
  };

  const savePaymentRecipient = async (order: Order) => {
    if (
      !order.paymentRecipientName?.trim() ||
      !order.paymentRecipientClass?.trim() ||
      !order.paymentRecipientSection?.trim()
    ) {
      setErrorMessage('Enter the payment recipient name, class and section.');
      return;
    }
    setErrorMessage('');
    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: order.status,
        paymentRecipientName: order.paymentRecipientName.trim(),
        paymentRecipientClass: order.paymentRecipientClass.trim(),
        paymentRecipientSection: order.paymentRecipientSection.trim(),
      });
    } catch {}
    const updated = getStoredOrders().map((o) =>
      o.id === order.id
        ? {
            ...o,
            paymentRecipientName: order.paymentRecipientName?.trim(),
            paymentRecipientClass: order.paymentRecipientClass?.trim(),
            paymentRecipientSection: order.paymentRecipientSection?.trim(),
          }
        : o
    );
    saveStoredOrders(updated);
    setOwnerOrders(updated);
    setSuccessMessage('Payment recipient saved.');
  };

  const handleOrderFieldChange = (orderId: string, field: string, val: string) => {
    setOwnerOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, [field]: val } : o))
    );
  };

  const handleOwnerNoteChange = (orderId: string, val: string) => {
    setOwnerOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, ownerNote: val } : o))
    );
  };

  const saveOwnerNote = async (order: Order) => {
    setErrorMessage('');
    try {
      await ownerPost('/api/owner/orders/status', {
        id: order.id,
        status: order.status,
        paymentRecipientName: order.paymentRecipientName || '',
        paymentRecipientClass: order.paymentRecipientClass || '',
        paymentRecipientSection: order.paymentRecipientSection || '',
        ownerNote: (order.ownerNote || '').trim(),
      });
    } catch {}
    const updated = getStoredOrders().map((o) =>
      o.id === order.id ? { ...o, ownerNote: (order.ownerNote || '').trim() } : o
    );
    saveStoredOrders(updated);
    setOwnerOrders(updated);
    setSuccessMessage('Customer note saved.');
  };

  const deleteSuggestion = async (s: Suggestion) => {
    if (confirm('Delete this customer suggestion permanently? This cannot be undone.')) {
      setErrorMessage('');
      try {
        await ownerPost('/api/owner/suggestions/delete', { id: s.id });
        setOwnerSuggestions((prev) => prev.filter((item) => item.id !== s.id));
        setSuccessMessage('Suggestion deleted.');
      } catch {
        setErrorMessage('Could not delete this suggestion. Please refresh and try again.');
      }
    }
  };

  const deleteOldOrder = async (order: Order) => {
    if (
      ['Completed', 'Cancelled'].includes(order.status) &&
      confirm(
        `Delete finished order ${order.orderNumber || order.id.slice(0, 8)} for ${
          order.name
        }? This cannot be undone.`
      )
    ) {
      setErrorMessage('');
      try {
        await ownerPost('/api/owner/orders/delete', { id: order.id });
      } catch {}
      const updated = getStoredOrders().filter((o) => o.id !== order.id);
      saveStoredOrders(updated);
      setOwnerOrders(updated);
      setSuccessMessage('Old order deleted.');
    }
  };

  return (
    <div className="app-shell">
      {/* Top Header Bar */}
      <header className="topbar">
        <button
          className="menu-toggle"
          type="button"
          aria-label="Open navigation menu"
          aria-expanded={isSideMenuOpen}
          onClick={() => setIsSideMenuOpen(true)}
        >
          <Menu size={23} />
        </button>

        <button
          className="brand"
          onClick={() => {
            setPage('home');
            setCheckoutMode(null);
            setErrorMessage('');
          }}
        >
          <span className="brand-icon">
            <img
              className="brand-logo"
              src="/resources/toynest-logo.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <Boxes size={23} />
          </span>
          <span>ToyNest</span>
        </button>

        <div className="top-actions">
          <span className="open-label">
            <span className="dot"></span> Toy shop
          </span>
          <button
            className="owner-link"
            type="button"
            onClick={shareShop}
            title="Copy short link (tinyurl.com/toynest)"
          >
            <Share2 size={16} /> {copiedLink ? 'Copied link!' : 'Share shop'}
          </button>
          <button
            className="owner-link"
            style={{ position: 'relative' }}
            onClick={() => {
              setPage('myOrders');
              setErrorMessage('');
            }}
          >
            <PackageCheck size={16} /> My Orders
            {hasStatusUpdateNotification && (
              <span
                className="notification-dot"
                title="Your order status has been updated!"
                aria-label="Order status update notification"
              />
            )}
          </button>
          <button
            className="owner-link"
            style={{ position: 'relative' }}
            onClick={() => {
              setPage('ownerLogin');
              setErrorMessage('');
            }}
          >
            <ShieldCheck size={16} /> Owner
            {hasOwnerOrderNotification && (
              <span
                className="blinking-green-dot"
                title={`${ownerNewOrdersCount} new order request(s)!`}
                aria-label="New order notification"
              />
            )}
          </button>
        </div>
      </header>

      {/* Side Navigation Menu */}
      {isSideMenuOpen && (
        <div className="side-menu-backdrop" onClick={() => setIsSideMenuOpen(false)}>
          <aside
            className="side-menu-panel"
            aria-label="ToyNest navigation"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="side-menu-heading">
              <div className="side-menu-brand">
                <span className="brand-icon">
                  <Boxes size={21} />
                </span>
                <span>ToyNest</span>
              </div>
              <button
                className="side-menu-close"
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setIsSideMenuOpen(false)}
              >
                <X size={21} />
              </button>
            </div>

            <div className="side-menu-links">
              <button
                type="button"
                onClick={() => {
                  setPage('home');
                  setCheckoutMode(null);
                  setErrorMessage('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <Boxes size={19} /> Home
              </button>
              <button
                type="button"
                onClick={() => {
                  setPage('suggestions');
                  setErrorMessage('');
                  setSuggestionSuccess('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <MessageSquare size={19} /> Suggestions?
              </button>
              <button
                type="button"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
                onClick={() => {
                  setPage('myOrders');
                  setErrorMessage('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <PackageCheck size={19} /> My Orders
                </span>
                {hasStatusUpdateNotification && (
                  <span className="notification-badge-pill">Update</span>
                )}
              </button>
              <button
                type="button"
                onClick={shareShop}
              >
                <Share2 size={19} /> {copiedLink ? 'Link copied!' : 'Share shop (tinyurl.com/toynest)'}
              </button>
              <button
                type="button"
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
                onClick={() => {
                  setPage('ownerLogin');
                  setErrorMessage('');
                  setIsSideMenuOpen(false);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ShieldCheck size={19} /> Owner access
                </span>
                {hasOwnerOrderNotification && (
                  <span
                    className="blinking-green-dot-inline"
                    title="New order request"
                  />
                )}
              </button>
            </div>

            <div className="side-menu-footer">
              A little joy for every day <span>✦</span>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Areas */}
      <main>
        {/* HOME VIEW: Shop unavailable if both sections draft */}
        {page === 'home' && !adultPublished && !childPublished && (
          <section className="mode-choice">
            <span className="eyebrow">WELCOME TO TOYNEST</span>
            <h1>Shop temporarily unavailable</h1>
            <p>Please check back later.</p>
          </section>
        )}

        {/* HOME VIEW: Normal */}
        {page === 'home' && (adultPublished || childPublished) && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">LITTLE THINGS, BIG SMILES</span>
                <h1>
                  Find your next
                  <br />
                  <em>favourite toy.</em>
                </h1>
                <p>
                  Discover fun picks, check the price, and place your order in just a few steps.
                </p>
                <button
                  className="primary-btn"
                  onClick={() => {
                    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Explore toys <ArrowLeft className="arrow-down" size={17} />
                </button>
                <div className="hero-proof">
                  <span className="proof-icon">✦</span> A little joy for every day
                </div>
              </div>

              <div className="hero-art">
                <div className="sun-shape"></div>
                <div className="toy-emoji">🧸</div>
                <div className="floating-card card-one">
                  🚀 <span>Ready for fun?</span>
                </div>
                <div className="floating-card card-two">
                  ⭐ <span>Pick your favourite</span>
                </div>
                <div className="hero-caption">PLAY MORE. SMILE MORE.</div>
              </div>
            </section>

            <section className="catalog" id="catalog">
              <div className="section-head">
                <div>
                  <span className="eyebrow">THE COLLECTION</span>
                  <h2>
                    Toy shelf <span>({products.filter((p) => p.available !== false).length})</span>
                  </h2>
                  <p>Pick a toy you love. The price is shown upfront.</p>
                </div>

                <div className="catalog-actions">
                  <div className="catalog-tag">
                    <ShoppingBag size={16} /> Easy ordering
                  </div>
                  <button
                    className="secondary-btn refresh-btn"
                    onClick={() => void refreshShop()}
                    disabled={isRefreshing}
                  >
                    <RefreshCw size={16} className={isRefreshing ? 'refresh-spinning' : ''} />
                    {isRefreshing ? 'Refreshing…' : 'Refresh shop'}
                  </button>
                </div>
              </div>

              <div className="category-filter">
                <label htmlFor="customer-category">Category</label>
                <select
                  id="customer-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                >
                  <option>All categories</option>
                  {Array.from(
                    new Set(
                      products
                        .filter((p) => p.available !== false)
                        .map((p) => p.category || 'Other')
                    )
                  )
                    .sort()
                    .map((cat) => (
                      <option key={cat}>{cat}</option>
                    ))}
                </select>
              </div>

              {products.filter((p) => p.available !== false).length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🪁</div>
                  <h3>The toy shelf is waiting!</h3>
                  <p>New toys will appear here when the owner adds them.</p>
                  <button className="secondary-btn" onClick={() => setPage('ownerLogin')}>
                    Owner? Add your first toy
                  </button>
                </div>
              ) : (
                <div className="product-grid">
                  {products
                    .filter(
                      (p) =>
                        p.available !== false &&
                        (selectedCategory === 'All categories' ||
                          (p.category || 'Other') === selectedCategory)
                    )
                    .map((p) => {
                      const count = (p.imageUrls && p.imageUrls.length) || (p.imageUrl ? 1 : 0);
                      const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                      return (
                        <article className="product-card" key={p.id}>
                          <button
                            type="button"
                            className="product-image product-image-button"
                            aria-label={`View photos and details for ${p.name}`}
                            onClick={() => {
                              setGalleryProduct(p);
                              setGalleryImageIndex(0);
                            }}
                          >
                            {firstImg ? (
                              <img src={firstImg} alt={p.name} />
                            ) : (
                              <div className="placeholder-toy">🧸</div>
                            )}
                            <span className="product-badge">
                              {count > 1 ? `${count} PHOTOS · TAP TO VIEW` : 'TAP TO VIEW'}
                            </span>
                          </button>

                          <div className="product-info">
                            <span className="product-category">{p.category || 'Other'}</span>
                            <h3>{p.name}</h3>
                            <p className="product-desc">
                              {p.description || 'A fun new friend for playtime.'}
                            </p>
                            <div className="product-bottom">
                              <strong>{da(p.price)}</strong>
                              <button
                                className="buy-btn"
                                onClick={() => {
                                  setSelectedProductForBuy(p);
                                  setCheckoutMode(null);
                                  setCheckoutForm({
                                    name: '',
                                    studentClass: '',
                                    section: '',
                                    phone: '',
                                    address: '',
                                    note: '',
                                  });
                                  setErrorMessage('');
                                  setPage('buy');
                                }}
                              >
                                Buy now <ArrowLeft size={15} />
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                </div>
              )}
            </section>
          </>
        )}

        {/* SUGGESTIONS VIEW */}
        {page === 'suggestions' && (
          <section className="form-page suggestions-page">
            <button
              className="back-link"
              type="button"
              onClick={() => {
                setPage('home');
                setErrorMessage('');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            >
              <ArrowLeft size={16} /> Back to toys
            </button>

            <section className="suggestions-box" aria-label="Suggestions box">
              <h2>Suggestions box - Got any suggestions?</h2>
              <form className="suggestion-form" onSubmit={handleSuggestionSubmit}>
                <label htmlFor="customer-suggestion">Write your suggestion</label>
                <textarea
                  id="customer-suggestion"
                  value={customerSuggestion}
                  onChange={(e) => setCustomerSuggestion(e.target.value)}
                  placeholder="Tell us which toys you'd like to see…"
                  maxLength={1000}
                  rows={4}
                  required
                />
                <button className="primary-btn" type="submit" disabled={submittingSuggestion}>
                  {submittingSuggestion ? 'Sending…' : 'Send suggestion'}
                </button>
                {suggestionSuccess && <p className="success-msg">{suggestionSuccess}</p>}
                {errorMessage && page === 'suggestions' && (
                  <p className="error-msg">{errorMessage}</p>
                )}
              </form>
            </section>
          </section>
        )}

        {/* BUY / CHECKOUT VIEW */}
        {page === 'buy' && selectedProductForBuy && (
          <section className="form-page">
            <button
              className="back-link"
              onClick={() => {
                setPage('home');
                setErrorMessage('');
              }}
            >
              <ArrowLeft size={16} /> Back to toys
            </button>

            {checkoutMode ? (
              <div className="form-layout">
                {/* Order Summary */}
                <div className="order-summary">
                  <span className="eyebrow">YOUR PICK</span>
                  <div className="summary-image summary-gallery">
                    {(selectedProductForBuy.imageUrls && selectedProductForBuy.imageUrls.length
                      ? selectedProductForBuy.imageUrls
                      : selectedProductForBuy.imageUrl
                      ? [selectedProductForBuy.imageUrl]
                      : []
                    ).length ? (
                      (selectedProductForBuy.imageUrls && selectedProductForBuy.imageUrls.length
                        ? selectedProductForBuy.imageUrls
                        : [selectedProductForBuy.imageUrl!]
                      ).map((url, idx) => (
                        <img key={url} src={url} alt={`${selectedProductForBuy.name} photo ${idx + 1}`} />
                      ))
                    ) : (
                      <span>🧸</span>
                    )}
                  </div>

                  {(selectedProductForBuy.imageUrls?.length || 0) > 1 && (
                    <p className="gallery-caption">
                      {selectedProductForBuy.imageUrls?.length} photos of this toy
                    </p>
                  )}

                  <h2>{selectedProductForBuy.name}</h2>
                  <p>{selectedProductForBuy.description || 'A little bundle of fun.'}</p>

                  <div className="summary-price">
                    <span>Price</span>
                    <strong>{da(selectedProductForBuy.price)}</strong>
                  </div>

                  <div className="secure-note">
                    <ShieldCheck size={17} /> Your order details are only used to process your request.
                  </div>
                </div>

                {/* Form Details */}
                <form className="panel-form" onSubmit={handlePlaceOrder}>
                  <span className="eyebrow">ORDER DETAILS</span>
                  <h2>Make it yours.</h2>
                  <p className="form-subtitle">
                    {checkoutMode === 'Adult'
                      ? 'Enter your contact and delivery details to place the order.'
                      : 'Fill in your school details to place the order.'}
                  </p>

                  {/* Child Warning */}
                  {checkoutMode === 'Child' && (
                    <p className="child-eligibility-warning" role="note">
                      ⚠️ Child option is only available for BCS students.
                    </p>
                  )}

                  <label>
                    Your name
                    <input
                      value={checkoutForm.name}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })}
                      placeholder="Enter your full name"
                      required
                      maxLength={80}
                    />
                  </label>

                  {checkoutMode === 'Adult' ? (
                    <>
                      <label>
                        Phone number
                        <input
                          type="tel"
                          value={checkoutForm.phone}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, phone: e.target.value })
                          }
                          placeholder="Enter your phone number"
                          required
                          maxLength={20}
                          autoComplete="tel"
                        />
                      </label>
                      <label>
                        Delivery address
                        <textarea
                          value={checkoutForm.address}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, address: e.target.value })
                          }
                          placeholder="House/building, street, area, city and PIN code"
                          required
                          maxLength={300}
                          autoComplete="street-address"
                          rows={3}
                        />
                      </label>
                    </>
                  ) : (
                    <div className="two-fields">
                      <label>
                        Class
                        <select
                          value={checkoutForm.studentClass}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, studentClass: e.target.value })
                          }
                          required
                        >
                          <option value="">Choose class</option>
                          {['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => String(i + 1))].map(
                            (c) => (
                              <option key={c}>{c}</option>
                            )
                          )}
                        </select>
                      </label>
                      <label>
                        Section
                        <input
                          value={checkoutForm.section}
                          onChange={(e) =>
                            setCheckoutForm({ ...checkoutForm, section: e.target.value })
                          }
                          placeholder="e.g. A"
                          required
                          maxLength={10}
                        />
                      </label>
                    </div>
                  )}

                  <label>
                    Note (optional)
                    <textarea
                      value={checkoutForm.note}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, note: e.target.value })}
                      placeholder="Any extra details?"
                      maxLength={250}
                    />
                  </label>

                  {errorMessage && <p className="error-msg">{errorMessage}</p>}

                  <button className="primary-btn full-btn" disabled={loading}>
                    {loading ? (
                      'Placing order…'
                    ) : (
                      <>
                        Place order · {da(selectedProductForBuy.price)} <ArrowLeft size={16} />
                      </>
                    )}
                  </button>

                  <p className="fine-print">
                    No online payment is taken on this website. The owner can follow up about your order.
                  </p>
                </form>
              </div>
            ) : (
              <section className="mode-choice checkout-mode-choice">
                <span className="eyebrow">CHECKOUT</span>
                <h2>ARE YOU -</h2>
                <p>Choose the order type to see the right details form.</p>
                <div className="mode-choice-grid">
                  {adultPublished && (
                    <button
                      type="button"
                      className="mode-choice-card"
                      onClick={() => {
                        setCheckoutMode('Adult');
                        setErrorMessage('');
                      }}
                    >
                      <span>🛍️</span>
                      <strong>Adult</strong>
                      <small>Contact and delivery details</small>
                    </button>
                  )}
                  {childPublished && (
                    <button
                      type="button"
                      className="mode-choice-card"
                      onClick={() => {
                        setCheckoutMode('Child');
                        setErrorMessage('');
                      }}
                    >
                      <span>🧸</span>
                      <strong>Child</strong>
                      <small>Name, class and section</small>
                    </button>
                  )}
                  {!adultPublished && !childPublished && (
                    <p className="empty-state compact">Ordering is temporarily unavailable.</p>
                  )}
                </div>
              </section>
            )}
          </section>
        )}

        {/* MY ORDERS VIEW */}
        {page === 'myOrders' && (
          <section className="owner-dashboard customer-orders-page">
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">YOUR ORDER HISTORY</span>
                <h1>My Orders</h1>
                <p>All orders placed from this browser appear here automatically.</p>
              </div>
              <button
                className="secondary-btn"
                onClick={() => void loadMyOrders()}
                disabled={myOrdersLoading}
              >
                {myOrdersLoading ? 'Refreshing…' : 'Refresh orders'}
              </button>
            </div>

            {myOrdersError && <p className="error-msg">{myOrdersError}</p>}

            {myOrdersLoading && myOrders.length === 0 ? (
              <div className="empty-state compact">
                <h3>Loading your orders…</h3>
              </div>
            ) : myOrders.length === 0 ? (
              <div className="empty-state compact">
                <div className="empty-icon">📦</div>
                <h3>No orders yet</h3>
                <p>When you place an order from this browser, it will show up here automatically.</p>
                <button className="primary-btn" onClick={() => setPage('home')}>
                  Browse toys <ArrowLeft size={16} />
                </button>
              </div>
            ) : (
              <div className="orders-list">
                {myOrders.map((o) => (
                  <article className="order-card" key={o.id}>
                    {o.productImageUrl && (
                      <div className="order-product-preview">
                        <img src={o.productImageUrl} alt={o.productName} />
                      </div>
                    )}
                    <div className="order-top">
                      <div>
                        <span className="order-id">ORDER NUMBER · {o.orderNumber || o.id}</span>
                        <h3>{o.productName}</h3>
                      </div>
                      <strong>{da(o.price)}</strong>
                    </div>

                    <div className="order-details">
                      <span>
                        <b>Status</b>
                        {o.status}
                      </span>
                      <span>
                        <b>Placed</b>
                        {new Date(o.createdAt).toLocaleDateString('en-IN')}
                      </span>
                      <span>
                        <b>Class</b>
                        {o.studentClass}
                      </span>
                      <span>
                        <b>Section</b>
                        {o.section}
                      </span>
                    </div>

                    {o.status === 'Confirmed' && (
                      <div className="order-status-highlight-badge status-confirmed">
                        <span className="dot-pulse green"></span> Order confirmed by owner
                      </div>
                    )}
                    {o.status === 'Dispatched' && (
                      <div className="order-status-highlight-badge status-dispatched">
                        <span className="dot-pulse blue"></span> Order dispatched & on the way!
                      </div>
                    )}

                    {o.ownerNote?.trim() && (
                      <div className="queue-status owner-customer-note">
                        <strong>Note from the owner</strong>
                        <p>{o.ownerNote}</p>
                      </div>
                    )}

                    {o.mode === 'Adult' && o.status === 'New' && (
                      <div className="queue-status payment-instruction adult-payment-instruction">
                        <strong>Payment required</strong>
                        <p>
                          Please pay {da(o.price)} using the QR code shown below to proceed with
                          your order.
                        </p>
                        {paymentQrUrl ? (
                          <img
                            className="payment-qr-image"
                            src={paymentQrUrl}
                            alt="Adult payment QR code"
                          />
                        ) : (
                          <p>The owner has not added a QR code yet.</p>
                        )}
                        <p>Before paying, verify the payment recipient and amount.</p>
                      </div>
                    )}

                    {o.mode === 'Adult' && o.status === 'Confirmed' && (
                      <div className="queue-status payment-instruction">
                        <strong>Your order has been confirmed and is being prepared.</strong>
                      </div>
                    )}

                    {o.status === 'Dispatched' && (
                      <div className="queue-status payment-instruction">
                        <strong>Your order is dispatched and will be delivered soon</strong>
                      </div>
                    )}

                    {o.status === 'Confirmed' && o.mode !== 'Adult' && (
                      <div className="queue-status payment-instruction">
                        <strong>Payment needed for preparation</strong>
                        {o.paymentRecipientName &&
                        o.paymentRecipientClass &&
                        o.paymentRecipientSection ? (
                          <p>
                            Please pay {da(o.price)} to <b>{o.paymentRecipientName}</b>, Class{' '}
                            <b>{o.paymentRecipientClass}</b>, Section{' '}
                            <b>{o.paymentRecipientSection}</b> for preparation of your order.
                          </p>
                        ) : (
                          <p>
                            Your order is confirmed. Payment recipient details will appear here when
                            the owner adds them.
                          </p>
                        )}
                      </div>
                    )}

                    {o.queuePosition !== null && o.queuePosition !== undefined ? (
                      <div className="queue-status">
                        <strong>
                          {o.peopleAhead === 0
                            ? 'You are next in line!'
                            : `${o.peopleAhead} people are ahead of you`}
                        </strong>
                        <p>
                          Your queue position is #{o.queuePosition}. Refresh to see the latest
                          status.
                        </p>
                      </div>
                    ) : (
                      <div className="queue-status">
                        <strong>
                          {o.status === 'Completed' ? 'Order completed!' : 'Order cancelled'}
                        </strong>
                        <p>This order is no longer in the active queue.</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <button className="back-link center-link" onClick={() => setPage('home')}>
              <ArrowLeft size={16} /> Back to shop
            </button>
            <p className="fine-print">
              Order history is linked to this browser on this device. Clearing browser data or using another device/browser may make these orders unavailable here.
            </p>
          </section>
        )}

        {/* OWNER LOGIN VIEW */}
        {page === 'ownerLogin' && (
          <section className="login-wrap">
            <div className="login-card">
              <div className="login-icon">
                <ShieldCheck size={26} />
              </div>
              <span className="eyebrow">PRIVATE AREA</span>
              <h1>Welcome, owner.</h1>
              <p>Enter your owner PIN to manage toys and customer orders.</p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  verifyOwnerLogin();
                }}
              >
                <label>
                  Owner PIN
                  <input
                    type="password"
                    value={ownerPin}
                    onChange={(e) => setOwnerPin(e.target.value)}
                    placeholder="Enter your PIN"
                    required
                    autoComplete="current-password"
                  />
                </label>
                {errorMessage && <p className="error-msg">{errorMessage}</p>}
                <button className="primary-btn full-btn" disabled={loading}>
                  {loading ? 'Checking…' : 'Open dashboard'} <ArrowLeft size={16} />
                </button>
              </form>
              <button
                className="back-link center-link"
                onClick={() => {
                  setPage('home');
                  setErrorMessage('');
                }}
              >
                <ArrowLeft size={16} /> Back to shop
              </button>
            </div>
          </section>
        )}

        {/* OWNER DASHBOARD VIEW */}
        {page === 'owner' && (
          <section className="owner-dashboard">
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">OWNER WORKSPACE</span>
                <h1>Your dashboard.</h1>
                <p>Manage the toy shelf and keep track of orders.</p>
              </div>
              <div className="dashboard-heading-actions">
                <button
                  className="secondary-btn refresh-btn"
                  onClick={() => void refreshOwnerDashboard()}
                  disabled={isRefreshing}
                >
                  <RefreshCw size={16} className={isRefreshing ? 'refresh-spinning' : ''} />
                  {isRefreshing ? 'Refreshing…' : 'Refresh dashboard'}
                </button>
                <button
                  className="secondary-btn"
                  onClick={() => {
                    setPage('home');
                    setOwnerPin('');
                  }}
                >
                  Exit owner area
                </button>
              </div>
            </div>

            <div className="stats-row">
              <div
                className="stat-card"
                onClick={() => setOwnerTab('products')}
                style={{ cursor: 'pointer' }}
                title="View live toys"
              >
                <span>Live toys</span>
                <strong>{products.filter((p) => p.available !== false).length}</strong>
                <Store size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('drafts')}
                style={{ cursor: 'pointer' }}
                title="View draft products"
              >
                <span>Draft products</span>
                <strong>{products.filter((p) => p.available === false).length}</strong>
                <FileText size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('orders')}
                style={{ cursor: 'pointer' }}
                title="View orders"
              >
                <span>Total orders</span>
                <strong>{ownerOrders.length}</strong>
                <PackageCheck size={20} />
              </div>
              <div
                className="stat-card"
                onClick={() => setOwnerTab('orders')}
                style={{ cursor: 'pointer' }}
                title="View orders needing follow-up"
              >
                <span>To follow up</span>
                <strong>{ownerOrders.filter((o) => o.status === 'New').length}</strong>
                <Store size={20} />
              </div>
            </div>

            <div className="dashboard-tabs">
              <button
                className={ownerTab === 'products' ? 'active' : ''}
                onClick={() => setOwnerTab('products')}
              >
                Products ({products.filter((p) => p.available !== false).length})
              </button>
              <button
                className={ownerTab === 'drafts' ? 'active' : ''}
                onClick={() => setOwnerTab('drafts')}
              >
                Drafts ({products.filter((p) => p.available === false).length})
              </button>
              <button
                className={ownerTab === 'orders' ? 'active' : ''}
                style={{ position: 'relative' }}
                onClick={() => {
                  setOwnerTab('orders');
                  loadOwnerOrders();
                }}
              >
                Orders ({ownerOrders.length})
                {hasOwnerOrderNotification && (
                  <span
                    className="blinking-green-dot"
                    style={{ top: '6px', right: '8px' }}
                    title="New order request received!"
                  />
                )}
              </button>
              <button
                className={ownerTab === 'suggestions' ? 'active' : ''}
                onClick={() => {
                  setOwnerTab('suggestions');
                  loadOwnerSuggestions();
                }}
              >
                Suggestions ({ownerSuggestions.length})
              </button>
              <button
                className={ownerTab === 'sections' ? 'active' : ''}
                onClick={() => {
                  setOwnerTab('sections');
                  loadShopModes();
                }}
              >
                Shop sections
              </button>
              <button
                className={ownerTab === 'payment' ? 'active' : ''}
                onClick={() => {
                  setOwnerTab('payment');
                  loadPaymentQr();
                }}
              >
                Payment QR
              </button>
            </div>

            {successMessage && <p className="success-msg">{successMessage}</p>}
            {errorMessage && <p className="error-msg">{errorMessage}</p>}

            {/* SECTIONS TAB */}
            {ownerTab === 'sections' && (
              <div className="panel-form add-form">
                <span className="eyebrow">CUSTOMER VISIBILITY</span>
                <h2>Adult and Child sections</h2>
                <p>
                  Keep a section in Draft to hide it from the customer home screen without deleting its settings, products, or order history.
                </p>
                <label className="section-publish-row">
                  <input
                    type="checkbox"
                    checked={adultPublished}
                    onChange={(e) => setAdultPublished(e.target.checked)}
                  />
                  <span>
                    <strong>Adult section</strong>
                    <small>
                      {adultPublished ? 'Published — customers can open it' : 'Draft — hidden from customers'}
                    </small>
                  </span>
                </label>
                <label className="section-publish-row">
                  <input
                    type="checkbox"
                    checked={childPublished}
                    onChange={(e) => setChildPublished(e.target.checked)}
                  />
                  <span>
                    <strong>Child section</strong>
                    <small>
                      {childPublished ? 'Published — customers can open it' : 'Draft — hidden from customers'}
                    </small>
                  </span>
                </label>
                {!adultPublished && !childPublished && (
                  <p className="fine-print">
                    Both sections are in Draft. Customers will see a temporary-unavailable message.
                  </p>
                )}
                <button
                  className="primary-btn full-btn"
                  disabled={loading}
                  onClick={() => void saveShopModes()}
                >
                  {loading ? 'Saving…' : 'Save section settings'}
                </button>
              </div>
            )}

            {/* PRODUCTS TAB */}
            {ownerTab === 'products' && (
              <div className="manage-layout">
                <form className="panel-form add-form" onSubmit={handleProductSubmit}>
                  <span className="eyebrow">{editingProductId ? 'UPDATE LISTING' : 'NEW ARRIVAL'}</span>
                  <h2>{editingProductId ? 'Edit toy details' : 'Add a toy'}</h2>
                  <label>
                    Toy name
                    <input
                      value={productForm.name}
                      onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                      placeholder="e.g. Mini race car"
                      required
                      maxLength={100}
                    />
                  </label>
                  <label>
                    Price (₹)
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={productForm.price}
                      onChange={(e) => setProductForm({ ...productForm, price: e.target.value })}
                      placeholder="e.g. 150"
                      required
                    />
                  </label>
                  <label>
                    Category
                    <input
                      value={productForm.category}
                      onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                      placeholder="e.g. Cars, Dolls, Puzzles"
                      maxLength={50}
                    />
                    <small>Leave blank to use the Other category.</small>
                  </label>
                  <label>
                    Description (optional)
                    <textarea
                      value={productForm.description}
                      onChange={(e) =>
                        setProductForm({ ...productForm, description: e.target.value })
                      }
                      placeholder="Tell customers about the toy"
                      maxLength={250}
                    />
                  </label>

                  {!editingProductId && (
                    <label className="upload-box">
                      <span className="upload-symbol">＋</span>
                      <strong>
                        {productImages.length
                          ? `${productImages.length}/5 photos selected — tap to add more`
                          : 'Choose toy pictures'}
                      </strong>
                      <small>
                        You can select photos together or add them one at a time. Up to 5 JPG, PNG or WebP photos · max 1 MB each
                      </small>
                      {productImages.length > 0 && (
                        <span className="selected-file-names">
                          {productImages.map((f) => f.name).join(' · ')}
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          const merged = [...productImages];
                          for (const f of files) {
                            if (
                              !merged.some(
                                (m) =>
                                  m.name === f.name &&
                                  m.size === f.size &&
                                  m.lastModified === f.lastModified
                              )
                            ) {
                              merged.push(f);
                            }
                          }
                          if (merged.length > 5) {
                            setErrorMessage('Please choose no more than 5 photos in total.');
                          } else if (merged.some((f) => f.size > 1024 * 1024)) {
                            setErrorMessage('Each photo must be smaller than 1 MB.');
                          } else {
                            setErrorMessage('');
                            setProductImages(merged);
                          }
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                  )}

                  <div className="product-save-actions">
                    <button
                      type="submit"
                      name="visibility"
                      value="published"
                      className="primary-btn full-btn"
                      disabled={loading}
                    >
                      {loading
                        ? 'Saving…'
                        : editingProductId
                        ? 'Save changes & publish'
                        : 'Publish product'}
                    </button>
                    <button
                      type="submit"
                      name="visibility"
                      value="draft"
                      className="secondary-btn full-btn"
                      disabled={loading}
                    >
                      {loading ? 'Saving…' : 'Save as draft'}
                    </button>
                  </div>

                  {editingProductId && (
                    <button
                      type="button"
                      className="secondary-btn full-btn"
                      onClick={cancelEditProduct}
                    >
                      Cancel editing
                    </button>
                  )}
                </form>

                <div className="manage-products">
                  <div className="manage-title">
                    <h2>Your toys</h2>
                    <span>
                      {products.filter((p) => p.available !== false).length} published ·{' '}
                      {products.filter((p) => p.available === false).length} drafts
                    </span>
                  </div>

                  <div className="filter-pills">
                    <button
                      type="button"
                      className={`filter-pill ${productFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setProductFilter('all')}
                    >
                      All ({products.length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${productFilter === 'published' ? 'active' : ''}`}
                      onClick={() => setProductFilter('published')}
                    >
                      Published ({products.filter((p) => p.available !== false).length})
                    </button>
                    <button
                      type="button"
                      className={`filter-pill ${productFilter === 'drafts' ? 'active' : ''}`}
                      onClick={() => setProductFilter('drafts')}
                    >
                      Drafts ({products.filter((p) => p.available === false).length})
                    </button>
                  </div>

                  {products.filter((p) => {
                    if (productFilter === 'published') return p.available !== false;
                    if (productFilter === 'drafts') return p.available === false;
                    return true;
                  }).length === 0 ? (
                    <div className="mini-empty">
                      {productFilter === 'drafts'
                        ? 'No toys currently in draft.'
                        : 'Your products will appear here.'}
                    </div>
                  ) : (
                    products
                      .filter((p) => {
                        if (productFilter === 'published') return p.available !== false;
                        if (productFilter === 'drafts') return p.available === false;
                        return true;
                      })
                      .map((p) => {
                        const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                        return (
                          <div className="manage-item" key={p.id}>
                            <div className="manage-thumb">
                              {firstImg ? <img src={firstImg} alt="" /> : '🧸'}
                            </div>
                            <div className="manage-item-text">
                              <strong>{p.name}</strong>
                              <span>
                                {da(p.price)} · {p.category || 'Other'}
                              </span>
                              <span
                                className={
                                  p.available === false
                                    ? 'product-status draft-status'
                                    : 'product-status published-status'
                                }
                              >
                                {p.available === false
                                  ? 'Draft · hidden from customers'
                                  : 'Published · visible to customers'}
                              </span>
                            </div>
                            <button
                              className="secondary-btn product-visibility-btn"
                              onClick={() => void toggleProductVisibility(p)}
                            >
                              {p.available === false ? 'Publish' : 'Unpublish'}
                            </button>
                            <button
                              className="icon-btn"
                              aria-label={`Edit ${p.name}`}
                              title="Edit toy details"
                              onClick={() => startEditProduct(p)}
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              className="icon-btn danger"
                              aria-label={`Delete ${p.name}`}
                              onClick={() => void deleteProduct(p.id)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}

            {/* DRAFTS TAB - DEDICATED SEPARATE SECTION FOR DRAFT PRODUCTS */}
            {ownerTab === 'drafts' && (
              <div className="drafts-section">
                <div className="drafts-section-header">
                  <div>
                    <span className="eyebrow">UNPUBLISHED ITEMS</span>
                    <h2>Draft Products ({products.filter((p) => p.available === false).length})</h2>
                    <p>
                      These toys are saved as drafts and hidden from customers.
                      You can review, edit details, or publish them to make them live in your shop.
                    </p>
                  </div>
                  <button
                    className="primary-btn"
                    onClick={() => {
                      setEditingProductId(null);
                      setProductForm({ name: '', price: '', description: '', category: '' });
                      setProductImages([]);
                      setOwnerTab('products');
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    + Add new toy
                  </button>
                </div>

                {products.filter((p) => p.available === false).length === 0 ? (
                  <div className="empty-state" style={{ margin: '20px 0' }}>
                    <div className="empty-icon">📝</div>
                    <h3>No products in draft</h3>
                    <p>
                      All your toys are currently live in the shop! When you create a toy and click
                      &quot;Save as draft&quot; or unpublish a live toy, it will appear in this dedicated section.
                    </p>
                    <button
                      className="secondary-btn"
                      onClick={() => setOwnerTab('products')}
                    >
                      Go to Products
                    </button>
                  </div>
                ) : (
                  <div className="draft-products-grid">
                    {products
                      .filter((p) => p.available === false)
                      .map((p) => {
                        const firstImg = (p.imageUrls && p.imageUrls[0]) || p.imageUrl;
                        return (
                          <div className="draft-card" key={p.id}>
                            <div className="draft-card-image">
                              {firstImg ? (
                                <img src={firstImg} alt={p.name} />
                              ) : (
                                <span style={{ fontSize: '60px' }}>🧸</span>
                              )}
                              <span className="draft-badge-pill">Draft</span>
                            </div>
                            <div className="draft-card-content">
                              <span className="draft-category">{p.category || 'Other'}</span>
                              <h3>{p.name}</h3>
                              {p.description && <p className="draft-desc">{p.description}</p>}
                              <strong className="draft-price">{da(p.price)}</strong>
                              <div className="draft-card-actions">
                                <button
                                  className="primary-btn publish-now-btn"
                                  onClick={() => void toggleProductVisibility(p)}
                                  title="Make this toy visible to all customers"
                                >
                                  Publish to shop
                                </button>
                                <button
                                  className="secondary-btn"
                                  onClick={() => {
                                    startEditProduct(p);
                                    setOwnerTab('products');
                                  }}
                                  title="Edit toy details"
                                >
                                  <Pencil size={15} /> Edit
                                </button>
                                <button
                                  className="icon-btn danger"
                                  onClick={() => void deleteProduct(p.id)}
                                  title="Delete draft"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* ORDERS TAB */}
            {ownerTab === 'orders' && (
              <>
                <div className="dashboard-tabs order-filters">
                  <button
                    className={orderStatusFilter === 'Pending' ? 'active' : ''}
                    onClick={() => setOrderStatusFilter('Pending')}
                  >
                    Pending (
                    {
                      ownerOrders.filter(
                        (o) => !['Completed', 'Cancelled'].includes(o.status)
                      ).length
                    }
                    )
                  </button>
                  <button
                    className={orderStatusFilter === 'Completed' ? 'active' : ''}
                    onClick={() => setOrderStatusFilter('Completed')}
                  >
                    Completed ({ownerOrders.filter((o) => o.status === 'Completed').length})
                  </button>
                  <button
                    className={orderStatusFilter === 'Cancelled' ? 'active' : ''}
                    onClick={() => setOrderStatusFilter('Cancelled')}
                  >
                    Cancelled ({ownerOrders.filter((o) => o.status === 'Cancelled').length})
                  </button>
                </div>

                <div className="orders-list">
                  {ownerOrders.filter((o) =>
                    orderStatusFilter === 'Pending'
                      ? !['Completed', 'Cancelled'].includes(o.status)
                      : o.status === orderStatusFilter
                  ).length === 0 ? (
                    <div className="empty-state compact">
                      <div className="empty-icon">📦</div>
                      <h3>
                        {orderStatusFilter === 'Pending'
                          ? 'No pending orders'
                          : `No ${orderStatusFilter.toLowerCase()} orders`}
                      </h3>
                      <p>Orders will appear here when their status matches this section.</p>
                    </div>
                  ) : (
                    ownerOrders
                      .filter((o) =>
                        orderStatusFilter === 'Pending'
                          ? !['Completed', 'Cancelled'].includes(o.status)
                          : o.status === orderStatusFilter
                      )
                      .map((o) => (
                        <article className="order-card" key={o.id}>
                          {o.productImageUrl && (
                            <div className="order-product-preview">
                              <img src={o.productImageUrl} alt={o.productName} />
                            </div>
                          )}
                          <div className="order-mode-label">{o.mode || 'Child'} order</div>
                          <div className="order-top">
                            <div>
                              <span className="order-id">ORDER · {o.orderNumber || o.id.slice(0, 8)}</span>
                              <h3>{o.productName}</h3>
                            </div>
                            <strong>{da(o.price)}</strong>
                          </div>

                          <div className="order-details">
                            <span>
                              <b>Student</b>
                              {o.name}
                            </span>
                            <span>
                              <b>Class</b>
                              {o.studentClass}
                            </span>
                            {o.mode === 'Adult' ? (
                              <>
                                <span>
                                  <b>Phone</b>
                                  {o.phone || 'Not provided'}
                                </span>
                                <span>
                                  <b>Delivery address</b>
                                  {o.address || 'Not provided'}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>
                                  <b>Class</b>
                                  {o.studentClass}
                                </span>
                                <span>
                                  <b>Section</b>
                                  {o.section}
                                </span>
                              </>
                            )}
                            <span>
                              <b>Placed</b>
                              {new Date(o.createdAt).toLocaleDateString('en-IN')}
                            </span>
                            <span>
                              <b>Queue</b>
                              {o.queuePosition ? `#${o.queuePosition} · ${o.peopleAhead} ahead` : 'Finished'}
                            </span>
                          </div>

                          {o.note && <p className="order-note">Note: {o.note}</p>}

                          <label className="status-select">
                            Order status
                            <select
                              value={o.status}
                              onChange={(e) => void updateOrderStatus(o, e.target.value)}
                            >
                              <option>New</option>
                              <option>Confirmed</option>
                              <option>Preparing</option>
                              <option>Dispatched</option>
                              {o.status === 'Ready for pickup' && <option>Ready for pickup</option>}
                              <option>Completed</option>
                              <option>Cancelled</option>
                              {o.status === 'Contacted' && <option>Contacted</option>}
                            </select>
                          </label>

                          {o.status === 'Confirmed' && (
                            <div className="payment-recipient-fields">
                              <strong>Payment recipient (shown to customer after confirmation)</strong>
                              <label>
                                Name
                                <input
                                  value={o.paymentRecipientName || ''}
                                  onChange={(e) =>
                                    handleOrderFieldChange(o.id, 'paymentRecipientName', e.target.value)
                                  }
                                  placeholder="Recipient name"
                                  maxLength={80}
                                />
                              </label>
                              <div className="two-fields">
                                <label>
                                  Class
                                  <input
                                    value={o.paymentRecipientClass || ''}
                                    onChange={(e) =>
                                      handleOrderFieldChange(o.id, 'paymentRecipientClass', e.target.value)
                                    }
                                    placeholder="e.g. 8"
                                    maxLength={30}
                                  />
                                </label>
                                <label>
                                  Section
                                  <input
                                    value={o.paymentRecipientSection || ''}
                                    onChange={(e) =>
                                      handleOrderFieldChange(o.id, 'paymentRecipientSection', e.target.value)
                                    }
                                    placeholder="e.g. A"
                                    maxLength={30}
                                  />
                                </label>
                              </div>
                              <button
                                className="secondary-btn"
                                onClick={() => void savePaymentRecipient(o)}
                              >
                                Save payment recipient
                              </button>
                            </div>
                          )}

                          <div className="payment-recipient-fields owner-note-fields">
                            <strong>Note to customer</strong>
                            <label>
                              Message
                              <textarea
                                value={o.ownerNote || ''}
                                onChange={(e) => handleOwnerNoteChange(o.id, e.target.value)}
                                placeholder="Write an update or instructions for the customer…"
                                maxLength={500}
                                rows={3}
                              />
                            </label>
                            <button className="secondary-btn" onClick={() => void saveOwnerNote(o)}>
                              Save customer note
                            </button>
                          </div>

                          {['Completed', 'Cancelled'].includes(o.status) && (
                            <button className="secondary-btn" onClick={() => void deleteOldOrder(o)}>
                              <Trash2 size={16} /> Delete old order
                            </button>
                          )}
                        </article>
                      ))
                  )}
                </div>
              </>
            )}

            {/* SUGGESTIONS TAB */}
            {ownerTab === 'suggestions' && (
              <section className="suggestions-owner-panel">
                <div className="manage-title">
                  <h2>Customer suggestions</h2>
                  <button className="secondary-btn" onClick={() => void loadOwnerSuggestions()}>
                    Refresh
                  </button>
                </div>

                {ownerSuggestions.length === 0 ? (
                  <div className="empty-state compact">
                    <div className="empty-icon">💡</div>
                    <h3>No suggestions yet</h3>
                    <p>Customer ideas will appear here after they submit them.</p>
                  </div>
                ) : (
                  <div className="suggestions-list">
                    {ownerSuggestions.map((s) => (
                      <article className="suggestion-card" key={s.id}>
                        <p>{s.suggestion}</p>
                        <div className="suggestion-card-footer">
                          <span>{new Date(s.createdAt).toLocaleString('en-IN')}</span>
                          <button
                            className="secondary-btn"
                            onClick={() => void deleteSuggestion(s)}
                            aria-label="Delete suggestion"
                          >
                            <Trash2 size={16} /> Delete
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* PAYMENT QR TAB */}
            {ownerTab === 'payment' && (
              <section className="payment-qr-panel">
                <span className="eyebrow">ADULT CHECKOUT</span>
                <h2>Adult payment QR code</h2>
                <p>Upload or replace the QR code customers see while an Adult order is New.</p>
                {paymentQrUrl ? (
                  <img
                    className="payment-qr-image owner-qr-preview"
                    src={paymentQrUrl}
                    alt="Current Adult payment QR code"
                  />
                ) : (
                  <div className="qr-empty">No QR code uploaded yet.</div>
                )}
                <label className="upload-box">
                  <span className="upload-symbol">＋</span>
                  <strong>{qrFile ? qrFile.name : 'Choose QR code image'}</strong>
                  <small>JPG, PNG or WebP · under 1 MB</small>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => setQrFile(e.currentTarget.files?.[0] || null)}
                  />
                </label>
                <button
                  className="primary-btn"
                  onClick={() => void savePaymentQr()}
                  disabled={loading || !qrFile}
                >
                  {loading ? 'Saving QR…' : paymentQrUrl ? 'Replace QR code' : 'Save QR code'}
                </button>
              </section>
            )}

          </section>
        )}
      </main>

      {/* Gallery Modal Dialog */}
      {galleryProduct && (
        <div className="gallery-overlay" role="presentation" onClick={() => setGalleryProduct(null)}>
          <section
            className="gallery-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`${galleryProduct.name} photo gallery`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="gallery-close"
              type="button"
              aria-label="Close gallery"
              onClick={() => setGalleryProduct(null)}
            >
              <X size={22} />
            </button>

            {(() => {
              const urls =
                galleryProduct.imageUrls && galleryProduct.imageUrls.length
                  ? galleryProduct.imageUrls
                  : galleryProduct.imageUrl
                  ? [galleryProduct.imageUrl]
                  : [];
              const navigatePhoto = (delta: number) => {
                if (urls.length > 1) {
                  setGalleryImageIndex((prev) => (prev + delta + urls.length) % urls.length);
                }
              };

              return (
                <>
                  <div
                    className="gallery-viewer"
                    onTouchStart={(e) => setTouchStartX(e.touches[0]?.clientX ?? null)}
                    onTouchEnd={(e) => {
                      if (touchStartX !== null && e.changedTouches[0]) {
                        const diff = e.changedTouches[0].clientX - touchStartX;
                        if (Math.abs(diff) > 45) {
                          navigatePhoto(diff < 0 ? 1 : -1);
                        }
                      }
                      setTouchStartX(null);
                    }}
                  >
                    {urls.length ? (
                      <img
                        src={urls[galleryImageIndex] || urls[0]}
                        alt={`${galleryProduct.name}, photo ${galleryImageIndex + 1}`}
                        decoding="async"
                        fetchPriority="high"
                      />
                    ) : (
                      <div className="gallery-placeholder">🧸</div>
                    )}
                    {urls.length > 1 && (
                      <>
                        <button
                          className="gallery-arrow gallery-prev"
                          type="button"
                          aria-label="Previous photo"
                          onClick={() => navigatePhoto(-1)}
                        >
                          <ChevronLeft size={25} />
                        </button>
                        <button
                          className="gallery-arrow gallery-next"
                          type="button"
                          aria-label="Next photo"
                          onClick={() => navigatePhoto(1)}
                        >
                          <ChevronRight size={25} />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="gallery-details">
                    <div className="gallery-counter">
                      PHOTO {galleryImageIndex + 1} OF {Math.max(urls.length, 1)}
                    </div>
                    <h2>{galleryProduct.name}</h2>
                    <p>{galleryProduct.description || 'A fun new friend for playtime.'}</p>
                    <div className="gallery-footer">
                      <strong>{da(galleryProduct.price)}</strong>
                      <button
                        className="primary-btn"
                        type="button"
                        onClick={() => {
                          setSelectedProductForBuy(galleryProduct);
                          setGalleryProduct(null);
                          setErrorMessage('');
                          setPage('buy');
                        }}
                      >
                        Buy now <ArrowLeft size={16} />
                      </button>
                    </div>
                    {urls.length > 1 && (
                      <p className="gallery-swipe-hint">Swipe left or right to see more photos</p>
                    )}
                  </div>
                </>
              );
            })()}
          </section>
        </div>
      )}

      {/* Footer */}
      <footer>
        <div className="footer-brand">
          <span className="brand-icon">
            <img
              className="brand-logo"
              src="/resources/toynest-logo.png"
              alt=""
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <Boxes size={18} />
          </span>{' '}
          ToyNest
        </div>
        <p>
          Made for little moments of happiness. <span>✦</span>
        </p>
        <button
          onClick={() => {
            setPage('ownerLogin');
            setErrorMessage('');
          }}
        >
          Owner access
        </button>
      </footer>
    </div>
  );
}
