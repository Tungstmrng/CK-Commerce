-- =====================================================================
-- Tool Shop update v2: manual shipping rates, order tracking, sales analytics
-- Run AFTER schema.sql, in: Supabase Dashboard -> SQL Editor -> New query.
-- Safe to run more than once.
-- =====================================================================

-- ---------- orders: manual address fields (area_id is only used by Biteship mode) ----------
alter table public.orders alter column area_id drop not null;
alter table public.orders add column if not exists province text;
alter table public.orders add column if not exists city text;
alter table public.orders add column if not exists district text;

-- ---------- helpers ----------
create or replace function public.norm_region(t text)
returns text language sql immutable as $$
  select lower(trim(regexp_replace(coalesce(t, ''),
    '^\s*(kota\s+administrasi|kabupaten|kota|kab\.?)\s+', '', 'i')))
$$;

create or replace function public.norm_phone(t text)
returns text language sql immutable as $$
  select case
    when d = '' then ''
    when d like '62%' then d
    when d like '0%' then '62' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as d) s
$$;

-- ---------- manual shipping rate table ----------
create table if not exists public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  company text not null,                 -- gojek, grab, jne, lion, jnt ...
  courier_name text not null,            -- display name
  service_name text not null,            -- e.g. REG, Instant
  service_code text not null,
  grp text not null check (grp in ('instant', 'regular')),
  coverage text not null check (coverage in ('city', 'province', 'nationwide')),
  first_kg_price integer not null check (first_kg_price >= 0),
  next_kg_price integer not null default 0 check (next_kg_price >= 0),
  duration text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (company, service_code, coverage)
);
alter table public.shipping_rates enable row level security;
drop policy if exists "shipping_rates admin all" on public.shipping_rates;
create policy "shipping_rates admin all" on public.shipping_rates for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- order status history (for tracking) ----------
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_idx on public.order_events(order_id, created_at);
alter table public.order_events enable row level security;
drop policy if exists "order_events admin all" on public.order_events;
create policy "order_events admin all" on public.order_events for all
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.log_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events (order_id, status, note) values (new.id, new.status, 'Order placed');
  elsif new.status is distinct from old.status then
    insert into public.order_events (order_id, status, note)
    values (new.id, new.status,
      case when new.status = 'shipped' and new.tracking_number is not null
           then 'Tracking number: ' || new.tracking_number end);
  elsif new.tracking_number is distinct from old.tracking_number and new.tracking_number is not null then
    insert into public.order_events (order_id, status, note)
    values (new.id, new.status, 'Tracking number: ' || new.tracking_number);
  end if;
  return null;
end $$;

drop trigger if exists orders_log_event on public.orders;
create trigger orders_log_event after insert or update on public.orders
  for each row execute function public.log_order_event();

-- history for orders that already exist
insert into public.order_events (order_id, status, note, created_at)
select o.id, o.status, 'Order placed', o.created_at
from public.orders o
where not exists (select 1 from public.order_events e where e.order_id = o.id);

-- ---------- order placement: now also stores province / city / district ----------
create or replace function public.place_order(p_order jsonb, p_items jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_no text;
  it jsonb;
begin
  v_no := 'TS-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  insert into public.orders (
    order_no, customer_name, phone, email, address, area_id, area_name, postal_code,
    province, city, district, dest_lat, dest_lng,
    courier_company, courier_service, courier_service_code,
    shipping_cost, subtotal, total, notes
  ) values (
    v_no, p_order->>'customer_name', p_order->>'phone', nullif(p_order->>'email', ''),
    p_order->>'address', nullif(p_order->>'area_id', ''), nullif(p_order->>'area_name', ''),
    nullif(p_order->>'postal_code', ''),
    nullif(p_order->>'province', ''), nullif(p_order->>'city', ''), nullif(p_order->>'district', ''),
    nullif(p_order->>'dest_lat', '')::double precision, nullif(p_order->>'dest_lng', '')::double precision,
    p_order->>'courier_company', p_order->>'courier_service', p_order->>'courier_service_code',
    (p_order->>'shipping_cost')::int, (p_order->>'subtotal')::int, (p_order->>'total')::int,
    nullif(p_order->>'notes', '')
  ) returning id into v_id;

  for it in select * from jsonb_array_elements(p_items) loop
    update public.products
       set stock = stock - (it->>'qty')::int
     where id = (it->>'product_id')::uuid and stock >= (it->>'qty')::int;
    if not found then
      raise exception 'INSUFFICIENT_STOCK: %', it->>'name';
    end if;
    insert into public.order_items (order_id, product_id, name, price, qty, weight_grams)
    values (v_id, (it->>'product_id')::uuid, it->>'name', (it->>'price')::int,
            (it->>'qty')::int, (it->>'weight_grams')::int);
  end loop;

  return v_no;
end $$;

revoke all on function public.place_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb, jsonb) to service_role;

-- ---------- cart lines: real prices / weights / stock from the database ----------
create or replace function public.cart_lines(p_items jsonb)
returns table(product_id uuid, name text, price int, weight_grams int, qty int)
language plpgsql stable security definer set search_path = public as $$
declare
  r record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;
  if jsonb_array_length(p_items) > 50 then
    raise exception 'Too many items';
  end if;

  for r in
    select x.pid, x.q, p.id as p_id, p.name as p_name, p.price as p_price,
           p.weight_grams as p_weight, p.stock as p_stock
    from (
      select (e->>'product_id')::uuid as pid,
             sum(least(999, greatest(0, coalesce((e->>'qty')::int, 0))))::int as q
      from jsonb_array_elements(p_items) e
      group by 1
    ) x
    left join public.products p on p.id = x.pid and p.is_active
  loop
    if r.q <= 0 then raise exception 'Invalid cart item'; end if;
    if r.p_id is null then raise exception 'A product in your cart is no longer available'; end if;
    if r.p_stock < r.q then
      raise exception 'Not enough stock for % (only % left)', r.p_name, r.p_stock;
    end if;
    product_id := r.p_id; name := r.p_name; price := r.p_price;
    weight_grams := r.p_weight; qty := r.q;
    return next;
  end loop;
end $$;

-- ---------- shipping price calculation ----------
-- zone: customer in the same city as the shop -> 'city'; same province -> 'province'; else 'nationwide'.
-- For every courier service the most specific matching coverage row wins.
create or replace function public.compute_shipping_rates(p_weight_grams int, p_province text, p_city text)
returns table(company text, courier_name text, service_name text, service_code text,
              grp text, duration text, price int)
language plpgsql stable security definer set search_path = public as $$
declare
  v_o_city text;
  v_o_prov text;
  v_zone text;
  v_kg int;
begin
  select s.value into v_o_city from public.site_settings s where s.key = 'origin_city';
  select s.value into v_o_prov from public.site_settings s where s.key = 'origin_province';

  v_zone := case
    when public.norm_region(p_city) <> '' and public.norm_region(p_city) = public.norm_region(v_o_city) then 'city'
    when public.norm_region(p_province) <> '' and public.norm_region(p_province) = public.norm_region(v_o_prov) then 'province'
    else 'nationwide'
  end;

  v_kg := greatest(1, ceil(p_weight_grams / 1000.0))::int;

  return query
  select distinct on (r.company, r.service_code)
         r.company, r.courier_name, r.service_name, r.service_code, r.grp, r.duration,
         (r.first_kg_price + r.next_kg_price * (v_kg - 1))::int
  from public.shipping_rates r
  where r.is_active
    and (
      (v_zone = 'city' and r.coverage in ('city', 'province', 'nationwide')) or
      (v_zone = 'province' and r.coverage in ('province', 'nationwide')) or
      (v_zone = 'nationwide' and r.coverage = 'nationwide')
    )
  order by r.company, r.service_code,
           case r.coverage when 'city' then 1 when 'province' then 2 else 3 end;
end $$;

-- ---------- public RPC: shipping quote ----------
create or replace function public.get_shipping_quote(p_items jsonb, p_province text, p_city text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_w int;
  v_rates jsonb;
begin
  if coalesce(trim(p_province), '') = '' or coalesce(trim(p_city), '') = '' then
    raise exception 'Please enter your province and city';
  end if;
  select coalesce(sum(l.weight_grams * l.qty), 0) into v_w from public.cart_lines(p_items) l;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.price), '[]'::jsonb) into v_rates
  from (
    select c.company, c.courier_name as name, c.service_name as service, c.service_code,
           c.grp as "group", c.duration, c.price
    from public.compute_shipping_rates(v_w, p_province, p_city) c
  ) t;

  return jsonb_build_object('rates', v_rates, 'weight_grams', v_w);
end $$;

-- ---------- public RPC: place an order (manual shipping mode) ----------
create or replace function public.place_order_manual(
  p_customer jsonb, p_address jsonb, p_courier jsonb, p_items jsonb, p_notes text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_name  text := left(trim(coalesce(p_customer->>'name', '')), 100);
  v_phone text := left(trim(coalesce(p_customer->>'phone', '')), 30);
  v_email text := left(trim(coalesce(p_customer->>'email', '')), 120);
  v_line  text := left(trim(coalesce(p_address->>'line', '')), 400);
  v_prov  text := left(trim(coalesce(p_address->>'province', '')), 80);
  v_city  text := left(trim(coalesce(p_address->>'city', '')), 80);
  v_dist  text := left(trim(coalesce(p_address->>'district', '')), 80);
  v_post  text := left(trim(coalesce(p_address->>'postal_code', '')), 10);
  v_items jsonb;
  v_w int;
  v_sub int;
  v_rate record;
  v_ship int;
  v_no text;
begin
  if v_name = '' or v_phone = '' or v_line = '' or v_prov = '' or v_city = '' then
    raise exception 'Please fill in your name, phone, province, city and street address';
  end if;
  if v_phone !~ '^[0-9+() -]{8,20}$' then
    raise exception 'Phone number looks invalid';
  end if;
  if coalesce(p_courier->>'company', '') = '' or coalesce(p_courier->>'service_code', '') = '' then
    raise exception 'Please choose a courier';
  end if;

  select jsonb_agg(to_jsonb(l)),
         coalesce(sum(l.weight_grams * l.qty), 0),
         coalesce(sum(l.price * l.qty), 0)
    into v_items, v_w, v_sub
  from public.cart_lines(p_items) l;

  select * into v_rate
  from public.compute_shipping_rates(v_w, v_prov, v_city) r
  where r.company = lower(p_courier->>'company') and r.service_code = p_courier->>'service_code';
  if not found then
    raise exception 'That courier option is not available for your address. Please check shipping again.';
  end if;
  v_ship := v_rate.price;

  v_no := public.place_order(
    jsonb_build_object(
      'customer_name', v_name, 'phone', v_phone, 'email', v_email,
      'address', v_line, 'province', v_prov, 'city', v_city, 'district', v_dist, 'postal_code', v_post,
      'courier_company', v_rate.company,
      'courier_service', trim(v_rate.courier_name || ' ' || v_rate.service_name),
      'courier_service_code', v_rate.service_code,
      'shipping_cost', v_ship, 'subtotal', v_sub, 'total', v_sub + v_ship,
      'notes', left(coalesce(p_notes, ''), 300)
    ),
    v_items
  );

  return jsonb_build_object('order_no', v_no, 'subtotal', v_sub, 'shipping_cost', v_ship, 'total', v_sub + v_ship);
exception
  when others then
    if sqlerrm like 'INSUFFICIENT_STOCK%' then
      raise exception 'Sorry, an item just went out of stock. Please review your cart.';
    end if;
    raise;
end $$;

-- ---------- public RPC: order tracking (order number + phone number) ----------
create or replace function public.track_order(p_order_no text, p_phone text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  o record;
begin
  select * into o
  from public.orders ord
  where ord.order_no = upper(trim(p_order_no))
    and public.norm_phone(ord.phone) = public.norm_phone(p_phone)
    and public.norm_phone(p_phone) <> '';
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'order_no', o.order_no,
    'status', o.status,
    'created_at', o.created_at,
    'courier', o.courier_service,
    'tracking_number', o.tracking_number,
    'subtotal', o.subtotal,
    'shipping_cost', o.shipping_cost,
    'total', o.total,
    'destination', concat_ws(', ', nullif(o.district, ''), nullif(o.city, ''), nullif(o.province, ''), nullif(o.area_name, '')),
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty, 'price', i.price)), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('status', e.status, 'note', e.note, 'at', e.created_at)
                                         order by e.created_at), '[]'::jsonb)
               from public.order_events e where e.order_id = o.id)
  );
end $$;

-- ---------- admin analytics ----------
-- Revenue = product subtotal (shipping is not shop income). Only paid / packed / shipped / completed orders count.
create or replace function public.admin_sales_daily(p_days int default 365)
returns table(sale_date date, order_count bigint, revenue bigint, units bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select (o.created_at at time zone 'Asia/Jakarta')::date,
         count(*),
         coalesce(sum(o.subtotal), 0)::bigint,
         coalesce(sum(u.units), 0)::bigint
  from public.orders o
  left join lateral (select sum(i.qty) as units from public.order_items i where i.order_id = o.id) u on true
  where o.status in ('paid', 'packed', 'shipped', 'completed')
    and o.created_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1;
end $$;

create or replace function public.admin_product_velocity()
returns table(product_id uuid, product_name text, stock int,
              units_14 bigint, units_28 bigint, units_90 bigint, revenue_90 bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  return query
  select p.id, p.name, p.stock,
         coalesce(sum(i.qty) filter (where o.created_at >= now() - interval '14 days'), 0)::bigint,
         coalesce(sum(i.qty) filter (where o.created_at >= now() - interval '28 days'), 0)::bigint,
         coalesce(sum(i.qty) filter (where o.created_at >= now() - interval '90 days'), 0)::bigint,
         coalesce(sum(i.qty::bigint * i.price) filter (where o.created_at >= now() - interval '90 days'), 0)::bigint
  from public.products p
  left join public.order_items i on i.product_id = p.id
  left join public.orders o on o.id = i.order_id and o.status in ('paid', 'packed', 'shipped', 'completed')
  where p.is_active
  group by p.id, p.name, p.stock
  order by p.name;
end $$;

-- ---------- function permissions ----------
revoke all on function public.cart_lines(jsonb) from public, anon, authenticated;
revoke all on function public.compute_shipping_rates(int, text, text) from public, anon, authenticated;
revoke all on function public.admin_sales_daily(int) from public, anon;
revoke all on function public.admin_product_velocity() from public, anon;

grant execute on function public.get_shipping_quote(jsonb, text, text) to anon, authenticated;
grant execute on function public.place_order_manual(jsonb, jsonb, jsonb, jsonb, text) to anon, authenticated;
grant execute on function public.track_order(text, text) to anon, authenticated;
grant execute on function public.admin_sales_daily(int) to authenticated;
grant execute on function public.admin_product_velocity() to authenticated;

-- ---------- settings + SAMPLE shipping rates (edit them in Admin -> Shipping) ----------
insert into public.site_settings (key, value) values
  ('shipping_mode', 'manual'),      -- 'manual' = your own rate table, 'biteship' = live rates
  ('origin_city', ''),              -- e.g. Malang
  ('origin_province', '')           -- e.g. Jawa Timur
on conflict (key) do nothing;

insert into public.shipping_rates
  (company, courier_name, service_name, service_code, grp, coverage, first_kg_price, next_kg_price, duration, sort_order)
values
  ('gojek', 'Gojek', 'Instant', 'instant', 'instant', 'city', 15000, 5000, '1-3 hours', 1),
  ('grab',  'Grab',  'Instant', 'instant', 'instant', 'city', 16000, 5000, '1-3 hours', 2),
  ('jne',   'JNE',   'REG', 'reg', 'regular', 'city',        9000,  3000, '1-2 days', 10),
  ('jne',   'JNE',   'REG', 'reg', 'regular', 'province',   12000,  5000, '2-3 days', 10),
  ('jne',   'JNE',   'REG', 'reg', 'regular', 'nationwide', 22000,  9000, '3-7 days', 10),
  ('lion',  'Lion Parcel', 'REGPACK', 'regpack', 'regular', 'city',        9000,  3000, '1-2 days', 11),
  ('lion',  'Lion Parcel', 'REGPACK', 'regpack', 'regular', 'province',   11000,  4500, '2-3 days', 11),
  ('lion',  'Lion Parcel', 'REGPACK', 'regpack', 'regular', 'nationwide', 21000,  8500, '3-7 days', 11),
  ('jnt',   'J&T', 'EZ', 'ez', 'regular', 'city',        9500,  3000, '1-2 days', 12),
  ('jnt',   'J&T', 'EZ', 'ez', 'regular', 'province',   12000,  4500, '2-3 days', 12),
  ('jnt',   'J&T', 'EZ', 'ez', 'regular', 'nationwide', 22000,  8500, '3-7 days', 12)
on conflict (company, service_code, coverage) do nothing;

-- After running this file, set your shop's city and province in Admin -> Settings,
-- and replace the SAMPLE prices above with your real courier prices in Admin -> Shipping.
