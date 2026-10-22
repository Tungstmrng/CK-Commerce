-- =====================================================================
-- OPTIONAL: fake sales history so you can try Admin -> Sales (forecast).
-- Needs at least one visible product. Creates ~6 months of "completed" demo orders
-- whose order numbers start with DEMO-.
--
-- Remove them again at any time with:
--   delete from public.orders where order_no like 'DEMO-%';
-- =====================================================================
do $$
declare
  d date;
  n int;
  i int;
  v_id uuid;
  p record;
  v_qty int;
  v_sub int;
  v_seq int := 0;
  base numeric;
begin
  if (select count(*) from public.products where is_active) = 0 then
    raise exception 'Add at least one visible product first';
  end if;
  if exists (select 1 from public.orders where order_no like 'DEMO-%') then
    raise exception 'Demo data already exists. Delete it first (see top of this file).';
  end if;

  for d in select g::date from generate_series(current_date - 180, current_date - 1, interval '1 day') g loop
    base := 1 + (d - (current_date - 180)) / 90.0;            -- demand grows over time
    if extract(isodow from d) in (6, 7) then base := base * 0.6; end if;  -- quieter weekends
    n := floor(base * (0.3 + random() * 1.4))::int;

    for i in 1..n loop
      v_seq := v_seq + 1;
      insert into public.orders (
        order_no, customer_name, phone, address, province, city,
        courier_company, courier_service, courier_service_code,
        shipping_cost, subtotal, total, status, created_at
      ) values (
        'DEMO-' || lpad(v_seq::text, 5, '0'), 'Demo Customer', '081234567890', 'Demo address',
        'Demo Province', 'Demo City', 'jne', 'JNE REG', 'reg',
        15000, 0, 15000, 'completed',
        (d::timestamp + interval '8 hours' + random() * interval '13 hours') at time zone 'Asia/Jakarta'
      ) returning id into v_id;

      v_sub := 0;
      for p in
        select id, name, price, weight_grams from public.products
        where is_active order by random() limit (1 + floor(random() * 2))::int
      loop
        v_qty := 1 + floor(random() * 2)::int;
        insert into public.order_items (order_id, product_id, name, price, qty, weight_grams)
        values (v_id, p.id, p.name, p.price, v_qty, p.weight_grams);
        v_sub := v_sub + p.price * v_qty;
      end loop;

      update public.orders set subtotal = v_sub, total = v_sub + shipping_cost where id = v_id;
    end loop;
  end loop;
end $$;
