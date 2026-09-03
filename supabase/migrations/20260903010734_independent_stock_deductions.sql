create or replace function public.remove_prepared_stock(
  p_selling_day_id bigint, p_variant_id bigint, p_quantity integer, p_kind text
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  b bigint; brought integer; sold bigint; component record;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select business_id into b from public.selling_days
    where id=p_selling_day_id for update;
  if b is null or not private.is_business_member(b,auth.uid()) then
    raise exception 'Selling day not found';
  end if;
  if p_quantity is null or p_quantity < 1 or p_kind is null
    or p_kind not in ('returned_home','damaged','giveaway','correction') then
    raise exception 'Invalid quantity or removal reason';
  end if;
  select brought_quantity into brought from public.selling_day_variants
    where selling_day_id=p_selling_day_id and variant_id=p_variant_id for update;
  select coalesce(sum(si.quantity),0) into sold from public.sale_items si
    join public.sales s on s.id=si.sale_id
    where s.selling_day_id=p_selling_day_id and s.voided_at is null and si.variant_id=p_variant_id;
  if brought is null or brought-sold < p_quantity then
    raise exception 'Stock changed. Refresh before removing this item.';
  end if;
  if not exists(select 1 from public.product_variants where id=p_variant_id and business_id=b)
    or exists(select 1 from public.product_variants v where v.id=p_variant_id and v.is_bundle
      and not exists(select 1 from public.variant_components where bundle_variant_id=v.id)) then
    raise exception 'Invalid selling option or pack recipe';
  end if;
  for component in
    select coalesce(c.component_variant_id,v.id) as id, coalesce(c.quantity,1) as quantity
    from public.product_variants v left join public.variant_components c
      on c.bundle_variant_id=v.id and c.business_id=b
    where v.id=p_variant_id and v.business_id=b order by 1
  loop
    insert into public.stock_adjustments(business_id,selling_day_id,variant_id,kind,quantity_delta,note)
      values (b,p_selling_day_id,component.id,p_kind,-(component.quantity::bigint*p_quantity)::integer,
        'Removed ' || p_quantity || ' selling units of variant ' || p_variant_id);
  end loop;
  update public.selling_day_variants set brought_quantity=brought_quantity-p_quantity
    where selling_day_id=p_selling_day_id and variant_id=p_variant_id;
end;
$$;
revoke all on function public.remove_prepared_stock(bigint,bigint,integer,text) from public,anon;
grant execute on function public.remove_prepared_stock(bigint,bigint,integer,text) to authenticated;
