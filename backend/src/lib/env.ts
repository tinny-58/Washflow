import { z } from "zod";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: ".env.local" });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), "backend/.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env.local") });
dotenv.config();

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Redis (Required for BullMQ queues and distributed rate limiting)
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Security Secrets
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DEVICE_FINGERPRINT_SECRET: z.string().min(32, "DEVICE_FINGERPRINT_SECRET must be at least 32 characters"),
  OTP_PEPPER: z.string().min(32, "OTP_PEPPER must be at least 32 characters"),
  BAILEYS_AUTH_KEY: z.string().min(32, "BAILEYS_AUTH_KEY must be at least 32 characters for AES-256-GCM"),
  
  // Google Authentication
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),

  // Turnstile Bot Protection
  TURNSTILE_SECRET_KEY: z.string().default("1x0000000000000000000000000000000AA"),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().default("1x00000000000000000000AA"),

  // Country Allowlist (ISO 3166-1 alpha-2, comma-separated)
  ALLOWED_COUNTRY_CODES: z.string().default("KE"),

  // Admin Configuration
  ADMIN_EMAIL: z.string().email().default("admin@washflow.co.ke"),
  ADMIN_PHONE: z.string().default("+254700000000"),
  ADMIN_NOTIFY_PHONE: z.string().default("+254700000000"),

  // M-Pesa Daraja
  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().default("mock_daraja_consumer_key"),
  MPESA_CONSUMER_SECRET: z.string().default("mock_daraja_consumer_secret"),
  MPESA_PASSKEY: z.string().default("bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"),
  MPESA_SHORTCODE: z.string().default("174379"),
  MPESA_CALLBACK_URL: z.string().default("http://localhost:3000/api/payments/mpesa/callback"),

  // Rate Limiting & Abuse Prevention
  MAX_ACCOUNTS_PER_DEVICE: z.coerce.number().default(2),
  MAX_OPEN_BOOKINGS_PER_PHONE: z.coerce.number().default(2),
  MAX_OTP_ATTEMPTS: z.coerce.number().default(5),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  RATE_LIMIT_OTP_PER_HOUR: z.coerce.number().default(3),
  RATE_LIMIT_IP_PER_HOUR: z.coerce.number().default(5),
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().default(10),
});

// Boot-time schema validation with clear, actionable diagnostics
const rawEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DEVICE_FINGERPRINT_SECRET: process.env.DEVICE_FINGERPRINT_SECRET,
  OTP_PEPPER: process.env.OTP_PEPPER,
  BAILEYS_AUTH_KEY: process.env.BAILEYS_AUTH_KEY || (process.env.NODE_ENV !== "production" ? "washflow_baileys_aes_256_gcm_auth_key_dev_32b" : undefined),
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  ALLOWED_COUNTRY_CODES: process.env.ALLOWED_COUNTRY_CODES,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PHONE: process.env.ADMIN_PHONE,
  ADMIN_NOTIFY_PHONE: process.env.ADMIN_NOTIFY_PHONE,
  MPESA_ENVIRONMENT: process.env.MPESA_ENVIRONMENT,
  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
  MPESA_PASSKEY: process.env.MPESA_PASSKEY,
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
  MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
  MAX_ACCOUNTS_PER_DEVICE: process.env.MAX_ACCOUNTS_PER_DEVICE,
  MAX_OPEN_BOOKINGS_PER_PHONE: process.env.MAX_OPEN_BOOKINGS_PER_PHONE,
  MAX_OTP_ATTEMPTS: process.env.MAX_OTP_ATTEMPTS,
  OTP_EXPIRY_MINUTES: process.env.OTP_EXPIRY_MINUTES,
  RATE_LIMIT_OTP_PER_HOUR: process.env.RATE_LIMIT_OTP_PER_HOUR,
  RATE_LIMIT_IP_PER_HOUR: process.env.RATE_LIMIT_IP_PER_HOUR,
  RATE_LIMIT_IP_PER_MIN: process.env.RATE_LIMIT_IP_PER_MIN,
};

const parseResult = envSchema.safeParse(rawEnv);

if (!parseResult.success) {
  console.error("\n=======================================================");
  console.error("❌ FATAL: Environment Configuration Validation Failed");
  console.error("=======================================================");
  for (const issue of parseResult.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("=======================================================\n");
  process.exit(1);
}

export const env = parseResult.data;
export type Env = z.infer<typeof envSchema>;
