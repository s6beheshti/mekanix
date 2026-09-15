"use client";
import { SectionHeader } from "@/components/mek/shared/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Sliders, Shield, Webhook, Building2, Percent } from "lucide-react";
import { toast } from "sonner";

export function AdminSettings() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <SectionHeader title="Platform Settings" subtitle="Global configuration for MEKANIX" />

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Globe className="size-4 text-amber" /> Regions & Localization</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Default Country</Label>
            <Select defaultValue="US">
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="AE">UAE</SelectItem>
                <SelectItem value="SA">Saudi Arabia</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Default Currency</Label>
            <Select defaultValue="USD">
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD — $</SelectItem>
                <SelectItem value="EUR">EUR — €</SelectItem>
                <SelectItem value="AED">AED — د.إ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Default Language</Label>
            <Select defaultValue="en">
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ar">العربية</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Time Zone</Label>
            <Select defaultValue="pst">
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pst">America/Los_Angeles</SelectItem>
                <SelectItem value="cet">Europe/Berlin</SelectItem>
                <SelectItem value="gst">Asia/Dubai</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Percent className="size-4 text-amber" /> Fees & Tax</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Platform Commission (%)</Label>
            <Input defaultValue="12" type="number" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Default Tax Rate (%)</Label>
            <Input defaultValue="9" type="number" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Cancellation Fee ($)</Label>
            <Input defaultValue="15" type="number" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Warranty Months</Label>
            <Input defaultValue="6" type="number" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Sliders className="size-4 text-amber" /> Platform Toggles</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: "Accept new customers", desc: "Allow new customer registrations", def: true },
            { label: "Accept new technicians", desc: "Allow new technician applications", def: true },
            { label: "Auto-match requests", desc: "Automatically match requests to nearest tech", def: true },
            { label: "Emergency dispatch 24/7", desc: "Enable off-hours emergency dispatch", def: true },
            { label: "Maintenance mode", desc: "Take platform offline for updates", def: false },
          ].map((s, i) => (
            <div key={i} className="flex items-center justify-between">
              <div><p className="text-sm font-medium">{s.label}</p><p className="text-[11px] text-muted-foreground">{s.desc}</p></div>
              <Switch defaultChecked={s.def} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Webhook className="size-4 text-amber" /> Integrations</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {[
            { name: "Stripe Payments", status: "Connected", tone: "emerald" },
            { name: "Twilio SMS", status: "Connected", tone: "emerald" },
            { name: "Mapbox / Google Maps", status: "Configure", tone: "amber" },
            { name: "Push Notifications (FCM)", status: "Configure", tone: "amber" },
            { name: "AI Diagnosis Service", status: "Configure", tone: "amber" },
          ].map((i) => (
            <div key={i.name} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2.5">
              <div className="flex items-center gap-2">
                <div className="grid size-8 place-items-center rounded-lg border border-border bg-muted"><Webhook className="size-4 text-muted-foreground" /></div>
                <span className="text-sm font-medium">{i.name}</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => toast.info(`Opening ${i.name} config`)}>{i.status}</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-sm"><Building2 className="size-4 text-amber" /> Branding</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Platform Name</Label>
            <Input defaultValue="MEKANIX" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Support Email</Label>
            <Input defaultValue="ops@mekanix.io" className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">Support Phone</Label>
            <Input defaultValue="+1-415-000-0000" className="mt-1" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button className="bg-amber text-black hover:bg-amber/90" onClick={() => toast.success("Platform settings saved")}>Save Settings</Button>
      </div>
    </div>
  );
}
