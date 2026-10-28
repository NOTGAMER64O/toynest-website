export interface Product {
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

export interface Order {
  id: string;
  orderNumber: string;
  customerId: string;
  mode: 'Child' | 'Adult';
  productId: string;
  productName: string;
  productImageUrl: string;
  price: number;
  quantity?: number;
  unitPrice?: number;
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
  queuePosition?: number | null;
  peopleAhead?: number;
  colour?: string;
  customerDeleted?: boolean;
  isRescueDeal?: boolean;
  rescueDealId?: string;
  rescueCondition?: string;
}

export interface Suggestion {
  id: string;
  suggestion: string;
  createdAt: string;
}

export interface RescueDeal {
  id: string;
  productId?: string;
  title: string;
  originalPrice: number;
  dealPrice: number;
  condition: string;
  description: string;
  imageUrl: string;
  imageUrls?: string[];
  claimed: boolean;
  status: 'available' | 'claimed';
  claimedAt?: string;
  claimedByOrder?: string;
  claimedByCustomer?: string;
  createdAt: string;
}

export const DEFAULT_OWNER_PIN = 'ANAND1904';

export const DEFAULT_RESCUE_DEALS: RescueDeal[] = [
  {
    id: "deal_spider_noir_special",
    productId: "78291ec9-cf52-4df8-ab72-7d4c0ab2d082",
    title: "Spider-Noir Sitting on Ledge Figure (Open Box Special)",
    originalPrice: 79,
    dealPrice: 49,
    condition: "Open Box - Single piece only",
    description: "Display showcase unit in pristine mint condition. Box opened for inspection. Only 1 available at this special rescue price!",
    imageUrl: "/toys/toy-78291ec9-1.jpg",
    imageUrls: ["/toys/toy-78291ec9-1.jpg", "/toys/toy-78291ec9-2.jpg"],
    claimed: false,
    status: "available",
    createdAt: "2026-10-20T10:00:00.000Z"
  },
  {
    id: "deal_roman_battleship_clearance",
    productId: "8b48e410-debe-4755-a99b-8915fcb5b939",
    title: "Roman Battleship Kit Card (Clearance Deal)",
    originalPrice: 69,
    dealPrice: 39,
    condition: "Last unit - special clearance",
    description: "Complete unbuilt kit card. Packaging has slight transit crease, contents 100% brand new and pristine.",
    imageUrl: "/toys/toy-8b48e410-1.jpg",
    imageUrls: ["/toys/toy-8b48e410-1.jpg", "/toys/toy-8b48e410-2.jpg"],
    claimed: false,
    status: "available",
    createdAt: "2026-10-20T10:05:00.000Z"
  }
];

export const DEFAULT_PRODUCTS: Product[] = [
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
