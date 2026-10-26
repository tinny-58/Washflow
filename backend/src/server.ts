import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./lib/env";
import authRoutes from "./routes/auth";
import catalogRoutes from "./routes/catalog";
import bookingsRoutes from "./routes/bookings";
import paymentsRoutes from "./routes/payments";
import ratingsRoutes from "./routes/ratings";
import adminRoutes from "./routes/admin";
import adminWhatsappRoutes from "./routes/admin-whatsapp";
import adminWhatsappWorkerRoutes from "./routes/admin-whatsapp-worker";
import adminWhatsappAutomationsRoutes from "./routes/admin-whatsapp-automations";
import adminWhatsappLogsRoutes from "./routes/admin-whatsapp-logs";
import adminCustomersRoutes from "./routes/admin-customers";
import adminRewardsRoutes from "./routes/admin-rewards";
import trackRateRoutes from "./routes/track-rate";
import clientRoutes from "./routes/client";
import { baileysService } from "./lib/baileys/baileys-service";

const app = express();
const port = env.PORT || 5000;

// Security Headers (Helmet)
app.use(
  helmet({
    contentSecurityPolicy: false, // Next.js controls frontend CSP; backend sets transport protections
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Middleware
app.use(
  cors({
    origin: [env.NEXT_PUBLIC_APP_URL, "http://localhost:3000", "http://127.0.0.1:3000"],
    credentials: true,
  })
);
app.use(cookieParser(env.SESSION_SECRET));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Healthcheck
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "washflow-backend", timestamp: new Date() });
});

// Mount API routes
app.use("/api/auth", authRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/admin/whatsapp/worker", adminWhatsappWorkerRoutes);
app.use("/api/admin/whatsapp/automations", adminWhatsappAutomationsRoutes);
app.use("/api/admin/whatsapp/logs", adminWhatsappLogsRoutes);
app.use("/api/admin/whatsapp", adminWhatsappRoutes);
app.use("/api/admin/customers", adminCustomersRoutes);
app.use("/api/admin/rewards", adminRewardsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", trackRateRoutes);

// Global 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handling middleware
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

if (env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`\n🧺 WashFlow Backend Server running on http://localhost:${port}`);
    console.log(`🚀 Environment: ${env.NODE_ENV}`);
    console.log(`🔌 Database: Connected`);

    // Auto-initialize Baileys service for admin portal
    baileysService.init().catch((err) => {
      console.warn("Baileys background initialization warning:", err.message);
    });
  });
}

export default app;
