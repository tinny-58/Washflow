import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, auditLog } from "@/db/schema";
import { requireAdminSession } from "@/lib/session";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminSession = await requireAdminSession();
    const { id: customerId } = await params;

    const customer = await db.query.users.findFirst({
      where: eq(users.id, customerId),
    });

    if (!customer) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const nextBlockedState = !customer.isBlocked;

    const [updatedCustomer] = await db
      .update(users)
      .set({ isBlocked: nextBlockedState })
      .where(eq(users.id, customerId))
      .returning();

    await db.insert(auditLog).values({
      actorId: adminSession.userId,
      action: nextBlockedState ? "CUSTOMER_BLOCKED" : "CUSTOMER_UNBLOCKED",
      entity: "users",
      entityId: customerId,
      meta: { phone: customer.phone, name: customer.name },
    });

    return NextResponse.json({
      success: true,
      isBlocked: updatedCustomer.isBlocked,
      message: nextBlockedState
        ? "Customer has been blocked from booking."
        : "Customer has been unblocked.",
    });
  } catch (error) {
    console.error("Block customer error:", error);
    return NextResponse.json({ error: "Failed to update customer status." }, { status: 500 });
  }
}
