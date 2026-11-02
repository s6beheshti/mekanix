import Link from "next/link";

type Props = {
  searchParams: Promise<{ payment?: string; ref?: string }>;
};

export default async function PaymentResultPage({ searchParams }: Props) {
  const params = await searchParams;
  const status = params.payment;
  const success = status === "success";
  const pending = status === "pending";

  const title = success
    ? "پرداخت با موفقیت تأیید شد"
    : pending
      ? "پرداخت در انتظار تأیید است"
      : "پرداخت ناموفق بود";
  const description = success
    ? "تراکنش از طرف درگاه بانکی تأیید شد و وضعیت فاکتور یا اشتراک شما به‌روزرسانی شده است."
    : pending
      ? "هنوز تأیید نهایی از درگاه دریافت نشده است. از پرداخت دوباره خودداری کنید و چند دقیقه بعد وضعیت را بررسی کنید."
      : "پرداخت تأیید نشد یا توسط شما لغو شد. اگر مبلغی از حساب کسر شده، تا بررسی وضعیت نهایی دوباره پرداخت نکنید.";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10" dir="rtl">
      <section className="w-full max-w-lg rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <div className={`mx-auto mb-5 grid size-16 place-items-center rounded-full border text-2xl font-bold ${success ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500" : pending ? "border-amber-500/40 bg-amber-500/10 text-amber-500" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
          {success ? "✓" : pending ? "…" : "!"}
        </div>
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{description}</p>
        {params.ref && success && (
          <p className="mt-4 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs" dir="ltr">
            کد پیگیری: {params.ref}
          </p>
        )}
        <Link href="/" className="mt-7 inline-flex rounded-lg bg-amber px-6 py-3 text-sm font-semibold text-black hover:bg-amber/90">
          بازگشت به MEKANIX
        </Link>
      </section>
    </main>
  );
}
