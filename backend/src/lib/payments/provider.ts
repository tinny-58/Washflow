export interface InitiatePaymentParams {
  bookingId: string;
  amount: number; // in KES
  phone: string; // E.164
  type: "service" | "tip";
  accountReference?: string;
  transactionDesc?: string;
}

export interface InitiatePaymentResult {
  success: boolean;
  provider: string;
  providerRef: string; // CheckoutRequestID or transaction ref
  customerMessage: string;
  rawResponse?: unknown;
}

export interface CallbackVerificationResult {
  isValid: boolean;
  isSuccess: boolean;
  providerRef: string;
  receiptNumber?: string;
  amount: number;
  phone?: string;
  failureReason?: string;
  rawCallback: unknown;
}

export interface PaymentProvider {
  name: string;
  initiatePayment(params: InitiatePaymentParams): Promise<InitiatePaymentResult>;
  verifyCallback(rawBody: unknown, headers?: Headers): Promise<CallbackVerificationResult>;
}
