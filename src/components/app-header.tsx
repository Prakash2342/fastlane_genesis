import { Link } from "@tanstack/react-router";
import { ChefHat, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function AppHeader() {
  const { user, profile, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-display text-xl font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-warm text-primary-foreground shadow-warm">
            <ChefHat className="h-5 w-5" />
          </span>
          <span>
            Society<span className="text-primary">HomeChef</span>
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {user && profile ? (
            <>
              <Link
                to={
                  profile.role === "chef"
                    ? "/chef"
                    : profile.role === "rider"
                      ? "/rider"
                      : "/feed"
                }
                className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
              >
                {profile.full_name} · <span className="capitalize">{profile.role}</span>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => signOut()}>
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" asChild>
                <Link to="/login">Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
