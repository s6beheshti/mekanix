"use client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { JOB_STATUS_FLOW } from "@/lib/constants";
import { Check } from "lucide-react";

export function JobStatusTimeline({ status, compact = false }: { status: string; compact?: boolean }) {
  const flow = JOB_STATUS_FLOW.filter((s) => s.key !== "CANCELLED");
  const current = flow.find((s) => s.key === status);
  const currentStep = current?.step ?? 0;

  if (status === "CANCELLED") {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        This job was cancelled.
      </div>
    );
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {flow.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div className={cn("h-1.5 rounded-full transition-all", i <= currentStep ? "bg-amber" : "bg-muted")} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-2 bottom-2 w-px bg-border" />
      <ol className="space-y-3">
        {flow.map((s, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <motion.li
              key={s.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="relative flex items-start gap-3"
            >
              <div
                className={cn(
                  "relative z-10 grid size-8 shrink-0 place-items-center rounded-full border-2 transition-all",
                  done && "border-amber bg-amber text-black",
                  active && "border-amber bg-amber/15 text-amber",
                  !done && !active && "border-border bg-background text-muted-foreground"
                )}
              >
                {done ? (
                  <Check className="size-3.5" />
                ) : active ? (
                  <span className="size-2 rounded-full bg-amber mk-status-pulse" />
                ) : (
                  <span className="font-mono text-[10px]">{i + 1}</span>
                )}
              </div>
              <div className="pt-1">
                <p className={cn("text-sm font-medium", active ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                  {s.label}
                </p>
                <p className="text-[11px] text-muted-foreground">{s.hint}</p>
              </div>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
