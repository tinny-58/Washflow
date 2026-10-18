# 🧺 WashFlow — On-Demand Laundry Service Platform

WashFlow is a full-stack, production-grade laundry service platform engineered for local laundry businesses. Customers scan a poster QR code, register in under 30 seconds via phone OTP, select items from an active price catalog, drop a pin on an interactive map, and pay via M-Pesa STK Push. Operations managers track the live pipeline on an admin console with real-time SSE broadcasts, audio chimes, and one-tap status dispatching.

---

## 🚀 Key Features

### 👤 Customer Experience
- **Under 30-Second QR Onboarding**: Arrive directly from a physical poster (`/book?src=poster-<location>`), enter phone number, verify with 6-digit OTP, and receive a long-lived signed session. Returning customers skip straight to ordering.
- **Interactive Geolocation & Pin Dropping**: HTML5 Geolocation (`Use My Location`), draggable Leaflet map pin, reverse-geocoding, and manual apartment/street fallback.
- **Live Catalog & Quantity Stepper**: Dynamic pricing for everyday laundry baskets, duvet sizes (3x5, 4x6, 5x6, 6x6), and area/bath mats with instant subtotal calculation.
- **M-Pesa STK Push & Pay on Delivery**: Instant STK push to the customer's mobile phone with polling and server-side payment callback verification.
- **Live Order Tracking**: Visual progress bar tracking order transitions from `PENDING` through `DELIVERED`.
- **Delivered Rating & Tip Flow**: 1–5 star interactive rating with prominent staff tips on 4+ star experiences.

### 🛡️ Admin Operations
- **Realtime Live Feed & Sound Chime**: Server-Sent Events (SSE) push incoming orders to the admin dashboard instantly, with Web Audio API chime notifications.
- **Interactive Pickup Map**: Plotted GPS pins with customer contact shortcuts ("📞 Call", "💬 WhatsApp") and one-tap status progression.
- **Strict State Machine**: Legal forward status transitions enforced server-side (`PENDING -> CONFIRMED -> PICKED_UP -> WASHING -> READY -> OUT_FOR_DELIVERY -> DELIVERED`).
- **Dynamic Price Catalog Manager**: Admin can edit prices, add new duvet or mat variants, or toggle active status without altering historical order snapshots.
- **CSV Order Export**: RFC 4180 export with timestamps, customer phones, item subtotals, tips, and poster attribution tags.
- **Customer Moderation**: One-click blocking for abusive customers with full audit trail logging.

---

## 🔒 Security & Abuse Prevention ("At Most 2" Rules)

1. **Sliding Window Rate Limiting**:
   - Redis-backed sliding window with automated PostgreSQL and in-memory fallback.
   - Enforces 5 OTP requests/hour/phone and 10 requests/min/IP. Returns HTTP `429 Too Many Requests` with `Retry-After`.
2. **Abuse Limit Enforcement**:
   - **Max 2 accounts per device fingerprint**: Uses a privacy-respecting signed httpOnly cookie (`wf_did`) combined with a SHA-256 hash of IP subnet and User-Agent.
   - **Max 2 simultaneously open orders**: Prevents malicious order flooding per phone/device until existing orders reach `DELIVERED` or `CANCELLED`.
   - **Max 2 failed OTP attempts**: Tokens are permanently invalidated on the second failed attempt to protect against brute-force attacks.
3. **Bot & Injection Protection**:
   - Hidden honeypot field (`website`) silently blocking automated spam bots.
   - Strict `libphonenumber-js` E.164 normalization and disposable/invalid format rejection.
   - Server-side HTML stripping on all free-text fields (`sanitize-html`).
   - Parameterized queries via Drizzle ORM.
   - Strict Content Security Policy (CSP), HSTS, and frame protection.
4. **Financial Idempotency & Audit Logs**:
   - Unique provider references on all payment transactions (`provider_ref`).
   - Server-side amount comparison preventing underpayment attacks.
   - Full event provenance recorded in the `audit_log` table.

---

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router, TypeScript strict)
- **Runtime**: Node.js 20+
- **Styling**: Tailwind CSS + shadcn/ui design tokens with a glassmorphism theme
- **Database**: PostgreSQL with Drizzle ORM & SQL migrations
- **Background Jobs**: BullMQ + Redis (with resilient asynchronous fallback outbox)
- **Realtime Updates**: Server-Sent Events (SSE)
- **Notifications**: In-App, WhatsApp Business Cloud API (Twilio fallback), Email (Resend)
- **Payments**: Provider-abstracted interface (`PaymentProvider`) with M-Pesa Daraja STK Push implementation
- **Maps**: Leaflet + OpenStreetMap
- **Testing**: Vitest (Unit & Integration) + Playwright (E2E)

---

## 📁 Repository Structure

```
Washflow/
├── .env.example                     # Environment template
├── .env.local                       # Local environment configuration
├── docker-compose.yml               # Web, Worker, Postgres, Redis orchestration
├── Dockerfile                       # Multi-stage production container
├── drizzle.config.ts                # Drizzle kit configuration
├── next.config.ts                   # Next.js 15 config with CSP & security headers
├── package.json
├── tailwind.config.ts               # Glassmorphism tokens & animations
├── tsconfig.json
├── drizzle/
│   └── migrations/                  # Generated SQL schema migrations
├── public/
│   ├── posters/                     # Fallback posters & SVG graphics
│   ├── qrcodes/                     # Generated poster QR codes & manifest.json
│   └── videos/                      # Looping background video assets
├── scripts/
│   ├── generate-qr.ts               # QR generator script per poster location
│   ├── generate-assets.ts           # Media asset generator
│   ├── seed.ts                      # Admin user & price catalog seeder
│   └── worker.ts                    # Standalone BullMQ notification worker
├── src/
│   ├── app/
│   │   ├── (auth)/login/            # Admin credentials & TOTP 2FA login
│   │   ├── (customer)/
│   │   │   ├── book/                # QR onboarding, location picker, catalog
│   │   │   ├── track/[id]/          # Live status timeline & M-Pesa STK trigger
│   │   │   └── rate/[id]/           # 1-5 star ratings & staff tips
│   │   ├── admin/
│   │   │   ├── page.tsx             # Live orders feed, sound chimes, pickup map
│   │   │   └── catalog/             # Admin price catalog editor
│   │   ├── api/
│   │   │   ├── auth/                # OTP send/verify, admin login, me, logout
│   │   │   ├── bookings/            # Booking CRUD & legal status transitions
│   │   │   ├── catalog/             # Public catalog endpoint
│   │   │   ├── payments/mpesa/      # STK push, Daraja webhook, dev simulator
│   │   │   ├── ratings/             # Rating submission endpoint
│   │   │   └── admin/               # SSE stream, CSV export, customer blocking
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── admin/                   # Sound notifier, Leaflet pickup map
│   │   ├── customer/                # Catalog selector, location picker, sticky CTA
│   │   └── shared/                  # Video background, navbar, glass card
│   ├── db/
│   │   ├── index.ts                 # PostgreSQL connection pool
│   │   ├── schema.ts                # Drizzle ORM schema & entity definitions
│   │   └── seed-data.ts             # Initial pricing catalog data
│   └── lib/
│       ├── env.ts                   # Zod environment validation
│       ├── payments/                # PaymentProvider interface & Daraja client
│       ├── notifications/           # BullMQ queue, WhatsApp API, Resend email
│       ├── phone.ts                 # libphonenumber-js validation
│       ├── rate-limiter.ts          # Sliding window rate limiter
│       ├── sanitization.ts          # HTML tag stripping
│       ├── security.ts              # Device fingerprinting & abuse limits
│       ├── session.ts               # Cryptographic HMAC-SHA256 session cookies
│       ├── sse.ts                   # Realtime SSE manager
│       └── state-machine.ts         # Booking status legal transitions
└── tests/
    ├── auth-and-security.test.ts    # Phone, rate limiting, and session tests
    ├── pricing-state-machine-payments.test.ts # State machine, catalog, M-Pesa tests
    └── e2e-booking-flow.spec.ts     # Playwright QR -> Book -> Pay journey
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 16+ running locally or via Docker
- Redis (Optional; the platform automatically falls back to PostgreSQL if Redis is not running)

### 2. Setup Environment
```bash
cp .env.example .env.local
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Database Setup & Seeding
```bash
# Push database schema to PostgreSQL
npm run db:push

# Seed admin user and initial price catalog
npm run db:seed
```

### 5. Generate Poster QR Codes
Generate high-resolution printable QR codes for all poster marketing locations:
```bash
npm run qr:generate
```
Outputs SVG and PNG QR codes to `public/qrcodes/` with source tags (`poster-nairobi-cbd`, `poster-westlands`, etc.).

### 6. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

- **Storefront & QR Booking**: [http://localhost:3000/book?src=poster-nairobi-cbd](http://localhost:3000/book?src=poster-nairobi-cbd)
- **Admin Dashboard**: [http://localhost:3000/admin](http://localhost:3000/admin)
  - Default Admin Email: `admin@washflow.co.ke`
  - Default Admin Password: `WashFlow#Admin2026!Secure`

---

## 🧪 Testing

Run the automated test suite covering phone validation, HTML sanitization, cryptographic sessions, rate limiting, state machine transitions, dynamic pricing, and M-Pesa callbacks:

```bash
npm test
```

To run Playwright end-to-end tests:
```bash
npx playwright test tests/e2e-booking-flow.spec.ts
```

---

## 🐳 Docker Deployment

To launch the complete production stack (Web app, standalone notification worker, PostgreSQL, and Redis):

```bash
docker compose up -d --build
```

Healthchecks verify PostgreSQL and Redis readiness before booting the web server and background workers.
