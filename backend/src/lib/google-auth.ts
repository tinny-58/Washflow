import { OAuth2Client } from "google-auth-library";
import { env } from "./env";

let oauthClient: OAuth2Client | null = null;

function getOAuthClient(): OAuth2Client {
  if (!oauthClient) {
    oauthClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);
  }
  return oauthClient;
}

export interface VerifiedGoogleUser {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Server-side cryptographic verification of Google OpenID Connect ID token.
 * Validates:
 * 1. Signature against Google JWKS public keys
 * 2. Issuer (`iss`) is accounts.google.com or https://accounts.google.com
 * 3. Audience (`aud`) strictly matches server's GOOGLE_CLIENT_ID
 * 4. Expiration (`exp`) has not passed
 * 5. `email_verified` is true
 * 
 * Never trusts any client-supplied claims.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<{
  success: boolean;
  user?: VerifiedGoogleUser;
  error?: string;
}> {
  if (!idToken || typeof idToken !== "string") {
    return { success: false, error: "Missing Google ID token" };
  }

  const token = idToken.trim();

  try {
    const client = getOAuthClient();
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      return { success: false, error: "Invalid Google token payload" };
    }

    const iss = payload.iss;
    if (iss !== "accounts.google.com" && iss !== "https://accounts.google.com") {
      return { success: false, error: "Invalid token issuer" };
    }

    if (!payload.email_verified) {
      return { success: false, error: "Google email is not verified" };
    }

    if (!payload.email) {
      return { success: false, error: "Google token missing email claim" };
    }

    return {
      success: true,
      user: {
        sub: payload.sub,
        email: payload.email.toLowerCase().trim(),
        name: payload.name || payload.given_name || "Google User",
        picture: payload.picture,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token verification failed";
    return { success: false, error: msg };
  }
}
