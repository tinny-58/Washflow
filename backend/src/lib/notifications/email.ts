export interface EmailMessagePayload {
  toEmail: string;
  subject: string;
  htmlContent: string;
}

export async function sendEmailMessage(payload: EmailMessagePayload): Promise<{
  success: boolean;
  messageId?: string;
  error?: string;
}> {
  const { toEmail, subject, htmlContent } = payload;
  const resendApiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || "WashFlow <notifications@washflow.co.ke>";

  if (!resendApiKey) {
    return {
      success: true,
      messageId: `log-${Date.now()}`,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [toEmail],
        subject,
        html: htmlContent,
      }),
    });

    const data = (await response.json()) as any;
    if (response.ok && data.id) {
      return { success: true, messageId: data.id };
    }
    return { success: false, error: data.message || "Failed to send email via Resend" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Sends an urgent alert email to the admin when WhatsApp Gateway is offline/disconnected
 * and a customer OTP or automation could not be delivered.
 */
let lastAlertSentAt = 0;
export async function alertAdminWhatsAppDisconnected(reason: string): Promise<void> {
  const now = Date.now();
  // Throttle email alerts to once every 10 minutes to prevent mailbox flooding
  if (now - lastAlertSentAt < 10 * 60 * 1000) {
    return;
  }
  lastAlertSentAt = now;

  const adminEmail = process.env.ADMIN_EMAIL || "admin@washflow.co.ke";
  console.warn(`🚨 [ADMIN ALERT] WhatsApp Gateway Disconnected. Alerting ${adminEmail}: ${reason}`);

  await sendEmailMessage({
    toEmail: adminEmail,
    subject: "🚨 [WashFlow Alert] WhatsApp Gateway Disconnected - Action Required",
    htmlContent: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; rounded: 12px;">
        <h2 style="color: #e11d48; margin-top: 0;">WashFlow WhatsApp Gateway Disconnected</h2>
        <p>Your automated WhatsApp messaging gateway is currently <strong>offline or disconnected</strong>.</p>
        <div style="background-color: #fff1f2; border-left: 4px solid #f43f5e; padding: 12px; margin: 16px 0;">
          <strong>Trigger:</strong> ${reason}
        </div>
        <p>Because the gateway is offline, new customer signup OTPs, booking confirmations, and order updates cannot be delivered.</p>
        <p style="margin-top: 24px;">
          <a href="${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/admin/whatsapp" 
             style="background-color: #0284c7; color: white; padding: 10px 18px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
            Open Operations Console to Re-link WhatsApp
          </a>
        </p>
      </div>
    `,
  }).catch((err) => {
    console.error("Failed to send admin email alert:", err);
  });
}
