import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/lib/auth";
import { AppHeader } from "./app-header";
import { Loader2 } from "lucide-react";

export function RequireRole({ role, children }: { role: AppRole; children: ReactNode }) {
  const { user, profile, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (profile && profile.role !== role) {
      const dest = profile.role === "chef" ? "/chef" : profile.role === "rider" ? "/rider" : "/feed";
      navigate({ to: dest });
    }
  }, [user, profile, loading, role, navigate]);

  if (loading || !user || !profile) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (profile.role !== role) return null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
