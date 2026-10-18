import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(3000),

  // Database
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Redis (Optional)
  REDIS_URL: z.string().optional().default("redis://localhost:6379"),

  // Security Secrets
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  DEVICE_FINGERPRINT_SECRET: z.string().min(32, "DEVICE_FINGERPRINT_SECRET must be at least 32 characters"),

  // Admin Credentials
  ADMIN_EMAIL: z.string().email().default("admin@washflow.co.ke"),
  ADMIN_PASSWORD: z.string().min(8).default("WashFlow#Admin2026!Secure"),
  ADMIN_NAME: z.string().default("WashFlow Operations"),
  ADMIN_PHONE: z.string().default("+254700000000"),

  // M-Pesa Daraja
  MPESA_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  MPESA_CONSUMER_KEY: z.string().default("mock_daraja_consumer_key"),
  MPESA_CONSUMER_SECRET: z.string().default("mock_daraja_consumer_secret"),
  MPESA_PASSKEY: z.string().default("bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919"),
  MPESA_SHORTCODE: z.string().default("174379"),
  MPESA_CALLBACK_URL: z.string().default("http://localhost:3000/api/payments/mpesa/callback"),

  // WhatsApp
  WHATSAPP_CLOUD_TOKEN: z.string().default("mock_meta_whatsapp_token"),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default("mock_phone_number_id"),
  ADMIN_NOTIFY_PHONE: z.string().default("+254700000000"),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().default("mock_twilio_account_sid"),
  TWILIO_AUTH_TOKEN: z.string().default("mock_twilio_auth_token"),
  TWILIO_FROM_NUMBER: z.string().default("whatsapp:+14155238886"),

  // Email
  RESEND_API_KEY: z.string().default("re_mock_key"),
  EMAIL_FROM: z.string().default("WashFlow <notifications@washflow.co.ke>"),

  // Abuse Protection & Rate Limiting
  MAX_ACCOUNTS_PER_DEVICE: z.coerce.number().default(2),
  MAX_OPEN_BOOKINGS_PER_PHONE: z.coerce.number().default(2),
  MAX_OTP_ATTEMPTS: z.coerce.number().default(2),
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),
  RATE_LIMIT_OTP_PER_HOUR: z.coerce.number().default(5),
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().default(10),
});

export const env = envSchema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  REDIS_URL: process.env.REDIS_URL,
  SESSION_SECRET: process.env.SESSION_SECRET,
  DEVICE_FINGERPRINT_SECRET: process.env.DEVICE_FINGERPRINT_SECRET,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_NAME: process.env.ADMIN_NAME,
  ADMIN_PHONE: process.env.ADMIN_PHONE,
  MPESA_ENVIRONMENT: process.env.MPESA_ENVIRONMENT,
  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
  MPESA_PASSKEY: process.env.MPESA_PASSKEY,
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
  MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
  WHATSAPP_CLOUD_TOKEN: process.env.WHATSAPP_CLOUD_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  ADMIN_NOTIFY_PHONE: process.env.ADMIN_NOTIFY_PHONE,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  EMAIL_FROM: process.env.EMAIL_FROM,
  MAX_ACCOUNTS_PER_DEVICE: process.env.MAX_ACCOUNTS_PER_DEVICE,
  MAX_OPEN_BOOKINGS_PER_PHONE: process.env.MAX_OPEN_BOOKINGS_PER_PHONE,
  MAX_OTP_ATTEMPTS: process.env.MAX_OTP_ATTEMPTS,
  OTP_EXPIRY_MINUTES: process.env.OTP_EXPIRY_MINUTES,
  RATE_LIMIT_OTP_PER_HOUR: process.env.RATE_LIMIT_OTP_PER_HOUR,
  RATE_LIMIT_IP_PER_MIN: process.env.RATE_LIMIT_IP_PER_MIN,
});

export type Env = z.infer<typeof envSchema>;
