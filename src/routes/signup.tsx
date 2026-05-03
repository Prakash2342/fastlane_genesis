import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ChefHat, Loader2, Bike, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppRole } from "@/lib/auth";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

const ROLES: { value: AppRole; label: string; icon: typeof ChefHat; desc: string }[] = [
  { value: "resident", label: "Resident", icon: ShoppingBag, desc: "Order from chefs nearby" },
  { value: "chef", label: "Chef", icon: ChefHat, desc: "Cook & sell home meals" },
  { value: "rider", label: "Rider", icon: Bike, desc: "Deliver in your society" },
];

function SignupPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState<AppRole>("resident");
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    password: "",
    society: "Green Valley Heights",
    flat_number: "",
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Mock coordinates: jitter around society center for matching demo
    const lat = 12.9716 + (Math.random() - 0.5) * 0.01;
    const lng = 77.5946 + (Math.random() - 0.5) * 0.01;

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.full_name,
          role,
          society: form.society,
          flat_number: form.flat_number,
          latitude: lat,
          longitude: lng,
        },
      },
    });

    if (error) {
      setLoading(false);
      toast.error(error.message);
      return;
    }

    toast.success(`Account created! Welcome, ${form.full_name}.`);
    setLoading(false);
    
    const dest = role === "chef" ? "/chef" : role === "rider" ? "/rider" : "/feed";
    navigate({ to: dest });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4 py-10">
      <Card className="w-full max-w-lg p-8 shadow-soft">
        <Link to="/" className="mb-6 flex items-center gap-2 font-display text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-warm text-primary-foreground">
            <ChefHat className="h-5 w-5" />
          </span>
          SocietyHomeChef
        </Link>

        <h1 className="font-display text-2xl font-semibold">Join your society's kitchen</h1>
        <p className="mt-1 text-sm text-muted-foreground">Pick a role to get started.</p>

        {/* Role picker */}
        <div className="mt-5 grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRole(r.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                role === r.value
                  ? "border-primary bg-primary/5 shadow-warm"
                  : "border-border hover:border-primary/50",
              )}
            >
              <r.icon
                className={cn("h-5 w-5", role === r.value ? "text-primary" : "text-muted-foreground")}
              />
              <div className="mt-1.5 text-sm font-semibold">{r.label}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label htmlFor="flat">Flat / Tower</Label>
              <Input
                id="flat"
                placeholder="A-1204"
                value={form.flat_number}
                onChange={(e) => setForm({ ...form, flat_number: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="society">Society</Label>
            <Input
              id="society"
              value={form.society}
              onChange={(e) => setForm({ ...form, society: e.target.value })}
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              You'll only see chefs and orders from your society.
            </p>
          </div>

          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create account
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already cooking?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </Card>
    </div>
  );
}
