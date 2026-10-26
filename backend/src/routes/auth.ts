import { Router, Request, Response } from "express";
import { z } from "zod";
import argon2 from "argon2";
import { db } from "../db";
import { users, customerOutboxEvents, referrals, referralEvents } from "../db/schema";
import { eq, or, sql } from "drizzle-orm";
import { broadcastAdminEvent } from "../lib/sse";
import { trackFirstPartyEvent } from "../lib/tracking/first-party-tracker";
import { env } from "../lib/env";
import { getClientIp, getClientIpHash } from "../lib/security";
import { checkRateLimit } from "../lib/rate-limiter";
import { verifyTurnstileToken } from "../lib/turnstile";
import {
  validateUsername,
  generateAvailableUsernameSuggestions,
  validatePasswordNist,
  normalizePhoneNumber,
} from "../lib/validation";
import { verifyGoogleIdToken } from "../lib/google-auth";
import {
  createAndStoreOtp,
  verifyAndConsumeOtp,
  consumeVerificationToken,
} from "../lib/otp";
import { maskPhone } from "../lib/otp/delivery-provider";
import { checkNumberOnWhatsApp } from "../lib/baileys/queue";
import { baileysService } from "../lib/baileys/baileys-service";
import {
  createSession,
  createPreauthSession,
  getPreauthSessionFromReq,
  consumePreauthSession,
  getSessionFromReq,
  revokeCurrentSession,
  revokeAllUserSessions,
  verifyPasswordConstantTime,
} from "../lib/session";
import { logAuthEvent } from "../lib/audit";
import {
  generateCsprngCode,
  attributeReferralOnSignup,
  verifyAttributionCookie,
  validateReferralCodeLookup,
  signAttributionCookie,
  recordReferralVisit,
} from "../lib/rewards";
import { referralCodes } from "../db/schema";

const router = Router();

// ============================================================================
// 1. SIGNUP: REQUEST OTP VIA WHATSAPP (STEP 1A)
// ============================================================================
const signupOtpRequestSchema = z.object({
  phone: z.string().min(5).max(30),
  turnstileToken: z.string().optional(),
});

router.post("/signup/otp/request", async (req: Request, res: Response) => {
  try {
    const parse = signupOtpRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid phone number payload." });
    }

    const { phone: rawPhone, turnstileToken } = parse.data;
    const clientIp = getClientIp(req);

    // 1. Bot Protection (Cloudflare Turnstile)
    const botCheck = await verifyTurnstileToken({ token: turnstileToken, clientIp });
    if (!botCheck.success) {
      return res.status(400).json({ error: botCheck.error || "Bot verification failed." });
    }

    // 2. Phone normalization and country allowlist check
    const phoneNorm = normalizePhoneNumber(rawPhone);
    if (!phoneNorm.valid || !phoneNorm.e164) {
      return res.status(422).json({ error: phoneNorm.error || "Invalid phone number." });
    }

    const e164 = phoneNorm.e164;
    const maskedDest = maskPhone(e164);

    // 3. Anti-enumeration: Check if phone is already registered
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.phoneE164, e164), eq(users.phone, e164)))
      .limit(1);

    if (existing.length > 0) {
      await logAuthEvent({
        event: "signup_otp_requested_existing_phone",
        identifier: e164,
        req,
        status: "success",
      });

      // Disclose nothing: return generic success body so attackers cannot enumerate
      return res.json({
        status: "ok",
        retryAfter: 60,
        maskedDestination: maskedDest,
      });
    }

    // 4. Baileys: verify number exists on WhatsApp network
    if (!baileysService.isConnected()) {
      return res.status(503).json({
        error: "WhatsApp delivery service is temporarily unavailable. Please try again shortly.",
      });
    }

    const waCheck = await checkNumberOnWhatsApp(e164);
    if (!waCheck.exists) {
      if (waCheck.error) {
        return res.status(503).json({
          error: "WhatsApp delivery service is temporarily unavailable. Please try again shortly.",
        });
      }
      return res.status(422).json({
        error:
          "This phone number is not registered on WhatsApp. WashFlow requires an active WhatsApp number for pickup and delivery coordination.",
      });
    }

    // 5. Generate and store OTP (automatically queues delivery to Baileys worker)
    const sessionBindingId =
      req.cookies?.["wf_preauth"] ||
      req.cookies?.["__Host-wf_preauth"] ||
      getClientIp(req);

    const otpResult = await createAndStoreOtp({
      e164Phone: e164,
      purpose: "signup",
      clientIp,
      sessionBindingId,
    });

    if (!otpResult.success) {
      return res.status(429).json({
        error: otpResult.error,
        retryAfter: otpResult.retryAfterSeconds || 60,
      });
    }

    await logAuthEvent({
      event: "signup_otp_dispatched",
      identifier: e164,
      req,
      status: "success",
    });

    trackFirstPartyEvent(req, {
      eventType: "otp_sent",
      path: "/auth/signup/otp",
    }).catch(() => {});

    return res.json({
      status: "ok",
      retryAfter: otpResult.retryAfterSeconds || 60,
      maskedDestination: maskedDest,
    });
  } catch (err) {
    console.error("Signup OTP request error:", err);
    return res.status(500).json({ error: "Failed to process verification request." });
  }
});

// ============================================================================
// 2. SIGNUP / LOGIN: GOOGLE IDENTITY SERVICES (DECISION A & BINDING)
// ============================================================================
const googleAuthSchema = z.object({
  credential: z.string().min(10),
});

router.post("/google", async (req: Request, res: Response) => {
  try {
    const parse = googleAuthSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Missing Google authentication credential." });
    }

    const { credential } = parse.data;

    // Cryptographic server-side verification against Google JWKS
    const verifyResult = await verifyGoogleIdToken(credential);
    if (!verifyResult.success || !verifyResult.user) {
      return res.status(401).json({ error: "Unable to verify Google identity." });
    }

    const googleUser = verifyResult.user;
    const cleanEmail = googleUser.email.toLowerCase();

    // Check if account already registered by Google Sub or Email
    const existing = await db.query.users.findFirst({
      where: or(eq(users.googleSub, googleUser.sub), eq(users.email, cleanEmail)),
    });

    if (existing) {
      // DECISION A: Returning Google user signs in directly!
      if (!existing.googleSub) {
        await db
          .update(users)
          .set({ googleSub: googleUser.sub, updatedAt: new Date() })
          .where(eq(users.id, existing.id));
      }

      await createSession({
        userId: existing.id,
        req,
        res,
      });

      await logAuthEvent({
        actorId: existing.id,
        event: "google_login_success",
        identifier: cleanEmail,
        req,
        status: "success",
      });

      let redirectTo = "/book";
      if (existing.role === "admin") redirectTo = "/admin";
      else if (existing.role === "client") redirectTo = "/client";

      return res.json({
        success: true,
        user: {
          id: existing.id,
          name: existing.name,
          username: existing.username,
          role: existing.role,
        },
        redirectTo,
      });
    }

    // New Google user: requires WhatsApp phone binding to receive order coordination
    await createPreauthSession({
      purpose: "google_signup",
      metadata: {
        googleSub: googleUser.sub,
        email: cleanEmail,
        name: googleUser.name,
      },
      req,
      res,
    });

    return res.json({
      success: true,
      phoneRequired: true,
      message: "Please provide your WhatsApp phone number to complete account setup.",
    });
  } catch (err) {
    console.error("Google auth error:", err);
    return res.status(500).json({ error: "Failed to authenticate with Google." });
  }
});

// Link phone for new Google signup
const googleLinkPhoneSchema = z.object({
  phone: z.string().min(5).max(30),
  turnstileToken: z.string().optional(),
});

router.post("/google/link-phone", async (req: Request, res: Response) => {
  try {
    const preauth = await getPreauthSessionFromReq(req, "google_signup");
    if (!preauth.valid || !preauth.metadata) {
      return res.status(401).json({ error: "Session expired. Please sign in with Google again." });
    }

    const parse = googleLinkPhoneSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid phone number." });
    }

    const { phone: rawPhone, turnstileToken } = parse.data;
    const clientIp = getClientIp(req);

    const botCheck = await verifyTurnstileToken({ token: turnstileToken, clientIp });
    if (!botCheck.success) {
      return res.status(400).json({ error: botCheck.error || "Bot verification failed." });
    }

    const phoneNorm = normalizePhoneNumber(rawPhone);
    if (!phoneNorm.valid || !phoneNorm.e164) {
      return res.status(422).json({ error: phoneNorm.error || "Invalid phone number." });
    }

    const e164 = phoneNorm.e164;
    if (!baileysService.isConnected()) {
      return res.status(503).json({
        error: "WhatsApp delivery service is temporarily unavailable. Please try again shortly.",
      });
    }

    const waCheck = await checkNumberOnWhatsApp(e164);
    if (!waCheck.exists) {
      if (waCheck.error) {
        return res.status(503).json({
          error: "WhatsApp delivery service is temporarily unavailable. Please try again shortly.",
        });
      }
      return res.status(422).json({
        error: "This phone number is not registered on WhatsApp. WashFlow requires an active WhatsApp number.",
      });
    }

    const sessionBindingId =
      req.cookies?.["wf_preauth"] ||
      req.cookies?.["__Host-wf_preauth"] ||
      getClientIp(req);

    // Generate and send OTP to this WhatsApp number
    const otpResult = await createAndStoreOtp({
      e164Phone: e164,
      purpose: "signup",
      clientIp,
      sessionBindingId,
    });

    if (!otpResult.success) {
      return res.status(429).json({
        error: otpResult.error,
        retryAfter: otpResult.retryAfterSeconds || 60,
      });
    }

    return res.json({
      status: "ok",
      retryAfter: otpResult.retryAfterSeconds || 60,
      maskedDestination: maskPhone(e164),
    });
  } catch (err) {
    console.error("Google link phone error:", err);
    return res.status(500).json({ error: "Failed to send verification code." });
  }
});

// ============================================================================
// 3. SIGNUP: VERIFY OTP CODE & ISSUE VERIFICATION TICKET
// ============================================================================
const otpVerifySchema = z.object({
  identifier: z.string().min(3).max(254),
  code: z.string().length(6),
});

router.post("/signup/otp/verify", async (req: Request, res: Response) => {
  try {
    const parse = otpVerifySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Please enter the 6-digit verification code." });
    }

    const { identifier: rawId, code } = parse.data;
    const phoneNorm = normalizePhoneNumber(rawId);
    const cleanId = phoneNorm.valid && phoneNorm.e164 ? phoneNorm.e164 : rawId.trim();

    const sessionBindingId =
      req.cookies?.["wf_preauth"] ||
      req.cookies?.["__Host-wf_preauth"] ||
      getClientIp(req);

    const result = await verifyAndConsumeOtp({
      e164Phone: cleanId,
      code,
      purpose: "signup",
      sessionBindingId,
    });

    if (!result.success || !result.verificationToken) {
      await logAuthEvent({
        event: "signup_otp_verification_failed",
        identifier: cleanId,
        req,
        status: "failed",
        metadata: { error: result.error },
      });
      return res.status(400).json({ error: result.error || "Invalid verification code." });
    }

    await logAuthEvent({
      event: "signup_otp_verification_success",
      identifier: cleanId,
      req,
      status: "success",
    });

    trackFirstPartyEvent(req, {
      eventType: "otp_verified",
      path: "/auth/signup/otp/verify",
    }).catch(() => {});

    // Return single-use signed verification token
    return res.json({
      success: true,
      verificationToken: result.verificationToken,
    });
  } catch (err) {
    console.error("Signup OTP verify error:", err);
    return res.status(500).json({ error: "Verification failed." });
  }
});

// ============================================================================
// 4. USERNAME AVAILABILITY CHECK & SUGGESTIONS
// ============================================================================
router.get("/check-username", async (req: Request, res: Response) => {
  try {
    const raw = req.query.username;
    if (typeof raw !== "string" || !raw.trim()) {
      return res.status(400).json({ available: false, error: "Username parameter is required." });
    }

    const clientIp = getClientIp(req);
    const rateCheck = await checkRateLimit(`ratelimit:check_user:${clientIp}`, 30, 60);
    if (!rateCheck.success) {
      return res.status(429).json({ available: false, error: "Too many checks. Please slow down." });
    }

    const valResult = validateUsername(raw);
    if (!valResult.valid) {
      const suggestions = await generateAvailableUsernameSuggestions(raw);
      return res.json({
        available: false,
        error: valResult.error,
        suggestions,
      });
    }

    const cleanUsername = valResult.cleanUsername!;

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${cleanUsername})`)
      .limit(1);

    if (existing.length > 0) {
      const suggestions = await generateAvailableUsernameSuggestions(cleanUsername);
      return res.json({
        available: false,
        error: `Username '${cleanUsername}' is already taken.`,
        suggestions,
      });
    }

    return res.json({
      available: true,
      cleanUsername,
    });
  } catch (err) {
    console.error("Check username error:", err);
    return res.status(500).json({ available: false, error: "Unable to verify username." });
  }
});

// ============================================================================
// 5. SIGNUP: FINALIZE REGISTRATION WITH USERNAME & PASSWORD (STEP 2)
// ============================================================================
const signupCompleteSchema = z.object({
  verificationToken: z.string().min(10),
  username: z.string().min(3).max(30),
  password: z.string().min(10).max(128),
  referralCode: z.string().optional(),
});

router.post("/signup/complete", async (req: Request, res: Response) => {
  try {
    const parse = signupCompleteSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid registration payload." });
    }

    const { verificationToken, username, password } = parse.data;

    // 1. Atomically consume the single-use verification token from PostgreSQL
    const tokenResult = await consumeVerificationToken({
      token: verificationToken,
      expectedPurpose: "signup",
    });

    if (!tokenResult.valid) {
      return res.status(403).json({
        error: tokenResult.error || "Your verification session has expired. Please request a new code.",
      });
    }

    const phoneFromToken = tokenResult.metadata?.phone || null;

    // 2. Validate username
    const userVal = validateUsername(username);
    if (!userVal.valid || !userVal.cleanUsername) {
      return res.status(422).json({ error: userVal.error });
    }
    const cleanUsername = userVal.cleanUsername;

    // 3. Validate password per NIST SP 800-63B
    const passVal = await validatePasswordNist(password);
    if (!passVal.valid) {
      return res.status(422).json({ error: passVal.error });
    }

    // 4. Hash password with tuned Argon2id
    const passwordHash = await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    // Check if Google metadata exists in preauth session
    const preauth = await getPreauthSessionFromReq(req, "google_signup");
    const googleMeta = preauth.valid ? preauth.metadata : null;

    const email = googleMeta?.email || null;
    const googleSub = googleMeta?.googleSub || null;
    const authProvider = googleSub ? "google" : "whatsapp";
    const displayName = googleMeta?.name || cleanUsername;
    const referralCode = generateCsprngCode();

    // 5. Insert user and handle PostgreSQL 23505 race conditions
    let createdUser;
    try {
      const [inserted] = await db
        .insert(users)
        .values({
          name: displayName,
          username: cleanUsername,
          passwordHash,
          phone: phoneFromToken,
          phoneE164: phoneFromToken,
          email,
          googleSub,
          authProvider,
          phoneVerifiedAt: phoneFromToken ? new Date() : null,
          role: "user",
          referralCode,
        })
        .returning();
      createdUser = inserted;

      // Register CSPRNG code in referral_codes table
      await db
        .insert(referralCodes)
        .values({
          userId: createdUser.id,
          code: referralCode,
          active: true,
        })
        .catch((err) => console.warn("[Auth] referral_codes insert warning:", err));

      // Transactional Outbox: Record customer.created event
      await db.insert(customerOutboxEvents).values({
        eventType: "customer.created",
        aggregateId: createdUser.id,
        payload: {
          id: createdUser.id,
          name: createdUser.name,
          username: createdUser.username,
          role: createdUser.role,
          phone: createdUser.phone,
          authProvider: createdUser.authProvider,
          createdAt: createdUser.createdAt,
        },
      });

      // Broadcast customer created via admin SSE
      broadcastAdminEvent("customer_created", {
        id: createdUser.id,
        name: createdUser.name,
        username: createdUser.username,
        role: createdUser.role,
        authProvider: createdUser.authProvider,
        createdAt: createdUser.createdAt,
      });

      // Telemetry: Funnel account created
      trackFirstPartyEvent(req, {
        eventType: "account_created",
        path: "/signup/complete",
        metadata: { authProvider },
      }).catch(() => {});
    } catch (dbErr: any) {
      if (dbErr?.code === "23505") {
        if (dbErr?.detail?.includes("username") || dbErr?.constraint?.includes("username")) {
          const suggestions = await generateAvailableUsernameSuggestions(cleanUsername);
          return res.status(409).json({
            error: `Username '${cleanUsername}' was just taken. Please choose another.`,
            suggestions,
          });
        }
        return res.status(409).json({
          error: "An account with these verified credentials already exists. Please sign in.",
        });
      }
      throw dbErr;
    }

    // Clear preauth session if present
    if (preauth.valid) {
      await consumePreauthSession(req, res);
    }

    // 5b. Attribution: Check referral code from signed attribution cookie or body (First-touch wins)
    const cookieAttribution =
      verifyAttributionCookie(req.cookies?.["wf_ref_attribution"]) ||
      (req.cookies?.["wf_ref_code"] ? req.cookies["wf_ref_code"].trim().toUpperCase() : null);

    const manualCode =
      parse.data.referralCode && parse.data.referralCode.trim()
        ? parse.data.referralCode.trim().toUpperCase()
        : typeof (req.body as any)?.referralCode === "string" && (req.body as any).referralCode.trim()
        ? (req.body as any).referralCode.trim().toUpperCase()
        : null;

    const codeToAttribute = cookieAttribution || manualCode;
    const attributionSource = cookieAttribution ? "link" : manualCode ? "manual_code" : "link";

    if (codeToAttribute) {
      try {
        await attributeReferralOnSignup({
          refereeUserId: createdUser.id,
          refereePhoneE164: phoneFromToken,
          refereeEmail: email,
          rawCode: codeToAttribute,
          deviceFingerprint: req.headers["x-device-fingerprint"] as string,
          attributionSource,
        });
      } catch (refErr) {
        console.warn("[Auth Signup] Attribution warning:", refErr);
      }
    }

    // 6. Create authenticated session in database & attach httpOnly cookie
    await createSession({
      userId: createdUser.id,
      req,
      res,
    });

    await logAuthEvent({
      actorId: createdUser.id,
      event: "signup_complete_success",
      identifier: cleanUsername,
      req,
      status: "success",
    });

    return res.status(201).json({
      success: true,
      user: {
        id: createdUser.id,
        name: createdUser.name,
        username: createdUser.username,
        role: createdUser.role,
      },
      redirectTo: "/client",
    });
  } catch (err) {
    console.error("Signup complete error:", err);
    return res.status(500).json({ error: "Registration failed." });
  }
});

// ============================================================================
// 5c. PUBLIC REFERRAL CODE VALIDATION (Zero Identity Disclosure)
// ============================================================================
router.get("/referral/check", async (req: Request, res: Response) => {
  try {
    const rawCode = (req.query.code as string) || "";
    const result = await validateReferralCodeLookup(rawCode);
    return res.json(result);
  } catch (err) {
    return res.json({ valid: false });
  }
});

// ============================================================================
// 6. LOGIN: RETURNING CUSTOMERS & ADMIN STEP-UP (DECISION B)
// ============================================================================
const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(128),
});

router.post("/login", async (req: Request, res: Response) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid username or password." });
    }

    const { username, password } = parse.data;
    const clientIp = getClientIp(req);
    const cleanUsername = username.normalize("NFKC").trim().toLowerCase().replace(/^@/, "");

    // 1. Rate limiting: IP throttle (20/min) & username throttle (10/min)
    const ipThrottle = await checkRateLimit(`ratelimit:login:ip:${clientIp}`, 20, 60);
    const userThrottle = await checkRateLimit(`ratelimit:login:user:${cleanUsername}`, 10, 60);

    if (!ipThrottle.success || !userThrottle.success) {
      await logAuthEvent({
        event: "login_throttled",
        identifier: cleanUsername,
        req,
        status: "failed",
      });
      return res.status(429).json({
        error: "Too many login attempts. Please wait a moment before trying again.",
      });
    }

    // 2. Lookup user case-insensitively by username, email, or phone
    const user = await db.query.users.findFirst({
      where: or(
        sql`lower(${users.username}) = lower(${cleanUsername})`,
        sql`lower(${users.email}) = lower(${cleanUsername})`,
        eq(users.phoneE164, cleanUsername),
        eq(users.phone, cleanUsername)
      ),
    });

    // 3. Constant-time password verification (prevents timing attacks)
    const isPasswordValid = await verifyPasswordConstantTime({
      candidatePassword: password,
      storedHash: user?.passwordHash,
    });

    if (!user || !isPasswordValid) {
      await logAuthEvent({
        actorId: user?.id || null,
        event: "login_failed",
        identifier: cleanUsername,
        req,
        status: "failed",
      });
      return res.status(401).json({ error: "Invalid username or password." });
    }

    if (user.isBlocked) {
      await logAuthEvent({
        actorId: user.id,
        event: "login_blocked_account",
        identifier: cleanUsername,
        req,
        status: "failed",
      });
      return res.status(403).json({ error: "Invalid username or password." });
    }

    // Admin login: If in test mode or WhatsApp Gateway is connected, require WhatsApp OTP step-up.
    // If WhatsApp Gateway is not yet connected in dev/prod, allow direct admin password login
    // so the admin can access /admin/whatsapp to scan the QR code and connect!
    if (user.role === "admin") {
      const shouldRequireStepup = env.NODE_ENV === "test" || baileysService.isConnected();

      if (shouldRequireStepup) {
        const adminPhone = user.phoneE164 || user.phone;
        if (!adminPhone) {
          return res.status(500).json({
            error: "Admin account has no WhatsApp phone number configured. Please run CLI setup.",
          });
        }

        // Create preauth session
        await createPreauthSession({
          userId: user.id,
          purpose: "admin_stepup",
          metadata: { adminId: user.id, phone: adminPhone },
          req,
          res,
        });

        const sessionBindingId =
          req.cookies?.["wf_preauth"] ||
          req.cookies?.["__Host-wf_preauth"] ||
          getClientIp(req);

        // Generate and send WhatsApp OTP
        const otpResult = await createAndStoreOtp({
          e164Phone: adminPhone,
          purpose: "admin_stepup",
          clientIp,
          sessionBindingId,
        });

        if (!otpResult.success) {
          return res.status(429).json({
            error: otpResult.error,
            retryAfter: otpResult.retryAfterSeconds,
          });
        }

        await logAuthEvent({
          actorId: user.id,
          event: "admin_login_stepup_required",
          identifier: cleanUsername,
          req,
          status: "success",
        });

        return res.json({
          success: true,
          stepUpRequired: true,
          maskedDestination: maskPhone(adminPhone),
          message: "Step-up verification code sent to admin WhatsApp.",
        });
      }

      // WhatsApp Gateway offline/disconnected: Allow direct login so admin can link WhatsApp
      await createSession({
        userId: user.id,
        req,
        res,
      });

      await logAuthEvent({
        actorId: user.id,
        event: "admin_login_direct_unconnected_gateway",
        identifier: cleanUsername,
        req,
        status: "success",
      });

      return res.json({
        success: true,
        redirect: "/admin",
        redirectTo: "/admin",
        user: {
          id: user.id,
          name: user.name,
          username: user.username,
          role: "admin",
        },
      });
    }

    // Standard customer/client: issue session
    await createSession({
      userId: user.id,
      req,
      res,
    });

    await logAuthEvent({
      actorId: user.id,
      event: "login_success",
      identifier: cleanUsername,
      req,
      status: "success",
    });

    const redirectTo = user.role === "client" ? "/client" : "/book";

    return res.json({
      success: true,
      authenticated: true,
      user: {
        id: user.id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
      redirectTo,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ error: "Invalid username or password." });
  }
});

// Admin OTP Step-up verification
const adminStepupSchema = z.object({
  code: z.string().length(6),
});

router.post("/admin/verify-stepup", async (req: Request, res: Response) => {
  try {
    const preauth = await getPreauthSessionFromReq(req, "admin_stepup");
    if (!preauth.valid || !preauth.metadata?.adminId || !preauth.metadata?.phone) {
      return res.status(401).json({ error: "Admin session expired. Please sign in again." });
    }

    const parse = adminStepupSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Please enter the 6-digit verification code." });
    }

    const { code } = parse.data;
    const adminPhone = preauth.metadata.phone;
    const adminId = preauth.metadata.adminId;

    const sessionBindingId =
      req.cookies?.["wf_preauth"] ||
      req.cookies?.["__Host-wf_preauth"] ||
      getClientIp(req);

    const otpResult = await verifyAndConsumeOtp({
      e164Phone: adminPhone,
      code,
      purpose: "admin_stepup",
      sessionBindingId,
    });

    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.error || "Invalid verification code." });
    }

    // Step-up verified! Consume preauth session and grant full elevated admin session
    await consumePreauthSession(req, res);

    await createSession({
      userId: adminId,
      req,
      res,
    });

    await logAuthEvent({
      actorId: adminId,
      event: "admin_stepup_verified",
      identifier: adminPhone,
      req,
      status: "success",
    });

    const adminUser = await db.query.users.findFirst({
      where: eq(users.id, adminId),
    });

    return res.json({
      success: true,
      authenticated: true,
      user: {
        id: adminUser?.id,
        name: adminUser?.name,
        username: adminUser?.username,
        role: "admin",
      },
      redirectTo: "/admin",
    });
  } catch (err) {
    console.error("Admin stepup verify error:", err);
    return res.status(500).json({ error: "Verification failed." });
  }
});

// ============================================================================
// 7. FORGOT PASSWORD: REQUEST RESET CODE
// ============================================================================
const forgotPasswordRequestSchema = z.object({
  identifier: z.string().min(3).max(254),
  turnstileToken: z.string().optional(),
});

router.post("/forgot-password/request", async (req: Request, res: Response) => {
  try {
    const parse = forgotPasswordRequestSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid request payload." });
    }

    const { identifier: rawInput, turnstileToken } = parse.data;
    const cleanInput = rawInput.normalize("NFKC").trim();
    const clientIp = getClientIp(req);

    const botCheck = await verifyTurnstileToken({ token: turnstileToken, clientIp });
    if (!botCheck.success) {
      return res.status(400).json({ error: botCheck.error || "Bot verification failed." });
    }

    const phoneNorm = normalizePhoneNumber(cleanInput);
    const e164 = phoneNorm.valid && phoneNorm.e164 ? phoneNorm.e164 : null;
    const cleanUsername = cleanInput.toLowerCase().replace(/^@/, "");

    const user = await db.query.users.findFirst({
      where: or(
        sql`lower(${users.username}) = lower(${cleanUsername})`,
        e164 ? eq(users.phoneE164, e164) : sql`false`,
        e164 ? eq(users.phone, e164) : sql`false`
      ),
    });

    // Per OWASP: ALWAYS return identical response: "If an account exists, a verification code has been sent."
    if (!user) {
      await verifyPasswordConstantTime({ candidatePassword: "dummy", storedHash: null });
      return res.json({
        success: true,
        message: "If an account exists, a verification code has been sent.",
        retryAfter: 60,
      });
    }

    const targetDestination = user.phoneE164 || user.phone;
    if (!targetDestination) {
      return res.json({
        success: true,
        message: "If an account exists, a verification code has been sent.",
        retryAfter: 60,
      });
    }

    if (!baileysService.isConnected()) {
      return res.status(503).json({
        error: "WhatsApp delivery service is temporarily unavailable. Please try again shortly.",
      });
    }

    const sessionBindingId =
      req.cookies?.["wf_preauth"] ||
      req.cookies?.["__Host-wf_preauth"] ||
      getClientIp(req);

    const otpResult = await createAndStoreOtp({
      e164Phone: targetDestination,
      purpose: "reset_password",
      clientIp,
      sessionBindingId,
    });

    await logAuthEvent({
      actorId: user.id,
      event: "password_reset_code_dispatched",
      identifier: targetDestination,
      req,
      status: "success",
    });

    return res.json({
      success: true,
      message: "If an account exists, a verification code has been sent.",
      retryAfter: otpResult.retryAfterSeconds || 60,
    });
  } catch (err) {
    console.error("Forgot password request error:", err);
    return res.status(500).json({ error: "Failed to process request." });
  }
});

// ============================================================================
// 8. FORGOT PASSWORD: VERIFY OTP AND ISSUE RESET TOKEN
// ============================================================================
const forgotPasswordVerifySchema = z.object({
  identifier: z.string().min(3).max(254),
  code: z.string().length(6),
});

router.post("/forgot-password/verify", async (req: Request, res: Response) => {
  try {
    const parse = forgotPasswordVerifySchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid verification code payload." });
    }

    const { identifier: rawInput, code } = parse.data;
    const cleanInput = rawInput.normalize("NFKC").trim();

    const phoneNorm = normalizePhoneNumber(cleanInput);
    const e164 = phoneNorm.valid && phoneNorm.e164 ? phoneNorm.e164 : null;
    const cleanUsername = cleanInput.toLowerCase().replace(/^@/, "");

    const user = await db.query.users.findFirst({
      where: or(
        sql`lower(${users.username}) = lower(${cleanUsername})`,
        e164 ? eq(users.phoneE164, e164) : sql`false`,
        e164 ? eq(users.phone, e164) : sql`false`
      ),
    });

    const targetDestination = user?.phoneE164 || user?.phone || cleanInput;

    const sessionBindingId =
      req.cookies?.["wf_preauth"] ||
      req.cookies?.["__Host-wf_preauth"] ||
      getClientIp(req);

    const result = await verifyAndConsumeOtp({
      e164Phone: targetDestination,
      code,
      purpose: "reset_password",
      sessionBindingId,
    });

    if (!result.success || !result.verificationToken) {
      await logAuthEvent({
        actorId: user?.id || null,
        event: "password_reset_otp_failed",
        identifier: targetDestination,
        req,
        status: "failed",
      });
      return res.status(400).json({ error: result.error || "Invalid verification code." });
    }

    await logAuthEvent({
      actorId: user?.id || null,
      event: "password_reset_otp_success",
      identifier: targetDestination,
      req,
      status: "success",
    });

    return res.json({
      success: true,
      resetToken: result.verificationToken,
    });
  } catch (err) {
    console.error("Forgot password verify error:", err);
    return res.status(500).json({ error: "Verification failed." });
  }
});

// ============================================================================
// 9. FORGOT PASSWORD: SET NEW PASSWORD & REVOKE ALL SESSIONS
// ============================================================================
const forgotPasswordResetSchema = z.object({
  resetToken: z.string().min(10),
  newPassword: z.string().min(10).max(128),
});

router.post("/forgot-password/reset", async (req: Request, res: Response) => {
  try {
    const parse = forgotPasswordResetSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: "Invalid password reset payload." });
    }

    const { resetToken, newPassword } = parse.data;

    // Verify and consume reset token atomically
    const tokenCheck = await consumeVerificationToken({
      token: resetToken,
      expectedPurpose: "reset_password",
    });

    if (!tokenCheck.valid) {
      return res.status(403).json({
        error: tokenCheck.error || "Your reset session has expired. Please request a new code.",
      });
    }

    const phoneFromToken = tokenCheck.metadata?.phone || null;

    // Validate password per NIST SP 800-63B
    const passVal = await validatePasswordNist(newPassword);
    if (!passVal.valid) {
      return res.status(422).json({ error: passVal.error });
    }

    // Find user
    const user = await db.query.users.findFirst({
      where: or(
        phoneFromToken ? eq(users.phoneE164, phoneFromToken) : sql`false`,
        phoneFromToken ? eq(users.phone, phoneFromToken) : sql`false`
      ),
    });

    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    // Hash new password with Argon2id
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // CRITICAL SECURITY REQUIREMENT: Invalidate ALL active sessions across all devices
    await revokeAllUserSessions(user.id);

    await logAuthEvent({
      actorId: user.id,
      event: "password_reset_success_sessions_revoked",
      identifier: user.username || user.phoneE164 || "user",
      req,
      status: "success",
    });

    return res.json({
      success: true,
      message: "Password reset successfully. You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("Forgot password reset error:", err);
    return res.status(500).json({ error: "Failed to reset password." });
  }
});

// ============================================================================
// 10. CURRENT SESSION & LOGOUT
// ============================================================================
router.get("/me", async (req: Request, res: Response) => {
  try {
    const session = await getSessionFromReq(req);
    if (!session) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    return res.json({
      success: true,
      authenticated: true,
      user: {
        id: session.id,
        name: session.name,
        username: session.username,
        role: session.role,
        phone: session.phoneE164 || session.phone,
        email: session.email,
        authProvider: session.authProvider,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch session." });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  try {
    // Anti-CSRF verification: Require custom header or trusted origin/referer
    const xRequestedWith = req.headers["x-requested-with"];
    const csrfHeader = req.headers["x-csrf-protection"];
    const origin = (req.headers["origin"] as string) || (req.headers["referer"] as string);
    const allowedOrigins = [
      env.NEXT_PUBLIC_APP_URL,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5000",
    ];

    if (origin) {
      const isAllowed = allowedOrigins.some((allowed) => origin.startsWith(allowed));
      if (!isAllowed) {
        return res.status(403).json({ error: "Invalid Origin/Referer for logout request" });
      }
    }

    if (!xRequestedWith && !csrfHeader && !origin) {
      return res.status(403).json({ error: "Missing CSRF verification header" });
    }

    await revokeCurrentSession(req, res);
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    return res.status(500).json({ error: "Logout error" });
  }
});

// Reject GET to /logout to prevent prefetch logouts
router.get("/logout", (_req: Request, res: Response) => {
  return res.status(405).json({ error: "Method Not Allowed. Logout requires POST." });
});

// ============================================================================
// 11. REFERRAL CODE CHECK & ATTRIBUTION TRACKING (PUBLIC, ANTI-ENUMERATION)
// ============================================================================
router.get("/referral/check", async (req: Request, res: Response) => {
  try {
    const rawCode = String(req.query.code || "").trim().toUpperCase();
    if (!rawCode || rawCode.length < 4) {
      return res.status(400).json({ valid: false, error: "Please enter a valid referral code." });
    }

    const isValid = await validateReferralCodeLookup(rawCode);
    if (!isValid) {
      return res.status(404).json({ valid: false, error: "Referral code not found or inactive." });
    }

    // Never disclose owner name, phone, or identity
    return res.json({
      valid: true,
      code: rawCode,
      message: "Valid referral code! You will be attributed upon sign up.",
    });
  } catch (err) {
    console.error("Check referral code error:", err);
    return res.status(500).json({ valid: false, error: "Unable to verify referral code." });
  }
});

router.post("/referral/track-visit", async (req: Request, res: Response) => {
  try {
    const rawCode = String(req.body?.code || "").trim().toUpperCase();
    if (!rawCode) {
      return res.status(400).json({ error: "Referral code required." });
    }

    const isValid = await validateReferralCodeLookup(rawCode);
    if (!isValid) {
      return res.status(404).json({ error: "Invalid referral code." });
    }

    // 1. Record privacy-safe visit
    const ipHash = getClientIpHash(req);
    await recordReferralVisit(rawCode, ipHash);

    // 2. Set signed, httpOnly attribution cookie if not already set (first touch wins)
    const existingAttr = req.cookies?.["wf_ref_attribution"];
    if (!existingAttr || !verifyAttributionCookie(existingAttr)) {
      const signedVal = signAttributionCookie(rawCode);
      res.cookie("wf_ref_attribution", signedVal, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        path: "/",
      });
    }

    return res.json({ success: true, valid: true, code: rawCode });
  } catch (err) {
    console.error("Track referral visit error:", err);
    return res.status(500).json({ error: "Failed to record visit." });
  }
});

export default router;
