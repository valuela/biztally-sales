alter table public.sales
  drop constraint sales_payment_method_check,
  alter column payment_method drop not null;

update public.sales
set payment_method = null
where payment_status = 'unpaid';

alter table public.sales
  add constraint sales_payment_method_check check (
    (payment_status = 'unpaid' and payment_method is null)
    or
    (payment_status = 'paid' and payment_method in ('cash', 'gcash', 'bank_transfer', 'unknown'))
  );

alter table public.sale_commands
  drop constraint sale_commands_payment_method_check,
  alter column payment_method drop not null,
  add constraint sale_commands_payment_method_check check (
    payment_method is null
    or payment_method in ('cash', 'gcash', 'bank_transfer', 'unknown')
  );

alter table public.payments
  add column payment_method text;

alter table public.payment_commands
  add column payment_method text;

update public.payments set payment_method = 'unknown' where payment_method is null;
update public.payment_commands set payment_method = 'unknown' where payment_method is null;

alter table public.payments
  alter column payment_method set not null,
  add constraint payments_payment_method_check
    check (payment_method in ('cash', 'gcash', 'bank_transfer', 'unknown'));

alter table public.payment_commands
  alter column payment_method set not null,
  add constraint payment_commands_payment_method_check
    check (payment_method in ('cash', 'gcash', 'bank_transfer', 'unknown'));
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

  if new.payment_status = 'paid' and (
    new.payment_method is null
    or new.payment_method not in ('cash', 'gcash', 'bank_transfer')
  ) then
    raise exception 'Choose a payment method';
  end if;

  if new.payment_status = 'unpaid' and new.payment_method is not null then
    raise exception 'Pay later sales cannot have a payment method';
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
    payment_status, payment_method, total, paid_at, created_by
  ) values (
    new_sale_id, new.business_id, new.selling_day_id, resolved_customer_id, resolved_customer_name,
    new.payment_status, new.payment_method, calculated_total,
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

  if new.payment_method not in ('cash', 'gcash', 'bank_transfer') then
    raise exception 'Choose a payment method';
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

  insert into public.payments (id, business_id, customer_id, total, payment_method, recorded_by)
  values (new_payment_id, new.business_id, new.customer_id, payment_total, new.payment_method, new.created_by);

  insert into public.payment_sales (payment_id, sale_id, business_id, amount)
  select new_payment_id, id, new.business_id, total
  from public.sales
  where id = any(new.sale_ids);

  update public.sales
  set payment_status = 'paid', payment_method = new.payment_method, paid_at = now()
  where id = any(new.sale_ids);

  new.result_payment_id = new_payment_id;
  return new;
end;
$$;

