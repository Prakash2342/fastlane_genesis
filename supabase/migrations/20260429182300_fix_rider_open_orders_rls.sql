-- Fix: Allow riders to see unassigned (open) orders in their society
-- Without this, the RLS policy blocks riders from viewing orders where rider_id IS NULL
CREATE POLICY "Riders can view open orders in their society"
  ON public.orders FOR SELECT TO authenticated
  USING (
    rider_id IS NULL
    AND status = 'placed'
    AND society = public.current_user_society()
    AND public.current_user_role() = 'rider'
  );
