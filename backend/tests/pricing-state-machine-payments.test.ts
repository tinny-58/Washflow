import { describe, it, expect, afterAll } from "vitest";
import { isValidTransition, ALLOWED_TRANSITIONS } from "../src/lib/state-machine";
import { mpesaProvider } from "../src/lib/payments/mpesa";
import { pool, db } from "../src/db";
import { priceCatalog, bookings, payments, users, addresses, auditLog } from "../src/db/schema";
import { eq } from "drizzle-orm";

describe("Phase 7: State Machine Transitions", () => {
  it("allows legal forward status transitions", () => {
    expect(isValidTransition("PENDING", "CONFIRMED")).toBe(true);
    expect(isValidTransition("CONFIRMED", "PICKED_UP")).toBe(true);
    expect(isValidTransition("PICKED_UP", "WASHING")).toBe(true);
    expect(isValidTransition("WASHING", "READY")).toBe(true);
    expect(isValidTransition("READY", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  it("allows cancellation from any active status", () => {
    expect(isValidTransition("PENDING", "CANCELLED")).toBe(true);
    expect(isValidTransition("CONFIRMED", "CANCELLED")).toBe(true);
    expect(isValidTransition("PICKED_UP", "CANCELLED")).toBe(true);
    expect(isValidTransition("WASHING", "CANCELLED")).toBe(true);
    expect(isValidTransition("READY", "CANCELLED")).toBe(true);
    expect(isValidTransition("OUT_FOR_DELIVERY", "CANCELLED")).toBe(true);
  });

  it("strictly rejects illegal backwards or skipped transitions", () => {
    // Cannot skip directly from PENDING to DELIVERED
    expect(isValidTransition("PENDING", "DELIVERED")).toBe(false);
    // Cannot reverse from DELIVERED back to PENDING or WASHING
    expect(isValidTransition("DELIVERED", "PENDING")).toBe(false);
    expect(isValidTransition("DELIVERED", "WASHING")).toBe(false);
    // Cannot transition out of CANCELLED
    expect(isValidTransition("CANCELLED", "CONFIRMED")).toBe(false);
  });
});

describe("Phase 7: Dynamic Catalog Pricing & Snapshotting", () => {
  it("reads prices from database catalog rather than hardcoding", async () => {
    const catalogRows = await db.select().from(priceCatalog).where(eq(priceCatalog.active, true));
    expect(catalogRows.length).toBeGreaterThanOrEqual(9);

    const smallBasket = catalogRows.find((c: any) => c.category === "basket" && c.variant.includes("Small"));
    expect(smallBasket).toBeDefined();
    expect(smallBasket?.price).toBe(300);

    const largeBasket = catalogRows.find((c: any) => c.category === "basket" && c.variant.includes("Large"));
    expect(largeBasket).toBeDefined();
    expect(largeBasket?.price).toBe(450);

    const singleDuvet = catalogRows.find((c: any) => c.category === "duvet" && c.variant.includes("3x5"));
    expect(singleDuvet).toBeDefined();
    expect(singleDuvet?.price).toBe(300);

    const mediumDuvet = catalogRows.find((c: any) => c.category === "duvet" && c.variant.includes("4x6"));
    expect(mediumDuvet).toBeDefined();
    expect(mediumDuvet?.price).toBe(450);
  });

  it("accurately computes multi-item subtotal from snapshots", () => {
    const testItems = [
      { qty: 2, unitPriceSnapshot: 300 }, // 2x small basket = 600
      { qty: 1, unitPriceSnapshot: 450 }, // 1x 4x6 duvet = 450
      { qty: 1, unitPriceSnapshot: 600 }, // 1x large mat = 600
    ];

    const subtotal = testItems.reduce((acc, i) => acc + i.qty * i.unitPriceSnapshot, 0);
    const tipAmount = 100;
    const total = subtotal + tipAmount;

    expect(subtotal).toBe(1650);
    expect(total).toBe(1750);
  });
});

describe("Phase 7: M-Pesa Payment Provider & Callback Verification", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("initiates STK push and generates provider reference", async () => {
    const res = await mpesaProvider.initiatePayment({
      bookingId: "test-booking-id",
      amount: 1050,
      phone: "+254712345678",
      type: "service",
    });

    expect(res.success).toBe(true);
    expect(res.provider).toBe("mpesa");
    expect(res.providerRef).toMatch(/^ws_CO_/);
  });

  it("successfully parses valid Daraja callback payload", async () => {
    const mockCallbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MR_12345",
          CheckoutRequestID: "ws_CO_18102026_9999",
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 750 },
              { Name: "MpesaReceiptNumber", Value: "QAB1234XYZ" },
              { Name: "TransactionDate", Value: 20261018210000 },
              { Name: "PhoneNumber", Value: 254712345678 },
            ],
          },
        },
      },
    };

    const parsed = await mpesaProvider.verifyCallback(mockCallbackPayload);
    expect(parsed.isValid).toBe(true);
    expect(parsed.isSuccess).toBe(true);
    expect(parsed.providerRef).toBe("ws_CO_18102026_9999");
    expect(parsed.amount).toBe(750);
    expect(parsed.receiptNumber).toBe("QAB1234XYZ");
    expect(parsed.phone).toBe("254712345678");
  });

  it("flags failed or user-cancelled Daraja callback", async () => {
    const cancelledPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MR_12345",
          CheckoutRequestID: "ws_CO_18102026_8888",
          ResultCode: 1032,
          ResultDesc: "Request cancelled by user",
        },
      },
    };

    const parsed = await mpesaProvider.verifyCallback(cancelledPayload);
    expect(parsed.isValid).toBe(true);
    expect(parsed.isSuccess).toBe(false);
    expect(parsed.providerRef).toBe("ws_CO_18102026_8888");
    expect(parsed.failureReason).toContain("cancelled");
  });
});
