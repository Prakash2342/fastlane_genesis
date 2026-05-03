-- Atomic dish quantity decrement to prevent overselling under concurrent orders
CREATE OR REPLACE FUNCTION public.decrement_dish_quantity(dish_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_qty INTEGER;
BEGIN
  UPDATE dishes
    SET quantity = quantity - 1,
        status = CASE WHEN quantity - 1 <= 0 THEN 'sold_out'::dish_status ELSE status END
    WHERE id = dish_id AND quantity > 0
    RETURNING quantity INTO new_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dish is sold out';
  END IF;

  RETURN new_qty;
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.decrement_dish_quantity(UUID) TO authenticated;
