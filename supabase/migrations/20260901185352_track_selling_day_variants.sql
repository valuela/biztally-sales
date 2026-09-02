create table public.selling_day_variants (
  selling_day_id bigint not null references public.selling_days(id) on delete cascade,
  variant_id bigint not null references public.product_variants(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (selling_day_id, variant_id)
);

create index selling_day_variants_variant_id_idx
  on public.selling_day_variants (variant_id);

alter table public.selling_day_variants enable row level security;

create policy selling_day_variants_select
on public.selling_day_variants
for select
  to authenticated
using (
  exists (
    select 1
    from public.selling_days sd
    where sd.id = selling_day_variants.selling_day_id
      and private.is_business_member(sd.business_id)
  )
);

create policy selling_day_variants_insert
on public.selling_day_variants
for insert
  to authenticated
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

revoke all on table public.selling_day_variants from public, anon, authenticated;
grant select, insert on table public.selling_day_variants to authenticated;