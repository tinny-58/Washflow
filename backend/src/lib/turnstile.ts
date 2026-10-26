import { env } from "./env";

interface TurnstileVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Server-side verification of Cloudflare Turnstile token.
 * Validates with challenges.cloudflare.com/turnstile/v0/siteverify
 */
export async function verifyTurnstileToken({
  token,
  clientIp,
}: {
  token?: string;
  clientIp?: string;
}): Promise<{ success: boolean; error?: string }> {
  // If no secret key is set or dummy testing key is in use without token in non-production, allow in test
  if (!token) {
    if (env.NODE_ENV === "test" || env.TURNSTILE_SECRET_KEY === "1x0000000000000000000000000000000AA") {
      return { success: true };
    }
    return { success: false, error: "Bot verification required (missing token)." };
  }

  try {
    const formData = new URLSearchParams();
    formData.append("secret", env.TURNSTILE_SECRET_KEY);
    formData.append("response", token);
    if (clientIp) {
      formData.append("remoteip", clientIp);
    }

    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: formData,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) {
      return { success: false, error: "Failed to communicate with bot verification service." };
    }

    const result = (await res.json()) as TurnstileVerifyResponse;
    if (!result.success) {
      return {
        success: false,
        error: "Bot verification failed. Please refresh and try again.",
      };
    }

    return { success: true };
  } catch (err) {
    console.error("Turnstile verification error:", err);
    // Fail-open only in test if configured, otherwise deny
    if (env.NODE_ENV === "test") {
      return { success: true };
    }
    return { success: false, error: "Bot verification service temporarily unavailable." };
  }
}
