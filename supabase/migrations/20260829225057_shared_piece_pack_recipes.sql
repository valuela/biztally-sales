-- Shared piece stock with explicit selling formats (including mixed-flavor packs).
-- A bundle is a sellable format; its components are the stock units consumed by a sale.

alter table public.product_variants
  add column if not exists is_bundle boolean not null default false;

create table if not exists public.variant_components (
  business_id bigint not null references public.businesses(id) on delete cascade,
  bundle_variant_id bigint not null references public.product_variants(id) on delete cascade,
  component_variant_id bigint not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  primary key (bundle_variant_id, component_variant_id),
  check (bundle_variant_id <> component_variant_id)
);

create index if not exists variant_components_business_idx
  on public.variant_components (business_id);
create index if not exists variant_components_component_idx
  on public.variant_components (component_variant_id);

create table if not exists public.sale_item_components (
  id bigint generated always as identity primary key,
  business_id bigint not null references public.businesses(id) on delete cascade,
  sale_item_id bigint not null references public.sale_items(id) on delete cascade,
  component_variant_id bigint not null references public.product_variants(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (sale_item_id, component_variant_id)
);

create index if not exists sale_item_components_business_idx
  on public.sale_item_components (business_id);
create index if not exists sale_item_components_component_idx
  on public.sale_item_components (component_variant_id);

alter table public.variant_components enable row level security;
alter table public.sale_item_components enable row level security;

create policy variant_components_all on public.variant_components
for all to authenticated
using (
  private.is_business_member(business_id)
  and exists (
    select 1 from public.product_variants bundle
    where bundle.id = variant_components.bundle_variant_id
      and bundle.business_id = variant_components.business_id
      and bundle.is_bundle
  )
  and exists (
    select 1 from public.product_variants component
    where component.id = variant_components.component_variant_id
      and component.business_id = variant_components.business_id
  )
)
with check (
  private.is_business_member(business_id)
  and exists (
    select 1 from public.product_variants bundle
    where bundle.id = variant_components.bundle_variant_id
      and bundle.business_id = variant_components.business_id
      and bundle.is_bundle
  )
  and exists (
    select 1 from public.product_variants component
    where component.id = variant_components.component_variant_id
      and component.business_id = variant_components.business_id
      and not component.is_bundle
  )
);

create policy sale_item_components_select on public.sale_item_components
for select to authenticated
using (private.is_business_member(business_id));

-- Existing sales were direct stock items. Record that relationship so the same
-- component-ledger calculation works for historical and new sales.
insert into public.sale_item_components (business_id, sale_item_id, component_variant_id, quantity)
select business_id, id, variant_id, quantity
from public.sale_items
on conflict (sale_item_id, component_variant_id) do nothing;

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
  required_component record;
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

  if exists (
    select 1
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
    left join public.product_variants pv
      on pv.id = item.variant_id
     and pv.business_id = new.business_id
     and pv.is_active
    where pv.id is null or item.quantity <= 0 or item.unit_price < 0
  ) then
    raise exception 'One or more sale items are invalid';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
    join public.product_variants bundle
      on bundle.id = item.variant_id
     and bundle.business_id = new.business_id
     and bundle.is_bundle
    where not exists (
      select 1 from public.variant_components vc
      where vc.bundle_variant_id = bundle.id
        and vc.business_id = new.business_id
    )
  ) then
    raise exception 'One of the selected packs has no recipe';
  end if;

  -- Expand every sellable format to its base stock components, then validate
  -- the aggregated demand while locking rows in a stable order.
  for required_component in
    select component_variant_id, sum(quantity)::integer as quantity
    from (
      select item.variant_id as component_variant_id, item.quantity
      from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
      where not exists (
        select 1 from public.variant_components vc
        where vc.bundle_variant_id = item.variant_id
          and vc.business_id = new.business_id
      )
      union all
      select vc.component_variant_id, item.quantity * vc.quantity
      from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
      join public.variant_components vc
        on vc.bundle_variant_id = item.variant_id
       and vc.business_id = new.business_id
    ) expanded
    group by component_variant_id
    order by component_variant_id
  loop
    if exists (
      select 1 from public.product_variants
      where id = required_component.component_variant_id
        and (not is_active or is_bundle or business_id <> new.business_id)
    ) then
      raise exception 'One of the selected pack components is unavailable';
    end if;

    perform 1
    from public.daily_stock
    where selling_day_id = new.selling_day_id
      and variant_id = required_component.component_variant_id
      and business_id = new.business_id
    for update;

    if not found then
      raise exception 'An item is not in today''s stock';
    end if;

    select ds.brought_quantity
      + coalesce((
        select sum(sa.quantity_delta)
        from public.stock_adjustments sa
        where sa.selling_day_id = ds.selling_day_id
          and sa.variant_id = ds.variant_id
      ), 0)
      - coalesce((
        select sum(sic.quantity)
        from public.sale_item_components sic
        join public.sale_items si on si.id = sic.sale_item_id
        join public.sales s on s.id = si.sale_id
        where s.selling_day_id = ds.selling_day_id
          and sic.component_variant_id = ds.variant_id
      ), 0)
    into available_quantity
    from public.daily_stock ds
    where ds.selling_day_id = new.selling_day_id
      and ds.variant_id = required_component.component_variant_id
      and ds.business_id = new.business_id;

    if available_quantity < required_component.quantity then
      raise exception 'Not enough stock for one of the selected products';
    end if;
  end loop;

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
    item.quantity,
    item.unit_price::numeric(12,2)
  from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
  join public.product_variants pv on pv.id = item.variant_id
  join public.products p on p.id = pv.product_id;

  insert into public.sale_item_components (
    business_id, sale_item_id, component_variant_id, quantity
  )
  select new.business_id, si.id, expanded.component_variant_id, sum(expanded.quantity)::integer
  from (
    select item.variant_id as sale_variant_id, item.variant_id as component_variant_id, item.quantity
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
    where not exists (
      select 1 from public.variant_components vc
      where vc.bundle_variant_id = item.variant_id
        and vc.business_id = new.business_id
    )
    union all
    select item.variant_id, vc.component_variant_id, item.quantity * vc.quantity
    from jsonb_to_recordset(new.items) as item(variant_id bigint, quantity integer, unit_price numeric)
    join public.variant_components vc
      on vc.bundle_variant_id = item.variant_id
     and vc.business_id = new.business_id
  ) expanded
  join public.sale_items si
    on si.sale_id = new_sale_id
   and si.variant_id = expanded.sale_variant_id
  group by si.id, expanded.component_variant_id;

  if resolved_customer_id is not null then
    update public.customers set last_used_at = now() where id = resolved_customer_id;
  end if;

  new.result_sale_id = new_sale_id;
  return new;
end;
$$;

revoke all on public.variant_components, public.sale_item_components from anon;
grant select, insert, update, delete on public.variant_components to authenticated;
grant select on public.sale_item_components to authenticated;
grant usage, select on sequence public.sale_item_components_id_seq to authenticated;