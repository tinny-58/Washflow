import { env } from "../env";
import {
  PaymentProvider,
  InitiatePaymentParams,
  InitiatePaymentResult,
  CallbackVerificationResult,
} from "./provider";

export class MpesaDarajaProvider implements PaymentProvider {
  name = "mpesa";

  private getBaseUrl(): string {
    return env.MPESA_ENVIRONMENT === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  }

  private getTimestamp(): string {
    const date = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(
      date.getHours()
    )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  private getPassword(timestamp: string): string {
    return Buffer.from(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`).toString(
      "base64"
    );
  }

  private cleanPhone(phone: string): string {
    return phone.replace(/^\+/, "").trim();
  }

  private async getAccessToken(): Promise<string> {
    const auth = Buffer.from(
      `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`
    ).toString("base64");

    const response = await fetch(
      `${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to obtain M-Pesa access token: ${response.statusText}`);
    }

    const data = (await response.json()) as any;
    return data.access_token;
  }

  async initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult> {
    const { bookingId, amount, phone, type, accountReference } = params;

    // In local dev/mock mode
    if (env.MPESA_CONSUMER_KEY.startsWith("mock_")) {
      const mockCheckoutId = `ws_CO_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      console.log(`\n========================================`);
      console.log(`💳 [M-Pesa STK Push Simulation]`);
      console.log(`To: ${phone} | Amount: KES ${amount} | Type: ${type}`);
      console.log(`CheckoutRequestID: ${mockCheckoutId}`);
      console.log(`========================================\n`);

      return {
        success: true,
        provider: this.name,
        providerRef: mockCheckoutId,
        customerMessage: "Success. Request accepted for processing",
        rawResponse: {
          MerchantRequestID: `MR_${Date.now()}`,
          CheckoutRequestID: mockCheckoutId,
          ResponseCode: "0",
          ResponseDescription: "Success. Request accepted for processing",
          CustomerMessage: "Success. Request accepted for processing",
        },
      };
    }

    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    const password = this.getPassword(timestamp);
    const cleanedPhone = this.cleanPhone(phone);

    const payload = {
      BusinessShortCode: env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: cleanedPhone,
      PartyB: env.MPESA_SHORTCODE,
      PhoneNumber: cleanedPhone,
      CallBackURL: env.MPESA_CALLBACK_URL,
      AccountReference: accountReference || `WashFlow-${bookingId.slice(0, 6)}`,
      TransactionDesc: `WashFlow Laundry ${type === "tip" ? "Tip" : "Service"}`,
    };

    const response = await fetch(
      `${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = (await response.json()) as any;

    if (data.ResponseCode === "0") {
      return {
        success: true,
        provider: this.name,
        providerRef: data.CheckoutRequestID,
        customerMessage: data.CustomerMessage || "Please enter your M-Pesa PIN on your phone.",
        rawResponse: data,
      };
    }

    throw new Error(data.errorMessage || data.ResponseDescription || "Daraja STK push failed");
  }

  async verifyCallback(rawBody: unknown): Promise<CallbackVerificationResult> {
    const body = rawBody as {
      Body?: {
        stkCallback?: {
          MerchantRequestID?: string;
          CheckoutRequestID?: string;
          ResultCode?: number;
          ResultDesc?: string;
          CallbackMetadata?: {
            Item?: { Name: string; Value: unknown }[];
          };
        };
      };
    };

    const callback = body?.Body?.stkCallback;
    if (!callback || !callback.CheckoutRequestID) {
      return {
        isValid: false,
        isSuccess: false,
        providerRef: "",
        amount: 0,
        rawCallback: rawBody,
        failureReason: "Missing or malformed stkCallback payload",
      };
    }

    const isSuccess = callback.ResultCode === 0;
    const providerRef = callback.CheckoutRequestID;
    let amount = 0;
    let receiptNumber = "";
    let phone = "";

    if (isSuccess && callback.CallbackMetadata?.Item) {
      for (const item of callback.CallbackMetadata.Item) {
        if (item.Name === "Amount") {
          amount = Number(item.Value);
        } else if (item.Name === "MpesaReceiptNumber") {
          receiptNumber = String(item.Value);
        } else if (item.Name === "PhoneNumber") {
          phone = String(item.Value);
        }
      }
    }

    return {
      isValid: true,
      isSuccess,
      providerRef,
      receiptNumber: receiptNumber || undefined,
      amount,
      phone: phone || undefined,
      failureReason: isSuccess ? undefined : callback.ResultDesc || "Payment rejected or cancelled by customer",
      rawCallback: rawBody,
    };
  }
}

export const mpesaProvider = new MpesaDarajaProvider();
