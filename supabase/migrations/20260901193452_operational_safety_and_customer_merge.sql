alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id),
  add column if not exists void_reason text;

create index if not exists sales_business_active_sold_at_idx
  on public.sales (business_id, sold_at desc)
  where voided_at is null;

create or replace function public.close_selling_day(p_selling_day_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare target_business_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select business_id into target_business_id
  from public.selling_days where id = p_selling_day_id for update;
  if target_business_id is null or
     not private.is_business_member(target_business_id, auth.uid()) then
    raise exception 'Selling day not found';
  end if;
  update public.selling_days
  set closed_at = coalesce(closed_at, now())
  where id = p_selling_day_id;
end;
$$;

create or replace function public.void_sale(p_sale_id uuid, p_reason text default 'Entry mistake')
returns void language plpgsql security definer set search_path = ''
as $$
declare target_business_id bigint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select business_id into target_business_id
  from public.sales where id = p_sale_id and voided_at is null for update;
  if target_business_id is null or
     not private.is_business_member(target_business_id, auth.uid()) then
    raise exception 'Sale not found';
  end if;
  if exists (select 1 from public.payment_sales where sale_id = p_sale_id) then
    raise exception 'A collected payment includes this sale and must be reviewed first';
  end if;
  update public.sales
  set voided_at = now(),
      voided_by = auth.uid(),
      void_reason = left(coalesce(nullif(trim(p_reason), ''), 'Entry mistake'), 200)
  where id = p_sale_id;
end;
$$;

create or replace function public.merge_customers(p_source_customer_id bigint, p_target_customer_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  source_business_id bigint;
  target_business_id bigint;
  target_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_source_customer_id = p_target_customer_id then
    raise exception 'Choose two different customers';
  end if;
  select business_id into source_business_id
  from public.customers where id = p_source_customer_id for update;
  select business_id, name into target_business_id, target_name
  from public.customers where id = p_target_customer_id for update;
  if source_business_id is null or target_business_id is null or
     source_business_id <> target_business_id or
     not private.is_business_member(source_business_id, auth.uid()) then
    raise exception 'Customers not found';
  end if;
  update public.sales
  set customer_id = p_target_customer_id, customer_name = target_name
  where customer_id = p_source_customer_id;
  update public.sale_commands
  set customer_id = p_target_customer_id, customer_name = target_name
  where customer_id = p_source_customer_id;
  update public.payments
  set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  update public.payment_commands
  set customer_id = p_target_customer_id
  where customer_id = p_source_customer_id;
  delete from public.customers where id = p_source_customer_id;
end;
$$;

revoke all on function public.close_selling_day(bigint) from public;
revoke all on function public.void_sale(uuid, text) from public;
revoke all on function public.merge_customers(bigint, bigint) from public;
grant execute on function public.close_selling_day(bigint) to authenticated;
grant execute on function public.void_sale(uuid, text) to authenticated;
grant execute on function public.merge_customers(bigint, bigint) to authenticated;