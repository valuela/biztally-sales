-- Tighten Data API table grants for the frontend roles.
-- The first V1 schema was applied from the Supabase SQL editor before CLI
-- migration history existed, and the live project retained broader defaults.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;
revoke all on all sequences in schema public from authenticated;

revoke all on schema public from public;
grant usage on schema public to authenticated;

grant select, insert, update on public.businesses to authenticated;
grant select, update on public.business_members to authenticated;
grant select, insert, update on public.products to authenticated;
grant select, insert, update on public.product_variants to authenticated;
grant select, insert, update on public.selling_days to authenticated;
grant select, insert, update on public.daily_stock to authenticated;
grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.stock_adjustments to authenticated;

grant select on public.sales to authenticated;
grant select on public.sale_items to authenticated;
grant select on public.payments to authenticated;
grant select on public.payment_sales to authenticated;

grant select, insert on public.business_join_requests to authenticated;
grant select, insert on public.sale_commands to authenticated;
grant select, insert on public.payment_commands to authenticated;

grant usage, select on all sequences in schema public to authenticated;