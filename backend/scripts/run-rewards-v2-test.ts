import { pool, db } from "../src/db";
import {
  users,
  referralCodes,
  referrals,
  pointsLedger,
  rewardEntitlements,
  vouchers,
  bookings,
  addresses,
  priceCatalog,
  payments,
  programSettings,
  programAuditLog,
} from "../src/db/schema";
import {
  generateCsprngCode,
  signAttributionCookie,
  verifyAttributionCookie,
  attributeReferralOnSignup,
  evaluateOrderQualification,
  revertOrderQualification,
  approveRewardEntitlement,
  redeemVoucherAtomic,
} from "../src/lib/rewards";
import { eq, or, and, sql } from "drizzle-orm";

async function runSuite() {
  console.log("=== Starting WashFlow Referrals & Loyalty V2 Test Suite ===");
  const referrerPhone = "+254700000101";
  const refereePhone1 = "+254700000102";
  const refereePhone2 = "+254700000103";
  const adminPhone = "+254706351077";

  let adminUserId: string;
  let referrerUserId: string;
  let refereeUser1Id: string;
  let refereeUser2Id: string;
  let referrerCode: string;
  let testAddressId: string;

  try {
    // 1. Cleanup previous test users
    console.log("1. Cleaning up previous test fixtures...");
    const testPhones = [referrerPhone, refereePhone1, refereePhone2, "+254700000999"];
    for (const p of testPhones) {
      const existing = await db.query.users.findFirst({ where: eq(users.phone, p) });
      if (existing) {
        await db.delete(vouchers).where(eq(vouchers.clientId, existing.id));
        await db.delete(rewardEntitlements).where(eq(rewardEntitlements.clientId, existing.id));
        await db.delete(pointsLedger).where(eq(pointsLedger.clientId, existing.id));
        await db.delete(referrals).where(or(eq(referrals.referrerId, existing.id), eq(referrals.referredUserId, existing.id)));
        await db.delete(bookings).where(eq(bookings.customerId, existing.id));
        await db.delete(referralCodes).where(eq(referralCodes.userId, existing.id));
        await db.delete(users).where(eq(users.id, existing.id));
      }
    }

    // 2. Fetch or create Admin
    let admin = await db.query.users.findFirst({ where: eq(users.role, "admin") });
    if (!admin) {
      const [newAdmin] = await db
        .insert(users)
        .values({
          name: "Test Admin",
          username: "admin_test_" + Date.now(),
          phone: adminPhone,
          phoneE164: adminPhone,
          role: "admin",
          passwordHash: "argon2_test_hash",
        })
        .returning();
      admin = newAdmin;
    }
    adminUserId = admin.id;

    // 3. Create Referrer
    referrerCode = generateCsprngCode();
    const [referrer] = await db
      .insert(users)
      .values({
        name: "Referrer Test Client",
        username: "ref_client_" + Date.now(),
        phone: referrerPhone,
        phoneE164: referrerPhone,
        role: "user",
        referralCode: referrerCode,
      })
      .returning();
    referrerUserId = referrer.id;

    await db.insert(referralCodes).values({
      userId: referrerUserId,
      code: referrerCode,
      active: true,
    });

    const [addr] = await db
      .insert(addresses)
      .values({
        userId: referrerUserId,
        label: "Home",
        addressText: "Kileleshwa, Nairobi",
        latitude: -1.2833,
        longitude: 36.8167,
      })
      .returning();
    testAddressId = addr.id;

    // 4. Test 1: CSPRNG Code Generation & Signed Cookie Tamper Proofing
    console.log("2. Testing CSPRNG Code Generation & Cookie Signatures...");
    const code1 = generateCsprngCode();
    const code2 = generateCsprngCode();
    if (!code1.startsWith("WF-") || code1.length !== 9) throw new Error("CSPRNG code format invalid");
    if (code1 === code2) throw new Error("CSPRNG codes collided");

    const signed = signAttributionCookie(code1);
    if (verifyAttributionCookie(signed) !== code1) throw new Error("Cookie verification failed");
    if (verifyAttributionCookie(signed.replace("WF-", "WF-FAKE")) !== null) throw new Error("Tampered cookie accepted");
    console.log("   -> PASSED: CSPRNG & Tamper-proof signatures verified.");

    // 5. Test 2: Fraud Checks (Self-Referral & Phone Collision Hard-Rejection)
    console.log("3. Testing Fraud Rejections (Self-Referral & Phone Collision)...");
    const selfRefRes = await attributeReferralOnSignup({
      refereeUserId: referrerUserId,
      refereePhoneE164: referrerPhone,
      rawCode: referrerCode,
      attributionSource: "manual_code",
    });
    if (selfRefRes.attributed !== false || selfRefRes.reason !== "Self-referral prohibited") {
      throw new Error("Self-referral was not rejected!");
    }

    const [fakeUser] = await db
      .insert(users)
      .values({
        name: "Duplicate Phone Client",
        username: "dup_" + Date.now(),
        phone: referrerPhone,
        phoneE164: referrerPhone,
        role: "user",
      })
      .returning();

    const dupRes = await attributeReferralOnSignup({
      refereeUserId: fakeUser.id,
      refereePhoneE164: referrerPhone,
      rawCode: referrerCode,
      attributionSource: "link",
    });
    await db.delete(users).where(eq(users.id, fakeUser.id));

    if (dupRes.attributed !== false || dupRes.reason !== "Matching phone number") {
      throw new Error("Phone collision was not rejected!");
    }
    console.log("   -> PASSED: Self-referral and phone collision hard rejected.");

    // 6. Test 3: Genuine New User Referral Attribution
    console.log("4. Testing Genuine User Attribution on Signup...");
    const [referee1] = await db
      .insert(users)
      .values({
        name: "Referee One",
        username: "referee_1_" + Date.now(),
        phone: refereePhone1,
        phoneE164: refereePhone1,
        role: "user",
        referralCode: generateCsprngCode(),
      })
      .returning();
    refereeUser1Id = referee1.id;

    const attrRes = await attributeReferralOnSignup({
      refereeUserId: refereeUser1Id,
      refereePhoneE164: refereePhone1,
      rawCode: referrerCode,
      attributionSource: "link",
    });
    if (!attrRes.attributed || !attrRes.referralId) throw new Error("Attribution failed");
    console.log("   -> PASSED: Attribution recorded in database.");

    // 7. Test 4: Order Qualification Pipeline (Both Event Arrivals & Idempotency)
    console.log("5. Testing Order Qualification Pipeline & Event Idempotency...");
    const [booking1] = await db
      .insert(bookings)
      .values({
        customerId: refereeUser1Id,
        addressId: testAddressId,
        total: 500,
        subtotal: 500,
        status: "CONFIRMED",
        paymentStatus: "PENDING",
        serviceType: "Wash & Fold",
      })
      .returning();

    await db.insert(payments).values({
      bookingId: booking1.id,
      amount: 500,
      currency: "KES",
      status: "PENDING",
      method: "MPESA",
    });

    // Payment arrives first
    await db.update(bookings).set({ paymentStatus: "PAID" }).where(eq(bookings.id, booking1.id));
    await db.update(payments).set({ status: "SUCCESS" }).where(eq(payments.bookingId, booking1.id));

    const qualRes1 = await evaluateOrderQualification(booking1.id, "payment_confirmed");
    if (qualRes1.qualified !== false) throw new Error("Order qualified prematurely before delivery!");

    // Delivered arrives second
    await db.update(bookings).set({ status: "DELIVERED" }).where(eq(bookings.id, booking1.id));
    const qualRes2 = await evaluateOrderQualification(booking1.id, "status_delivered");
    if (qualRes2.qualified !== true) throw new Error("Order failed to qualify after delivery & payment!");

    // Check referrer got +100 points
    const [refLedger] = await db
      .select()
      .from(pointsLedger)
      .where(and(eq(pointsLedger.clientId, referrerUserId), eq(pointsLedger.track, "referral")));
    if (!refLedger || refLedger.delta !== 100) throw new Error("Referrer points delta is not +100");

    // Check referee got +10 loyalty points
    const [loyaltyLedger] = await db
      .select()
      .from(pointsLedger)
      .where(and(eq(pointsLedger.clientId, refereeUser1Id), eq(pointsLedger.track, "loyalty")));
    if (!loyaltyLedger || loyaltyLedger.delta !== 10) throw new Error("Referee loyalty delta is not +10");

    // Duplicate event arrival must be idempotent
    const dupEval = await evaluateOrderQualification(booking1.id, "status_delivered");
    if (dupEval.qualified !== false) throw new Error("Duplicate event double-qualified!");

    const allLedger = await db
      .select()
      .from(pointsLedger)
      .where(and(eq(pointsLedger.clientId, referrerUserId), eq(pointsLedger.track, "referral")));
    if (allLedger.length !== 1) throw new Error("Duplicate ledger row was inserted!");
    console.log("   -> PASSED: Qualification evaluated correctly and strictly idempotent.");

    // 8. Test 5: Reversals on Order Cancellation or Dispute
    console.log("6. Testing Points Reversal on Refund / Cancellation...");
    await revertOrderQualification(booking1.id, "Test cancellation");
    const [balAfter] = (
      await db.execute(sql`
        SELECT COALESCE(SUM(delta), 0)::int as b FROM points_ledger 
        WHERE client_id = ${referrerUserId} AND track = 'referral'
      `)
    ).rows as any[];
    if (Number(balAfter.b) !== 0) throw new Error(`Balance after reversal expected 0, got ${balAfter.b}`);
    console.log("   -> PASSED: Reversal appended negative delta (-100) and restored balance to 0.");

    // 9. Test 6: Milestone Crossing & Step-Up Admin Approval
    console.log("7. Testing Milestone Crossing (500 pts) & Admin Step-Up Approval...");
    await db.insert(pointsLedger).values({
      clientId: referrerUserId,
      track: "referral",
      delta: 500,
      balanceAfter: 500,
      reason: "Milestone grant",
      sourceEventId: "grant_" + Date.now(),
    });

    const [referee2] = await db
      .insert(users)
      .values({
        name: "Referee Two",
        username: "referee_2_" + Date.now(),
        phone: refereePhone2,
        phoneE164: refereePhone2,
        role: "user",
      })
      .returning();
    refereeUser2Id = referee2.id;

    await attributeReferralOnSignup({
      refereeUserId: refereeUser2Id,
      refereePhoneE164: refereePhone2,
      rawCode: referrerCode,
      attributionSource: "link",
    });

    const [booking2] = await db
      .insert(bookings)
      .values({
        customerId: refereeUser2Id,
        addressId: testAddressId,
        total: 600,
        subtotal: 600,
        status: "DELIVERED",
        paymentStatus: "PAID",
      })
      .returning();

    await evaluateOrderQualification(booking2.id, "status_delivered");

    const entitlements = await db
      .select()
      .from(rewardEntitlements)
      .where(and(eq(rewardEntitlements.clientId, referrerUserId), eq(rewardEntitlements.milestoneKey, "standard_500")));
    if (entitlements.length !== 1 || entitlements[0].status !== "pending_approval") {
      throw new Error("Entitlement was not created in pending_approval!");
    }

    const appRes = await approveRewardEntitlement({
      entitlementId: entitlements[0].id,
      adminUserId,
      adminUsername: "admin_test",
      ipHash: "hash123",
      stepUpMethod: "password",
    });
    if (!appRes.success || !appRes.voucherCode) throw new Error("Approval failed to produce voucher");

    const voucher = await db.query.vouchers.findFirst({ where: eq(vouchers.code, appRes.voucherCode!) });
    if (!voucher || voucher.status !== "available" || voucher.maxDiscountKes !== 300) {
      throw new Error("Voucher attributes mismatch");
    }

    const auditEntry = await db.query.programAuditLog.findFirst({
      where: and(eq(programAuditLog.entityId, entitlements[0].id), eq(programAuditLog.action, "REWARD_APPROVED")),
    });
    if (!auditEntry) throw new Error("Audit log entry missing");
    console.log("   -> PASSED: Milestone reached, admin approved, voucher generated, audit log appended.");

    // 10. Test 7: Atomic Voucher Redemption (50 Parallel Requests)
    console.log("8. Testing Atomic Voucher Redemption (50 Parallel Concurrent Requests)...");
    const raceVoucherCode = "WF-RACE-" + Math.floor(Math.random() * 1000000);
    const [raceVoucher] = await db
      .insert(vouchers)
      .values({
        clientId: referrerUserId,
        code: raceVoucherCode,
        source: "referral_milestone",
        status: "available",
        maxDiscountKes: 300,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      })
      .returning();

    const attempts = Array.from({ length: 50 }, (_, i) =>
      redeemVoucherAtomic({
        voucherId: raceVoucher.id,
        clientId: referrerUserId,
        orderId: `order_race_${i}`,
      })
    );

    const raceResults = await Promise.all(attempts);
    const successes = raceResults.filter((r) => r.success);
    const failures = raceResults.filter((r) => !r.success);

    if (successes.length !== 1 || failures.length !== 49) {
      throw new Error(`Race condition check failed! Successes: ${successes.length}, Failures: ${failures.length}`);
    }
    console.log("   -> PASSED: Exactly 1 concurrent request succeeded, 49 cleanly rejected.");

    console.log("\n========================================================");
    console.log("ALL 8 VERIFICATION PHASES PASSED WITH 100% SUCCESS!");
    console.log("========================================================\n");
  } finally {
    // Teardown test records
    console.log("Cleaning up test data...");
    const testIds = [referrerUserId, refereeUser1Id, refereeUser2Id].filter(Boolean);
    for (const uid of testIds) {
      await db.delete(vouchers).where(eq(vouchers.clientId, uid));
      await db.delete(rewardEntitlements).where(eq(rewardEntitlements.clientId, uid));
      await db.delete(pointsLedger).where(eq(pointsLedger.clientId, uid));
      await db.delete(referrals).where(or(eq(referrals.referrerId, uid), eq(referrals.referredUserId, uid)));
      await db.delete(bookings).where(eq(bookings.customerId, uid));
      await db.delete(referralCodes).where(eq(referralCodes.userId, uid));
      await db.delete(users).where(eq(users.id, uid));
    }
    await pool.end();
  }
}

runSuite().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
