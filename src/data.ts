export type Order = {
  id: number;
  customer: string;
  items: { sku: string; qty: number }[];
  total: number;
  status: "pending" | "shipped" | "delivered";
  date: string;
  carrier?: string;
};
export type Product = { sku: string; name: string; price: number; stock: number; supplier: string };

const today = new Date();
const daysAgo = (n: number) => new Date(today.getTime() - n * 864e5).toISOString().slice(0, 10);

export const products: Product[] = [
  { sku: "TEE-BLK-M", name: "Black Tee (M)", price: 1800, stock: 4, supplier: "Faisal Textiles" },
  { sku: "TEE-WHT-L", name: "White Tee (L)", price: 1800, stock: 42, supplier: "Faisal Textiles" },
  { sku: "HOOD-GRY-L", name: "Grey Hoodie (L)", price: 4200, stock: 7, supplier: "Madina Knits" },
  { sku: "CAP-NVY", name: "Navy Cap", price: 1200, stock: 3, supplier: "Madina Knits" },
  { sku: "SOCK-3PK", name: "Socks 3-Pack", price: 900, stock: 120, supplier: "Crescent Hosiery" },
];

export const orders: Order[] = [
  {
    id: 1040,
    customer: "Ayesha K.",
    items: [{ sku: "HOOD-GRY-L", qty: 1 }],
    total: 4200,
    status: "pending",
    date: daysAgo(0),
  },
  {
    id: 1041,
    customer: "Bilal R.",
    items: [
      { sku: "TEE-BLK-M", qty: 2 },
      { sku: "CAP-NVY", qty: 1 },
    ],
    total: 4800,
    status: "pending",
    date: daysAgo(0),
  },
  {
    id: 1042,
    customer: "Sana M.",
    items: [{ sku: "SOCK-3PK", qty: 3 }],
    total: 2700,
    status: "pending",
    date: daysAgo(1),
  },
  {
    id: 1043,
    customer: "Hamza T.",
    items: [{ sku: "TEE-WHT-L", qty: 1 }],
    total: 1800,
    status: "shipped",
    date: daysAgo(2),
    carrier: "TCS",
  },
  {
    id: 1044,
    customer: "Noor F.",
    items: [{ sku: "HOOD-GRY-L", qty: 2 }],
    total: 8400,
    status: "delivered",
    date: daysAgo(4),
    carrier: "Leopards",
  },
  {
    id: 1045,
    customer: "Zain A.",
    items: [{ sku: "TEE-BLK-M", qty: 3 }],
    total: 5400,
    status: "delivered",
    date: daysAgo(6),
    carrier: "TCS",
  },
];
