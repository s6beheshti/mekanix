"use client";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { COUNTRIES, CURRENCIES } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { User as UserIcon, Globe, Bell, Shield } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

export function CustomerSettings({ customer }: { customer: DemoUser }) {
  const { go } = useApp();
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your account, preferences & notifications</p>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><UserIcon className="size-4 text-amber" /> Profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid size-14 place-items-center overflow-hidden rounded-full border border-border bg-muted">
              {customer.avatar ? <img src={customer.avatar} alt="" className="size-full object-cover" /> : <span className="font-semibold">{customer.name[0]}</span>}
            </div>
            <div className="flex-1">
              <p className="font-medium">{customer.name}</p>
              <p className="text-xs text-muted-foreground">{customer.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Full Name</Label>
              <Input defaultValue={customer.name} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Phone</Label>
              <Input defaultValue={customer.phone ?? ""} className="mt-1" />
            </div>
          </div>
          {customer.customer?.company && (
            <div>
              <Label className="text-xs">Company</Label>
              <Input defaultValue={customer.customer.company} className="mt-1" />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Globe className="size-4 text-amber" /> Regional</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Country</Label>
              <Select defaultValue={customer.country}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Currency</Label>
              <Select defaultValue={customer.currency}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CURRENCIES).map(([k, v]) => <SelectItem key={k} value={k}>{v.symbol} {v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Language</Label>
            <Select defaultValue="en">
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fa">فارسی</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Theme</Label>
            <Select value={theme} onValueChange={(v) => { setTheme(v); toast.success(`Theme: ${v}`); }}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dark">Dark (Graphite)</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Bell className="size-4 text-amber" /> Notifications</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Job status updates", desc: "When a technician accepts, arrives, or completes", def: true },
            { label: "Estimate & invoice alerts", desc: "When estimates are ready or payment is due", def: true },
            { label: "New messages", desc: "When your technician sends a message", def: true },
            { label: "Maintenance reminders", desc: "Scheduled service reminders for your fleet", def: true },
            { label: "Promotions", desc: "Occasional offers and service deals", def: false },
          ].map((n, i) => (
            <div key={i} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{n.label}</p>
                <p className="text-[11px] text-muted-foreground">{n.desc}</p>
              </div>
              <Switch defaultChecked={n.def} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Shield className="size-4 text-amber" /> Security</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("Password reset link sent")}>Change password</Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => toast.info("2FA setup coming soon")}>Enable two-factor auth</Button>
          <Button variant="outline" className="w-full justify-start text-destructive hover:bg-destructive/10" onClick={() => toast.info("Session cleared")}>Sign out all devices</Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="bg-amber text-black hover:bg-amber/90" onClick={() => toast.success("Settings saved")}>Save Changes</Button>
      </div>
    </div>
  );
}
