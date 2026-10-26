import { relations, sql } from "drizzle-orm";
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
  bigint,
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["customer", "client", "admin", "user"]);
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
export const messageStatusEnum = pgEnum("message_status", ["queued", "sent", "delivered", "read", "failed", "expired"]);
export const messagePurposeEnum = pgEnum("message_purpose", ["signup_otp", "reset_otp", "security_alert", "notification"]);
export const voucherSourceEnum = pgEnum("voucher_source", ["referral", "loyalty", "admin_grant"]);
export const voucherStatusEnum = pgEnum("voucher_status", ["available", "reserved", "redeemed", "expired", "voided"]);

// 1. users
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    phone: text("phone"),
    phoneE164: text("phone_e164").unique(),
    phoneBlindIndex: text("phone_blind_index").unique(),
    email: text("email"),
    username: text("username").unique(),
    authProvider: text("auth_provider").notNull().default("credentials"),
    googleSub: text("google_sub").unique(),
    businessName: text("business_name"),
    passwordHash: text("password_hash"),
    totpSecret: text("totp_secret"),
    role: userRoleEnum("role").notNull().default("customer"),
    phoneVerifiedAt: timestamp("phone_verified_at", { withTimezone: true }),
    isBlocked: boolean("is_blocked").notNull().default(false),
    deviceFingerprint: text("device_fingerprint"),
    referralCode: text("referral_code").unique(),
    referredBy: text("referred_by"),
    referralCount: integer("referral_count").notNull().default(0),
    referralPoints: integer("referral_points").notNull().default(0),
    loyaltyPoints: integer("loyalty_points").notNull().default(0),
    rewardPointsBalance: integer("reward_points_balance").notNull().default(0),
    whatsappNotifications: boolean("whatsapp_notifications").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("users_phone_idx").on(table.phone),
    index("users_phone_e164_idx").on(table.phoneE164),
    index("users_role_idx").on(table.role),
    uniqueIndex("users_username_lower_idx").on(sql`lower(${table.username})`),
    uniqueIndex("users_single_admin_idx").on(table.role).where(sql`${table.role} = 'admin'`),
    uniqueIndex("users_google_sub_idx").on(table.googleSub),
    uniqueIndex("users_referral_code_idx").on(table.referralCode),
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
    category: text("category").notNull(), // dynamic category string (e.g. basket, duvet, mat, etc.)
    variant: text("variant").notNull(), // item name / title
    price: integer("price").notNull(), // price in KES
    active: boolean("active").notNull().default(true),
    description: text("description"),
    sizeLabel: text("size_label"), // e.g. "Up to 7 kg", "4x6 ft", etc.
    imageUrl: text("image_url"),
    imageAlt: text("image_alt"),
    badge: text("badge"), // e.g. "Popular"
    displayOrder: integer("display_order").notNull().default(0),
    categoryDescription: text("category_description"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("price_catalog_category_idx").on(table.category),
    index("price_catalog_active_idx").on(table.active),
    index("price_catalog_display_order_idx").on(table.displayOrder),
  ]
);

// 3b. catalog_versions
export const catalogVersions = pgTable(
  "catalog_versions",
  {
    id: integer("id").primaryKey().default(1),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
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
    estimatedDeliveryAt: timestamp("estimated_delivery_at", { withTimezone: true }),
    riderPingLat: doublePrecision("rider_ping_lat"),
    riderPingLng: doublePrecision("rider_ping_lng"),
    riderPingAddress: text("rider_ping_address"),
    riderPingNotes: text("rider_ping_notes"),
    riderPingAccuracy: doublePrecision("rider_ping_accuracy"),
    riderLocationPingedAt: timestamp("rider_location_pinged_at", { withTimezone: true }),
    freeWashRedeemed: boolean("free_wash_redeemed").notNull().default(false),
    voucherId: uuid("voucher_id"),
    discountAmount: integer("discount_amount").notNull().default(0),
    catalogVersion: integer("catalog_version").default(1),
    seriesId: uuid("series_id"),
    occurrenceId: uuid("occurrence_id"),
    depositMinor: integer("deposit_minor").notNull().default(5000),
    balanceMinor: integer("balance_minor").notNull().default(0),
    isRecurring: boolean("is_recurring").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bookings_customer_idx").on(table.customerId),
    index("bookings_status_idx").on(table.status),
    index("bookings_created_idx").on(table.createdAt),
    index("bookings_device_fingerprint_idx").on(table.deviceFingerprint),
    index("bookings_series_idx").on(table.seriesId),
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
    variantSnapshot: text("variant_snapshot"),
    categorySnapshot: text("category_snapshot"),
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
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // e.g. "new_booking_admin", "status_update_customer", "points_reward", "referral"
    title: text("title"),
    message: text("message"),
    isRead: boolean("is_read").notNull().default(false),
    link: text("link"),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    channel: notificationChannelEnum("channel").notNull().default("app"), // app | whatsapp | email
    status: notificationStatusEnum("status").notNull().default("PENDING"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
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

// 11b. otp_codes (Unified secure OTP engine)
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier"), // optional legacy field
    identifierHash: text("identifier_hash").notNull(), // SHA-256(e164)
    purpose: text("purpose").notNull(), // 'signup' | 'reset_password' | 'admin_stepup'
    sessionBindingId: text("session_binding_id").notNull(), // Bound to __Host-wf_preauth
    codeHash: text("code_hash").notNull(), // HMAC-SHA256(salt + code, OTP_PEPPER)
    salt: text("salt").notNull(), // Per-record 16-byte random hex salt
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    sendCount: integer("send_count").notNull().default(1),
  },
  (table) => [
    uniqueIndex("otp_codes_active_unique_idx")
      .on(table.purpose, table.identifierHash)
      .where(sql`${table.consumedAt} IS NULL`),
    index("otp_codes_lookup_idx").on(table.identifierHash, table.purpose, table.consumedAt, table.expiresAt),
    index("otp_codes_session_idx").on(table.sessionBindingId),
  ]
);

// 11c. verification_tokens (Single-use post-OTP verified claims)
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: text("token_hash").notNull().unique(), // SHA-256 of signed token
    identifierHash: text("identifier_hash").notNull(),
    purpose: text("purpose").notNull(), // 'signup' | 'reset_password' | 'admin_stepup'
    sessionBindingId: text("session_binding_id").notNull(),
    metadata: text("metadata"), // JSON string
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verification_tokens_lookup_idx").on(table.tokenHash, table.consumedAt, table.expiresAt),
  ]
);

// 11d. sessions (Server-authoritative session store)
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sessionTokenHash: text("session_token_hash").notNull().unique(),
    refreshTokenHash: text("refresh_token_hash"),
    userAgent: text("user_agent"),
    ipHash: text("ip_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sessions_user_idx").on(table.userId, table.revokedAt),
    uniqueIndex("sessions_token_hash_idx").on(table.sessionTokenHash),
  ]
);

// 11e. wa_auth_state (Encrypted PostgreSQL auth store for Baileys)
export const waAuthState = pgTable(
  "wa_auth_state",
  {
    id: text("id").primaryKey(),
    encryptedData: text("encrypted_data").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 11f. wa_outbound_messages (Communications tracking)
export const waOutboundMessages = pgTable(
  "wa_outbound_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    otpId: uuid("otp_id").references(() => otpCodes.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    automationId: text("automation_id"),
    templateVersion: integer("template_version"),
    purpose: text("purpose").notNull(),
    recipientMasked: text("recipient_masked").notNull(),
    recipientHash: text("recipient_hash").notNull(),
    providerMessageId: text("provider_message_id").unique(),
    status: text("status").notNull().default("queued"),
    renderedBodyMasked: text("rendered_body_masked"),
    priority: text("priority").default("transactional"),
    idempotencyKey: text("idempotency_key").unique(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull().default(0),
  },
  (table) => [
    index("wa_messages_status_idx").on(table.status, table.queuedAt),
    index("wa_messages_recipient_hash_idx").on(table.recipientHash),
    index("wa_messages_scheduled_idx").on(table.status, table.scheduledFor),
  ]
);

// 11h. wa_automation_templates (PostgreSQL single source of truth for automation rules)
export const waAutomationTemplates = pgTable(
  "wa_automation_templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    recipientType: text("recipient_type").notNull(), // customer | admin
    priorityClass: text("priority_class").notNull(), // otp | transactional
    enabled: boolean("enabled").notNull().default(true),
    template: text("template").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
  }
);

// 11i. wa_automation_template_history (Audit trail & restore versions)
export const waAutomationTemplateHistory = pgTable(
  "wa_automation_template_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: text("template_id").notNull().references(() => waAutomationTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    template: text("template").notNull(),
    action: text("action").notNull(), // CREATE | UPDATE | RESTORE | RESET_DEFAULT
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
    changeSummary: text("change_summary"),
  },
  (table) => [
    index("wa_template_history_idx").on(table.templateId, table.version),
  ]
);

// 11j. order_access_tokens (128-bit unguessable scoped tokens for public tracking/rating links)
export const orderAccessTokens = pgTable(
  "order_access_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    token: text("token").notNull().unique(),
    bookingId: uuid("booking_id").notNull().references(() => bookings.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // track | rate
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("order_access_tokens_token_idx").on(table.token),
    index("order_access_tokens_booking_idx").on(table.bookingId, table.purpose),
  ]
);

// 11k. traffic_events (First-party privacy-preserving visitor and user tracking)
export const trafficEvents = pgTable(
  "traffic_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    visitorHash: text("visitor_hash").notNull(), // Daily salted hash, raw IP never stored
    customerId: uuid("customer_id").references(() => users.id, { onDelete: "set null" }),
    sessionId: text("session_id"),
    eventType: text("event_type").notNull(),
    path: text("path").notNull(),
    referrerType: text("referrer_type").notNull().default("direct"),
    campaignSource: text("campaign_source"),
    deviceClass: text("device_class"),
    neighborhood: text("neighborhood"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("traffic_events_type_created_idx").on(table.eventType, table.createdAt),
    index("traffic_events_visitor_idx").on(table.visitorHash, table.createdAt),
    index("traffic_events_customer_idx").on(table.customerId),
  ]
);

// 11l. traffic_hourly_rollups & traffic_daily_rollups
export const trafficHourlyRollups = pgTable(
  "traffic_hourly_rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hourTimestamp: timestamp("hour_timestamp", { withTimezone: true }).notNull().unique(),
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
    pageViews: integer("page_views").notNull().default(0),
    eventCounts: jsonb("event_counts").notNull().default({}),
  }
);

export const trafficDailyRollups = pgTable(
  "traffic_daily_rollups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: text("date").notNull().unique(), // YYYY-MM-DD
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
    newRegistrations: integer("new_registrations").notNull().default(0),
    funnelCounts: jsonb("funnel_counts").notNull().default({}),
    channelBreakdown: jsonb("channel_breakdown").notNull().default({}),
    deviceBreakdown: jsonb("device_breakdown").notNull().default({}),
    areaBreakdown: jsonb("area_breakdown").notNull().default({}),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 11m. customer_outbox_events (Transactional outbox for reliable Customer Directory SSE sync)
export const customerOutboxEvents = pgTable(
  "customer_outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seq: bigint("seq", { mode: "number" }),
    eventType: text("event_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    index("customer_outbox_seq_idx").on(table.seq),
  ]
);

// 11n. catalog_outbox_events (Transactional outbox for Next.js ISR cache invalidation)
export const catalogOutboxEvents = pgTable(
  "catalog_outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("catalog_outbox_status_idx").on(table.status, table.scheduledFor),
  ]
);

// 11o. consent_ledger (Append-only audit-compliant consent ledger)
export const consentLedger = pgTable(
  "consent_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").references(() => users.id, { onDelete: "set null" }),
    phone: text("phone"),
    purpose: text("purpose").notNull(),
    status: text("status").notNull(),
    version: text("version").notNull().default("v1.0"),
    source: text("source").notNull(),
    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("consent_ledger_client_purpose_idx").on(table.clientId, table.purpose, table.createdAt),
    index("consent_ledger_phone_purpose_idx").on(table.phone, table.purpose, table.createdAt),
  ]
);

// 11g. wa_session_events (Connection lifecycle events)
export const waSessionEvents = pgTable(
  "wa_session_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventType: text("event_type").notNull(),
    statusCode: integer("status_code"),
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wa_events_type_created_idx").on(table.eventType, table.createdAt),
  ]
);

// 11d. auth_audit_log (Security audit log with masked PII)
export const authAuditLog = pgTable(
  "auth_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    event: text("event").notNull(),
    identifierMasked: text("identifier_masked"),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent"),
    status: text("status").notNull().default("success"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("auth_audit_log_created_idx").on(table.createdAt),
    index("auth_audit_log_event_idx").on(table.event),
  ]
);

// 11p. referral_codes (CSPRNG unguessable personal referral codes)
export const referralCodes = pgTable(
  "referral_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    active: boolean("active").notNull().default(true),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referral_codes_user_idx").on(table.userId),
    uniqueIndex("referral_codes_code_idx").on(table.code),
  ]
);

// 11q. referral_visits (Aggregated, privacy-safe referral link impressions)
export const referralVisits = pgTable(
  "referral_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    deviceClass: text("device_class"),
    landingPath: text("landing_path").notNull().default("/r/"),
    converted: boolean("converted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referral_visits_code_idx").on(table.code, table.createdAt),
    index("referral_visits_visitor_idx").on(table.visitorHash, table.createdAt),
  ]
);

// 12. referrals (Per-referee unique attribution and qualification state machine)
export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerId: uuid("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    referredUserId: uuid("referred_user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    status: text("status").notNull().default("signed_up"), // signed_up | booked | delivered | paid | qualified | voided | flagged
    attributionSource: text("attribution_source").notNull().default("link"), // link | manual_code | promo
    flagSignals: jsonb("flag_signals"),
    flagReason: text("flag_reason"),
    voidReason: text("void_reason"),
    qualifyingOrderId: uuid("qualifying_order_id").references(() => bookings.id, { onDelete: "set null" }),
    qualifyingBookingId: uuid("qualifying_booking_id").references(() => bookings.id, { onDelete: "set null" }),
    rewardVoucherId: uuid("reward_voucher_id"),
    referrerPointsAwarded: integer("referrer_points_awarded").notNull().default(0),
    refereePointsAwarded: integer("referee_points_awarded").notNull().default(0),
    firstTouchAt: timestamp("first_touch_at", { withTimezone: true }),
    signedUpAt: timestamp("signed_up_at", { withTimezone: true }).notNull().defaultNow(),
    bookedAt: timestamp("booked_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referrals_referrer_idx").on(table.referrerId),
    index("referrals_status_idx").on(table.status),
    uniqueIndex("referrals_referred_user_idx").on(table.referredUserId),
    index("referrals_code_idx").on(table.code),
  ]
);

// 13. points_ledger (Append-only source of truth for referral & loyalty points)
export const pointsLedger = pgTable(
  "points_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    track: text("track").notNull(), // 'referral' | 'loyalty'
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    orderId: uuid("order_id").references(() => bookings.id, { onDelete: "set null" }),
    referralId: uuid("referral_id").references(() => referrals.id, { onDelete: "set null" }),
    sourceEventId: text("source_event_id").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("points_ledger_track_source_event_idx").on(table.track, table.sourceEventId),
    index("points_ledger_client_track_idx").on(table.clientId, table.track, table.createdAt),
  ]
);

// Legacy table preserved for backwards compatibility
export const rewardPointsLedger = pgTable(
  "reward_points_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    balanceAfter: integer("balance_after").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    referenceId: text("reference_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("reward_points_ledger_user_idx").on(table.userId),
    index("reward_points_ledger_created_idx").on(table.createdAt),
  ]
);

// 13b. reward_entitlements (Milestone reward approvals lifecycle)
export const rewardEntitlements = pgTable(
  "reward_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    milestoneKey: text("milestone_key").notNull(), // 'standard_500' | 'exclusive_1000'
    milestoneIndex: integer("milestone_index").notNull(), // 1, 2, 3...
    pointsSnapshot: integer("points_snapshot").notNull().default(500),
    status: text("status").notNull().default("pending_approval"), // earned | pending_approval | approved | rejected | voided | expired
    voucherId: uuid("voucher_id"),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    rejectedReason: text("rejected_reason"),
    voidReason: text("void_reason"),
    flagSignals: jsonb("flag_signals"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("reward_entitlements_client_milestone_idx").on(table.clientId, table.milestoneKey, table.milestoneIndex),
    index("reward_entitlements_status_idx").on(table.status, table.createdAt),
    index("reward_entitlements_client_idx").on(table.clientId),
  ]
);

// 14. vouchers (Catalog-item-bound opaque reward discount vouchers)
export const vouchers = pgTable(
  "vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    entitlementId: uuid("entitlement_id").references(() => rewardEntitlements.id, { onDelete: "set null" }),
    code: text("code").notNull().unique(),
    source: voucherSourceEnum("source").notNull(), // referral | loyalty | admin_grant
    status: voucherStatusEnum("status").notNull().default("available"), // available | reserved | redeemed | expired | voided
    capDefinition: text("cap_definition").notNull().default("small_basket"),
    eligibleItemIds: jsonb("eligible_item_ids").notNull().default([]), // Price catalog UUIDs
    maxDiscountKes: integer("max_discount_kes").notNull().default(300),
    createdFromEventId: text("created_from_event_id"),
    reservedOrderId: uuid("reserved_order_id").references(() => bookings.id, { onDelete: "set null" }),
    redeemedOrderId: uuid("redeemed_order_id").references(() => bookings.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    voidReason: text("void_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("vouchers_client_idx").on(table.clientId, table.status),
    index("vouchers_status_expires_idx").on(table.status, table.expiresAt),
    uniqueIndex("vouchers_code_idx").on(table.code),
  ]
);

// 15. loyalty_ledger (Legacy cycle tracker, preserved for schema continuity)
export const loyaltyLedger = pgTable(
  "loyalty_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id").notNull().unique().references(() => bookings.id, { onDelete: "cascade" }),
    cycleNumber: integer("cycle_number").notNull().default(1),
    washNumber: integer("wash_number").notNull(),
    voucherId: uuid("voucher_id").references(() => vouchers.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("loyalty_ledger_user_cycle_idx").on(table.userId, table.cycleNumber),
  ]
);

// 16. referral_events
export const referralEvents = pgTable(
  "referral_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referralId: uuid("referral_id").notNull().references(() => referrals.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    notes: text("notes"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("referral_events_referral_idx").on(table.referralId, table.createdAt),
  ]
);

// 17. program_settings (Versioned program settings and thresholds)
export const programSettings = pgTable(
  "program_settings",
  {
    version: integer("version").primaryKey().default(1),
    programActive: boolean("program_active").notNull().default(true),
    referralThreshold: integer("referral_threshold").notNull().default(5),
    loyaltyThreshold: integer("loyalty_threshold").notNull().default(10),
    minOrderValueKes: integer("min_order_value_kes").notNull().default(300),
    smallBasketPriceKes: integer("small_basket_price_kes").notNull().default(300),
    voucherValidityDays: integer("voucher_validity_days").notNull().default(90),
    holdWindowHours: integer("hold_window_hours").notNull().default(0),
    referralPointsPerQualified: integer("referral_points_per_qualified").notNull().default(100),
    loyaltyPointsPerPaidOrder: integer("loyalty_points_per_paid_order").notNull().default(10),
    loyaltyRedemptionPoints: integer("loyalty_redemption_points").notNull().default(100),
    loyaltyRewardCatalogId: uuid("loyalty_reward_catalog_id").references(() => priceCatalog.id, { onDelete: "set null" }),
    standardRewardMilestonePoints: integer("standard_reward_milestone_points").notNull().default(500),
    standardRewardEligibleItemIds: jsonb("standard_reward_eligible_item_ids").notNull().default([]),
    standardRewardMaxCapKes: integer("standard_reward_max_cap_kes").notNull().default(300),
    exclusiveRewardMilestonePoints: integer("exclusive_reward_milestone_points").notNull().default(1000),
    exclusiveRewardEligibleItemIds: jsonb("exclusive_reward_eligible_item_ids").notNull().default([]),
    exclusiveRewardMaxCapKes: integer("exclusive_reward_max_cap_kes").notNull().default(450),
    annualRewardCapPerClient: integer("annual_reward_cap_per_client").notNull().default(15),
    loyaltyPointsExpiryMonths: integer("loyalty_points_expiry_months").notNull().default(12),
    refereeWelcomeDiscountActive: boolean("referee_welcome_discount_active").notNull().default(false),
    refereeWelcomeDiscountKes: integer("referee_welcome_discount_kes").notNull().default(0),
    adminAlertPhone: text("admin_alert_phone").default("+254706351077"),
    autoApproveLowRisk: boolean("auto_approve_low_risk").notNull().default(false),
    whatsappTemplateReferralShare: text("whatsapp_template_referral_share"),
    activeFrom: timestamp("active_from", { withTimezone: true }).notNull().defaultNow(),
    createdByAdminId: uuid("created_by_admin_id").references(() => users.id, { onDelete: "set null" }),
  }
);

// 17b. program_audit_log (Append-only tamper-proof audit trail)
export const programAuditLog = pgTable(
  "program_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    previousState: jsonb("previous_state"),
    newState: jsonb("new_state"),
    stepUpMethod: text("step_up_method"),
    ipHash: text("ip_hash").notNull(),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("program_audit_log_entity_idx").on(table.entity, table.entityId),
    index("program_audit_log_actor_idx").on(table.actorId),
    index("program_audit_log_created_idx").on(table.createdAt),
  ]
);

// 18. client_encryption_keys
export const clientEncryptionKeys = pgTable(
  "client_encryption_keys",
  {
    clientId: uuid("client_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    encryptedDek: text("encrypted_dek").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    keyVersion: integer("key_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  }
);

// 18. system_settings (Phase 0 confirmed operational thresholds)
export const systemSettings = pgTable(
  "system_settings",
  {
    id: integer("id").primaryKey().default(1),
    version: integer("version").notNull().default(1),
    bookingDepositMinor: integer("booking_deposit_minor").notNull().default(5000),
    cancellationCutoffMinutes: integer("cancellation_cutoff_minutes").notNull().default(120),
    recurringMaxHorizonDays: integer("recurring_max_horizon_days").notNull().default(90),
    recurringMaxOccurrences: integer("recurring_max_occurrences").notNull().default(12),
    defaultWindowCapacity: integer("default_window_capacity").notNull().default(10),
    minLeadTimeHours: integer("min_lead_time_hours").notNull().default(3),
    windowBookingCutoffHours: integer("window_booking_cutoff_hours").notNull().default(1),
    slotHoldDurationMinutes: integer("slot_hold_duration_minutes").notNull().default(10),
    maxConcurrentUnpaidHolds: integer("max_concurrent_unpaid_holds").notNull().default(2),
    claimWindowHours: integer("claim_window_hours").notNull().default(72),
    claimSlaFirstResponseHours: integer("claim_sla_first_response_hours").notNull().default(24),
    claimSlaResolutionHours: integer("claim_sla_resolution_hours").notNull().default(48),
    usernameChangeCooldownDays: integer("username_change_cooldown_days").notNull().default(60),
    closedDaysOfWeek: jsonb("closed_days_of_week").notNull().default([0]),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
);

// 19. slot_capacity (Live availability and capacity tracking per date/window)
export const slotCapacity = pgTable(
  "slot_capacity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: text("date").notNull(),
    windowId: text("window_id").notNull(),
    windowLabel: text("window_label").notNull(),
    capacity: integer("capacity").notNull().default(10),
    reserved: integer("reserved").notNull().default(0),
    held: integer("held").notNull().default(0),
    status: text("status").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("slot_capacity_date_window_unique").on(table.date, table.windowId),
    index("slot_capacity_date_idx").on(table.date),
    index("slot_capacity_status_idx").on(table.status),
  ]
);

// 20. booking_series (Series definitions for recurring orders)
export const bookingSeries = pgTable(
  "booking_series",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    addressId: uuid("address_id").notNull().references(() => addresses.id),
    frequency: text("frequency").notNull(), // one_time | weekly | monthly | custom
    rule: jsonb("rule").notNull(),
    catalogVersion: integer("catalog_version").notNull().default(1),
    totalOccurrences: integer("total_occurrences").notNull().default(1),
    status: text("status").notNull().default("active"), // active | completed | cancelled
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("booking_series_client_idx").on(table.clientId, table.status),
  ]
);

// 21. booking_occurrences (Individual schedule occurrences of a series)
export const bookingOccurrences = pgTable(
  "booking_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seriesId: uuid("series_id").notNull().references(() => bookingSeries.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    occurrenceIndex: integer("occurrence_index").notNull().default(1),
    occurrenceDate: text("occurrence_date").notNull(),
    windowId: text("window_id").notNull(),
    slotId: uuid("slot_id").references(() => slotCapacity.id, { onDelete: "set null" }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
    status: text("status").notNull().default("scheduled"), // scheduled | held | awaiting_deposit | confirmed | completed | skipped | cancelled | lapsed
    depositAmountMinor: integer("deposit_amount_minor").notNull().default(5000),
    depositPaid: boolean("deposit_paid").notNull().default(false),
    depositPaidAt: timestamp("deposit_paid_at", { withTimezone: true }),
    priceLockedMinor: integer("price_locked_minor").notNull(),
    catalogSnapshot: jsonb("catalog_snapshot").notNull(),
    reminded48hAt: timestamp("reminded_48h_at", { withTimezone: true }),
    reminded24hAt: timestamp("reminded_24h_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("booking_occurrences_series_date_unique").on(table.seriesId, table.occurrenceDate),
    index("booking_occurrences_client_idx").on(table.clientId, table.status),
    index("booking_occurrences_date_idx").on(table.occurrenceDate, table.status),
  ]
);

// 22. slot_holds (Atomic 10-minute slot holds before deposit payment)
export const slotHolds = pgTable(
  "slot_holds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slotId: uuid("slot_id").notNull().references(() => slotCapacity.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    seriesId: uuid("series_id").references(() => bookingSeries.id, { onDelete: "set null" }),
    occurrenceDate: text("occurrence_date").notNull(),
    windowId: text("window_id").notNull(),
    status: text("status").notNull().default("held"), // held | confirmed | released | expired
    heldAt: timestamp("held_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    bookingId: uuid("booking_id").references(() => bookings.id, { onDelete: "set null" }),
  },
  (table) => [
    index("slot_holds_client_active_idx").on(table.clientId, table.status, table.expiresAt),
    index("slot_holds_slot_idx").on(table.slotId, table.status),
  ]
);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
  addresses: many(addresses),
  referralsGiven: many(referrals, { relationName: "referrer" }),
  pointEntries: many(rewardPointsLedger),
  userNotifications: many(notifications),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrer: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrer",
  }),
  referredUser: one(users, {
    fields: [referrals.referredUserId],
    references: [users.id],
  }),
  qualifyingBooking: one(bookings, {
    fields: [referrals.qualifyingBookingId],
    references: [bookings.id],
  }),
}));

export const rewardPointsLedgerRelations = relations(rewardPointsLedger, ({ one }) => ({
  user: one(users, {
    fields: [rewardPointsLedger.userId],
    references: [users.id],
  }),
}));

export const pointsLedgerRelations = relations(pointsLedger, ({ one }) => ({
  client: one(users, {
    fields: [pointsLedger.clientId],
    references: [users.id],
  }),
  order: one(bookings, {
    fields: [pointsLedger.orderId],
    references: [bookings.id],
  }),
  referral: one(referrals, {
    fields: [pointsLedger.referralId],
    references: [referrals.id],
  }),
}));

export const rewardEntitlementsRelations = relations(rewardEntitlements, ({ one }) => ({
  client: one(users, {
    fields: [rewardEntitlements.clientId],
    references: [users.id],
  }),
  voucher: one(vouchers, {
    fields: [rewardEntitlements.voucherId],
    references: [vouchers.id],
  }),
  approver: one(users, {
    fields: [rewardEntitlements.approvedBy],
    references: [users.id],
  }),
}));

export const referralCodesRelations = relations(referralCodes, ({ one }) => ({
  user: one(users, {
    fields: [referralCodes.userId],
    references: [users.id],
  }),
}));

export const addressesRelations = relations(addresses, ({ one, many }) => ({
  user: one(users, {
    fields: [addresses.userId],
    references: [users.id],
  }),
  bookings: many(bookings),
}));

export const priceCatalogRelations = relations(priceCatalog, ({ many }) => ({
  bookingItems: many(bookingItems),
}));

export const bookingsRelations = relations(bookings, ({ one, many }) => ({
  customer: one(users, {
    fields: [bookings.customerId],
    references: [users.id],
  }),
  address: one(addresses, {
    fields: [bookings.addressId],
    references: [addresses.id],
  }),
  items: many(bookingItems),
  payments: many(payments),
  rating: one(ratings),
  notifications: many(notifications),
}));

export const bookingItemsRelations = relations(bookingItems, ({ one }) => ({
  booking: one(bookings, {
    fields: [bookingItems.bookingId],
    references: [bookings.id],
  }),
  catalogItem: one(priceCatalog, {
    fields: [bookingItems.catalogId],
    references: [priceCatalog.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  booking: one(bookings, {
    fields: [payments.bookingId],
    references: [bookings.id],
  }),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  booking: one(bookings, {
    fields: [ratings.bookingId],
    references: [bookings.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  booking: one(bookings, {
    fields: [notifications.bookingId],
    references: [bookings.id],
  }),
}));

export const vouchersRelations = relations(vouchers, ({ one }) => ({
  client: one(users, {
    fields: [vouchers.clientId],
    references: [users.id],
  }),
  redeemedOrder: one(bookings, {
    fields: [vouchers.redeemedOrderId],
    references: [bookings.id],
  }),
}));

export const loyaltyLedgerRelations = relations(loyaltyLedger, ({ one }) => ({
  user: one(users, {
    fields: [loyaltyLedger.userId],
    references: [users.id],
  }),
  booking: one(bookings, {
    fields: [loyaltyLedger.bookingId],
    references: [bookings.id],
  }),
  voucher: one(vouchers, {
    fields: [loyaltyLedger.voucherId],
    references: [vouchers.id],
  }),
}));

export const referralEventsRelations = relations(referralEvents, ({ one }) => ({
  referral: one(referrals, {
    fields: [referralEvents.referralId],
    references: [referrals.id],
  }),
}));

// Type Exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Address = typeof addresses.$inferSelect;
export type NewAddress = typeof addresses.$inferInsert;
export type PriceCatalogItem = typeof priceCatalog.$inferSelect;
export type NewPriceCatalogItem = typeof priceCatalog.$inferInsert;
export type CatalogVersion = typeof catalogVersions.$inferSelect;
export type NewCatalogVersion = typeof catalogVersions.$inferInsert;
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
export type Referral = typeof referrals.$inferSelect;
export type NewReferral = typeof referrals.$inferInsert;
export type RewardPointsLedgerEntry = typeof rewardPointsLedger.$inferSelect;
export type NewRewardPointsLedgerEntry = typeof rewardPointsLedger.$inferInsert;
export type OtpCode = typeof otpCodes.$inferSelect;
export type NewOtpCode = typeof otpCodes.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type VerificationToken = typeof verificationTokens.$inferSelect;
export type NewVerificationToken = typeof verificationTokens.$inferInsert;
export type WaAuthState = typeof waAuthState.$inferSelect;
export type NewWaAuthState = typeof waAuthState.$inferInsert;
export type WaOutboundMessage = typeof waOutboundMessages.$inferSelect;
export type NewWaOutboundMessage = typeof waOutboundMessages.$inferInsert;
export type WaSessionEvent = typeof waSessionEvents.$inferSelect;
export type NewWaSessionEvent = typeof waSessionEvents.$inferInsert;
export type AuthAuditLogEntry = typeof authAuditLog.$inferSelect;
export type NewAuthAuditLogEntry = typeof authAuditLog.$inferInsert;
export type Voucher = typeof vouchers.$inferSelect;
export type NewVoucher = typeof vouchers.$inferInsert;
export type LoyaltyLedgerEntry = typeof loyaltyLedger.$inferSelect;
export type NewLoyaltyLedgerEntry = typeof loyaltyLedger.$inferInsert;
export type ReferralEvent = typeof referralEvents.$inferSelect;
export type NewReferralEvent = typeof referralEvents.$inferInsert;
export type ProgramSettings = typeof programSettings.$inferSelect;
export type NewProgramSettings = typeof programSettings.$inferInsert;
export type ClientEncryptionKey = typeof clientEncryptionKeys.$inferSelect;
export type NewClientEncryptionKey = typeof clientEncryptionKeys.$inferInsert;
export type WaAutomationTemplate = typeof waAutomationTemplates.$inferSelect;
export type NewWaAutomationTemplate = typeof waAutomationTemplates.$inferInsert;
export type WaAutomationTemplateHistoryEntry = typeof waAutomationTemplateHistory.$inferSelect;
export type NewWaAutomationTemplateHistoryEntry = typeof waAutomationTemplateHistory.$inferInsert;
export type OrderAccessToken = typeof orderAccessTokens.$inferSelect;
export type NewOrderAccessToken = typeof orderAccessTokens.$inferInsert;
export type TrafficEvent = typeof trafficEvents.$inferSelect;
export type NewTrafficEvent = typeof trafficEvents.$inferInsert;
export type TrafficHourlyRollup = typeof trafficHourlyRollups.$inferSelect;
export type NewTrafficHourlyRollup = typeof trafficHourlyRollups.$inferInsert;
export type TrafficDailyRollup = typeof trafficDailyRollups.$inferSelect;
export type NewTrafficDailyRollup = typeof trafficDailyRollups.$inferInsert;
export type CustomerOutboxEvent = typeof customerOutboxEvents.$inferSelect;
export type NewCustomerOutboxEvent = typeof customerOutboxEvents.$inferInsert;
export type CatalogOutboxEvent = typeof catalogOutboxEvents.$inferSelect;
export type NewCatalogOutboxEvent = typeof catalogOutboxEvents.$inferInsert;
export type ConsentLedgerEntry = typeof consentLedger.$inferSelect;
export type NewConsentLedgerEntry = typeof consentLedger.$inferInsert;
export type ReferralCode = typeof referralCodes.$inferSelect;
export type NewReferralCode = typeof referralCodes.$inferInsert;
export type ReferralVisit = typeof referralVisits.$inferSelect;
export type NewReferralVisit = typeof referralVisits.$inferInsert;
export type PointsLedgerEntry = typeof pointsLedger.$inferSelect;
export type NewPointsLedgerEntry = typeof pointsLedger.$inferInsert;
export type RewardEntitlement = typeof rewardEntitlements.$inferSelect;
export type NewRewardEntitlement = typeof rewardEntitlements.$inferInsert;
export type ProgramAuditLogEntry = typeof programAuditLog.$inferSelect;
export type NewProgramAuditLogEntry = typeof programAuditLog.$inferInsert;
