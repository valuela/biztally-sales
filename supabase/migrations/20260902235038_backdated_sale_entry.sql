-- A historical sale uses the selected selling day's Philippine date.
-- Existing sales are intentionally not rewritten.
alter table public.sale_commands
  add column sale_time time without time zone
    check (sale_time < time '24:00');

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
  resolved_sale_date date;
  resolved_sold_at timestamptz;
  initial_payment_id uuid := gen_random_uuid();
begin
  if auth.uid() is null or new.created_by is distinct from auth.uid()
    or not private.is_business_member(new.business_id, auth.uid()) then
    raise exception 'You do not have access to this business';
  end if;

  -- Lock the selected day so closing it cannot race a sale submission.
  select sale_date into resolved_sale_date
  from public.selling_days
  where id = new.selling_day_id
    and business_id = new.business_id
    and status = 'open'
    and closed_at is null
  for update;
  if not found then
    raise exception 'The selected selling day is closed or unavailable. Reopen it before adding sales.';
  end if;
  if resolved_sale_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'Sales cannot be recorded for a future date';
  end if;

  -- Use the selected business date, not the time the entry was typed.
  -- created_at is left untouched as the actual recording timestamp.
  if resolved_sale_date = (now() at time zone 'Asia/Manila')::date
    and new.sale_time is null then
    resolved_sold_at := now();
  else
    resolved_sold_at := (resolved_sale_date + coalesce(new.sale_time, time '12:00'))
      at time zone 'Asia/Manila';
  end if;
  if resolved_sold_at > now() then
    raise exception 'Sale time cannot be in the future';
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

  if new.payment_status = 'paid' then
    if new.amount_paid <> calculated_total then
      raise exception 'Paid amount must equal the sale total';
    end if;
    if new.payment_method is null
      or new.payment_method not in ('cash', 'gcash', 'bank_transfer') then
      raise exception 'Choose a payment method';
    end if;
  elsif new.amount_paid = 0 then
    if new.payment_method is not null then
      raise exception 'Pay later sales cannot have a payment method';
    end if;
  elsif new.amount_paid > 0 and new.amount_paid < calculated_total then
    if new.payment_method is null
      or new.payment_method not in ('cash', 'gcash', 'bank_transfer') then
      raise exception 'Choose a payment method';
    end if;
  else
    raise exception 'Partial payment must be more than zero and less than the total';
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
      raise exception 'An item is not in the selected day''s stock';
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
          and s.voided_at is null
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
    payment_status, payment_method, total, amount_paid, sold_at, paid_at, created_by
  ) values (
    new_sale_id, new.business_id, new.selling_day_id, resolved_customer_id, resolved_customer_name,
    new.payment_status, new.payment_method, calculated_total, new.amount_paid,
    resolved_sold_at,
    case when new.payment_status = 'paid' then resolved_sold_at else null end,
    new.created_by
  );

  if new.amount_paid > 0 and new.amount_paid < calculated_total then
    insert into public.payments (
      id, business_id, customer_id, total, payment_method, paid_at, recorded_by
    ) values (
      initial_payment_id, new.business_id, resolved_customer_id,
      new.amount_paid, new.payment_method, resolved_sold_at, new.created_by
    );

    insert into public.payment_sales (payment_id, sale_id, business_id, amount)
    values (initial_payment_id, new_sale_id, new.business_id, new.amount_paid);
  end if;
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

create or replace function public.reopen_selling_day(p_selling_day_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.selling_days%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target from public.selling_days
  where id = p_selling_day_id for update;
  if not found or not private.is_business_member(target.business_id, auth.uid()) then
    raise exception 'Selling day not found';
  end if;
  if target.sale_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'Cannot reopen a future selling day';
  end if;
  update public.selling_days
  set status = 'open', closed_at = null
  where id = target.id;
end;
$$;
revoke all on function public.reopen_selling_day(bigint) from public, anon;
grant execute on function public.reopen_selling_day(bigint) to authenticated;

create or replace function public.close_selling_day(p_selling_day_id bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_business_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select business_id into target_business_id
  from public.selling_days where id = p_selling_day_id for update;
  if target_business_id is null or
     not private.is_business_member(target_business_id, auth.uid()) then
    raise exception 'Selling day not found';
  end if;
  update public.selling_days
  set status = 'closed', closed_at = coalesce(closed_at, now())
  where id = p_selling_day_id;
end;
$$;
revoke all on function public.close_selling_day(bigint) from public, anon;
grant execute on function public.close_selling_day(bigint) to authenticated;
