import crypto from "crypto";
import { Request } from "express";
import { db } from "../../db";
import { trafficEvents, trafficHourlyRollups, trafficDailyRollups, sessions } from "../../db/schema";
import { getSessionFromReq } from "../session";
import { env } from "../env";
import { eq, sql, and, gte, lte } from "drizzle-orm";

/**
 * Returns a daily-rotating salted hash for an anonymous visitor.
 * Never stores or logs raw IP addresses.
 */
export function getDailyVisitorHash(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const rawIp = typeof forwarded === "string" ? forwarded.split(",")[0].trim() : req.socket.remoteAddress || "127.0.0.1";
  const userAgent = req.headers["user-agent"] || "";

  // Daily rotating salt based on current date string YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);
  const salt = `${env.SESSION_SECRET}:${todayStr}`;

  return crypto
    .createHash("sha256")
    .update(`${rawIp}:${userAgent}:${salt}`)
    .digest("hex");
}

/**
 * Detects device class from user agent string.
 */
export function getDeviceClass(userAgent: string): "mobile" | "tablet" | "desktop" {
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad|playbook|silk/i.test(ua)) return "tablet";
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile";
  return "desktop";
}

/**
 * Records a first-party privacy-preserving visitor or user event.
 * Excludes admin traffic and detected bots.
 */
export async function trackFirstPartyEvent(
  req: Request,
  params: {
    eventType:
      | "visited"
      | "signup_started"
      | "otp_sent"
      | "otp_verified"
      | "account_created"
      | "booking_started"
      | "booking_confirmed"
      | "delivery_paid"
      | "page_view"
      | "login_success"
      | "login_failed";
    path: string;
    referrerType?: "direct" | "referral_link" | "campaign" | "other";
    campaignSource?: string;
    neighborhood?: string;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  try {
    const userAgent = req.headers["user-agent"] || "";

    // Ignore known bots & web crawlers
    if (/bot|crawl|spider|googlebot|bingbot|yandex|slurp|facebookexternalhit/i.test(userAgent)) {
      return;
    }

    // Check session
    const session = await getSessionFromReq(req);
    // Exclude admin traffic from analytics
    if (session && session.role === "admin") {
      return;
    }

    const visitorHash = getDailyVisitorHash(req);
    const customerId = session?.userId || null;
    const deviceClass = getDeviceClass(userAgent);

    await db.insert(trafficEvents).values({
      visitorHash,
      customerId,
      sessionId: session?.id || null,
      eventType: params.eventType,
      path: params.path,
      referrerType: params.referrerType || "direct",
      campaignSource: params.campaignSource || null,
      deviceClass,
      neighborhood: params.neighborhood || null,
      metadata: params.metadata || null,
      createdAt: new Date(),
    });

    // Throttled atomic update for lastActiveAt (at most once every 5 minutes per session)
    if (session?.id) {
      await db
        .update(sessions)
        .set({ lastActiveAt: new Date() })
        .where(
          and(
            eq(sessions.id, session.id),
            sql`${sessions.lastActiveAt} < NOW() - INTERVAL '5 minutes'`
          )
        );
    }
  } catch (err) {
    // Non-blocking telemetry error
    console.warn("[Telemetry] Error recording first party event:", err);
  }
}

/**
 * Aggregates daily rollups for the Traffic & Activity dashboard.
 */
export async function computeTrafficRollup(dateStr: string): Promise<void> {
  const startOfDay = new Date(`${dateStr}T00:00:00+03:00`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999+03:00`);

  const events = await db
    .select({
      eventType: trafficEvents.eventType,
      visitorHash: trafficEvents.visitorHash,
      referrerType: trafficEvents.referrerType,
      deviceClass: trafficEvents.deviceClass,
      neighborhood: trafficEvents.neighborhood,
    })
    .from(trafficEvents)
    .where(
      and(
        gte(trafficEvents.createdAt, startOfDay),
        lte(trafficEvents.createdAt, endOfDay)
      )
    );

  const uniqueVisitors = new Set(events.map((e) => e.visitorHash)).size;
  const newRegistrations = events.filter((e) => e.eventType === "account_created").length;

  // Funnel counts
  const funnel = {
    visited: new Set(events.filter((e) => e.eventType === "visited" || e.eventType === "page_view").map((e) => e.visitorHash)).size,
    signup_started: new Set(events.filter((e) => e.eventType === "signup_started").map((e) => e.visitorHash)).size,
    otp_sent: events.filter((e) => e.eventType === "otp_sent").length,
    otp_verified: events.filter((e) => e.eventType === "otp_verified").length,
    account_created: newRegistrations,
    booking_started: events.filter((e) => e.eventType === "booking_started").length,
    booking_confirmed: events.filter((e) => e.eventType === "booking_confirmed").length,
    delivery_paid: events.filter((e) => e.eventType === "delivery_paid").length,
  };

  // Channel breakdown
  const channels: Record<string, number> = {};
  events.forEach((e) => {
    channels[e.referrerType] = (channels[e.referrerType] || 0) + 1;
  });

  // Device breakdown
  const devices: Record<string, number> = {};
  events.forEach((e) => {
    if (e.deviceClass) {
      devices[e.deviceClass] = (devices[e.deviceClass] || 0) + 1;
    }
  });

  // Neighborhood breakdown (only include neighborhoods with at least 5 customers)
  const areaCounts: Record<string, number> = {};
  events.forEach((e) => {
    if (e.neighborhood) {
      areaCounts[e.neighborhood] = (areaCounts[e.neighborhood] || 0) + 1;
    }
  });
  const safeAreas: Record<string, number> = {};
  for (const [area, count] of Object.entries(areaCounts)) {
    if (count >= 5) {
      safeAreas[area] = count;
    }
  }

  await db
    .insert(trafficDailyRollups)
    .values({
      date: dateStr,
      uniqueVisitors,
      newRegistrations,
      funnelCounts: funnel,
      channelBreakdown: channels,
      deviceBreakdown: devices,
      areaBreakdown: safeAreas,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: trafficDailyRollups.date,
      set: {
        uniqueVisitors,
        newRegistrations,
        funnelCounts: funnel,
        channelBreakdown: channels,
        deviceBreakdown: devices,
        areaBreakdown: safeAreas,
        updatedAt: new Date(),
      },
    });
}
