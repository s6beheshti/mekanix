"use client";

import { useState } from "react";
import { ShieldCheck, Loader2, Lock } from "lucide-react";
import { authFetch } from "@/lib/fetch-with-auth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useT } from "@/lib/use-t";
import { toast } from "sonner";

type PaymentPurpose = "vip" | "prepay" | "invoice";

export function PaymentGatewayDialog({
  open,
  onOpenChange,
  amount,
  purpose,
  description,
  planId,
  jobId,
  invoiceId,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  amount: number;
  purpose: PaymentPurpose;
  description?: string;
  planId?: string;
  jobId?: string;
  invoiceId?: string;
}) {
  const { t, isFa, money } = useT();
  const [processing, setProcessing] = useState(false);

  const initiate = async () => {
    const reference =
      purpose === "vip" ? { planId } :
      purpose === "prepay" ? { jobId } :
      { invoiceId };

    if (!Object.values(reference).some((value) => typeof value === "string" && value.trim())) {
      toast.error(isFa ? "شناسه سفارش برای پرداخت موجود نیست" : "The payment reference is missing");
      return;
    }

    setProcessing(true);
    try {
      const res = await authFetch("/api/gateway/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, ...reference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment initiation failed");
      if (typeof data.paymentUrl !== "string") {
        throw new Error(isFa ? "نشانی درگاه پرداخت معتبر نیست" : "The gateway URL is invalid");
      }
      const paymentUrl = new URL(data.paymentUrl);
      if (process.env.NODE_ENV === "production" && paymentUrl.protocol !== "https:") {
        throw new Error(isFa ? "نشانی درگاه پرداخت امن نیست" : "The gateway URL must use HTTPS");
      }
      window.location.assign(paymentUrl.toString());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pay.gateway.failed"));
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir={isFa ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <div className="grid size-9 place-items-center rounded-lg border border-amber/30 bg-amber/10">
              <ShieldCheck className="size-4 text-amber" />
            </div>
            {t("pay.gateway.title")}
          </DialogTitle>
          <DialogDescription className="text-xs">{t("pay.gateway.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-amber/20 bg-amber/5 p-4">
          <p className="text-[11px] text-muted-foreground">{description ?? t("pay.gateway.title")}</p>
          <p className="mt-1 font-display text-2xl font-bold text-amber">{money(amount)}</p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-border p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0 text-amber" />
          <span>
            {isFa
              ? "برای امنیت پرداخت، اطلاعات کارت را فقط در صفحه رسمی بانک یا درگاه وارد کنید. مبلغ نهایی از اطلاعات ثبت‌شده در سامانه محاسبه می‌شود."
              : "For your security, enter card details only on the official bank or gateway page. The final amount is calculated from server records."}
          </span>
        </div>

        <Button onClick={initiate} disabled={processing} className="w-full bg-amber text-black hover:bg-amber/90" size="lg">
          {processing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Lock className="mr-2 size-4" />}
          {processing ? t("pay.gateway.processing") : t("pay.gateway.pay").replace("{amount}", money(amount))}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
