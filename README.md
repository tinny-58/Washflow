# 🧺 WashFlow — On-Demand Laundry Service Platform

WashFlow is a full-stack, production-grade laundry service platform engineered for local laundry businesses. Customers scan a poster QR code, register in under 30 seconds via phone OTP, select items from an active price catalog, drop a pin on an interactive map, and pay via M-Pesa STK Push. Operations managers track the live pipeline on an admin console with real-time SSE broadcasts, audio chimes, and one-tap status dispatching.

---

## 📁 Repository Structure

The project is cleanly divided into **`backend`** and **`frontend`** under the same `Washflow` workspace to make code tracking, development, and deployment straightforward:

```
Washflow/
├── backend/                         # Express API, Database, Worker, Payments
│   ├── src/
│   │   ├── routes/                  # Express route handlers
│   │   │   ├── auth.ts              # Phone OTP send/verify, admin login, me, logout
│   │   │   ├── bookings.ts          # Booking creation, list, detail, legal transitions
│   │   │   ├── catalog.ts           # Customer active price catalog
│   │   │   ├── payments.ts          # M-Pesa STK push, Daraja webhook callback, simulator
│   │   │   ├── ratings.ts           # 1-5 star ratings & customer tips
│   │   │   └── admin.ts             # Orders feed, catalog editor, customer moderation, CSV export, SSE
│   │   ├── db/                      # Drizzle ORM schema, migrations, connection pool
│   │   ├── lib/                     # Business logic: state machine, rate limiter, security, phone, notifications
│   │   └── server.ts                # Standalone Express server entrypoint (Port 5000)
│   ├── drizzle/                     # SQL schema migrations
│   ├── scripts/                     # Seed script, BullMQ worker, QR generator
│   ├── tests/                       # Vitest integration tests (auth, security, payments, state machine)
│   ├── Dockerfile                   # Production container for backend service
│   ├── package.json                 # Backend dependencies & scripts
│   └── tsconfig.json
│
├── frontend/                        # Next.js 15 Client-Side Application
│   ├── src/
│   │   ├── app/                     # App Router pages & layouts
│   │   │   ├── page.tsx             # High-converting landing & storefront hero
│   │   │   ├── (auth)/login/        # Admin login with TOTP 2FA code
│   │   │   ├── (customer)/
│   │   │   │   ├── book/            # QR onboarding, phone OTP, price catalog stepper, GPS pin drop
│   │   │   │   ├── track/[id]/      # Visual progress timeline & live M-Pesa pay prompt
│   │   │   │   └── rate/[id]/       # 1-5 star ratings & staff tips
│   │   │   ├── admin/
│   │   │   │   ├── page.tsx         # Realtime SSE order feed, Web Audio chimes, Leaflet dispatch map
│   │   │   │   └── catalog/         # Dynamic price catalog manager
│   │   │   ├── globals.css          # Glassmorphism tokens & animations
│   │   │   └── layout.tsx           # Root layout with video background & responsive navbar
│   │   ├── components/              # Modular UI components (customer, admin, shared)
│   │   ├── lib/                     # Client types, status metadata, formatting utilities
│   │   └── hooks/                   # Client state hooks
│   ├── public/                      # Posters, QR code assets, looping background videos
│   ├── next.config.ts               # Next.js 15 config with API proxy rewrites to Backend (:5000)
│   ├── tailwind.config.ts           # Glassmorphism design system
│   ├── Dockerfile                   # Production container for frontend service
│   ├── package.json                 # Frontend dependencies & scripts
│   └── tsconfig.json
│
├── docker-compose.yml               # Multi-container orchestration (backend, frontend, worker, postgres, redis)
├── package.json                     # Root workspace orchestration scripts
└── README.md
```

---

## 🚀 Key Features

### 👤 Customer Experience (Frontend)
- **Under 30-Second QR Onboarding**: Arrive directly from a physical poster (`/book?src=poster-<location>`), enter phone number, verify with 6-digit OTP, and receive a long-lived signed session. Returning customers skip straight to ordering.
- **Interactive Geolocation & Pin Dropping**: HTML5 Geolocation (`Use My Location`), draggable Leaflet map pin, reverse-geocoding, and manual apartment/street fallback.
- **Live Catalog & Quantity Stepper**: Dynamic pricing for everyday laundry baskets, duvet sizes (3x5, 4x6, 5x6, 6x6), and area/bath mats with instant subtotal calculation.
- **M-Pesa STK Push & Pay on Delivery**: Instant STK push to the customer's mobile phone with polling and server-side payment callback verification.
- **Live Order Tracking**: Visual progress bar tracking order transitions from `PENDING` through `DELIVERED`.
- **Delivered Rating & Tip Flow**: 1–5 star interactive rating with prominent staff tips on 4+ star experiences.

### 🛡️ Admin Operations (Frontend & Backend)
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

## 🛠️ Quick Start & Running Locally

### 1. Start Services via Docker Compose
```bash
docker compose up -d
```
This boots:
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- WashFlow Backend on `http://localhost:5000`
- WashFlow Frontend on `http://localhost:3000`
- Background Notification Worker

### 2. Or Run Directly with Node

**Backend (Port 5000):**
```bash
cd backend
npm install
npm run db:push
npm run db:seed
npm run dev
```

**Frontend (Port 3000):**
```bash
cd frontend
npm install
npm run dev
```

**Run Unit & Integration Tests:**
```bash
npm run test --prefix backend
```

---

## 🔑 Demo & Admin Credentials

- **Admin Dashboard**: `http://localhost:3000/admin`
- **Admin Login**: `http://localhost:3000/login`
- **Email**: `admin@washflow.co.ke`
- **Password**: `WashFlow#Admin2026!Secure`
- **Customer Booking Flow**: `http://localhost:3000/book`
- **Poster Demo Location**: `http://localhost:3000/book?src=poster-kilimani-01`
#   W a s h f l o w  
 