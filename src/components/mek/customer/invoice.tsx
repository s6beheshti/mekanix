"use client";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Receipt, Loader2, CreditCard, Wallet, Landmark, Banknote, ShieldCheck, CheckCircle2, ArrowLeft, Lock,
} from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { api, type Invoice, type Job, type Payment } from "@/lib/api";
import { PAYMENT_METHODS } from "@/lib/constants";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { parseMedia } from "@/lib/format";

export function CustomerInvoice({ customer }: { customer: DemoUser }) {
  const { go, params, back } = useApp();
  const [job, setJob] = useState<Job | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState("card");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (!params.jobId) return;
    api.getJob(params.jobId).then(async (j) => {
      setJob(j);
      const inv = await api.getInvoice(j.id);
      setInvoice(inv);
    }).catch(() => toast.error("Job not found")).finally(() => setLoading(false));
  }, [params.jobId]);

  const approveAndPay = async () => {
    if (!invoice) return;
    setPaying(true);
    try {
      // approve first (if waiting)
      if (job && !job.customerApproved && job.status === "WAITING_APPROVAL") {
        const updated = await api.updateJobStatus(job.id, job.status, { customerApproved: true });
        setJob(updated);
      }
      const pay = await api.payInvoice(invoice.id, method);
      if (pay.status === "SUCCEEDED") {
        toast.success("Payment successful");
        go("completion", { jobId: job!.id });
      } else {
        toast.error("Payment failed — please try again");
      }
    } catch (e: any) {
      toast.error(e.message ?? "Payment failed");
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <div className="grid h-64 place-items-center"><Loader2 className="size-8 animate-spin text-amber" /></div>;
  if (!job) return null;

  const parts = job.parts;
  const mediaUrls = parseMedia(job.request.mediaUrls);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <button onClick={back} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back
      </button>

      {/* Invoice header */}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-gradient-to-r from-amber/10 to-transparent px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid size-9 place-items-center rounded-lg border border-amber/30 bg-amber/10">
              <Receipt className="size-4 text-amber" />
            </div>
            <div>
              <h1 className="font-display text-base font-semibold">Repair Estimate</h1>
              <p className="font-mono text-[11px] text-muted-foreground">{invoice?.code ?? "Draft"} · {job.code}</p>
            </div>
          </div>
          {invoice && (
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${invoice.status === "PAID" ? "border-emerald-glow/30 bg-emerald-glow/10 text-emerald-glow" : invoice.status === "SENT" ? "border-amber/30 bg-amber/10 text-amber" : "border-border text-muted-foreground"}`}>
              {invoice.status}
            </span>
          )}
        </div>

        {/* Diagnosis & parts summary */}
        <div className="space-y-4 p-5">
          {job.diagnosis && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Diagnosis</p>
              <p className="mt-1 text-sm">{job.diagnosis}</p>
            </div>
          )}

          {/* Parts */}
          {parts.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Parts & Materials</p>
              <div className="mt-2 overflow-hidden rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Unit</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2">
                          <span className="font-medium">{p.name}</span>
                          {p.sku && <span className="ml-2 font-mono text-[10px] text-muted-foreground">{p.sku}</span>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{p.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(p.unitPrice)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{fmtMoney(p.unitPrice * p.quantity)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Media evidence */}
          {mediaUrls.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Diagnostic Photos</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {mediaUrls.map((u, i) => <img key={i} src={u} alt="" className="size-20 rounded-lg border border-border object-cover" />)}
              </div>
            </div>
          )}
        </div>

        {/* Totals */}
        {invoice && (
          <div className="border-t border-border bg-muted/20 p-5">
            <div className="mx-auto max-w-xs space-y-1.5 text-sm">
              <Line label="Labor" value={`${invoice.laborHours}h × ${fmtMoney(invoice.laborRate)}`} amount={invoice.laborTotal} />
              <Line label="Parts & materials" amount={invoice.partsTotal} />
              <Line label="Travel fee" amount={invoice.travelFee} />
              <div className="border-t border-border pt-1.5" />
              <Line label="Subtotal" amount={invoice.subtotal} muted />
              <Line label={`Tax (${Math.round(invoice.taxRate * 100)}%)`} amount={invoice.taxTotal} muted />
              {invoice.discount > 0 && <Line label="Discount" amount={-invoice.discount} muted tone="emerald" />}
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="font-display text-base font-semibold">Total</span>
                <span className="font-display text-xl font-bold text-amber">{fmtMoney(invoice.total)}</span>
              </div>
            </div>
          </div>
        )}

        {invoice?.notes && <p className="px-5 pb-3 text-[11px] text-muted-foreground">{invoice.notes}</p>}
      </div>

      {/* Payment */}
      {invoice && invoice.status !== "PAID" && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-amber" />
            <h3 className="font-display text-sm font-semibold">Approve & Pay</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Select a payment method. You'll approve the estimate before charges apply.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PAYMENT_METHODS.map((m) => {
              const Icon = { CreditCard, Wallet, Landmark, Banknote }[m.icon] ?? CreditCard;
              return (
                <button
                  key={m.slug}
                  onClick={() => setMethod(m.slug)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors ${method === m.slug ? "border-amber bg-amber/10" : "border-border hover:bg-accent"}`}
                >
                  <Icon className={`size-5 ${method === m.slug ? "text-amber" : "text-muted-foreground"}`} />
                  <span className="text-[10px] font-medium leading-tight">{m.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-glow/20 bg-emerald-glow/5 p-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-4 text-emerald-glow shrink-0" />
            MEKANIX secure payment · 6-month warranty on parts & labor
          </div>

          <Button onClick={approveAndPay} disabled={paying} className="mt-3 w-full bg-amber text-black hover:bg-amber/90">
            {paying ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Lock className="mr-2 size-4" />}
            Approve & Pay {fmtMoney(invoice.total)}
          </Button>
        </div>
      )}

      {invoice?.status === "PAID" && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-emerald-glow/40 bg-emerald-glow/5 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-5 text-emerald-glow" />
            <h3 className="font-display text-sm font-semibold">Payment Complete</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Paid {fmtMoney(invoice.total)} on {fmtDate(invoice.updatedAt)}.</p>
          <Button onClick={() => go("completion", { jobId: job.id })} className="mt-3 bg-amber text-black hover:bg-amber/90">
            View Summary & Rate
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function Line({ label, value, amount, muted, tone }: { label: string; value?: string; amount: number; muted?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>
        {label}{value && <span className="ml-1 text-[11px] text-muted-foreground">{value}</span>}
      </span>
      <span className={`tabular-nums ${tone === "emerald" ? "text-emerald-glow" : muted ? "text-muted-foreground" : "font-medium"}`}>
        {fmtMoney(amount)}
      </span>
    </div>
  );
}
