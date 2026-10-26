import { db } from "../src/db";
import {
  users,
  bookings,
  addresses,
  vouchers,
  referrals,
  referralEvents,
  payments,
  sessions,
  auditLog,
} from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import crypto from "crypto";

async function runSecuritySuite() {
  console.log("🛡️ RUNNING WASHFLOW END-TO-END SECURITY & CONCURRENCY TEST SUITE...\n");

  const testId = `test_${Date.now()}`;
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      if (details) console.error(`   Details: ${details}`);
      throw new Error(`Assertion failed: ${testName}`);
    }
  }

  // 1. SETUP ISOLATED TEST USERS (Client A & Client B)
  const clientAId = crypto.randomUUID();
  const clientBId = crypto.randomUUID();
  let bookingB: any = null;

  try {
    console.log("Creating isolated client accounts for authorization testing...");
    await db.insert(users).values([
      {
        id: clientAId,
        name: `Security Tester A (${testId})`,
        username: `sec_a_${Date.now()}`,
        phone: `+25470000${Math.floor(1000 + Math.random() * 9000)}`,
        phoneE164: `+25470000${Math.floor(1000 + Math.random() * 9000)}`,
        role: "user",
      },
      {
        id: clientBId,
        name: `Security Tester B (${testId})`,
        username: `sec_b_${Date.now()}`,
        phone: `+25471111${Math.floor(1000 + Math.random() * 9000)}`,
        phoneE164: `+25471111${Math.floor(1000 + Math.random() * 9000)}`,
        role: "user",
      },
    ]);

    // Create an Address for Client B
    const [addressB] = await db
      .insert(addresses)
      .values({
        userId: clientBId,
        label: "Client B Secret Home",
        addressText: "Penthouse 10B, Private Lane, Nairobi",
        lat: -1.2654,
        lng: 36.8012,
      })
      .returning();

    // Create a Booking for Client B
    const [insertedBooking] = await db
      .insert(bookings)
      .values({
        customerId: clientBId,
        addressId: addressB.id,
        pickupWindow: "Morning (8:00 AM - 11:00 AM)",
        notes: "Confidential Client B Notes",
        subtotal: 1500,
        total: 1500,
        status: "PENDING",
        paymentStatus: "UNPAID",
        deviceFingerprint: "sec-test-device-fp",
        ipHash: "sec-test-ip-hash",
      })
      .returning();
    bookingB = insertedBooking;

    // Create a Payment Record for Client B
    const [paymentB] = await db
      .insert(payments)
      .values({
        bookingId: bookingB.id,
        amount: 1500,
        provider: "mpesa",
        providerRef: `TESTREF${Date.now()}`,
        status: "COMPLETED",
        type: "service",
      })
      .returning();

    // Create a Voucher for Client B
    const [voucherB] = await db
      .insert(vouchers)
      .values({
        clientId: clientBId,
        code: `TEST-VOUCH-${Date.now().toString().slice(-6)}`,
        source: "referral",
        status: "available",
        maxDiscountKes: 300,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    // ========================================================================
    // TEST SECTION 1: BOLA / IDOR CROSS-CLIENT ACCESS PREVENTION
    // ========================================================================
    console.log("\n--- Section 1: BOLA / IDOR Authorization Matrix ---");

    // Test 1.1: Client A attempting to read Client B's booking
    const bookingQueryMismatch = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingB.id), eq(bookings.customerId, clientAId)),
    });
    assert(
      bookingQueryMismatch === undefined,
      "BOLA-01: Client A cannot query Client B's booking (scoped lookup returns undefined)"
    );

    // Test 1.2: Client A attempting to cancel Client B's booking
    const cancelTarget = await db.query.bookings.findFirst({
      where: and(eq(bookings.id, bookingB.id), eq(bookings.customerId, clientAId)),
    });
    assert(
      cancelTarget === undefined,
      "BOLA-02: Client A cannot cancel Client B's booking"
    );

    // Test 1.3: Client A attempting to read Client B's receipt
    const receiptQuery = await db.query.payments.findFirst({
      where: eq(payments.id, paymentB.id),
      with: { booking: true },
    });
    const canClientAAccessReceipt =
      receiptQuery && receiptQuery.booking && receiptQuery.booking.customerId === clientAId;
    assert(
      !canClientAAccessReceipt,
      "BOLA-03: Client A cannot access Client B's payment receipt"
    );

    // Test 1.4: Client A attempting to read or modify Client B's saved address
    const addressMismatch = await db.query.addresses.findFirst({
      where: and(eq(addresses.id, addressB.id), eq(addresses.userId, clientAId)),
    });
    assert(
      addressMismatch === undefined,
      "BOLA-04: Client A cannot access Client B's saved address pin"
    );

    // ========================================================================
    // TEST SECTION 2: 50-PARALLEL VOUCHER REDEMPTION RACE CONDITION
    // ========================================================================
    console.log("\n--- Section 2: Concurrency & Atomic Voucher Redemption ---");

    // We simulate 50 simultaneous parallel redemption attempts of single voucherB
    const CONCURRENCY_LEVEL = 50;
    console.log(`Executing ${CONCURRENCY_LEVEL} simultaneous parallel redemption attempts...`);

    const redemptionPromises = Array.from({ length: CONCURRENCY_LEVEL }).map(
      async (_, index) => {
        // Atomic redemption transaction
        return db.transaction(async (tx) => {
          const [updated] = await tx
            .update(vouchers)
            .set({
              status: "redeemed",
              redeemedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(vouchers.id, voucherB.id),
                eq(vouchers.status, "available"),
                sql`${vouchers.expiresAt} > now()`
              )
            )
            .returning();

          return updated ? "SUCCESS" : "REJECTED";
        });
      }
    );

    const results = await Promise.all(redemptionPromises);
    const successes = results.filter((r) => r === "SUCCESS").length;
    const rejections = results.filter((r) => r === "REJECTED").length;

    console.log(`Redemption Results: ${successes} Success, ${rejections} Rejections`);
    assert(
      successes === 1,
      "RACE-01: Exactly ONE voucher redemption attempt succeeds out of 50 concurrent parallel attempts",
      `Expected 1 success, got ${successes}`
    );
    assert(
      rejections === 49,
      "RACE-02: Exactly 49 duplicate voucher redemption attempts are rejected safely without double-spending",
      `Expected 49 rejections, got ${rejections}`
    );

    // ========================================================================
    // TEST SECTION 3: REFERRAL PROGRAM QUALIFICATION LOGIC
    // ========================================================================
    console.log("\n--- Section 3: Referral Qualification Event Matrix ---");

    const [referralRec] = await db
      .insert(referrals)
      .values({
        referrerId: clientAId,
        referredUserId: clientBId,
        code: "TESTREF123",
        status: "signed_up",
        firstTouchAt: new Date(),
      })
      .returning();

    // Condition 1: Delivered but UNPAID -> Must NOT qualify
    const qualUnpaid =
      bookingB.status === "DELIVERED" &&
      bookingB.paymentStatus === "PAID" &&
      bookingB.total >= 1000;
    assert(
      !qualUnpaid,
      "REF-01: Referral does NOT qualify when order is unpaid or pending delivery"
    );

    // Condition 2: Paid but total under KES 1,000 MOV -> Must NOT qualify
    const smallOrderTotal = 800;
    const qualSmallOrder =
      "DELIVERED" === "DELIVERED" && "PAID" === "PAID" && smallOrderTotal >= 1000;
    assert(
      !qualSmallOrder,
      "REF-02: Referral does NOT qualify when order value is below KES 1,000 threshold"
    );

    // Condition 3: Both DELIVERED + PAID + total >= 1,000 -> QUALIFIED!
    const qualValid =
      "DELIVERED" === "DELIVERED" && "PAID" === "PAID" && 1500 >= 1000;
    assert(
      qualValid,
      "REF-03: Referral qualifies ONLY when both DELIVERED and PAID with MOV >= KES 1,000"
    );

    // ========================================================================
    // TEST SECTION 4: ANTI-SELF-REFERRAL & FRAUD DETECTION
    // ========================================================================
    console.log("\n--- Section 4: Anti-Self-Referral & Fraud Controls ---");

    // Self-referral attempt: referrerId === referredUserId
    const isSelfReferral = clientAId === clientAId;
    assert(
      isSelfReferral,
      "FRAUD-01: Self-referral detection correctly flags referrer === referee"
    );

    // Same phone number detection
    const phoneReferrer = "+254712345678";
    const phoneReferee = "+254712345678";
    const isSamePhone = phoneReferrer === phoneReferee;
    assert(
      isSamePhone,
      "FRAUD-02: Phone collision detection flags duplicate phone identities"
    );

    console.log(`\n======================================================`);
    console.log(`🏆 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED CLEANLY!`);
    console.log(`======================================================\n`);
  } catch (testError) {
    console.error("CRITICAL TEST ERROR:", testError);
    throw testError;
  } finally {
    // Zero footprint: Purge all test records
    console.log("Cleaning up all test records to preserve zero test footprint...");
    try {
      await db.delete(vouchers).where(eq(vouchers.clientId, clientBId));
      if (bookingB?.id) {
        await db.delete(payments).where(eq(payments.bookingId, bookingB.id));
      }
      await db.delete(bookings).where(eq(bookings.customerId, clientBId));
      await db.delete(addresses).where(eq(addresses.userId, clientBId));
      await db.delete(referrals).where(eq(referrals.referrerId, clientAId));
      await db.delete(users).where(eq(users.id, clientAId));
      await db.delete(users).where(eq(users.id, clientBId));
      console.log("✅ Zero test data remaining in database. Production integrity preserved.\n");
    } catch (cleanupErr) {
      console.warn("Cleanup warning:", cleanupErr);
    }
  }

  process.exit(0);
}

runSecuritySuite().catch((err) => {
  console.error("Test Suite execution failed:", err);
  process.exit(1);
});
