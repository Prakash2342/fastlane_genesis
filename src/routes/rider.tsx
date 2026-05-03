import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bike, CheckCircle2, Loader2, Package, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/components/require-role";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/rider")({
  component: () => (
    <RequireRole role="rider">
      <RiderDashboard />
    </RequireRole>
  ),
});

interface OrderJob {
  id: string;
  status: "placed" | "accepted" | "picked_up" | "delivered" | "cancelled";
  price: number;
  created_at: string;
  dish_id: string;
  resident_id: string;
  chef_id: string;
  rider_id: string | null;
}
interface Lookup {
  dishes: Record<string, { name: string }>;
  profiles: Record<string, { full_name: string; flat_number: string | null }>;
}

function RiderDashboard() {
  const { profile } = useAuth();
  const [available, setAvailable] = useState(false);
  const [orders, setOrders] = useState<OrderJob[]>([]);
  const [lookup, setLookup] = useState<Lookup>({ dishes: {}, profiles: {} });
  const [loading, setLoading] = useState(true);

  async function loadStatus() {
    if (!profile) return;
    const { data } = await supabase
      .from("rider_status")
      .select("available")
      .eq("rider_id", profile.id)
      .maybeSingle();
    setAvailable(data?.available ?? false);
  }

  async function load() {
    if (!profile) return;
    // Show: jobs already assigned to me, plus open jobs (placed with no rider) in my society
    const { data: myJobs } = await supabase
      .from("orders")
      .select("*")
      .eq("rider_id", profile.id)
      .order("created_at", { ascending: false });

    const { data: openJobs } = await supabase
      .from("orders")
      .select("*")
      .is("rider_id", null)
      .eq("status", "placed")
      .eq("society", profile.society);

    const all = [...((openJobs as OrderJob[]) ?? []), ...((myJobs as OrderJob[]) ?? [])];
    // dedupe
    const map = new Map(all.map((o) => [o.id, o]));
    const list = Array.from(map.values()).sort(
      (a, b) => +new Date(b.created_at) - +new Date(a.created_at),
    );
    setOrders(list);

    if (list.length) {
      const dishIds = Array.from(new Set(list.map((o) => o.dish_id)));
      const userIds = Array.from(new Set(list.flatMap((o) => [o.resident_id, o.chef_id])));
      const [{ data: ds }, { data: ps }] = await Promise.all([
        supabase.from("dishes").select("id, name").in("id", dishIds),
        supabase.from("profiles").select("id, full_name, flat_number").in("id", userIds),
      ]);
      const lk: Lookup = { dishes: {}, profiles: {} };
      ds?.forEach((d) => (lk.dishes[d.id] = { name: d.name }));
      ps?.forEach((p) => (lk.profiles[p.id] = { full_name: p.full_name, flat_number: p.flat_number }));
      setLookup(lk);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadStatus();
    load();
    const ch = supabase
      .channel("rider")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function toggleAvailable(v: boolean) {
    if (!profile) return;
    setAvailable(v);
    await supabase
      .from("rider_status")
      .upsert({ rider_id: profile.id, available: v, updated_at: new Date().toISOString() });
    toast.success(v ? "You're online" : "You're offline");
  }

  async function update(id: string, patch: Partial<OrderJob>) {
    const { error } = await supabase
      .from("orders")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else load();
  }

  const active = orders.filter((o) => ["placed", "accepted", "picked_up"].includes(o.status));
  const past = orders.filter((o) => o.status === "delivered");

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Rider hub</h1>
          <p className="text-muted-foreground">{profile?.society}</p>
        </div>
        <Card className="flex items-center gap-3 p-4">
          <Bike className={available ? "text-herb" : "text-muted-foreground"} />
          <div>
            <Label htmlFor="online" className="text-sm">
              {available ? "Online — accepting jobs" : "Offline"}
            </Label>
            <div className="mt-1 flex items-center gap-2">
              <Switch id="online" checked={available} onCheckedChange={toggleAvailable} />
            </div>
          </div>
        </Card>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <h2 className="mb-3 font-display text-xl font-semibold">Active jobs</h2>
          {active.length === 0 ? (
            <Card className="grid place-items-center p-12 text-center text-muted-foreground">
              {available ? "No jobs right now. Stay online — you'll get pinged." : "Go online to receive jobs."}
            </Card>
          ) : (
            <div className="space-y-3">
              {active.map((o) => (
                <JobRow key={o.id} order={o} lookup={lookup} myId={profile!.id} onUpdate={update} />
              ))}
            </div>
          )}

          {past.length > 0 && (
            <>
              <h2 className="mb-3 mt-10 font-display text-xl font-semibold">Delivered</h2>
              <div className="space-y-3">
                {past.slice(0, 8).map((o) => (
                  <Card key={o.id} className="flex items-center justify-between p-4 opacity-70">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-herb" />
                      <div>
                        <div className="font-medium">{lookup.dishes[o.dish_id]?.name ?? "Order"}</div>
                        <div className="text-xs text-muted-foreground">
                          ₹{o.price} · {new Date(o.created_at).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <Badge variant="secondary">Delivered</Badge>
                  </Card>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}

function JobRow({
  order,
  lookup,
  myId,
  onUpdate,
}: {
  order: OrderJob;
  lookup: Lookup;
  myId: string;
  onUpdate: (id: string, patch: Partial<OrderJob>) => void;
}) {
  const dish = lookup.dishes[order.dish_id];
  const resident = lookup.profiles[order.resident_id];
  const chef = lookup.profiles[order.chef_id];
  const mine = order.rider_id === myId;
  // Note: order.rider_id is not in the type, use a cast — accept handler for unassigned
  const unassigned = !mine && order.status === "placed";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-semibold">{dish?.name ?? "Order"}</h3>
            <Badge variant="outline" className="capitalize">
              {order.status.replace("_", " ")}
            </Badge>
          </div>
          <div className="mt-2 grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Pick up: {chef?.full_name ?? "Chef"}{" "}
              {chef?.flat_number ? `(${chef.flat_number})` : ""}
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Drop: {resident?.full_name ?? "Resident"}{" "}
              {resident?.flat_number ? `(${resident.flat_number})` : ""}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-lg font-semibold">₹{order.price}</div>
          <div className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleTimeString()}</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {unassigned && (
          <Button onClick={() => onUpdate(order.id, { status: "accepted", rider_id: myId })}>
            Accept job
          </Button>
        )}
        {mine && order.status === "accepted" && (
          <Button onClick={() => onUpdate(order.id, { status: "picked_up" })}>Mark picked up</Button>
        )}
        {mine && order.status === "picked_up" && (
          <Button onClick={() => onUpdate(order.id, { status: "delivered" })}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Mark delivered
          </Button>
        )}
        {mine && order.status === "placed" && (
          <Button onClick={() => onUpdate(order.id, { status: "accepted" })}>Confirm pickup</Button>
        )}
      </div>
    </Card>
  );
}
