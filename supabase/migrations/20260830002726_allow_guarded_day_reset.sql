create or replace function public.reset_selling_day(p_selling_day_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id bigint;
begin
  select sd.business_id
  into v_business_id
  from public.selling_days sd
  where sd.id = p_selling_day_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Selling day not found.';
  end if;

  if not private.is_business_member(v_business_id, (select auth.uid())) then
    raise exception using errcode = '42501', message = 'You cannot reset this selling day.';
  end if;

  if exists (
    select 1
    from public.sales s
    where s.selling_day_id = p_selling_day_id
  ) then
    raise exception using errcode = 'P0001', message = 'This day already has sales and cannot be reset.';
  end if;

  delete from public.selling_days
  where id = p_selling_day_id;
end;
$$;

revoke all on function public.reset_selling_day(bigint) from public, anon;
grant execute on function public.reset_selling_day(bigint) to authenticated;