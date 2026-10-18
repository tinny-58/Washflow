import { env } from "../env";

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

  if (env.RESEND_API_KEY.startsWith("re_mock")) {
    console.log(`\n📧 [Email Mock Delivery] To: ${toEmail} | Subject: ${subject}`);
    console.log(`Content:\n${htmlContent.replace(/<[^>]*>?/gm, "")}\n`);
    return {
      success: true,
      messageId: `mock-email-${Date.now()}`,
    };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [toEmail],
        subject,
        html: htmlContent,
      }),
    });

    const data = await response.json();
    if (response.ok && data.id) {
      return { success: true, messageId: data.id };
    }
    return { success: false, error: data.message || "Failed to send email via Resend" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}
