create schema if not exists private;

create table public.businesses (
  id bigint generated always as identity primary key,
  name text not null check (char_length(trim(name)) between 1 and 80),
  join_code text not null default upper(encode(gen_random_bytes(4), 'hex')) unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_members (
  business_id bigint not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create table public.business_join_requests (
  id bigint generated always as identity primary key,
  business_id bigint references public.businesses(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  join_code text not null,
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create table public.products (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, name)
);

create table public.product_variants (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  product_id bigint not null references public.products(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  default_price numeric(12,2) not null check (default_price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);

create table public.selling_days (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  sale_date date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  started_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (business_id, sale_date)
);

create table public.daily_stock (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  selling_day_id bigint not null references public.selling_days(id) on delete cascade,
  variant_id bigint not null references public.product_variants(id),
  brought_quantity integer not null check (brought_quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (selling_day_id, variant_id)
);

create table public.customers (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  normalized_name text generated always as (lower(regexp_replace(trim(name), '\s+', ' ', 'g'))) stored,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, normalized_name)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete cascade,
  selling_day_id bigint not null references public.selling_days(id),
  customer_id bigint references public.customers(id),
  customer_name text not null,
  payment_status text not null check (payment_status in ('paid', 'unpaid')),
  total numeric(12,2) not null check (total >= 0),
  sold_at timestamptz not null default now(),
  paid_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.sale_items (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  sale_id uuid not null references public.sales(id) on delete restrict,
  variant_id bigint not null references public.product_variants(id),
  product_name text not null,
  variant_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) generated always as (quantity * unit_price) stored,
  created_at timestamptz not null default now(),
  unique (sale_id, variant_id)
);

create table public.stock_adjustments (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  selling_day_id bigint not null references public.selling_days(id) on delete cascade,
  variant_id bigint not null references public.product_variants(id),
  kind text not null check (kind in ('damaged', 'giveaway', 'returned_home', 'customer_return', 'correction')),
  quantity_delta integer not null check (quantity_delta <> 0),
  note text check (note is null or char_length(note) <= 240),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check (
    (kind in ('damaged', 'giveaway', 'returned_home') and quantity_delta < 0)
    or (kind = 'customer_return' and quantity_delta > 0)
    or kind = 'correction'
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  business_id bigint not null references public.businesses(id) on delete cascade,
  customer_id bigint not null references public.customers(id),
  total numeric(12,2) not null check (total > 0),
  paid_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.payment_sales (
  payment_id uuid not null references public.payments(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  business_id bigint not null references public.businesses(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  primary key (payment_id, sale_id),
  unique (sale_id)
);

create table public.sale_commands (
  id uuid primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  selling_day_id bigint not null references public.selling_days(id),
  customer_id bigint references public.customers(id),
  customer_name text,
  is_walk_in boolean not null default false,
  payment_status text not null check (payment_status in ('paid', 'unpaid')),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  result_sale_id uuid references public.sales(id),
  created_at timestamptz not null default now()
);

create table public.payment_commands (
  id uuid primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  customer_id bigint not null references public.customers(id),
  sale_ids uuid[] not null check (cardinality(sale_ids) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  result_payment_id uuid references public.payments(id),
  created_at timestamptz not null default now()
);

create index business_members_user_id_idx on public.business_members (user_id);
create index business_join_requests_user_id_idx on public.business_join_requests (user_id);
create index products_business_id_idx on public.products (business_id);
create index product_variants_business_id_idx on public.product_variants (business_id);
create index product_variants_product_id_idx on public.product_variants (product_id);
create index selling_days_business_date_idx on public.selling_days (business_id, sale_date desc);
create index daily_stock_business_id_idx on public.daily_stock (business_id);
create index daily_stock_day_idx on public.daily_stock (selling_day_id);
create index daily_stock_variant_idx on public.daily_stock (variant_id);
create index customers_business_last_used_idx on public.customers (business_id, last_used_at desc);
create index customers_name_search_idx on public.customers (business_id, normalized_name text_pattern_ops);
create index sales_business_sold_at_idx on public.sales (business_id, sold_at desc);
create index sales_day_idx on public.sales (selling_day_id);
create index sales_customer_unpaid_idx on public.sales (customer_id, sold_at) where payment_status = 'unpaid';
create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_variant_id_idx on public.sale_items (variant_id);
create index stock_adjustments_day_variant_idx on public.stock_adjustments (selling_day_id, variant_id);
create index payments_customer_idx on public.payments (customer_id, paid_at desc);
create index payment_sales_sale_id_idx on public.payment_sales (sale_id);

create or replace function private.is_business_member(target_business_id bigint, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = target_business_id
      and user_id = target_user_id
  );
$$;

create or replace function private.is_business_owner(target_business_id bigint, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = target_business_id
      and user_id = target_user_id
      and role = 'owner'
  );
$$;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger businesses_set_updated_at before update on public.businesses
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger variants_set_updated_at before update on public.product_variants
for each row execute function private.set_updated_at();
create trigger daily_stock_set_updated_at before update on public.daily_stock
for each row execute function private.set_updated_at();

create or replace function private.add_business_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.created_by is distinct from auth.uid() then
    raise exception 'A business can only be created for the signed-in user';
  end if;

  insert into public.business_members (business_id, user_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger businesses_add_owner after insert on public.businesses
for each row execute function private.add_business_owner();

create or replace function private.process_business_join_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  matched_business_id bigint;
begin
  if new.user_id is distinct from auth.uid() then
    raise exception 'A join request can only be created for the signed-in user';
  end if;

  select id into matched_business_id
  from public.businesses
  where join_code = upper(trim(new.join_code));

  if matched_business_id is null then
    raise exception 'That join code was not found';
  end if;

  new.business_id = matched_business_id;
  new.join_code = upper(trim(new.join_code));

  insert into public.business_members (business_id, user_id, role)
  values (matched_business_id, new.user_id, 'member')
  on conflict (business_id, user_id) do nothing;

  return new;
end;
$$;

create trigger business_join_requests_process before insert on public.business_join_requests
for each row execute function private.process_business_join_request();

create or replace function private.process_sale_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_customer_id bigint;
  resolved_customer_name text;
  new_sale_id uuid := gen_random_uuid();
  calculated_total numeric(12,2);
  requested record;
  available_quantity integer;
begin
  if new.created_by is distinct from auth.uid()
    or not private.is_business_member(new.business_id, auth.uid()) then
    raise exception 'You do not have access to this business';
  end if;

  if not exists (
    select 1 from public.selling_days
    where id = new.selling_day_id
      and business_id = new.business_id
      and status = 'open'
  ) then
    raise exception 'The selling day is not open';
  end if;

  if new.is_walk_in then
    if new.payment_status <> 'paid' then
      raise exception 'Walk-in sales must be paid';
    end if;
    resolved_customer_id := null;
    resolved_customer_name := 'Walk-in';
  elsif new.customer_id is not null then
    select id, name into resolved_customer_id, resolved_customer_name
    from public.customers
    where id = new.customer_id and business_id = new.business_id;

    if resolved_customer_id is null then
      raise exception 'Customer was not found';
    end if;
  else
    if char_length(trim(coalesce(new.customer_name, ''))) = 0 then
      raise exception 'Enter a customer name';
    end if;

    select id, name into resolved_customer_id, resolved_customer_name
    from public.customers
    where business_id = new.business_id
      and normalized_name = lower(regexp_replace(trim(new.customer_name), '\s+', ' ', 'g'));

    if resolved_customer_id is null then
      insert into public.customers (business_id, name)
      values (new.business_id, regexp_replace(trim(new.customer_name), '\s+', ' ', 'g'))
      returning id, name into resolved_customer_id, resolved_customer_name;
    end if;
  end if;

  select coalesce(sum(item.quantity * item.unit_price), 0)::numeric(12,2)
  into calculated_total
  from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric);

  if calculated_total < 0 then
    raise exception 'Sale total is invalid';
  end if;

  if (
    select count(*) <> count(distinct item.variant_id)
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
  ) then
    raise exception 'Each product variant may only appear once in a sale';
  end if;

  for requested in
    select item.variant_id, sum(item.quantity)::integer as quantity
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
    group by item.variant_id
  loop
    if requested.quantity <= 0 then
      raise exception 'Item quantity must be greater than zero';
    end if;

    perform 1
    from public.daily_stock
    where selling_day_id = new.selling_day_id
      and variant_id = requested.variant_id
      and business_id = new.business_id
    for update;

    if not found then
      raise exception 'An item is not in today''s stock';
    end if;

    select ds.brought_quantity
      + coalesce((select sum(sa.quantity_delta) from public.stock_adjustments sa where sa.selling_day_id = ds.selling_day_id and sa.variant_id = ds.variant_id), 0)
      - coalesce((select sum(si.quantity) from public.sale_items si join public.sales s on s.id = si.sale_id where s.selling_day_id = ds.selling_day_id and si.variant_id = ds.variant_id), 0)
    into available_quantity
    from public.daily_stock ds
    where ds.selling_day_id = new.selling_day_id
      and ds.variant_id = requested.variant_id;

    if available_quantity < requested.quantity then
      raise exception 'Not enough stock for one of the selected products';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
    left join public.product_variants pv on pv.id = item.variant_id and pv.business_id = new.business_id and pv.is_active
    where pv.id is null or item.unit_price < 0
  ) then
    raise exception 'One or more sale items are invalid';
  end if;

  insert into public.sales (
    id, business_id, selling_day_id, customer_id, customer_name,
    payment_status, total, paid_at, created_by
  ) values (
    new_sale_id, new.business_id, new.selling_day_id, resolved_customer_id, resolved_customer_name,
    new.payment_status, calculated_total,
    case when new.payment_status = 'paid' then now() else null end,
    new.created_by
  );

  insert into public.sale_items (
    business_id, sale_id, variant_id, product_name, variant_name,
    quantity, unit_price
  )
  select
    new.business_id,
    new_sale_id,
    item.variant_id,
    p.name,
    pv.name,
    sum(item.quantity)::integer,
    item.unit_price::numeric(12,2)
  from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
  join public.product_variants pv on pv.id = item.variant_id
  join public.products p on p.id = pv.product_id
  group by item.variant_id, item.unit_price, p.name, pv.name;

  if resolved_customer_id is not null then
    update public.customers set last_used_at = now() where id = resolved_customer_id;
  end if;

  new.result_sale_id = new_sale_id;
  return new;
end;
$$;

create trigger sale_commands_process before insert on public.sale_commands
for each row execute function private.process_sale_command();

create or replace function private.process_payment_command()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_count integer;
  payment_total numeric(12,2);
  new_payment_id uuid := gen_random_uuid();
begin
  if new.created_by is distinct from auth.uid()
    or not private.is_business_member(new.business_id, auth.uid()) then
    raise exception 'You do not have access to this business';
  end if;

  select count(*), coalesce(sum(total), 0)::numeric(12,2)
  into selected_count, payment_total
  from public.sales
  where id = any(new.sale_ids)
    and business_id = new.business_id
    and customer_id = new.customer_id
    and payment_status = 'unpaid';

  if selected_count <> cardinality(new.sale_ids) then
    raise exception 'Select only complete unpaid orders for this customer';
  end if;

  insert into public.payments (id, business_id, customer_id, total, recorded_by)
  values (new_payment_id, new.business_id, new.customer_id, payment_total, new.created_by);

  insert into public.payment_sales (payment_id, sale_id, business_id, amount)
  select new_payment_id, id, new.business_id, total
  from public.sales
  where id = any(new.sale_ids);

  update public.sales
  set payment_status = 'paid', paid_at = now()
  where id = any(new.sale_ids);

  new.result_payment_id = new_payment_id;
  return new;
end;
$$;

create trigger payment_commands_process before insert on public.payment_commands
for each row execute function private.process_payment_command();

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;
alter table public.business_join_requests enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.selling_days enable row level security;
alter table public.daily_stock enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_adjustments enable row level security;
alter table public.payments enable row level security;
alter table public.payment_sales enable row level security;
alter table public.sale_commands enable row level security;
alter table public.payment_commands enable row level security;

create policy businesses_select on public.businesses for select to authenticated
using (private.is_business_member(id));
create policy businesses_insert on public.businesses for insert to authenticated
with check (created_by = (select auth.uid()));
create policy businesses_update on public.businesses for update to authenticated
using (private.is_business_owner(id)) with check (private.is_business_owner(id));

create policy members_select on public.business_members for select to authenticated
using (private.is_business_member(business_id));
create policy members_update on public.business_members for update to authenticated
using (private.is_business_owner(business_id)) with check (private.is_business_owner(business_id));

create policy join_requests_select on public.business_join_requests for select to authenticated
using (user_id = (select auth.uid()));
create policy join_requests_insert on public.business_join_requests for insert to authenticated
with check (user_id = (select auth.uid()));

create policy products_all on public.products for all to authenticated
using (private.is_business_member(business_id)) with check (private.is_business_member(business_id));
create policy variants_all on public.product_variants for all to authenticated
using (private.is_business_member(business_id)) with check (private.is_business_member(business_id));
create policy selling_days_all on public.selling_days for all to authenticated
using (private.is_business_member(business_id)) with check (private.is_business_member(business_id));
create policy daily_stock_all on public.daily_stock for all to authenticated
using (private.is_business_member(business_id)) with check (private.is_business_member(business_id));
create policy customers_all on public.customers for all to authenticated
using (private.is_business_member(business_id)) with check (private.is_business_member(business_id));
create policy sales_select on public.sales for select to authenticated
using (private.is_business_member(business_id));
create policy sale_items_select on public.sale_items for select to authenticated
using (private.is_business_member(business_id));
create policy adjustments_all on public.stock_adjustments for all to authenticated
using (private.is_business_member(business_id)) with check (private.is_business_member(business_id));
create policy payments_select on public.payments for select to authenticated
using (private.is_business_member(business_id));
create policy payment_sales_select on public.payment_sales for select to authenticated
using (private.is_business_member(business_id));
create policy sale_commands_select on public.sale_commands for select to authenticated
using (created_by = (select auth.uid()) and private.is_business_member(business_id));
create policy sale_commands_insert on public.sale_commands for insert to authenticated
with check (created_by = (select auth.uid()) and private.is_business_member(business_id));
create policy payment_commands_select on public.payment_commands for select to authenticated
using (created_by = (select auth.uid()) and private.is_business_member(business_id));
create policy payment_commands_insert on public.payment_commands for insert to authenticated
with check (created_by = (select auth.uid()) and private.is_business_member(business_id));

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_business_member(bigint, uuid) to authenticated;
grant execute on function private.is_business_owner(bigint, uuid) to authenticated;

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.businesses, public.business_members, public.products,
  public.product_variants, public.selling_days, public.daily_stock, public.customers,
  public.stock_adjustments to authenticated;
grant select on public.sales, public.sale_items, public.payments, public.payment_sales to authenticated;
grant select, insert on public.business_join_requests, public.sale_commands, public.payment_commands to authenticated;
grant usage, select on all sequences in schema public to authenticated;
