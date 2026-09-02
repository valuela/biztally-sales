alter table public.selling_day_variants
  add column brought_quantity integer not null default 0
  check (brought_quantity >= 0);

create policy selling_day_variants_update
on public.selling_day_variants
for update to authenticated
using (
  exists (
    select 1 from public.selling_days sd
    where sd.id = selling_day_variants.selling_day_id
      and private.is_business_member(sd.business_id)
  )
)
with check (
  exists (
    select 1
    from public.selling_days sd
    join public.product_variants pv
      on pv.id = selling_day_variants.variant_id
     and pv.business_id = sd.business_id
    where sd.id = selling_day_variants.selling_day_id
      and private.is_business_member(sd.business_id)
  )
);

grant update on table public.selling_day_variants to authenticated;

create or replace function private.validate_selling_unit_stock()
returns trigger language plpgsql security invoker set search_path = ''
as $$
declare
  item jsonb;
  requested integer;
  brought integer;
  already_sold bigint;
begin
  for item in select value from jsonb_array_elements(new.items)
  loop
    requested := (item->>'quantity')::integer;
    select sdv.brought_quantity into brought
    from public.selling_day_variants sdv
    where sdv.selling_day_id = new.selling_day_id
      and sdv.variant_id = (item->>'variant_id')::bigint;
    if brought is null then
      raise exception 'This product was not added to today''s selling list';
    end if;
    select coalesce(sum(si.quantity), 0) into already_sold
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    where s.selling_day_id = new.selling_day_id
      and s.voided_at is null
      and si.variant_id = (item->>'variant_id')::bigint;
    if requested > brought - already_sold then
      raise exception 'Not enough prepared stock for this product';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists sale_commands_00_validate_units on public.sale_commands;
create trigger sale_commands_00_validate_units
before insert on public.sale_commands
for each row execute function private.validate_selling_unit_stock();