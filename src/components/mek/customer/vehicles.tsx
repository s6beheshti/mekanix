"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Car, Plus, Loader2, X, Save, Search, ChevronDown, Check } from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { useT } from "@/lib/use-t";
import { api, type Vehicle } from "@/lib/api";
import { MACHINE_TYPES, typesForMode, type MachineMode } from "@/lib/constants";
import { VehicleCard } from "@/components/mek/shared/vehicle-card";
import { filterByMode } from "./home";
import { EmptyState, SectionHeader } from "@/components/mek/shared/primitives";
import { MekIcon, iconForMachineType } from "@/components/mek/shared/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { getMakesForMode } from "@/lib/vehicle-db";

export function CustomerVehicles({ customer }: { customer: DemoUser }) {
  const { go, machineMode } = useApp();
  const { t, isFa } = useT();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    if (!customer.customer) return;
    api.listVehicles(customer.customer.id).then((v) => setVehicles(filterByMode(v, machineMode))).catch(() => setVehicles([]));
  };
  useEffect(load, [customer, machineMode]);

  const onDelete = async (id: string) => {
    await api.deleteVehicle(id);
    toast.success(isFa ? "ماشین حذف شد" : "Vehicle removed");
    load();
  };

  return (
    <div className="space-y-5" dir={isFa ? "rtl" : "ltr"}>
      <SectionHeader
        title={t("vehicles.title")}
        subtitle={t("vehicles.subtitle")}
        action={<Button onClick={() => setAddOpen(true)} className="bg-amber text-black hover:bg-amber/90"><Plus className="mr-1.5 size-4" /> {t("vehicles.addMachine")}</Button>}
      />

      {vehicles === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-muted/60 mk-shimmer" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title={t("vehicles.empty.title")}
          description={t("vehicles.empty.desc")}
          action={<Button onClick={() => setAddOpen(true)} className="bg-amber text-black hover:bg-amber/90"><Plus className="mr-1.5 size-4" /> {t("vehicles.addMachine")}</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onDelete={() => onDelete(v.id)} onSelect={() => go("request-type", { vehicleId: v.id })} />
          ))}
        </div>
      )}

      <AddVehicleDialog open={addOpen} onOpenChange={setAddOpen} customerId={customer.customer?.id ?? ""} onCreated={load} machineMode={machineMode} />
    </div>
  );
}

function AddVehicleDialog({ open, onOpenChange, customerId, onCreated, machineMode }: { open: boolean; onOpenChange: (v: boolean) => void; customerId: string; onCreated: () => void; machineMode: MachineMode }) {
  const { t, isFa, type: typeLabel } = useT();
  const [type, setType] = useState<string>(machineMode === "heavy" ? "TRUCK" : "CAR");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [plate, setPlate] = useState("");
  const [location, setLocation] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [makeQuery, setMakeQuery] = useState("");
  const [makeOpen, setMakeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

  const dbMakes = getMakesForMode(machineMode);
  const filteredMakes = dbMakes.filter((m) => m.make.toLowerCase().includes(makeQuery.toLowerCase()) || m.country.includes(makeQuery));
  const selectedMakeObj = dbMakes.find((m) => m.make === make);
  const availableModels = selectedMakeObj?.models ?? [];
  const filteredModels = availableModels.filter((m) => m.toLowerCase().includes(modelQuery.toLowerCase()));

  const reset = () => {
    setType(machineMode === "heavy" ? "TRUCK" : "CAR"); setMake(""); setModel(""); setYear(String(new Date().getFullYear())); setPlate(""); setLocation(""); setEngineHours(""); setNotes("");
    setMakeQuery(""); setModelQuery(""); setMakeOpen(false); setModelOpen(false);
  };

  const submit = async () => {
    if (!make.trim() || !model.trim()) {
      toast.error(t("vehicles.add.requireMakeModel"));
      return;
    }
    setSaving(true);
    try {
      const lat = 37.7749 + (Math.random() - 0.5) * 0.05;
      const lng = -122.4194 + (Math.random() - 0.5) * 0.05;
      await api.createVehicle({
        customerId,
        type: type as any,
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year) || new Date().getFullYear(),
        plate: plate.trim() || null,
        location: location.trim() || null,
        engineHours: engineHours ? parseInt(engineHours) : null,
        lat,
        lng,
        notes: notes.trim() || null,
      });
      toast.success(t("vehicles.add.added"));
      onCreated();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add machine");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display"><Car className="size-4 text-amber" /> {t("vehicles.add.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">{t("vehicles.add.machineType")}</Label>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {MACHINE_TYPES.filter((m) => m.slug !== "OTHER" && typesForMode(machineMode).includes(m.slug)).map((m) => (
                <button
                  key={m.slug}
                  onClick={() => setType(m.slug)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${type === m.slug ? "border-amber bg-amber/10" : "border-border hover:bg-accent"}`}
                >
                  <MekIcon name={m.icon} className={`size-5 ${type === m.slug ? "text-amber" : "text-muted-foreground"}`} />
                  <span className="text-[9px] font-medium leading-tight">{typeLabel(m.slug).split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {/* Make — searchable dropdown from vehicle DB */}
            <div className="relative">
              <Label className="text-xs">{t("vehicles.add.make")}</Label>
              <button
                type="button"
                onClick={() => { setMakeOpen(!makeOpen); setModelOpen(false); }}
                className="mt-1 flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm"
              >
                <span className={make ? "" : "text-muted-foreground"}>{make || t("vehicles.add.makePlaceholder")}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              {makeOpen && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input value={makeQuery} onChange={(e) => setMakeQuery(e.target.value)} placeholder={isFa ? "جستجو..." : "Search..."} className="h-8 pl-7 text-xs" autoFocus />
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {filteredMakes.length === 0 ? (
                      <button onClick={() => { setMake(makeQuery); setModel(""); setMakeOpen(false); setMakeQuery(""); }} className="w-full px-3 py-2 text-left text-xs hover:bg-accent">
                        «{makeQuery}» ({isFa ? "دستی" : "manual"})
                      </button>
                    ) : (
                      filteredMakes.map((m) => (
                        <button key={m.make} onClick={() => { setMake(m.make); setModel(""); setMakeOpen(false); setMakeQuery(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent">
                          <span className="font-medium">{m.make}</span>
                          <span className="text-[10px] text-muted-foreground">{m.country}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Model — searchable dropdown from selected make */}
            <div className="relative">
              <Label className="text-xs">{t("vehicles.add.model")}</Label>
              <button
                type="button"
                disabled={!make}
                onClick={() => { setModelOpen(!modelOpen); setMakeOpen(false); }}
                className="mt-1 flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm disabled:opacity-40"
              >
                <span className={model ? "" : "text-muted-foreground"}>{model || t("vehicles.add.modelPlaceholder")}</span>
                <ChevronDown className="size-4 text-muted-foreground" />
              </button>
              {modelOpen && make && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                  <div className="border-b border-border p-2">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input value={modelQuery} onChange={(e) => setModelQuery(e.target.value)} placeholder={isFa ? "جستجو..." : "Search..."} className="h-8 pl-7 text-xs" autoFocus />
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                    {filteredModels.length === 0 ? (
                      <button onClick={() => { setModel(modelQuery); setModelOpen(false); setModelQuery(""); }} className="w-full px-3 py-2 text-left text-xs hover:bg-accent">
                        «{modelQuery}» ({isFa ? "دستی" : "manual"})
                      </button>
                    ) : (
                      filteredModels.map((m) => (
                        <button key={m} onClick={() => { setModel(m); setModelOpen(false); setModelQuery(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-accent">
                          {m}
                          {model === m && <Check className="size-3 text-amber" />}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label className="text-xs">{t("vehicles.add.year")}</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} type="number" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("vehicles.add.plate")}</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder={isFa ? "اختیاری" : "Optional"} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("vehicles.add.location")}</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("vehicles.add.locationPlaceholder")} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">{t("vehicles.add.engineHours")}</Label>
              <Input value={engineHours} onChange={(e) => setEngineHours(e.target.value)} type="number" placeholder={isFa ? "اختیاری" : "Optional"} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">{t("vehicles.add.notes")}</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("vehicles.add.notesPlaceholder")} rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("vehicles.add.cancel")}</Button>
          <Button onClick={submit} disabled={saving} className="bg-amber text-black hover:bg-amber/90">
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            {saving ? t("vehicles.add.saving") : t("vehicles.add.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
