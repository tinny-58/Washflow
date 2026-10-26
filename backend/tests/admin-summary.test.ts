import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import app from "../src/server";
import { db } from "../src/db";
import { users } from "../src/db/schema";
import { eq } from "drizzle-orm";
import { createSession } from "../src/lib/session";
import argon2 from "argon2";

describe("Admin Summary & Health API", () => {
  let adminCookie: string;

  beforeAll(async () => {
    let admin = await db.query.users.findFirst({
      where: eq(users.role, "admin"),
    });

    if (!admin) {
      const passwordHash = await argon2.hash("AdminTest2026!");
      const [created] = await db
        .insert(users)
        .values({
          name: "Operations Admin",
          username: "ops_admin",
          email: "admin@washflow.ke",
          phone: "+254700000099",
          role: "admin",
          passwordHash,
        })
        .returning();
      admin = created;
    }

    const mockReq = { headers: { "user-agent": "Vitest" }, ip: "127.0.0.1" } as any;
    const mockRes = { cookie: () => {} } as any;
    const token = await createSession({
      userId: admin.id,
      req: mockReq,
      res: mockRes,
    });

    adminCookie = `wf_session=${token}`;
  });

  it("rejects unauthorized access without admin session", async () => {
    const res = await request(app).get("/api/admin/summary");
    expect(res.status).toBe(401);
  });

  it("returns comprehensive summary metrics for transactions, deliveries, traffic, and system downtime alerts", async () => {
    const res = await request(app)
      .get("/api/admin/summary")
      .set("Cookie", adminCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toBeDefined();

    const { summary } = res.body;

    // Transactions
    expect(summary.transactions).toBeDefined();
    expect(typeof summary.transactions.grossRevenue).toBe("number");
    expect(typeof summary.transactions.totalTransactions).toBe("number");
    expect(Array.isArray(summary.transactions.recentPayments)).toBe(true);

    // Deliveries
    expect(summary.deliveries).toBeDefined();
    expect(typeof summary.deliveries.totalDeliveries).toBe("number");
    expect(summary.deliveries.onTimeRate === null || typeof summary.deliveries.onTimeRate === "number").toBe(true);
    expect(summary.deliveries.statusBreakdown).toBeDefined();

    // Traffic
    expect(summary.traffic).toBeDefined();
    expect(typeof summary.traffic.totalUsers).toBe("number");
    expect(typeof summary.traffic.activeSessionsToday).toBe("number");

    // System Health & Downtime
    expect(summary.systemHealth).toBeDefined();
    expect(["operational", "degraded", "warning", "downtime"]).toContain(summary.systemHealth.status);
    expect(summary.systemHealth.database.status).toBe("connected");
    expect(Array.isArray(summary.systemHealth.downtimeAlerts)).toBe(true);

    // Undelivered messages & notifications
    expect(summary.notifications).toBeDefined();
    expect(typeof summary.notifications.undeliveredCount).toBe("number");
    expect(Array.isArray(summary.notifications.failedMessages)).toBe(true);
  });
});
