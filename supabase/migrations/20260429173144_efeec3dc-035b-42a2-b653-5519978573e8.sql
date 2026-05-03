-- Roles enum
CREATE TYPE public.app_role AS ENUM ('chef', 'resident', 'rider');
CREATE TYPE public.dish_status AS ENUM ('available', 'sold_out');
CREATE TYPE public.order_status AS ENUM ('placed', 'accepted', 'picked_up', 'delivered', 'cancelled');
CREATE TYPE public.meal_slot AS ENUM ('breakfast', 'lunch', 'dinner', 'snacks');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role public.app_role NOT NULL,
  society TEXT NOT NULL,
  flat_number TEXT,
  latitude DOUBLE PRECISION NOT NULL DEFAULT 12.9716,
  longitude DOUBLE PRECISION NOT NULL DEFAULT 77.5946,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's society
CREATE OR REPLACE FUNCTION public.current_user_society()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT society FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Profiles RLS
CREATE POLICY "Users in same society can view profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (society = public.current_user_society() OR id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

-- Auto-create profile from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role, society, flat_number, latitude, longitude)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'),
    COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'resident'),
    COALESCE(NEW.raw_user_meta_data->>'society', 'Green Valley Heights'),
    NEW.raw_user_meta_data->>'flat_number',
    COALESCE((NEW.raw_user_meta_data->>'latitude')::DOUBLE PRECISION, 12.9716 + (random() - 0.5) * 0.01),
    COALESCE((NEW.raw_user_meta_data->>'longitude')::DOUBLE PRECISION, 77.5946 + (random() - 0.5) * 0.01)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Dishes
CREATE TABLE public.dishes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chef_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  society TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity >= 0),
  image_url TEXT,
  calories INTEGER,
  health_score NUMERIC(3,1),
  tags TEXT[] DEFAULT '{}',
  ai_explanation TEXT,
  meal_slot public.meal_slot DEFAULT 'lunch',
  status public.dish_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same-society users can view dishes"
  ON public.dishes FOR SELECT TO authenticated
  USING (society = public.current_user_society());

CREATE POLICY "Chefs can insert own dishes"
  ON public.dishes FOR INSERT TO authenticated
  WITH CHECK (chef_id = auth.uid() AND public.current_user_role() = 'chef');

CREATE POLICY "Chefs can update own dishes"
  ON public.dishes FOR UPDATE TO authenticated
  USING (chef_id = auth.uid());

CREATE POLICY "Chefs can delete own dishes"
  ON public.dishes FOR DELETE TO authenticated
  USING (chef_id = auth.uid());

-- Rider availability
CREATE TABLE public.rider_status (
  rider_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  available BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.rider_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Same-society users can view rider status"
  ON public.rider_status FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = rider_status.rider_id
      AND p.society = public.current_user_society()
    )
  );

CREATE POLICY "Riders manage own status"
  ON public.rider_status FOR ALL TO authenticated
  USING (rider_id = auth.uid())
  WITH CHECK (rider_id = auth.uid());

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id UUID NOT NULL REFERENCES public.dishes(id) ON DELETE RESTRICT,
  resident_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  chef_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  society TEXT NOT NULL,
  status public.order_status NOT NULL DEFAULT 'placed',
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Order participants can view"
  ON public.orders FOR SELECT TO authenticated
  USING (
    resident_id = auth.uid()
    OR chef_id = auth.uid()
    OR rider_id = auth.uid()
  );

CREATE POLICY "Residents can place orders"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (resident_id = auth.uid() AND public.current_user_role() = 'resident');

CREATE POLICY "Order participants can update"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    resident_id = auth.uid()
    OR chef_id = auth.uid()
    OR rider_id = auth.uid()
  );

CREATE INDEX idx_dishes_society ON public.dishes(society, status);
CREATE INDEX idx_orders_rider ON public.orders(rider_id, status);
CREATE INDEX idx_orders_resident ON public.orders(resident_id);
CREATE INDEX idx_orders_chef ON public.orders(chef_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dishes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_status;

-- Storage bucket for dish images
INSERT INTO storage.buckets (id, name, public) VALUES ('dish-images', 'dish-images', true);

CREATE POLICY "Public read dish images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'dish-images');

CREATE POLICY "Authenticated upload dish images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dish-images');

CREATE POLICY "Users delete own dish images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dish-images' AND owner = auth.uid());