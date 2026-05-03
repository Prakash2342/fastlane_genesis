import { supabase } from "@/integrations/supabase/client";
import { distanceKm } from "./distance";

export interface Profile {
  id: string;
  full_name: string;
  latitude: number;
  longitude: number;
  society: string;
}

/** Find nearest available rider in same society within 2km of resident.
 *  Returns null if none. */
export async function findNearestRider(
  residentSociety: string,
  residentLoc: { latitude: number; longitude: number },
): Promise<{ rider: Profile; km: number } | null> {
  // Get all online riders in this society
  const { data: statuses } = await supabase
    .from("rider_status")
    .select("rider_id, available")
    .eq("available", true);

  if (!statuses || statuses.length === 0) return null;

  const riderIds = statuses.map((s) => s.rider_id);
  const { data: riders } = await supabase
    .from("profiles")
    .select("id, full_name, latitude, longitude, society")
    .in("id", riderIds)
    .eq("society", residentSociety)
    .eq("role", "rider");

  if (!riders || riders.length === 0) return null;

  let best: { rider: Profile; km: number } | null = null;
  for (const r of riders) {
    const km = distanceKm(residentLoc, { latitude: r.latitude, longitude: r.longitude });
    if (km <= 2 && (!best || km < best.km)) {
      best = { rider: r as Profile, km };
    }
  }
  return best;
}
