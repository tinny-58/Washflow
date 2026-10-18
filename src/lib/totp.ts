import { authenticator } from "otplib";

authenticator.options = {
  window: 1, // Allow 1 step backward/forward (30 seconds leeway)
};

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function generateTotpUri(userEmail: string, secret: string): string {
  return authenticator.keyuri(userEmail, "WashFlow Admin", secret);
}

export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}
