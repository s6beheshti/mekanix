// MEKANIX — Payment Gateway Abstraction
//
// Production policy:
// - Zarinpal and IDPay are the only implemented live providers.
// - The simulator is available only outside production.
// - Unknown, incomplete, and stub providers fail closed (never silently simulate).
//
// Amounts passed to this module are IRR (Rial), not Toman.

export interface PaymentRequest {
  amount: number;
  description: string;
  callbackUrl: string;
  mobile?: string;
  orderId: string;
}

export interface PaymentResult {
  success: boolean;
  paymentUrl?: string;
  authority?: string;
  orderId?: string;
  error?: string;
}

export interface PaymentVerifyResult {
  success: boolean;
  refId?: string;
  amount?: number;
  error?: string;
}

export type CreatePaymentFn = (req: PaymentRequest) => Promise<PaymentResult>;
export type VerifyPaymentFn = (authority: string, amount: number, orderId: string) => Promise<PaymentVerifyResult>;

type Provider = {
  name: string;
  configured: boolean;
  create: CreatePaymentFn;
  verify: VerifyPaymentFn;
};

const unavailable = async (): Promise<PaymentResult> => ({
  success: false,
  error: "درگاه پرداخت پیکربندی نشده است",
});
const unavailableVerify = async (): Promise<PaymentVerifyResult> => ({
  success: false,
  error: "درگاه پرداخت پیکربندی نشده است",
});

const simulator: Provider = {
  name: "simulator",
  configured: process.env.NODE_ENV !== "production",
  create: async (req) => {
    if (process.env.NODE_ENV === "production") {
      return { success: false, error: "شبیه‌ساز پرداخت در محیط عملیاتی غیرفعال است" };
    }
    const authority = `sim_${req.orderId}`;
    const callback = new URL(req.callbackUrl);
    callback.searchParams.set("Authority", authority);
    callback.searchParams.set("Status", "OK");
    callback.searchParams.set("simulator", "true");
    return { success: true, paymentUrl: callback.toString(), authority, orderId: req.orderId };
  },
  verify: async (authority, amount, orderId) => {
    if (process.env.NODE_ENV === "production" || authority !== `sim_${orderId}`) {
      return { success: false, error: "تأیید شبیه‌ساز معتبر نیست" };
    }
    return { success: true, refId: `dev_${orderId}`, amount };
  },
};

function createZarinpalProvider(merchantId: string): Provider {
  return {
    name: "zarinpal",
    configured: true,
    create: async (req) => {
      try {
        const res = await fetch("https://api.zarinpal.com/pg/v4/payment/request.json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchant_id: merchantId,
            amount: req.amount,
            description: req.description,
            callback_url: req.callbackUrl,
            mobile: req.mobile,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        if (!res.ok || Number(data.data?.code) !== 100 || !data.data?.authority) {
          return { success: false, error: data.errors?.message || "Zarinpal request failed" };
        }
        const authority = String(data.data.authority);
        return {
          success: true,
          authority,
          orderId: req.orderId,
          paymentUrl: `https://www.zarinpal.com/pg/StartPay/${encodeURIComponent(authority)}`,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Zarinpal request failed" };
      }
    },
    verify: async (authority, amount) => {
      try {
        const res = await fetch("https://api.zarinpal.com/pg/v4/payment/verify.json", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchant_id: merchantId, authority, amount }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        const code = Number(data.data?.code);
        const refId = data.data?.ref_id;
        // 100 = verified; 101 = already verified (safe for callback retries).
        if (!res.ok || ![100, 101].includes(code) || refId == null) {
          return { success: false, error: data.errors?.message || "Zarinpal verification failed" };
        }
        return { success: true, refId: String(refId), amount };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Zarinpal verification failed" };
      }
    },
  };
}

function createIdpayProvider(apiKey: string): Provider {
  return {
    name: "idpay",
    configured: true,
    create: async (req) => {
      try {
        const res = await fetch("https://api.idpay.ir/v1.3/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": apiKey, "X-SANDBOX": "0" },
          body: JSON.stringify({
            order_id: req.orderId,
            amount: req.amount,
            name: req.description,
            callback: req.callbackUrl,
            mobile: req.mobile,
          }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        if (!res.ok || !data.link || !data.id) {
          return { success: false, error: data.error_message || "IDPay request failed" };
        }
        return {
          success: true,
          paymentUrl: String(data.link),
          authority: String(data.id),
          orderId: req.orderId,
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "IDPay request failed" };
      }
    },
    verify: async (authority, amount, orderId) => {
      try {
        const res = await fetch("https://api.idpay.ir/v1.3/payment/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-KEY": apiKey },
          body: JSON.stringify({ id: authority, order_id: orderId }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        if (!res.ok || Number(data.status) !== 100) {
          return { success: false, error: data.error_message || "IDPay verification failed" };
        }
        if (data.amount != null && Number(data.amount) !== amount) {
          return { success: false, error: "مبلغ تأییدشده با مبلغ سفارش مطابقت ندارد" };
        }
        if (data.track_id == null) {
          return { success: false, error: "IDPay did not return a transaction reference" };
        }
        return { success: true, refId: String(data.track_id), amount };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "IDPay verification failed" };
      }
    },
  };
}

function resolveProvider(): Provider {
  const name = (process.env.PAYMENT_PROVIDER || "simulator").toLowerCase().trim();
  if (name === "simulator") return simulator;
  if (name === "zarinpal") {
    const merchantId = process.env.ZARINPAL_MERCHANT_ID?.trim();
    return merchantId
      ? createZarinpalProvider(merchantId)
      : { name, configured: false, create: unavailable, verify: unavailableVerify };
  }
  if (name === "idpay") {
    const apiKey = process.env.IDPAY_API_KEY?.trim();
    return apiKey
      ? createIdpayProvider(apiKey)
      : { name, configured: false, create: unavailable, verify: unavailableVerify };
  }
  // NextPay was previously advertised but never implemented. Do not fall back to a simulator.
  return { name, configured: false, create: unavailable, verify: unavailableVerify };
}

let currentProvider: Provider | null = null;

export function initPaymentProvider(): void {
  if (currentProvider) return;
  currentProvider = resolveProvider();
  if (!currentProvider.configured) {
    console.error(`[payment] Provider "${currentProvider.name}" is unsupported or missing required credentials`);
    return;
  }
  console.log(`💳 Payment provider: ${currentProvider.name}`);
}

function getProvider(): Provider {
  initPaymentProvider();
  return currentProvider ?? { name: "unavailable", configured: false, create: unavailable, verify: unavailableVerify };
}

export async function createPayment(req: PaymentRequest): Promise<PaymentResult> {
  const provider = getProvider();
  if (!provider.configured) return { success: false, error: "درگاه پرداخت عملیاتی پیکربندی نشده است" };
  if (!Number.isSafeInteger(req.amount) || req.amount <= 0 || !req.orderId) {
    return { success: false, error: "مبلغ یا شناسه سفارش نامعتبر است" };
  }
  return provider.create(req);
}

export async function verifyPayment(
  authority: string,
  amount: number,
  orderId: string
): Promise<PaymentVerifyResult> {
  const provider = getProvider();
  if (!provider.configured) return { success: false, error: "درگاه پرداخت عملیاتی پیکربندی نشده است" };
  if (!authority || !orderId || !Number.isSafeInteger(amount) || amount <= 0) {
    return { success: false, error: "اطلاعات تأیید پرداخت نامعتبر است" };
  }
  return provider.verify(authority, amount, orderId);
}

export function getPaymentProviderStatus(): { configured: boolean; provider: string } {
  const provider = resolveProvider();
  return { configured: provider.configured, provider: provider.name };
}
