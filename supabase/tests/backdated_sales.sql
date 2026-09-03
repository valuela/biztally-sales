-- Isolated authenticated regression: all fixtures and schema injection roll back.
begin;
-- MIGRATION_UNDER_TEST
do $$ begin
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users limit 1), true);
end $$;
do $$
declare
  b bigint; p bigint; v bigint; d bigint; t bigint; f bigint;
  s uuid; items jsonb; rejected boolean; original_user text := auth.uid()::text;
  local_today date := (now() at time zone 'Asia/Manila')::date;
begin
  insert into public.businesses(name,created_by) values ('Backdate regression',auth.uid()) returning id into b;
  set local role authenticated;
  insert into public.products(business_id,name) values (b,'Test product') returning id into p;
  insert into public.product_variants(business_id,product_id,name,default_price)
    values (b,p,'Test flavor',20) returning id into v;
  insert into public.selling_days(business_id,sale_date) values (b,local_today-1) returning id into d;
  insert into public.selling_days(business_id,sale_date) values (b,local_today) returning id into t;
  insert into public.selling_days(business_id,sale_date) values (b,local_today+1) returning id into f;
  insert into public.daily_stock(business_id,selling_day_id,variant_id,brought_quantity)
    values (b,d,v,10),(b,t,v,10),(b,f,v,10);
  insert into public.selling_day_variants(selling_day_id,variant_id,brought_quantity)
    values (d,v,10),(t,v,10),(f,v,10);
  items := jsonb_build_array(jsonb_build_object('variant_id',v,'quantity',1,'unit_price',20));
  insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items,sale_time)
    values (gen_random_uuid(),b,d,true,'paid',20,'cash',items,'23:30') returning result_sale_id into s;
  if not exists (select 1 from public.sales where id=s
      and sold_at=((local_today-1)+time '23:30') at time zone 'Asia/Manila'
      and paid_at=sold_at and created_at=now()) then
    raise exception 'Historical paid date/audit assertion failed';
  end if;
  insert into public.sale_commands(id,business_id,selling_day_id,customer_name,payment_status,amount_paid,items)
    values (gen_random_uuid(),b,d,'Test customer','unpaid',0,items) returning result_sale_id into s;
  if not exists (select 1 from public.sales where id=s and amount_paid=0 and paid_at is null
    and sold_at=((local_today-1)+time '12:00') at time zone 'Asia/Manila') then
    raise exception 'Unpaid historical default time assertion failed';
  end if;
  insert into public.sale_commands(id,business_id,selling_day_id,customer_name,payment_status,amount_paid,payment_method,items,sale_time)
    values (gen_random_uuid(),b,d,'Test customer','unpaid',5,'cash',items,'09:00') returning result_sale_id into s;
  if not exists (select 1 from public.payments pay join public.payment_sales ps on ps.payment_id=pay.id
    where ps.sale_id=s and pay.total=5 and pay.paid_at=((local_today-1)+time '09:00') at time zone 'Asia/Manila') then
    raise exception 'Partial payment historical date assertion failed';
  end if;
  if exists (select 1 from public.sales where selling_day_id=t) then
    raise exception 'Historical entry leaked into today';
  end if;
  perform public.close_selling_day(d);
  rejected := false;
  begin
    insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
      values (gen_random_uuid(),b,d,true,'paid',20,'cash',items);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Closed day accepted sale'; end if;
  perform public.reopen_selling_day(d);
  insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
    values (gen_random_uuid(),b,d,true,'paid',20,'cash',items);
  if (select count(*) from public.sales where selling_day_id=d) <> 4 then
    raise exception 'Reopening changed prior sales';
  end if;
  insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
    values (gen_random_uuid(),b,t,true,'paid',20,'cash',items) returning result_sale_id into s;
  if not exists (select 1 from public.sales where id=s and sold_at=now()) then
    raise exception 'Current sale timestamp assertion failed';
  end if;
  rejected := false;
  begin
    insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
      values (gen_random_uuid(),b,f,true,'paid',20,'cash',items);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Future day accepted sale'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected := false;
  begin perform public.reopen_selling_day(d);
  exception when others then rejected := true;
  end;
  if not rejected then raise exception 'Nonmember reopened day'; end if;
  perform set_config('request.jwt.claim.sub',original_user,true);
end $$;
rollback;
select 'Backdated paid, unpaid, partial, today, closed/reopened, future and membership checks passed; fixtures rolled back' as result;
