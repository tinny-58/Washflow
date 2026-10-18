import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  doublePrecision,
  jsonb,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["customer", "admin"]);
export const catalogCategoryEnum = pgEnum("catalog_category", ["basket", "mat", "duvet"]);
export const bookingStatusEnum = pgEnum("booking_status", [
  "PENDING",
  "CONFIRMED",
  "PICKED_UP",
  "WASHING",
  "READY",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
]);
export const paymentTypeEnum = pgEnum("payment_type", ["service", "tip"]);
export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "COMPLETED", "FAILED"]);
export const bookingPaymentStatusEnum = pgEnum("booking_payment_status", [
  "UNPAID",
  "PAID",
  "PAY_ON_DELIVERY",
]);
export const notificationChannelEnum = pgEnum("notification_channel", ["app", "whatsapp", "email"]);
export const notificationStatusEnum = pgEnum("notification_status", ["PENDING", "SENT", "FAILED"]);

// 1. users
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone").notNull().unique(),
    email: text("email"),
    passwordHash: text("password_hash"),
    totpSecret: text("totp_secret"),
    role: userRoleEnum("role").notNull().default("customer"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    isBlocked: boolean("is_blocked").notNull().default(false),
    deviceFingerprint: text("device_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_phone_idx").on(table.phone),
    index("users_role_idx").on(table.role),
  ]
);

// 2. addresses
export const addresses = pgTable(
  "addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull().default("Home"), // Home, Office, Landmark, etc.
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    addressText: text("address_text").notNull(),
    landmark: text("landmark"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("addresses_user_idx").on(table.userId),
  ]
);

// 3. price_catalog
export const priceCatalog = pgTable(
  "price_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: catalogCategoryEnum("category").notNull(),
    variant: text("variant").notNull(), // small, large, 3x5, 4x6, etc.
    price: integer("price").notNull(), // price in KES
    active: boolean("active").notNull().default(true),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("price_catalog_category_idx").on(table.category),
    index("price_catalog_active_idx").on(table.active),
  ]
);

// 4. bookings
export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: uuid("customer_id").notNull().references(() => users.id),
    addressId: uuid("address_id").notNull().references(() => addresses.id),
    pickupWindow: text("pickup_window").notNull(), // e.g. "Morning (8am - 11am)", "Afternoon (1pm - 4pm)"
    notes: text("notes"),
    status: bookingStatusEnum("status").notNull().default("PENDING"),
    subtotal: integer("subtotal").notNull(),
    tipAmount: integer("tip_amount").notNull().default(0),
    total: integer("total").notNull(),
    paymentStatus: bookingPaymentStatusEnum("payment_status").notNull().default("UNPAID"),
    deviceFingerprint: text("device_fingerprint").notNull(),
    ipHash: text("ip_hash").notNull(),
    posterSrc: text("poster_src"), // e.g. "poster-cbd-01"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bookings_customer_idx").on(table.customerId),
    index("bookings_status_idx").on(table.status),
    index("bookings_created_idx").on(table.createdAt),
    index("bookings_device_fingerprint_idx").on(table.deviceFingerprint),
  ]
);

// 5. booking_items
export const bookingItems = pgTable(
  "booking_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    catalogId: uuid("catalog_id").notNull().references(() => priceCatalog.id),
    qty: integer("qty").notNull(),
    unitPriceSnapshot: integer("unit_price_snapshot").notNull(), // NEVER mutate this
  },
  (table) => [
    index("booking_items_booking_idx").on(table.bookingId),
  ]
);

// 6. payments
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id),
    type: paymentTypeEnum("type").notNull().default("service"), // service | tip
    provider: text("provider").notNull().default("mpesa"), // mpesa | cash | stripe
    providerRef: text("provider_ref").notNull().unique(), // Daraja CheckoutRequestID or Transaction ID
    amount: integer("amount").notNull(),
    status: paymentStatusEnum("status").notNull().default("PENDING"),
    rawCallbackJson: jsonb("raw_callback_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("payments_booking_idx").on(table.bookingId),
    uniqueIndex("payments_provider_ref_idx").on(table.providerRef),
  ]
);

// 7. ratings
export const ratings = pgTable(
  "ratings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
    stars: integer("stars").notNull(), // 1 - 5
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("ratings_booking_unique_idx").on(table.bookingId),
  ]
);

// 8. notifications
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(), // e.g. "new_booking_admin", "status_update_customer"
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    channel: notificationChannelEnum("channel").notNull(), // app | whatsapp | email
    status: notificationStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_status_idx").on(table.status),
    index("notifications_booking_idx").on(table.bookingId),
  ]
);

// 9. audit_log
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_log_entity_idx").on(table.entity, table.entityId),
    index("audit_log_created_idx").on(table.createdAt),
  ]
);

// 10. otp_verifications (Phone OTP authentication)
export const otpVerifications = pgTable(
  "otp_verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("otp_phone_idx").on(table.phone),
  ]
);

// 11. rate_limits (Fallback store when Redis is unavailable)
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("rate_limits_expires_idx").on(table.expiresAt),
  ]
);

// Type Exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type PriceCatalogItem = typeof priceCatalog.$inferSelect;
export type NewPriceCatalogItem = typeof priceCatalog.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingItem = typeof bookingItems.$inferSelect;
export type NewBookingItem = typeof bookingItems.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
export type Rating = typeof ratings.$inferSelect;
export type NewRating = typeof ratings.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type NewAuditLogEntry = typeof auditLog.$inferInsert;
