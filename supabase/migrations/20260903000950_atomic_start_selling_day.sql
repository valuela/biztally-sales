-- One RPC transaction creates the day, component stock, and selling units.
create function public.start_selling_day(p_business_id bigint, p_sale_date date, p_items jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_day bigint;
begin
  if auth.uid() is null or not private.is_business_member(p_business_id, auth.uid()) then
    raise exception 'You do not have access to this business';
  end if;
  if p_sale_date is null or p_sale_date > (now() at time zone 'Asia/Manila')::date then
    raise exception 'Choose today or a past date';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Choose at least one item';
  end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Choose at least one item'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as i(variant_id bigint, quantity numeric)
    left join public.product_variants v on v.id=i.variant_id and v.business_id=p_business_id
    left join public.products p on p.id=v.product_id
    where v.id is null or not v.is_active or not p.is_active
      or i.quantity is null or i.quantity <= 0 or i.quantity <> trunc(i.quantity)
      or i.quantity > 2147483647
      or (v.is_bundle and not exists (
        select 1 from public.variant_components c
        where c.bundle_variant_id=v.id and c.business_id=p_business_id))
  ) then raise exception 'Invalid product, quantity, or pack recipe'; end if;
  if exists (
    select variant_id from jsonb_to_recordset(p_items) as i(variant_id bigint)
    group by variant_id having count(*) > 1
  ) then raise exception 'Choose each selling option only once'; end if;

  insert into public.selling_days(business_id,sale_date)
    values (p_business_id,p_sale_date) returning id into new_day;

  insert into public.daily_stock(business_id,selling_day_id,variant_id,brought_quantity)
  select p_business_id,new_day,component_variant_id,sum(quantity)::integer
  from (
    select coalesce(c.component_variant_id,i.variant_id) as component_variant_id,
      i.quantity * coalesce(c.quantity,1) as quantity
    from jsonb_to_recordset(p_items) as i(variant_id bigint,quantity numeric)
    left join public.variant_components c
      on c.bundle_variant_id=i.variant_id and c.business_id=p_business_id
  ) expanded group by component_variant_id;

  insert into public.selling_day_variants(selling_day_id,variant_id,brought_quantity)
    select new_day,i.variant_id,i.quantity
    from jsonb_to_recordset(p_items) as i(variant_id bigint,quantity integer);
  return new_day;
end;
$$;
revoke all on function public.start_selling_day(bigint,date,jsonb) from public,anon;
grant execute on function public.start_selling_day(bigint,date,jsonb) to authenticated;
