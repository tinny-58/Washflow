import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool, db } from "../src/db";
import {
  users,
  referrals,
  rewardPointsLedger,
  bookings,
  addresses,
  priceCatalog,
  notifications,
} from "../src/db/schema";
import {
  registerReferralOnSignup,
  completeReferralIfPending,
  awardOrderDeliveryPoints,
  awardReviewCommentPoints,
  redeemFreeWash,
  REFERRAL_BONUS_POINTS,
  FREE_WASH_THRESHOLD_POINTS,
  ORDER_COMPLETED_POINTS,
  REVIEW_COMMENT_POINTS,
} from "../src/lib/rewards";
import { eq, or } from "drizzle-orm";

describe("Laundry & Reward Points System & Live Location Ping", () => {
  const referrerPhone = "+254711999888";
  const refereePhone = "+254722888777";
  let referrerId: string;
  let refereeId: string;
  let testAddressId: string;
  let testCatalogId: string;
  let referrerCode = "WF-TEST101";

  beforeAll(async () => {
    // Clean test data
    const existingUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.phone, referrerPhone), eq(users.phone, refereePhone)));
    
    for (const u of existingUsers) {
      await db.delete(referrals).where(or(eq(referrals.referrerId, u.id), eq(referrals.referredUserId, u.id)));
      await db.delete(bookings).where(eq(bookings.customerId, u.id));
      await db.delete(users).where(eq(users.id, u.id));
    }

    // Create Referrer User
    const [createdReferrer] = await db
      .insert(users)
      .values({
        name: "Alice Wangari",
        phone: referrerPhone,
        username: "alicew_" + Date.now(),
        role: "client",
        referralCode: referrerCode,
        rewardPointsBalance: 950, // Starts with 950 pts
      })
      .returning();
    referrerId = createdReferrer.id;

    // Create Referee User (Friend signing up)
    const [createdReferee] = await db
      .insert(users)
      .values({
        name: "Bob Mutua",
        phone: refereePhone,
        username: "bobm_" + Date.now(),
        role: "customer",
        referralCode: "WF-BOB202",
        rewardPointsBalance: 0,
      })
      .returning();
    refereeId = createdReferee.id;

    // Create Address for bookings
    const [address] = await db
      .insert(addresses)
      .values({
        userId: refereeId,
        label: "Home",
        lat: -1.286389,
        lng: 36.817223,
        addressText: "Kilimani Crestwood Apt 4B",
      })
      .returning();
    testAddressId = address.id;

    // Ensure catalog item exists
    const catalog = await db.query.priceCatalog.findFirst();
    if (catalog) {
      testCatalogId = catalog.id;
    } else {
      const [newCat] = await db
        .insert(priceCatalog)
        .values({
          category: "basket",
          variant: "Standard 10kg",
          price: 600,
        })
        .returning();
      testCatalogId = newCat.id;
    }
  });

  afterAll(async () => {
    await db.delete(referrals).where(or(eq(referrals.referrerId, referrerId), eq(referrals.referredUserId, refereeId)));
    await db.delete(bookings).where(or(eq(bookings.customerId, refereeId), eq(bookings.customerId, referrerId)));
    await db.delete(users).where(or(eq(users.phone, referrerPhone), eq(users.phone, refereePhone)));
    await pool.end();
  });

  it("Step 1: Referee registers with referral code -> referral status is PENDING", async () => {
    const result = await registerReferralOnSignup(refereeId, referrerCode);
    expect(result.success).toBe(true);

    const ref = await db.query.referrals.findFirst({
      where: eq(referrals.referredUserId, refereeId),
    });

    expect(ref).toBeDefined();
    expect(ref?.status).toBe("PENDING");
    expect(ref?.referrerId).toBe(referrerId);

    // Verify referrer has not received points yet (must book a wash first!)
    const refUser = await db.query.users.findFirst({ where: eq(users.id, referrerId) });
    expect(refUser?.rewardPointsBalance).toBe(950);
  });

  it("Step 2: Referee books a wash -> Referral completes and BOTH earn 50 points", async () => {
    // Referee creates their first booking
    const [newBooking] = await db
      .insert(bookings)
      .values({
        customerId: refereeId,
        addressId: testAddressId,
        pickupWindow: "Morning (8am - 11am)",
        subtotal: 600,
        total: 600,
        status: "PENDING",
        paymentStatus: "UNPAID",
        deviceFingerprint: "fingerprint_test_1",
        ipHash: "hash_test_1",
        estimatedDeliveryAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
      })
      .returning();

    // Complete referral trigger
    const completion = await completeReferralIfPending(refereeId, newBooking.id);
    expect(completion.completed).toBe(true);
    expect(completion.pointsAwarded).toBe(REFERRAL_BONUS_POINTS);

    // Check referral status is now COMPLETED
    const refRecord = await db.query.referrals.findFirst({
      where: eq(referrals.referredUserId, refereeId),
    });
    expect(refRecord?.status).toBe("COMPLETED");
    expect(refRecord?.qualifyingBookingId).toBe(newBooking.id);

    // Referrer now has 950 + 50 = 1000 points!
    const updatedReferrer = await db.query.users.findFirst({ where: eq(users.id, referrerId) });
    expect(updatedReferrer?.rewardPointsBalance).toBe(1000);

    // Referee also has 50 points welcome bonus!
    const updatedReferee = await db.query.users.findFirst({ where: eq(users.id, refereeId) });
    expect(updatedReferee?.rewardPointsBalance).toBe(50);
  });

  it("Step 3: 1,000 points unlocks a Free Wash redemption", async () => {
    // Referrer has 1,000 points, so they can redeem a free wash
    const redemption = await redeemFreeWash(referrerId);
    expect(redemption.success).toBe(true);
    expect(redemption.voucherCode).toContain("FREEWASH-");

    // Balance deducted by 1,000
    const userAfter = await db.query.users.findFirst({ where: eq(users.id, referrerId) });
    expect(userAfter?.rewardPointsBalance).toBe(0);

    // Trying to redeem again with 0 points fails
    const failRedemption = await redeemFreeWash(referrerId);
    expect(failRedemption.success).toBe(false);
    expect(failRedemption.error).toContain("Insufficient points");
  });

  it("Step 4: Making an order and successfully paying after delivery awards 100 points", async () => {
    const [deliveredBooking] = await db
      .insert(bookings)
      .values({
        customerId: refereeId,
        addressId: testAddressId,
        pickupWindow: "Afternoon (1pm - 4pm)",
        subtotal: 1200,
        total: 1200,
        status: "DELIVERED",
        paymentStatus: "PAID",
        deviceFingerprint: "fingerprint_test_2",
        ipHash: "hash_test_2",
      })
      .returning();

    const awarded = await awardOrderDeliveryPoints(deliveredBooking.id);
    expect(awarded).toBe(true);

    const user = await db.query.users.findFirst({ where: eq(users.id, refereeId) });
    // Had 50 pts, now 50 + 100 = 150 pts
    expect(user?.rewardPointsBalance).toBe(150);

    // Double execution does not duplicate points
    const secondTry = await awardOrderDeliveryPoints(deliveredBooking.id);
    expect(secondTry).toBe(false);
  });

  it("Step 5: Leaving a comment/review awards small community points (20 pts)", async () => {
    const awarded = await awardReviewCommentPoints(
      "00000000-0000-0000-0000-000000000001",
      refereeId,
      "Super clean clothes, smells amazing!"
    );
    expect(awarded).toBe(true);

    const user = await db.query.users.findFirst({ where: eq(users.id, refereeId) });
    // Had 150 pts, now 150 + 20 = 170 pts
    expect(user?.rewardPointsBalance).toBe(170);
  });

  it("Step 6: Live GPS Location ping records coordinates, address, and accuracy for courier", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        customerId: refereeId,
        addressId: testAddressId,
        pickupWindow: "Morning",
        subtotal: 800,
        total: 800,
        status: "OUT_FOR_DELIVERY",
        paymentStatus: "PAID",
        deviceFingerprint: "fingerprint_test_3",
        ipHash: "hash_test_3",
      })
      .returning();

    const pingLat = -1.2921;
    const pingLng = 36.8219;
    const addressDetails = "Gate 2, Kilimani Luxury Courts, Argwings Kodhek Rd";
    const accuracy = 4.2;

    const [updated] = await db
      .update(bookings)
      .set({
        riderPingLat: pingLat,
        riderPingLng: pingLng,
        riderPingAddress: addressDetails,
        riderPingAccuracy: accuracy,
        riderLocationPingedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id))
      .returning();

    expect(updated.riderPingLat).toBe(pingLat);
    expect(updated.riderPingLng).toBe(pingLng);
    expect(updated.riderPingAddress).toBe(addressDetails);
    expect(updated.riderPingAccuracy).toBe(accuracy);
    expect(updated.riderLocationPingedAt).toBeInstanceOf(Date);
  });
});
