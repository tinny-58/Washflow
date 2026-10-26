import { Request } from "express";
import { db } from "../db";
import { authAuditLog } from "../db/schema";
import { getClientIpHash } from "./security";

/**
 * Mask PII identifiers for audit logging to comply with GDPR/data minimization standards.
 */
export function maskIdentifier(identifier?: string | null): string {
  if (!identifier) return "unknown";
  const clean = identifier.trim();

  // Email format
  if (clean.includes("@")) {
    const [local, domain] = clean.split("@");
    if (!domain) return "••••@unknown";
    const maskedLocal =
      local.length <= 2
        ? `${local[0]}••••`
        : `${local[0]}••••${local[local.length - 1]}`;
    return `${maskedLocal}@${domain}`;
  }

  // Phone number format (+254...)
  if (clean.startsWith("+") || /^\d+$/.test(clean.replace(/\D/g, ""))) {
    const digits = clean.replace(/\D/g, "");
    if (digits.length <= 4) return "••••";
    const prefix = clean.startsWith("+") ? clean.slice(0, 4) : digits.slice(0, 3);
    const suffix = digits.slice(-3);
    return `${prefix}••••••${suffix}`;
  }

  // Username
  if (clean.length <= 3) return "••••";
  return `${clean[0]}••••${clean[clean.length - 1]}`;
}

export interface LogAuthEventParams {
  actorId?: string | null;
  event: string;
  identifier?: string | null;
  req: Request;
  status?: "success" | "failed";
  metadata?: Record<string, any>;
}

/**
 * Persists an authentication security event to auth_audit_log without storing raw PII.
 */
export async function logAuthEvent({
  actorId = null,
  event,
  identifier,
  req,
  status = "success",
  metadata = {},
}: LogAuthEventParams): Promise<void> {
  try {
    const ipHash = getClientIpHash(req);
    const userAgent = (req.headers["user-agent"] as string) || "unknown";
    const masked = maskIdentifier(identifier);

    await db.insert(authAuditLog).values({
      actorId,
      event,
      identifierMasked: masked,
      ipHash,
      userAgent: userAgent.slice(0, 255),
      status,
      metadata,
    });
  } catch (err) {
    // Audit log write failure must not crash authentication request, but should be logged to stderr
    console.error("Failed to write to auth_audit_log:", err);
  }
}
