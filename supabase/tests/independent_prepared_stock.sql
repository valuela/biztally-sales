begin;
-- MIGRATION_UNDER_TEST
do $$ begin
  perform set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
end $$;
do $$
declare
  b bigint; p bigint; a bigint; c bigint; pack bigint; d bigint;
  items jsonb; rejected boolean; test_date date := (now() at time zone 'Asia/Manila')::date-2;
  original_user text := auth.uid()::text;
begin
  insert into public.businesses(name,created_by) values ('Atomic start regression',auth.uid()) returning id into b;
  set local role authenticated;
  insert into public.products(business_id,name) values (b,'Test product') returning id into p;
  insert into public.product_variants(business_id,product_id,name,default_price)
    values (b,p,'Flavor A',20) returning id into a;
  insert into public.product_variants(business_id,product_id,name,default_price)
    values (b,p,'Flavor B',18) returning id into c;
  insert into public.product_variants(business_id,product_id,name,default_price,is_bundle,package_quantity)
    values (b,p,'Mixed six',110,true,6) returning id into pack;
  insert into public.variant_components(business_id,bundle_variant_id,component_variant_id,quantity)
    values (b,pack,a,3),(b,pack,c,3);
  items := jsonb_build_array(jsonb_build_object('variant_id',a,'quantity',2),
    jsonb_build_object('variant_id',pack,'quantity',4));
  d := public.start_selling_day(b,test_date,items);
  if (select brought_quantity from public.daily_stock where selling_day_id=d and variant_id=a) <> 14
    or (select brought_quantity from public.daily_stock where selling_day_id=d and variant_id=c) <> 12
    or (select count(*) from public.daily_stock where selling_day_id=d) <> 2
    or (select brought_quantity from public.selling_day_variants where selling_day_id=d and variant_id=pack) <> 4
    or (select brought_quantity from public.selling_day_variants where selling_day_id=d and variant_id=a) <> 2 then
    raise exception 'Mixed pack/component stock assertion failed';
  end if;
  rejected := false;
  begin perform public.start_selling_day(b,test_date,items);
  exception when unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'Duplicate date accepted'; end if;
  -- Force a stock-insert overflow AFTER the day insert: nothing may remain.
  rejected := false;
  begin
    perform public.start_selling_day(b,test_date+1,
      jsonb_build_array(jsonb_build_object('variant_id',pack,'quantity',2147483647)));
  exception when numeric_value_out_of_range then rejected := true;
  end;
  if not rejected or exists(select 1 from public.selling_days where business_id=b and sale_date=test_date+1) then
    raise exception 'Failed stock write left a partial day';
  end if;
  rejected := false;
  begin
    perform public.start_selling_day(b,test_date+1,
      jsonb_build_array(jsonb_build_object('variant_id',a,'quantity',1.5)));
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Fractional quantity accepted'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected := false;
  begin perform public.start_selling_day(b,test_date+1,items);
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Nonmember started day'; end if;
  perform set_config('request.jwt.claim.sub',original_user,true);
  -- Simulate a legacy piece ledger that disagrees with the prepared stock.
  update public.daily_stock set brought_quantity=1 where selling_day_id=d;
  insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
    values (gen_random_uuid(),b,d,true,'paid',40,'cash',
      jsonb_build_array(jsonb_build_object('variant_id',a,'quantity',2,'unit_price',20)));
  if (select brought_quantity from public.selling_day_variants where selling_day_id=d and variant_id=pack) <> 4 then
    raise exception 'Another option changed prepared pack stock';
  end if;
  insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
    values (gen_random_uuid(),b,d,true,'paid',440,'cash',
      jsonb_build_array(jsonb_build_object('variant_id',pack,'quantity',4,'unit_price',110)));
  rejected := false;
  begin
    insert into public.sale_commands(id,business_id,selling_day_id,is_walk_in,payment_status,amount_paid,payment_method,items)
      values (gen_random_uuid(),b,d,true,'paid',110,'cash',
        jsonb_build_array(jsonb_build_object('variant_id',pack,'quantity',1,'unit_price',110)));
  exception when raise_exception then rejected := true;
  end;
  if not rejected then raise exception 'Prepared pack overselling allowed'; end if;
end $$;
rollback;
select 'Independent stock: sale completion, separate prepared counts and oversell rejection passed' as result;

