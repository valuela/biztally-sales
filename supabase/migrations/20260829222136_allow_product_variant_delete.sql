-- Allow deleting unused product variants from the app.
-- Existing RLS still limits rows to the user's business, and foreign keys
-- prevent deleting variants that already have stock, sales, or adjustment history.
grant delete on public.product_variants to authenticated;