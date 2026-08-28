alter table public.product_variants
add column if not exists package_quantity integer not null default 1;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'product_variants_package_quantity_positive'
      and conrelid = 'public.product_variants'::regclass
  ) then
    alter table public.product_variants
    add constraint product_variants_package_quantity_positive
    check (package_quantity >= 1);
  end if;
end $$;