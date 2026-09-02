do $$
declare
  target_day_id bigint;
begin
  select sd.id into target_day_id
  from public.selling_days sd
  where sd.status = 'open'
    and not exists (
      select 1 from public.sales s
      where s.selling_day_id = sd.id
        and s.voided_at is null
    )
    and exists (
      select 1
      from public.selling_day_variants sdv
      join public.product_variants pv on pv.id = sdv.variant_id
      join public.products p on p.id = pv.product_id
      where sdv.selling_day_id = sd.id
        and p.name = 'Polvoron'
        and pv.name in ('Nuts', 'Pinipig', 'Mix 6s', 'Nuts 5s', 'Pinipig 5s')
        and sdv.brought_quantity = 0
    )
  order by sd.sale_date desc, sd.id desc
  limit 1;

  if target_day_id is not null then
    update public.selling_day_variants sdv
    set brought_quantity = values_to_set.quantity
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    join (values
      ('Nuts', 6),
      ('Pinipig', 9),
      ('Mix 6s', 5),
      ('Nuts 5s', 2),
      ('Pinipig 5s', 2)
    ) as values_to_set(variant_name, quantity)
      on values_to_set.variant_name = pv.name
    where sdv.selling_day_id = target_day_id
      and sdv.variant_id = pv.id
      and p.name = 'Polvoron'
      and sdv.brought_quantity = 0;
  end if;
end;
$$;