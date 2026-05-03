import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Activity, Flame, Loader2, MapPin, Search, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { findNearestRider } from "@/lib/matching";

export const Route = createFileRoute("/feed")({
  component: () => (
    <RequireRole role="resident">
      <ResidentFeed />
    </RequireRole>
  ),
});

interface Dish {
  id: string;
  chef_id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
  calories: number | null;
  health_score: number | null;
  tags: string[] | null;
  meal_slot: string | null;
  status: string;
}
interface ChefMap {
  [id: string]: { full_name: string; flat_number: string | null };
}

interface OrderRow {
  id: string;
  status: string;
  dish_id: string;
  rider_id: string | null;
  created_at: string;
}

const FILTERS = ["All", "Veg", "High Protein", "Low Calorie", "Keto"];

function ResidentFeed() {
  const { profile } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [chefs, setChefs] = useState<ChefMap>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [q, setQ] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);

  async function load() {
    if (!profile) return;
    const { data } = await supabase
      .from("dishes")
      .select("*")
      .eq("status", "available")
      .gt("quantity", 0)
      .order("created_at", { ascending: false });
    const list = (data as Dish[]) ?? [];
    setDishes(list);

    if (list.length) {
      const chefIds = Array.from(new Set(list.map((d) => d.chef_id)));
      const { data: cs } = await supabase
        .from("profiles")
        .select("id, full_name, flat_number")
        .in("id", chefIds);
      const map: ChefMap = {};
      (cs ?? []).forEach((c) => {
        map[c.id] = { full_name: c.full_name, flat_number: c.flat_number };
      });
      setChefs(map);
    }

    const { data: myOrders } = await supabase
      .from("orders")
      .select("id, status, dish_id, rider_id, created_at")
      .eq("resident_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(10);
    setOrders((myOrders as OrderRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const filtered = useMemo(() => {
    return dishes.filter((d) => {
      if (filter !== "All" && !d.tags?.includes(filter)) return false;
      if (q && !d.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [dishes, filter, q]);

  async function placeOrder(d: Dish) {
    if (!profile) return;
    toast.loading("Finding the nearest rider...", { id: "order" });
    const match = await findNearestRider(profile.society, {
      latitude: profile.latitude,
      longitude: profile.longitude,
    });

    const { error } = await supabase.from("orders").insert({
      dish_id: d.id,
      resident_id: profile.id,
      chef_id: d.chef_id,
      society: profile.society,
      price: d.price,
      rider_id: match?.rider.id ?? null,
    });

    if (error) {
      toast.error(error.message, { id: "order" });
      return;
    }

    // Atomic qty decrement (prevents overselling under concurrent orders)
    await supabase.rpc("decrement_dish_quantity", { dish_id: d.id });

    if (match) {
      toast.success(
        `Ordered! Assigned to ${match.rider.full_name} (${match.km.toFixed(2)} km away)`,
        { id: "order" },
      );
    } else {
      toast.success("Ordered! Waiting for a rider to be available.", { id: "order" });
    }
    load();
  }

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">Today in {profile?.society}</h1>
        <p className="text-muted-foreground">Fresh from chefs around your tower.</p>
      </div>

      {/* Active orders strip */}
      {orders.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length > 0 && (
        <Card className="mb-6 p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Active orders
          </div>
          <div className="flex flex-wrap gap-2">
            {orders
              .filter((o) => o.status !== "delivered" && o.status !== "cancelled")
              .map((o) => {
                const dish = dishes.find((d) => d.id === o.dish_id);
                return (
                  <Badge key={o.id} variant="outline" className="border-primary/30 bg-primary/5">
                    {dish?.name ?? "Order"} · {o.status.replace("_", " ")}
                  </Badge>
                );
              })}
          </div>
        </Card>
      )}

      {/* Search + filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search dishes..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="rounded-full"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="grid place-items-center p-12 text-center">
          <p className="text-muted-foreground">No dishes match your filter right now.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((d) => {
            const chef = chefs[d.chef_id];
            return (
              <Card key={d.id} className="group overflow-hidden transition-all hover:-translate-y-1 hover:shadow-warm">
                <div className="aspect-[4/3] bg-muted">
                  {d.image_url ? (
                    <img
                      src={d.image_url}
                      alt={d.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center font-display text-4xl text-muted-foreground/40">
                      {d.name[0]}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-display text-lg font-semibold leading-tight">{d.name}</h3>
                      {chef && (
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          by {chef.full_name}{" "}
                          {chef.flat_number && (
                            <span className="inline-flex items-center gap-0.5">
                              · <MapPin className="h-3 w-3" /> {chef.flat_number}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <span className="font-display text-lg font-semibold text-primary">₹{d.price}</span>
                  </div>
                  {d.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{d.description}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="border-spice/40 bg-spice/10 text-spice-foreground">
                      <Flame className="mr-1 h-3 w-3" /> {d.calories ?? "—"} kcal
                    </Badge>
                    <Badge variant="outline" className="border-herb/40 bg-herb/10 text-herb">
                      <Activity className="mr-1 h-3 w-3" /> {d.health_score ?? "—"}/10
                    </Badge>
                    {d.tags?.slice(0, 2).map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <Button onClick={() => placeOrder(d)} className="mt-4 w-full">
                    <ShoppingBag className="mr-2 h-4 w-4" /> Order · ₹{d.price}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
