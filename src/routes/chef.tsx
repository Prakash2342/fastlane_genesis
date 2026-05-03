import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Sparkles, Loader2, Trash2, ImageIcon, Activity, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { RequireRole } from "@/components/require-role";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { estimateNutrition, heuristicNutrition, type NutritionResult } from "@/lib/nutrition";

export const Route = createFileRoute("/chef")({
  component: () => (
    <RequireRole role="chef">
      <ChefDashboard />
    </RequireRole>
  ),
});

interface Dish {
  id: string;
  name: string;
  description: string | null;
  price: number;
  quantity: number;
  image_url: string | null;
  calories: number | null;
  health_score: number | null;
  tags: string[] | null;
  ai_explanation: string | null;
  meal_slot: string | null;
  status: "available" | "sold_out";
  created_at: string;
}

interface OrderRow {
  id: string;
  status: string;
  price: number;
  created_at: string;
  dish_id: string;
}

function ChefDashboard() {
  const { profile } = useAuth();
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  async function load() {
    if (!profile) return;
    const [{ data: d }, { data: o }] = await Promise.all([
      supabase
        .from("dishes")
        .select("*")
        .eq("chef_id", profile.id)
        .order("created_at", { ascending: false }),
      supabase.from("orders").select("id, status, price, created_at, dish_id").eq("chef_id", profile.id),
    ]);
    setDishes((d as Dish[]) ?? []);
    setOrders((o as OrderRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const ch = supabase
      .channel("chef-orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "dishes" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function markSoldOut(id: string) {
    await supabase.from("dishes").update({ status: "sold_out" }).eq("id", id);
    toast.success("Marked sold out");
    load();
  }
  async function deleteDish(id: string) {
    await supabase.from("dishes").delete().eq("id", id);
    toast.success("Dish removed");
    load();
  }

  const revenue = orders
    .filter((o) => o.status === "delivered")
    .reduce((s, o) => s + Number(o.price), 0);
  const activeOrders = orders.filter((o) => ["placed", "accepted", "picked_up"].includes(o.status))
    .length;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Your Kitchen</h1>
          <p className="text-muted-foreground">
            {profile?.society} · publish today's specials
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="lg">
              <Plus className="mr-2 h-4 w-4" /> New dish
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Publish dish of the day</DialogTitle>
            </DialogHeader>
            <NewDishForm
              onCreated={() => {
                setOpen(false);
                load();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Active listings" value={dishes.filter((d) => d.status === "available").length} />
        <StatCard label="Active orders" value={activeOrders} />
        <StatCard label="Revenue (delivered)" value={`₹${revenue.toFixed(0)}`} />
      </div>

      <h2 className="mb-3 font-display text-xl font-semibold">Your listings</h2>
      {loading ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : dishes.length === 0 ? (
        <Card className="grid place-items-center p-12 text-center">
          <p className="text-muted-foreground">No dishes yet. Publish your first one!</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {dishes.map((d) => (
            <Card key={d.id} className="overflow-hidden">
              <div className="aspect-[4/3] bg-muted">
                {d.image_url ? (
                  <img src={d.image_url} alt={d.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display text-lg font-semibold">{d.name}</h3>
                  <span className="font-display text-lg font-semibold text-primary">₹{d.price}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <Badge variant="outline" className="border-spice/40 bg-spice/10 text-spice-foreground">
                    <Flame className="mr-1 h-3 w-3" /> {d.calories ?? "—"} kcal
                  </Badge>
                  <Badge variant="outline" className="border-herb/40 bg-herb/10 text-herb">
                    <Activity className="mr-1 h-3 w-3" /> {d.health_score ?? "—"}/10
                  </Badge>
                  {d.tags?.slice(0, 2).map((t) => (
                    <Badge key={t} variant="secondary">
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Qty left: {d.quantity}</span>
                  <span className={d.status === "sold_out" ? "text-destructive" : "text-herb"}>
                    {d.status === "sold_out" ? "Sold out" : "Available"}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  {d.status === "available" && (
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => markSoldOut(d.id)}>
                      Mark sold out
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteDish(d.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-semibold">{value}</div>
    </Card>
  );
}

function NewDishForm({ onCreated }: { onCreated: () => void }) {
  const { profile } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("120");
  const [quantity, setQuantity] = useState("10");
  const [mealSlot, setMealSlot] = useState("lunch");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<NutritionResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Live heuristic preview
  useEffect(() => {
    if (!name) return setPreview(null);
    setPreview(heuristicNutrition(name, description));
  }, [name, description]);

  async function runAI() {
    setAiBusy(true);
    const refined = await estimateNutrition(name, description);
    setPreview(refined);
    setAiBusy(false);
    toast.success("AI estimate updated");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || !name) return;
    setSubmitting(true);

    let image_url: string | null = null;
    if (file) {
      const path = `${profile.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("dish-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (upErr) {
        toast.error("Image upload failed: " + upErr.message);
      } else {
        const { data } = supabase.storage.from("dish-images").getPublicUrl(path);
        image_url = data.publicUrl;
      }
    }

    const nutrition = preview ?? heuristicNutrition(name, description);

    const { error } = await supabase.from("dishes").insert({
      chef_id: profile.id,
      society: profile.society,
      name,
      description,
      price: Number(price),
      quantity: Number(quantity),
      image_url,
      calories: nutrition.calories,
      health_score: nutrition.health_score,
      tags: nutrition.tags,
      ai_explanation: nutrition.explanation,
      meal_slot: mealSlot as "breakfast" | "lunch" | "dinner" | "snacks",
    });

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Dish published!");
    onCreated();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label htmlFor="dish-name">Dish name</Label>
        <Input
          id="dish-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Paneer Paratha"
          required
        />
      </div>
      <div>
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Stuffed with fresh paneer, lightly pan-fried in ghee, served with curd..."
          rows={2}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="price">Price ₹</Label>
          <Input id="price" type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div>
          <Label htmlFor="qty">Qty</Label>
          <Input id="qty" type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
        </div>
        <div>
          <Label>Slot</Label>
          <Select value={mealSlot} onValueChange={setMealSlot}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="breakfast">Breakfast</SelectItem>
              <SelectItem value="lunch">Lunch</SelectItem>
              <SelectItem value="dinner">Dinner</SelectItem>
              <SelectItem value="snacks">Snacks</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="img">Photo</Label>
        <Input id="img" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>

      {preview && (
        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-primary" /> Nutrition estimate
              <Badge variant="outline" className="ml-1 text-xs">
                {preview.confidence} confidence
              </Badge>
            </div>
            <Button type="button" size="sm" variant="ghost" onClick={runAI} disabled={aiBusy || !name}>
              {aiBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refine with AI"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge className="bg-spice/20 text-spice-foreground">{preview.calories} kcal</Badge>
            <Badge className="bg-herb/20 text-herb">{preview.health_score}/10</Badge>
            {preview.tags.map((t) => (
              <Badge key={t} variant="secondary">
                {t}
              </Badge>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{preview.explanation}</p>
        </div>
      )}

      <Button type="submit" className="w-full" disabled={submitting || !name}>
        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Publish dish
      </Button>
    </form>
  );
}
