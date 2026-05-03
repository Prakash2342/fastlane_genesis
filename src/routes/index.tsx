import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ChefHat, ShoppingBag, Bike, Sparkles, MapPin, Leaf } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import heroImg from "@/assets/hero-thali.jpg";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  const { profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile) {
      const dest =
        profile.role === "chef" ? "/chef" : profile.role === "rider" ? "/rider" : "/feed";
      navigate({ to: dest });
    }
  }, [loading, profile, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="container mx-auto grid gap-12 px-4 py-16 md:grid-cols-2 md:py-24 md:gap-8">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Hyperlocal · AI-powered nutrition
            </span>
            <h1 className="font-display text-5xl font-bold leading-[1.05] text-foreground md:text-6xl">
              Home-cooked meals,{" "}
              <span className="bg-gradient-warm bg-clip-text text-transparent">from neighbours you trust.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              Browse today's specials from chefs in your gated society. See AI-estimated calories
              and a health score on every dish. Order in two taps — a rider in your tower picks it up.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/signup">Get started — free</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/login">I have an account</Link>
              </Button>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Leaf className="h-4 w-4 text-herb" /> AI nutrition on every dish
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-primary" /> Riders within 2 km
              </span>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-warm opacity-15 blur-3xl" />
            <img
              src={heroImg}
              alt="Home-cooked thali with paneer, dal, raita and fresh paratha"
              width={1536}
              height={1024}
              className="aspect-[3/2] w-full rounded-3xl object-cover shadow-warm"
            />
            <div className="absolute -bottom-5 left-5 rounded-2xl border border-border bg-card p-4 shadow-soft">
              <div className="text-xs font-medium text-muted-foreground">Paneer Paratha</div>
              <div className="font-display text-lg font-semibold">₹120</div>
              <div className="mt-1 flex gap-2 text-xs">
                <span className="rounded-full bg-spice/20 px-2 py-0.5 text-spice-foreground">320 kcal</span>
                <span className="rounded-full bg-herb/20 px-2 py-0.5 text-herb">7.1 / 10</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-center font-display text-3xl font-semibold md:text-4xl">
          One platform, three sides of the kitchen.
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
          Sign up as a chef to sell your dish of the day, a resident to order, or a rider to deliver
          last-mile within your society.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: ChefHat,
              title: "HomeChef",
              desc: "Publish a Dish of the Day with photo, price and quantity. We auto-estimate calories and a health score.",
              cta: "Cook & sell",
            },
            {
              icon: ShoppingBag,
              title: "Resident",
              desc: "Browse fresh dishes from chefs in your tower. Filter by Veg, High Protein, Low Calorie. Order in one tap.",
              cta: "Browse menu",
            },
            {
              icon: Bike,
              title: "Rider",
              desc: "Toggle availability, accept the nearest job, mark picked up and delivered. Built for sub-2 km hops.",
              cta: "Earn deliveries",
            },
          ].map((r) => (
            <div
              key={r.title}
              className="group rounded-3xl border border-border bg-card p-6 shadow-soft transition-all hover:-translate-y-1 hover:shadow-warm"
            >
              <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-warm text-primary-foreground">
                <r.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-xl font-semibold">{r.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{r.desc}</p>
              <Link
                to="/signup"
                className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {r.cta} →
              </Link>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-sm text-muted-foreground">
        Built for hyperlocal communities. © {new Date().getFullYear()} Society HomeChef.
      </footer>
    </div>
  );
}
