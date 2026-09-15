"use client";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Car, Plus, Loader2, X, Save } from "lucide-react";
import type { DemoUser } from "@/lib/use-active-user";
import { useApp } from "@/lib/store";
import { api, type Vehicle } from "@/lib/api";
import { MACHINE_TYPES, typesForMode } from "@/lib/constants";
import { VehicleCard } from "@/components/mek/shared/vehicle-card";
import { filterByMode } from "./home";
import { EmptyState, SectionHeader } from "@/components/mek/shared/primitives";
import { MekIcon, iconForMachineType } from "@/components/mek/shared/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export function CustomerVehicles({ customer }: { customer: DemoUser }) {
  const { go, machineMode } = useApp();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = () => {
    if (!customer.customer) return;
    api.listVehicles(customer.customer.id).then((v) => setVehicles(filterByMode(v, machineMode))).catch(() => setVehicles([]));
  };
  useEffect(load, [customer, machineMode]);

  const onDelete = async (id: string) => {
    await api.deleteVehicle(id);
    toast.success("Vehicle removed");
    load();
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="My Fleet"
        subtitle="Vehicles and machinery registered to your account"
        action={<Button onClick={() => setAddOpen(true)} className="bg-amber text-black hover:bg-amber/90"><Plus className="mr-1.5 size-4" /> Add Machine</Button>}
      />

      {vehicles === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-36 rounded-xl bg-muted/60 mk-shimmer" />)}
        </div>
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={Car}
          title="No machines yet"
          description="Add your cars, trucks, or heavy machinery to request service instantly."
          action={<Button onClick={() => setAddOpen(true)} className="bg-amber text-black hover:bg-amber/90"><Plus className="mr-1.5 size-4" /> Add Machine</Button>}
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

function AddVehicleDialog({ open, onOpenChange, customerId, onCreated, machineMode }: { open: boolean; onOpenChange: (v: boolean) => void; customerId: string; onCreated: () => void; machineMode: "passenger" | "heavy" }) {
  const [type, setType] = useState<string>(machineMode === "heavy" ? "TRUCK" : "CAR");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [plate, setPlate] = useState("");
  const [location, setLocation] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setType(machineMode === "heavy" ? "TRUCK" : "CAR"); setMake(""); setModel(""); setYear(String(new Date().getFullYear())); setPlate(""); setLocation(""); setEngineHours(""); setNotes("");
  };

  const submit = async () => {
    if (!make.trim() || !model.trim()) {
      toast.error("Make and model are required");
      return;
    }
    setSaving(true);
    try {
      // default SF location
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
      toast.success("Machine added to your fleet");
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
          <DialogTitle className="flex items-center gap-2 font-display"><Car className="size-4 text-amber" /> Register a Machine</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Machine Type</Label>
            <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {MACHINE_TYPES.filter((m) => m.slug !== "OTHER" && typesForMode(machineMode).includes(m.slug)).map((m) => (
                <button
                  key={m.slug}
                  onClick={() => setType(m.slug)}
                  className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition-colors ${type === m.slug ? "border-amber bg-amber/10" : "border-border hover:bg-accent"}`}
                >
                  <MekIcon name={m.icon} className={`size-5 ${type === m.slug ? "text-amber" : "text-muted-foreground"}`} />
                  <span className="text-[9px] font-medium leading-tight">{m.label.split(" ")[0]}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Make</Label>
              <Input value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Volvo" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Model</Label>
              <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. VNL 760" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Year</Label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} type="number" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Plate / ID</Label>
              <Input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="Optional" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Location Label</Label>
              <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. North Yard" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Engine Hours</Label>
              <Input value={engineHours} onChange={(e) => setEngineHours(e.target.value)} type="number" placeholder="Optional" className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the technician should know…" rows={2} className="mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-amber text-black hover:bg-amber/90">
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
            Save Machine
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
