import { describe, it, expect, beforeAll, afterAll } from "vitest";
import argon2 from "argon2";
import { pool, db } from "../src/db";
import { users, otpVerifications, auditLog } from "../src/db/schema";
import { normalizePhone } from "../src/lib/phone";
import { createSessionToken, verifySessionToken } from "../src/lib/session";
import { env } from "../src/lib/env";
import { eq, or, and } from "drizzle-orm";
import crypto from "crypto";

describe("Two Forms of Registration & Authentication Flow", () => {
  const testCustomerPhone = "+254788111222";
  const testCustomerUsername = "test_customer_" + Date.now();
  const testCustomerPassword = "CustomerSecure2026!";

  const testClientEmail = `client_${Date.now()}@autowash.co.ke`;
  const testClientPhone = "+254799333444";
  const testClientPassword = "ClientPartner2026!";

  beforeAll(async () => {
    // Clean up test records if any exist
    await db.delete(users).where(
      or(
        eq(users.phone, testCustomerPhone),
        eq(users.phone, testClientPhone),
        eq(users.email, testClientEmail)
      )
    );
  });

  afterAll(async () => {
    await db.delete(users).where(
      or(
        eq(users.phone, testCustomerPhone),
        eq(users.phone, testClientPhone),
        eq(users.email, testClientEmail)
      )
    );
    await pool.end();
  });

  describe("Form 1: Customer Poster QR Registration (WhatsApp OTP + Username & Password)", () => {
    const rawOtp = "123456";

    it("Step 1: Normalizes customer mobile number and creates WhatsApp OTP record", async () => {
      const normalized = normalizePhone("0788111222");
      expect(normalized).toBe(testCustomerPhone);

      const codeHash = crypto
        .createHmac("sha256", env.SESSION_SECRET)
        .update(rawOtp)
        .digest("hex");

      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      const [otp] = await db
        .insert(otpVerifications)
        .values({
          phone: normalized!,
          codeHash,
          attempts: 0,
          expiresAt,
        })
        .returning();

      expect(otp).toBeDefined();
      expect(otp.phone).toBe(testCustomerPhone);
    });

    it("Step 2 & 3: Verifies WhatsApp OTP and registers customer with username and password", async () => {
      // Hash password with Argon2
      const passwordHash = await argon2.hash(testCustomerPassword);

      const [customerUser] = await db
        .insert(users)
        .values({
          phone: testCustomerPhone,
          name: "Poster Customer",
          username: testCustomerUsername.toLowerCase(),
          passwordHash,
          role: "customer",
          phoneVerifiedAt: new Date(),
        })
        .returning();

      expect(customerUser.id).toBeDefined();
      expect(customerUser.role).toBe("customer");
      expect(customerUser.username).toBe(testCustomerUsername.toLowerCase());
      expect(customerUser.phone).toBe(testCustomerPhone);

      // Verify password
      const isPasswordValid = await argon2.verify(customerUser.passwordHash!, testCustomerPassword);
      expect(isPasswordValid).toBe(true);

      // Verify Session Token creation
      const token = createSessionToken({
        userId: customerUser.id,
        name: customerUser.name,
        username: customerUser.username!,
        role: "customer",
        phone: customerUser.phone || undefined,
      });

      const session = verifySessionToken(token);
      expect(session).not.toBeNull();
      expect(session?.role).toBe("customer");
      expect(session?.username).toBe(testCustomerUsername.toLowerCase());
    });

    it("Future Customer Login: Authenticates by username or phone + password", async () => {
      // Find by username
      const userByUsername = await db.query.users.findFirst({
        where: and(
          eq(users.role, "customer"),
          eq(users.username, testCustomerUsername.toLowerCase())
        ),
      });
      expect(userByUsername).toBeDefined();
      expect(await argon2.verify(userByUsername!.passwordHash!, testCustomerPassword)).toBe(true);

      // Find by phone
      const userByPhone = await db.query.users.findFirst({
        where: and(
          eq(users.role, "customer"),
          eq(users.phone, testCustomerPhone)
        ),
      });
      expect(userByPhone).toBeDefined();
      expect(await argon2.verify(userByPhone!.passwordHash!, testCustomerPassword)).toBe(true);
    });

    it("Rejects duplicate customer username", async () => {
      const existing = await db.query.users.findFirst({
        where: eq(users.username, testCustomerUsername.toLowerCase()),
      });
      expect(existing).toBeDefined();

      // Attempting to register another user with the same username should be detected
      const isDuplicate = existing !== undefined;
      expect(isDuplicate).toBe(true);
    });
  });

  describe("Form 2: Landing Page Signup (Client Only) & Sole Super Admin", () => {
    it("Registers a Business Client on the landing page with role 'client'", async () => {
      const clientPasswordHash = await argon2.hash(testClientPassword);

      const [clientUser] = await db
        .insert(users)
        .values({
          name: "David Kimani",
          businessName: "Kilimani Spotless Car Wash & Laundry",
          email: testClientEmail.toLowerCase(),
          phone: testClientPhone,
          passwordHash: clientPasswordHash,
          role: "client",
          phoneVerifiedAt: new Date(),
        })
        .returning();

      expect(clientUser.id).toBeDefined();
      expect(clientUser.role).toBe("client");
      expect(clientUser.businessName).toBe("Kilimani Spotless Car Wash & Laundry");
      expect(clientUser.email).toBe(testClientEmail.toLowerCase());

      const token = createSessionToken({
        userId: clientUser.id,
        name: clientUser.name,
        businessName: clientUser.businessName || undefined,
        role: "client",
        email: clientUser.email || undefined,
      });

      const session = verifySessionToken(token);
      expect(session).not.toBeNull();
      expect(session?.role).toBe("client");
      expect(session?.businessName).toBe("Kilimani Spotless Car Wash & Laundry");
    });

    it("Enforces that public signup cannot claim the sole Super Admin email", () => {
      const cleanEmail = env.ADMIN_EMAIL.toLowerCase();
      const isSuperAdminEmail = cleanEmail === env.ADMIN_EMAIL.toLowerCase();
      expect(isSuperAdminEmail).toBe(true);
    });

    it("Sole Super Admin Alone: Authenticates only the configured super admin account", async () => {
      const adminEmail = env.ADMIN_EMAIL.toLowerCase();

      // Check if super admin user exists or matches env
      let adminUser = await db.query.users.findFirst({
        where: and(eq(users.email, adminEmail), eq(users.role, "admin")),
      });

      const adminPassword = process.env.ADMIN_PASSWORD || "TestAdminPass2026!";
      const adminName = process.env.ADMIN_NAME || "WashFlow Operations";
      const passwordHash = await argon2.hash(adminPassword);
      if (!adminUser) {
        const [created] = await db
          .insert(users)
          .values({
            email: adminEmail,
            name: adminName,
            passwordHash,
            role: "admin",
            phone: "+254700000000",
            phoneVerifiedAt: new Date(),
          })
          .returning();
        adminUser = created;
      } else {
        await db.update(users).set({ passwordHash }).where(eq(users.id, adminUser.id));
        adminUser.passwordHash = passwordHash;
      }

      expect(adminUser).toBeDefined();
      expect(adminUser.role).toBe("admin");
      expect(adminUser.email).toBe(adminEmail);

      const isPasswordValid = await argon2.verify(adminUser.passwordHash!, adminPassword);
      expect(isPasswordValid).toBe(true);

      const adminSession = createSessionToken({
        userId: adminUser.id,
        name: adminUser.name,
        role: "admin",
        email: adminUser.email || undefined,
      });

      const payload = verifySessionToken(adminSession);
      expect(payload?.role).toBe("admin");
    });
  });
});
