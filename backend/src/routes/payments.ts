import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { bookings, payments, auditLog, users } from "../db/schema";
import { getSessionFromReq } from "../lib/session";
import { normalizePhone } from "../lib/phone";
import { mpesaProvider } from "../lib/payments/mpesa";
import { broadcastAdminEvent, sendClientEvent } from "../lib/sse";
import { evaluateOrderQualification } from "../lib/rewards";
import { eq } from "drizzle-orm";

const router = Router();

const stkRequestSchema = z.object({
  bookingId: z.string().uuid(),
  phone: z.string().min(5).optional(),
  amount: z.number().int().positive(),
  type: z.enum(["service", "tip"]).default("service"),
});

// POST /api/payments/mpesa/stk
router.post("/mpesa/stk", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const parseResult = stkRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: "Invalid payment request",
        details: parseResult.error.flatten(),
      });
    }

    const { bookingId, phone: submittedPhone, amount, type } = parseResult.data;

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId),
    });

    if (!booking) {
      return res.status(404).json({ error: "Booking not found" });
    }

    if (session.role !== "admin" && booking.customerId !== session.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (type === "service") {
      const targetAmount = booking.total;
      if (amount !== targetAmount) {
        return res.status(400).json({
          error: `Payment amount (KES ${amount}) does not match booking total (KES ${targetAmount}).`,
        });
      }
    }

    const customerUser = await db.query.users.findFirst({
      where: eq(users.id, booking.customerId),
    });

    const targetPhone = normalizePhone(submittedPhone || customerUser?.phone || session.phone || "");
    if (!targetPhone) {
      return res.status(422).json({ error: "Invalid mobile phone number for M-Pesa push." });
    }

    const result = await mpesaProvider.initiatePayment({
      bookingId,
      amount,
      phone: targetPhone,
      type,
    });

    const [createdPayment] = await db
      .insert(payments)
      .values({
        bookingId,
        type,
        provider: "mpesa",
        providerRef: result.providerRef,
        amount,
        status: "PENDING",
      })
      .returning();

    await db.insert(auditLog).values({
      actorId: session.userId,
      action: "MPESA_STK_INITIATED",
      entity: "payments",
      entityId: createdPayment.id,
      meta: {
        bookingId,
        paymentId: createdPayment.id,
        amount,
        type,
        providerRef: result.providerRef,
      },
    });

    return res.json({
      success: true,
      providerRef: result.providerRef,
      message: result.customerMessage,
      paymentId: createdPayment.id,
    });
  } catch (error) {
    console.error("M-Pesa STK push error:", error);
    return res.status(500).json({
      error: "Failed to initiate M-Pesa STK push. Please verify your phone number and try again.",
    });
  }
});

async function handleDarajaCallback(rawBody: any): Promise<{ status: number; body: any }> {
  try {
    const verification = await mpesaProvider.verifyCallback(rawBody);

    if (!verification.isValid || !verification.providerRef) {
      console.warn("Invalid M-Pesa callback payload received:", rawBody);
      return { status: 200, body: { ResultCode: 1, ResultDesc: "Rejected - Invalid payload" } };
    }

    const existingPayment = await db.query.payments.findFirst({
      where: eq(payments.providerRef, verification.providerRef),
    });

    if (!existingPayment) {
      console.warn(`Payment with providerRef ${verification.providerRef} not found.`);
      return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted - Record not found" } };
    }

    if (existingPayment.status === "COMPLETED") {
      return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted - Already processed" } };
    }

    if (!verification.isSuccess) {
      await db
        .update(payments)
        .set({
          status: "FAILED",
          rawCallbackJson: rawBody,
        })
        .where(eq(payments.id, existingPayment.id));

      await db.insert(auditLog).values({
        action: "PAYMENT_FAILED_OR_CANCELLED",
        entity: "payments",
        entityId: existingPayment.id,
        meta: {
          providerRef: verification.providerRef,
          reason: verification.failureReason,
        },
      });

      return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted - Failure recorded" } };
    }

    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, existingPayment.bookingId),
    });

    if (!booking) {
      return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted - Booking missing" } };
    }

    const currentTotal = booking.total || 0;

    if (existingPayment.type === "service") {
      if (verification.amount < currentTotal) {
        await db
          .update(payments)
          .set({
            status: "FAILED",
            rawCallbackJson: rawBody,
          })
          .where(eq(payments.id, existingPayment.id));

        await db.insert(auditLog).values({
          action: "PAYMENT_UNDERPAYMENT_FLAGGED",
          entity: "payments",
          entityId: existingPayment.id,
          meta: { paid: verification.amount, expected: currentTotal },
        });

        return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted - Underpayment flagged" } };
      }

      await db
        .update(payments)
        .set({
          status: "COMPLETED",
          rawCallbackJson: rawBody,
        })
        .where(eq(payments.id, existingPayment.id));

      await db
        .update(bookings)
        .set({
          paymentStatus: "PAID",
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));

      // Evaluate qualification and loyalty points on Delivery if already delivered
      if (booking.status === "DELIVERED") {
        evaluateOrderQualification(booking.id, "payment_confirmed").catch((err) =>
          console.error("[Rewards] Failed to evaluate order qualification on payment:", err)
        );
      }
    } else if (existingPayment.type === "tip") {
      await db
        .update(payments)
        .set({
          status: "COMPLETED",
          rawCallbackJson: rawBody,
        })
        .where(eq(payments.id, existingPayment.id));

      const updatedTip = (booking.tipAmount || 0) + verification.amount;
      await db
        .update(bookings)
        .set({
          tipAmount: updatedTip,
          total: currentTotal + verification.amount,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
    }

    await db.insert(auditLog).values({
      action: "PAYMENT_COMPLETED_CALLBACK",
      entity: "payments",
      entityId: existingPayment.id,
      meta: {
        bookingId: booking.id,
        amount: verification.amount,
        type: existingPayment.type,
        receipt: verification.receiptNumber,
        providerRef: verification.providerRef,
      },
    });

    broadcastAdminEvent("PAYMENT_RECEIVED", {
      bookingId: booking.id,
      paymentId: existingPayment.id,
      amount: verification.amount,
      type: existingPayment.type,
      receipt: verification.receiptNumber,
    });

    sendClientEvent(booking.customerId, "PAYMENT_CONFIRMED", {
      bookingId: booking.id,
      paymentId: existingPayment.id,
      amount: verification.amount,
      type: existingPayment.type,
      receipt: verification.receiptNumber,
    });

    return { status: 200, body: { ResultCode: 0, ResultDesc: "Accepted" } };
  } catch (error) {
    console.error("M-Pesa callback handling error:", error);
    return { status: 500, body: { ResultCode: 1, ResultDesc: "Internal server error" } };
  }
}

// POST /api/payments/mpesa/callback
router.post("/mpesa/callback", async (req: Request, res: Response) => {
  const result = await handleDarajaCallback(req.body);
  return res.status(result.status).json(result.body);
});

// POST /api/payments/mpesa/simulate (Strictly for isolated automated testing environments)
router.post("/mpesa/simulate", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "test") {
    return res.status(404).json({ error: "Endpoint not found." });
  }

  const session = await getSessionFromReq(req);
  if (!session || session.role !== "admin") {
    return res.status(403).json({ error: "Unauthorized access to simulation tool." });
  }

  try {
    const { providerRef, amount = 300, success = true } = req.body;

    const payment = await db.query.payments.findFirst({
      where: eq(payments.providerRef, providerRef),
    });

    if (!payment) {
      return res.status(404).json({ error: "Payment reference not found." });
    }

    const mockDarajaCallback = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MOCK_MERCHANT_REQ_123",
          CheckoutRequestID: providerRef,
          ResultCode: success ? 0 : 1032,
          ResultDesc: success ? "The service request is processed successfully." : "Request cancelled by user",
          CallbackMetadata: success
            ? {
                Item: [
                  { Name: "Amount", Value: amount },
                  { Name: "MpesaReceiptNumber", Value: "QHD" + Math.floor(10000000 + Math.random() * 90000000) },
                  { Name: "Balance" },
                  { Name: "TransactionDate", Value: 20261019073000 },
                  { Name: "PhoneNumber", Value: 254712345678 },
                ],
              }
            : undefined,
        },
      },
    };

    const result = await handleDarajaCallback(mockDarajaCallback);
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Payment simulation error:", error);
    return res.status(500).json({ error: "Simulation failed." });
  }
});

export default router;
