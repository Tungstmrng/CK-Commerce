-- =====================================================================
-- Tool Shop schema for Supabase (Postgres)
-- Run this whole file once in: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================

-- ---------- profiles & roles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- catalogue ----------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  brand text,
  category text,
  description text not null default '',
  price integer not null check (price >= 0),          -- IDR, whole rupiah
  stock integer not null default 0 check (stock >= 0),
  weight_grams integer not null default 1000 check (weight_grams > 0),
  images text[] not null default '{}',
  is_active boolean not null default true,
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text,
  image_url text,
  link_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value text not null default ''
);

-- ---------- orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  customer_name text not null,
  phone text not null,
  email text,
  address text not null,
  area_id text not null,
  area_name text,
  postal_code text,
  dest_lat double precision,
  dest_lng double precision,
  courier_company text not null,
  courier_service text not null,
  courier_service_code text not null,
  shipping_cost integer not null,
  subtotal integer not null,
  total integer not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','packed','shipped','completed','cancelled')),
  tracking_number text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  price integer not null,
  qty integer not null check (qty > 0),
  weight_grams integer not null
);

-- ---------- atomic order placement (called only by the create-order Edge Function) ----------
create or replace function public.place_order(p_order jsonb, p_items jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_no text;
  it jsonb;
begin
  v_no := 'TS-' || to_char(now() at time zone 'Asia/Jakarta', 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5));

  insert into public.orders (
    order_no, customer_name, phone, email, address, area_id, area_name, postal_code,
    dest_lat, dest_lng, courier_company, courier_service, courier_service_code,
    shipping_cost, subtotal, total, notes
  ) values (
    v_no, p_order->>'customer_name', p_order->>'phone', nullif(p_order->>'email',''),
    p_order->>'address', p_order->>'area_id', p_order->>'area_name', p_order->>'postal_code',
    nullif(p_order->>'dest_lat','')::double precision, nullif(p_order->>'dest_lng','')::double precision,
    p_order->>'courier_company', p_order->>'courier_service', p_order->>'courier_service_code',
    (p_order->>'shipping_cost')::int, (p_order->>'subtotal')::int, (p_order->>'total')::int,
    nullif(p_order->>'notes','')
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

-- ---------- Row Level Security ----------
alter table public.profiles      enable row level security;
alter table public.products      enable row level security;
alter table public.banners       enable row level security;
alter table public.site_settings enable row level security;
alter table public.orders        enable row level security;
alter table public.order_items   enable row level security;

-- profiles: users can read their own row; nobody can change roles from the client
drop policy if exists "profiles read own" on public.profiles;
create policy "profiles read own" on public.profiles for select
  using (id = auth.uid() or public.is_admin());

-- products
drop policy if exists "products public read" on public.products;
create policy "products public read" on public.products for select
  using (is_active or public.is_admin());
drop policy if exists "products admin write" on public.products;
create policy "products admin write" on public.products for all
  using (public.is_admin()) with check (public.is_admin());

-- banners
drop policy if exists "banners public read" on public.banners;
create policy "banners public read" on public.banners for select
  using (is_active or public.is_admin());
drop policy if exists "banners admin write" on public.banners;
create policy "banners admin write" on public.banners for all
  using (public.is_admin()) with check (public.is_admin());

-- settings
drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings for select using (true);
drop policy if exists "settings admin write" on public.site_settings;
create policy "settings admin write" on public.site_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- orders: only admins can see/edit; customers create them through the Edge Function (service role)
drop policy if exists "orders admin all" on public.orders;
create policy "orders admin all" on public.orders for all
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "order_items admin all" on public.order_items;
create policy "order_items admin all" on public.order_items for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------- image storage ----------
insert into storage.buckets (id, name, public)
values ('shop-images', 'shop-images', true)
on conflict (id) do nothing;

drop policy if exists "shop images public read" on storage.objects;
create policy "shop images public read" on storage.objects for select
  using (bucket_id = 'shop-images');
drop policy if exists "shop images admin insert" on storage.objects;
create policy "shop images admin insert" on storage.objects for insert
  with check (bucket_id = 'shop-images' and public.is_admin());
drop policy if exists "shop images admin update" on storage.objects;
create policy "shop images admin update" on storage.objects for update
  using (bucket_id = 'shop-images' and public.is_admin());
drop policy if exists "shop images admin delete" on storage.objects;
create policy "shop images admin delete" on storage.objects for delete
  using (bucket_id = 'shop-images' and public.is_admin());

-- ---------- starter data (safe to delete) ----------
insert into public.site_settings (key, value) values
  ('store_name', 'Tool Shop'),
  ('announcement', 'Welcome! Shipping is calculated at checkout.'),
  ('home_headline', 'Power tools for every job'),
  ('home_subheadline', 'Drills, grinders, saws and more — shipped across Indonesia.'),
  ('whatsapp', ''),
  ('origin_area_id', ''),
  ('origin_lat', ''),
  ('origin_lng', '')
on conflict (key) do nothing;

insert into public.banners (title, subtitle, link_url, sort_order) values
  ('Grand opening promo', 'Special prices on selected drills and grinders', '/products', 0);

insert into public.products (slug, name, brand, category, description, price, stock, weight_grams, is_featured) values
  ('sample-cordless-drill', 'Cordless Drill 18V (sample)', 'SampleBrand', 'Drill', 'Sample product — edit or delete it in the admin.', 850000, 10, 2200, true),
  ('sample-angle-grinder', 'Angle Grinder 4" 850W (sample)', 'SampleBrand', 'Grinder', 'Sample product — edit or delete it in the admin.', 420000, 15, 1800, true),
  ('sample-circular-saw', 'Circular Saw 7-1/4" (sample)', 'SampleBrand', 'Saw', 'Sample product — edit or delete it in the admin.', 1250000, 5, 4200, false)
on conflict (slug) do nothing;

-- ---------- make yourself admin ----------
-- 1) Create your user: Dashboard -> Authentication -> Users -> Add user (email + password, tick "Auto confirm")
-- 2) Then run (with your email):
--    update public.profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'YOUR-EMAIL@example.com');
