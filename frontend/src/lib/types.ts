export type CatalogCategory = "basket" | "mat" | "duvet" | string;

export interface PriceCatalogItem {
  id: string;
  category: string;
  variant: string;
  price: number;
  active: boolean;
  description?: string | null;
  sizeLabel?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  badge?: string | null;
  displayOrder?: number;
  categoryDescription?: string | null;
  effectiveFrom?: string | Date | null;
  version?: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export type BookingStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PICKED_UP"
  | "WASHING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type PaymentStatus = "UNPAID" | "PAID" | "PAY_ON_DELIVERY" | "PENDING";

export interface SelectedLocation {
  lat: number;
  lng: number;
  addressText: string;
  landmark?: string;
  label: string;
}

export interface BookingItemSnapshot {
  id?: string;
  catalogId: string;
  categorySnapshot?: string;
  variantSnapshot: string;
  unitPriceSnapshot: number;
  qty: number;
  subtotal: number;
}

export interface Booking {
  id: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  customerBlocked?: boolean;
  addressId: string;
  addressText?: string;
  landmark?: string;
  lat?: string | number;
  lng?: string | number;
  status: BookingStatus;
  pickupWindow: string;
  notes?: string | null;
  totalAmount: number;
  tipAmount?: number;
  paymentStatus: PaymentStatus;
  posterSrc?: string | null;
  createdAt: string;
  updatedAt?: string;
  items?: BookingItemSnapshot[];
  customer?: {
    id: string;
    name: string;
    phone: string;
    email?: string;
  };
  address?: {
    id: string;
    addressText: string;
    landmark?: string;
    lat: string | number;
    lng: string | number;
  };
}

export interface UserSession {
  id: string;
  name: string;
  username?: string;
  businessName?: string;
  phone?: string;
  email?: string;
  role: "customer" | "client" | "admin";
}

export interface Voucher {
  id: string;
  code: string;
  source: "referral" | "loyalty" | "admin_grant";
  status: "available" | "reserved" | "redeemed" | "expired" | "voided";
  capDefinition: string;
  maxDiscountKes: number;
  discountCap?: number;
  expiresAt: string;
  redeemedAt?: string | null;
  updatedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
}

export interface SavedAddress {
  id: string;
  userId: string;
  label: string;
  lat: number;
  lng: number;
  addressText: string;
  landmark?: string | null;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  type: "service" | "tip";
  provider: string;
  providerRef: string;
  amount: number;
  status: "PENDING" | "COMPLETED" | "FAILED";
  createdAt: string;
  bookingStatus?: string;
  bookingTotal?: number;
}
