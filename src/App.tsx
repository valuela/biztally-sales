/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart3,
  Box,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  Minus,
  PackagePlus,
  Pencil,
  Plus,
  RotateCcw,
  ReceiptText,
  Smartphone,
  Users,
  WifiOff,
  Settings,
  ShoppingBag,
  Trash2,
  X,
} from "lucide-react";
import { supabase } from "./lib/supabase";

type Business = { id: number; name: string; join_code: string };
type Product = { id: number; name: string };
type Variant = {
  id: number;
  product_id: number;
  name: string;
  package_quantity: number;
  default_price: number;
  is_active?: boolean;
  is_bundle?: boolean;
  products?: Product;
  components?: VariantComponent[];
};
type VariantComponent = {
  bundle_variant_id?: number;
  component_variant_id: number;
  quantity: number;
  component?: Variant;
};
type Day = { id: number; sale_date: string; status?: string; closed_at?: string | null };
type Stock = {
  id: number;
  variant_id: number;
  brought_quantity: number;
  initial_quantity?: number;
  product_variants: Variant;
};
type Cart = {
  variant: Variant;
  quantity: number;
  unitPrice: number;
};
type Customer = { id: number; name: string };
type PaymentMethod = "" | "cash" | "gcash" | "bank_transfer";
type Sale = {
  id: string;
  customer_id: number | null;
  customer_name: string;
  total: number;
  payment_status: string;
  payment_method: string | null;
  amount_paid: number;
  sold_at: string;
  voided_at?: string | null;
  void_reason?: string | null;
  sale_items?: SaleItem[];
};
type SaleItem = {
  id: number;
  product_name: string;
  variant_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};
type CustomerBalance = {
  key: string;
  customerId: number | null;
  name: string;
  total: number;
  count: number;
  sales: Sale[];
};
const php = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const paymentMethodLabel = (method?: string | null) => {
  if (method === "cash") return "Cash";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank transfer";
  return "";
};
const balanceDue = (sale: Pick<Sale, "total" | "amount_paid">) =>
  Math.max(0, Number(sale.total) - Number(sale.amount_paid));
const salePaymentLabel = (sale: Pick<Sale, "payment_status" | "amount_paid">) =>
  sale.payment_status === "paid"
    ? "Paid"
    : Number(sale.amount_paid) > 0
      ? "Partial"
      : "Pay Later";
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );
const displayDate = (date: string) =>
  new Intl.DateTimeFormat("en-PH", {
    month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila",
  }).format(new Date(date + "T12:00:00+08:00"));
const unitLabel = (variant: Pick<Variant, "package_quantity">) =>
  variant.package_quantity === 1 ? "1 pc" : `${variant.package_quantity} pcs`;
const stockLabel = (
  quantity: number,
  variant: Pick<Variant, "package_quantity">,
) =>
  variant.package_quantity === 1
    ? `${quantity} pcs`
    : `${quantity} ${quantity === 1 ? "pack" : "packs"} (${quantity * variant.package_quantity} pcs)`;
const componentDemand = (variant: Variant, quantity: number) =>
  variant.is_bundle
    ? (variant.components || []).map((component) => ({
        component_variant_id: component.component_variant_id,
        quantity: component.quantity * quantity,
      }))
    : [{ component_variant_id: variant.id, quantity }];
const bundleContents = (variant: Variant) =>
  (variant.components || [])
    .map((component) => component.quantity + ' ' + (component.component?.name || 'piece'))
    .join(' + ');
const groupVariantsByProduct = (variants: Variant[]) => {
  const grouped = new Map<
    number,
    { id: number; name: string; variants: Variant[] }
  >();
  for (const variant of variants) {
    const current = grouped.get(variant.product_id) || {
      id: variant.product_id,
      name: variant.products?.name || "Product",
      variants: [],
    };
    current.variants.push(variant);
    grouped.set(variant.product_id, current);
  }
  return [...grouped.values()]
    .map((group) => ({
      ...group,
      variants: group.variants.sort(
        (a, b) =>
          Number(Boolean(a.is_bundle)) - Number(Boolean(b.is_bundle)) ||
          a.name.localeCompare(b.name),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};
function Auth() {
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg("");
    const r = signup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    setMsg(
      r.error?.message ||
        (signup ? "Check your email to confirm your account." : ""),
    );
  }
  return (
    <main className="center">
      <section className="auth">
        <Logo />
        <p className="eyebrow">BizTally Sales</p>
        <h1>{signup ? "Create your account" : "Welcome back"}</h1>
        <p>Simple sales and stock for busy days.</p>
        <form onSubmit={submit}>
          <label>
            Email
            <input
              required
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              minLength={6}
              type="password"
              name="password"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && <small role="status" aria-live="polite">{msg}</small>}
          <button className="primary" disabled={busy}>
            {busy ? "Please wait…" : signup ? "Sign up" : "Log in"}
          </button>
        </form>
        <button type="button" className="link" onClick={() => setSignup(!signup)}>
          {signup
            ? "Already have an account? Log in"
            : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}
function Logo() {
  return (
    <div className="logo" aria-hidden="true">
      <ShoppingBag aria-hidden="true" />
    </div>
  );
}
function Setup({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [name, setName] = useState("BizTally Sales"),
    [code, setCode] = useState(""),
    [error, setError] = useState("");
  async function create() {
    if (!supabase) return;
    const { error } = await supabase
      .from("businesses")
      .insert({ name: name.trim(), created_by: userId });
    if (error) setError(error.message);
    else onDone();
  }
  async function join() {
    if (!supabase) return;
    const { error } = await supabase
      .from("business_join_requests")
      .insert({ join_code: code.trim().toUpperCase(), user_id: userId });
    if (error) setError(error.message);
    else onDone();
  }
  return (
    <main className="center">
      <section className="auth">
        <Logo />
        <h1>Set up your shop</h1>
        <p>Create a shop, or join using the invite code.</p>
        <form onSubmit={(e) => e.preventDefault()}>
          <label>
            Shop name
            <input name="shopName" autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="primary" onClick={create}>
            Create shop
          </button>
          <i>or</i>
          <label>
            Invite code
            <input name="inviteCode" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" className="secondary" onClick={join}>
            Join shop
          </button>
          {error && <small role="alert" aria-live="polite">{error}</small>}
        </form>
      </section>
    </main>
  );
}
function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty" role="status">
      <Box aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}

function StartDay({
  business,
  variants,
  done,
  saleDate,
}: {
  business: Business;
  variants: Variant[];
  done: () => void;
  saleDate: string;
}) {
  const [q, setQ] = useState<Record<number, number>>({}),
    [error, setError] = useState(""),
    [reviewing, setReviewing] = useState(false),
    [starting, setStarting] = useState(false),
    [expandedProducts, setExpandedProducts] = useState<Record<number, boolean>>(
      {},
    );
  const productGroups = useMemo(
    () => groupVariantsByProduct(variants),
    [variants],
  );
  const chosen = variants.filter((variant) => (q[variant.id] || 0) > 0);

  function reviewStart() {
    if (!chosen.length) return setError("Add at least one item.");
    setError("");
    setReviewing(true);
  }

  async function start() {
    if (!supabase || starting) return;
    if (!chosen.length) return setError("Add at least one item.");
    setStarting(true);
    setError("");
    try {
      const { error } = await supabase.rpc("start_selling_day", {
        p_business_id: business.id,
        p_sale_date: saleDate,
        p_items: chosen.map((item) => ({
          variant_id: item.id,
          quantity: q[item.id] || 0,
        })),
      });
      if (error) {
        setError(error.code === "23505"
          ? "This day has already been started. Reload the page to see its stock."
          : error.message);
        return;
      }
      done();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to start the day. Reload to check whether it saved before trying again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <section>
      <Heading
        label={saleDate === today() ? "Good morning" : displayDate(saleDate)}
        title="What did you bring?"
        text={saleDate === today() ? "Enter how many pieces or packs you brought." : "Enter the pieces or packs you brought on this date. Today's stock will not change."}
      />
      <div className="sell-groups start-groups">
        {productGroups.map((group, groupIndex) => {
          const isExpanded =
              expandedProducts[group.id] ?? groupIndex === 0,
            entered = group.variants.filter(
              (variant) => (q[variant.id] || 0) > 0,
            ).length,
            contentId = `start-product-${group.id}`;
          return (
            <section className="sell-product" key={group.id}>
              <button
                type="button"
                className="sell-product-head product-collapse"
                aria-expanded={isExpanded}
                aria-controls={contentId}
                onClick={() =>
                  setExpandedProducts((current) => ({
                    ...current,
                    [group.id]: !isExpanded,
                  }))
                }
              >
                <i aria-hidden="true">{group.name.slice(0, 1) || "P"}</i>
                <div>
                  <h2>{group.name}</h2>
                  <span>
                    {group.variants.length}{" "}
                    {group.variants.length === 1 ? "option" : "options"} ·{" "}
                    {entered ? `${entered} entered` : "None entered"}
                  </span>
                </div>
                <ChevronDown className="collapse-chevron" aria-hidden="true" />
              </button>
              {isExpanded && (
                <div className="sell-variants" id={contentId}>
                  {group.variants.map((v, index) => (
                    <article className="start-variant" key={v.id}>
                      <div className="sell-variant-copy">
                        <div className="sell-variant-title">
                          <b>{v.name}</b>
                          <span className="sell-kind">
                            {v.is_bundle ? "Pack" : "Piece"}
                          </span>
                        </div>
                        {v.is_bundle && (
                          <span className="recipe">{bundleContents(v)}</span>
                        )}
                        <small>
                          <strong>{php.format(v.default_price)}</strong>
                          <span> · {unitLabel(v)}</span>
                        </small>
                      </div>
                      <QuantityInput
                        value={q[v.id] || 0}
                        label={`${group.name} ${v.name}`}
                        isLast={index === group.variants.length - 1}
                        set={(n) => setQ((current) => ({ ...current, [v.id]: n }))}
                      />
                    </article>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
      {error && !reviewing && (
        <p className="error" role="alert" aria-live="polite">
          {error}
        </p>
      )}
      <button type="button" className="primary sticky" onClick={reviewStart}>
        Start selling
      </button>
      {reviewing && (
        <div className="backdrop">
          <div
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-stock-title"
          >
            <div className="sheethead review-stock-head">
              <div>
                <h2 id="review-stock-title">Review what you brought</h2>
                <p>Selling date: {displayDate(saleDate)}</p>
                <p>
                  {chosen.length} selected {chosen.length === 1 ? "option" : "options"}
                </p>
              </div>
              <button
                type="button"
                aria-label="Close stock review"
                disabled={starting}
                onClick={() => setReviewing(false)}
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="review-stock-list">
              {chosen.map((item) => {
                const quantity = q[item.id] || 0;
                return (
                  <div className="review-stock-row" key={item.id}>
                    <div>
                      <b>{item.products?.name}</b>
                      <span>
                        {item.name} · {unitLabel(item)}
                      </span>
                      {item.is_bundle && (
                        <span className="recipe">{bundleContents(item)}</span>
                      )}
                    </div>
                    <strong>
                      {item.package_quantity === 1
                        ? `${quantity} pcs`
                        : `${quantity} ${quantity === 1 ? "pack" : "packs"} · ${quantity * item.package_quantity} pcs`}
                    </strong>
                  </div>
                );
              })}
            </div>
            {error && (
              <p className="error" role="alert" aria-live="polite">
                {error}
              </p>
            )}
            <div className="review-stock-actions">
              <button
                type="button"
                className="secondary"
                disabled={starting}
                onClick={() => setReviewing(false)}
              >
                Go back
              </button>
              <button
                type="button"
                className="primary"
                disabled={starting}
                onClick={() => void start()}
              >
                {starting ? "Starting…" : "Confirm & start selling"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}function QuantityInput({
  value,
  label,
  isLast,
  set,
}: {
  value: number;
  label: string;
  isLast: boolean;
  set: (n: number) => void;
}) {
  function moveToNext(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const fields = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-start-quantity]"),
    );
    const next = fields[fields.indexOf(event.currentTarget) + 1];
    if (next) {
      next.focus();
      next.select();
    } else event.currentTarget.blur();
  }
  return (
    <label className="quantity-input">
      <span>Quantity</span>
      <div>
        <button
          type="button"
          aria-label={`Decrease ${label} quantity`}
          disabled={value === 0}
          onClick={() => set(Math.max(0, value - 1))}
        >
          <Minus aria-hidden="true" />
        </button>
        <input
          data-start-quantity
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint={isLast ? "done" : "next"}
          aria-label={`${label} quantity`}
          value={value}
          onFocus={(event) => event.currentTarget.select()}
          onKeyDown={moveToNext}
          onChange={(event) =>
            set(
              Math.min(
                999,
                Number(event.target.value.replace(/\D/g, "")) || 0,
              ),
            )
          }
        />
        <button
          type="button"
          aria-label={`Increase ${label} quantity`}
          disabled={value >= 999}
          onClick={() => set(Math.min(999, value + 1))}
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
    </label>
  );
}
function Stepper({ value, set }: { value: number; set: (n: number) => void }) {
  return (
    <div className="step">
      <button type="button" aria-label="Decrease quantity" onClick={() => set(Math.max(0, value - 1))}>
        <Minus aria-hidden="true" />
      </button>
      <span>{value}</span>
      <button type="button" aria-label="Increase quantity" onClick={() => set(value + 1)}>
        <Plus aria-hidden="true" />
      </button>
    </div>
  );
}
function Heading({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text: string;
}) {
  return (
    <header className="heading">
      <p className="eyebrow">{label}</p>
      <h1>{title}</h1>
      <span>{text}</span>
    </header>
  );
}

function Sell({
  business,
  userId,
  day,
  variants,
  offeringStock,
  stock,
  reload,
}: {
  business: Business;
  userId: string;
  day: Day;
  variants: Variant[];
  offeringStock: Record<number, number>;
  stock: Stock[];
  reload: () => void;
}) {
  const [cart, setCart] = useState<Record<number, Cart>>({}),
    [review, setReview] = useState(false),
    [saleTime, setSaleTime] = useState("12:00"),
    [name, setName] = useState(""),
    [customer, setCustomer] = useState<Customer | null>(null),
    [suggestions, setSuggestions] = useState<Customer[]>([]),
    [walkIn, setWalkIn] = useState(false),
    [payment, setPayment] = useState<"paid" | "unpaid" | "partial">("paid"),
    [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(""),
    [partialAmount, setPartialAmount] = useState(""),
    [editingPriceId, setEditingPriceId] = useState<number | null>(null),
    [saving, setSaving] = useState(false),
    [success, setSuccess] = useState(""),
    [error, setError] = useState("");
  const lines = Object.values(cart);
  const total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const productGroups = useMemo(
    () => groupVariantsByProduct(variants),
    [variants],
  );
  const stockByVariant = useMemo(
    () => new Map(stock.map((item) => [item.variant_id, item.brought_quantity])),
    [stock],
  );
  function reservedDemand(current: Record<number, Cart>) {
    const reserved = new Map<number, number>();
    for (const item of Object.values(current))
      for (const component of componentDemand(item.variant, item.quantity))
        reserved.set(
          component.component_variant_id,
          (reserved.get(component.component_variant_id) || 0) +
            component.quantity,
        );
    return reserved;
  }
  function availableFor(variant: Variant, current = cart) {
    const picked = current[variant.id]?.quantity || 0;
    const recipe = componentDemand(variant, 1);
    const reserved = reservedDemand(current);
    const componentAvailable = recipe.length
      ? Math.min(
          ...recipe.map((component) =>
            Math.floor(
              ((stockByVariant.get(component.component_variant_id) || 0) -
                (reserved.get(component.component_variant_id) || 0)) /
                component.quantity,
            ),
          ),
        )
      : 0;
    return Math.max(
      0,
      Math.min((offeringStock[variant.id] || 0) - picked, componentAvailable),
    );
  }  useEffect(() => {
    const t = setTimeout(async () => {
      if (!supabase || name.trim().length < 2 || customer)
        return setSuggestions([]);
      const { data } = await supabase
        .from("customers")
        .select("id,name")
        .eq("business_id", business.id)
        .ilike("normalized_name", name.trim().toLowerCase() + "%")
        .limit(5);
      setSuggestions((data || []) as Customer[]);
    }, 200);
    return () => clearTimeout(t);
  }, [name, customer, business.id]);
  function add(v: Variant) {
    setCart((current) => {
      const picked = current[v.id]?.quantity || 0;
      if (availableFor(v, current) < 1) return current;
      return {
        ...current,
        [v.id]: current[v.id]
          ? { ...current[v.id], quantity: picked + 1 }
          : {
              variant: v,
              quantity: 1,
              unitPrice: Number(v.default_price),
            },
      };
    });
  }
  function decrease(v: Variant) {
    setCart((current) => {
      const item = current[v.id];
      if (!item) return current;
      if (item.quantity <= 1) {
        const next = { ...current };
        delete next[v.id];
        return next;
      }
      return {
        ...current,
        [v.id]: { ...item, quantity: item.quantity - 1 },
      };
    });
  }
  async function save() {
    if (!supabase || saving) return;
    if (!lines.length) return setError("Add at least one item.");
    if (day.sale_date < today() && !/^([01]\d|2[0-3]):[0-5]\d$/.test(saleTime))
      return setError("Enter a valid sale time.");
    if (!walkIn && !name.trim()) return setError("Enter a customer name.");
    const enteredPartial = Number(partialAmount);
    if (payment === "partial" &&
      (!Number.isFinite(enteredPartial) || enteredPartial <= 0 || enteredPartial >= total))
      return setError("Enter an amount greater than ₱0 and less than the total.");
    if ((walkIn || payment === "paid" || payment === "partial") && !paymentMethod)
      return setError("Choose a payment method.");
    setSaving(true);
    setError("");
    try {
      const r = await supabase.from("sale_commands").insert({
        id: crypto.randomUUID(),
        business_id: business.id,
        selling_day_id: day.id,
        sale_time: day.sale_date < today() ? saleTime : null,
        customer_id: customer?.id || null,
        customer_name: walkIn ? null : name.trim(),
        is_walk_in: walkIn,
        payment_status: walkIn || payment === "paid" ? "paid" : "unpaid",
        payment_method:
          walkIn || payment === "paid" || payment === "partial"
            ? paymentMethod
            : null,
        amount_paid:
          walkIn || payment === "paid"
            ? total
            : payment === "partial"
              ? enteredPartial
              : 0,
        items: lines.map((l) => ({
          variant_id: l.variant.id,
          quantity: l.quantity,
          unit_price: l.unitPrice,
        })),
        created_by: userId,
      });
      if (r.error) setError(r.error.message);
      else {
        setCart({});
        setReview(false);
        setName("");
        setCustomer(null);
        setSuggestions([]);
        setWalkIn(false);
        setPayment("paid");
        setPaymentMethod("");
        setPartialAmount("");
        setEditingPriceId(null);
        setSuccess("Sale completed · " + php.format(total));
        window.setTimeout(() => setSuccess(""), 2800);
        await reload();
      }
    } catch {
      setError("The sale could not be completed. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <section>
      <Heading
        label={day.sale_date === today() ? "Today" : displayDate(day.sale_date)}
        title="New sale"
        text="Choose a product, then adjust its flavor or pack."
      />
      <div className="sell-groups">
        {productGroups.map((group) => (
          <section className="sell-product" key={group.id}>
            <header className="sell-product-head">
              <i aria-hidden="true">{group.name.slice(0, 1) || "P"}</i>
              <div>
                <h2>{group.name}</h2>
                <span>
                  {group.variants.length}{" "}
                  {group.variants.length === 1 ? "option" : "options"}
                </span>
              </div>
            </header>
            <div className="sell-variants">
              {group.variants.map((v) => {
                const picked = cart[v.id]?.quantity || 0,
                  remaining = availableFor(v),
                  label = group.name + " " + v.name;
                return (
                  <article
                    className={
                      "sell-variant" +
                      (picked ? " selected" : "") +
                      (!picked && !remaining ? " disabled" : "")
                    }
                    key={v.id}
                  >
                    <div className="sell-variant-copy">
                      <div className="sell-variant-title">
                        <b>{v.name}</b>
                        <span className="sell-kind">
                          {v.is_bundle ? "Pack" : "Piece"}
                        </span>
                      </div>
                      {v.is_bundle && (
                        <span className="recipe">{bundleContents(v)}</span>
                      )}
                      <small>
                        <strong>{php.format(v.default_price)}</strong>
                        <span className={remaining <= 2 ? "low-stock" : ""}> · {remaining === 0 ? "Sold out" : remaining <= 2 ? "Only " + stockLabel(remaining, v) + " left" : stockLabel(remaining, v) + " left"}</span>
                      </small>
                    </div>
                    <div
                      className="product-actions"
                      aria-label={label + " quantity"}
                    >
                      <button
                        type="button"
                        disabled={!picked}
                        onClick={() => decrease(v)}
                        aria-label={"Decrease " + label}
                      >
                        <Minus aria-hidden="true" />
                      </button>
                      <span>{picked}</span>
                      <button
                        type="button"
                        disabled={!remaining}
                        onClick={() => add(v)}
                        aria-label={"Add " + label}
                      >
                        <Plus aria-hidden="true" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      {lines.length > 0 && (
        <button type="button" className="cart" aria-label="Review sale" onClick={() => setReview(true)}>
          <span>{lines.reduce((s, l) => s + l.quantity, 0)} items</span>
          <b>Review · {php.format(total)}</b>
        </button>
      )}
      {success && (
        <div className="success-toast" role="status" aria-live="polite">
          <CheckCircle2 aria-hidden="true" /> {success}
        </div>
      )}
      {review && (
        <div className="backdrop">
          <div className="sheet review-sale" role="dialog" aria-modal="true" aria-labelledby="review-sale-title">
            <div className="sheethead review-sale-head">
              <div>
                <h2 id="review-sale-title">Review Sale</h2>
                <p>Selling date: {displayDate(day.sale_date)}</p>
                <p>{lines.reduce((sum, line) => sum + line.quantity, 0)} items · {php.format(total)}</p>
              </div>
              <button type="button" disabled={saving} aria-label="Close sale review" onClick={() => setReview(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            {day.sale_date < today() && (
              <label className="backdated-time">
                Sale time (Philippines)
                <input type="time" value={saleTime} required
                  onChange={(event) => setSaleTime(event.target.value)} />
                <small>Defaults to 12:00 noon. Change it if you know the time.</small>
              </label>
            )}
            <div className="review-sale-list">
              {lines.map((l) => (
                <article className="review-sale-row" key={l.variant.id}>
                  <div className="review-sale-copy">
                    <b>{l.variant.products?.name}</b>
                    <span>{l.variant.name} · {unitLabel(l.variant)}</span>
                    {l.variant.is_bundle && (
                      <span className="recipe">{bundleContents(l.variant)}</span>
                    )}
                    {editingPriceId === l.variant.id ? (
                      <label className="review-price-field">
                        Price each
                        <input
                          type="number"
                          name={`price-${l.variant.id}`}
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={l.unitPrice}
                          onChange={(e) =>
                            setCart((c) => ({
                              ...c,
                              [l.variant.id]: {
                                ...c[l.variant.id],
                                unitPrice: Number(e.target.value) || 0,
                              },
                            }))
                          }
                        />
                        <button type="button" onClick={() => setEditingPriceId(null)}>Done</button>
                      </label>
                    ) : (
                      <button
                        type="button"
                        className="review-price"
                        aria-label={`Edit price for ${l.variant.products?.name} ${l.variant.name}`}
                        onClick={() => setEditingPriceId(l.variant.id)}
                      >
                        {php.format(l.unitPrice)} each <Pencil aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <div className="review-sale-controls">
                    <strong>{php.format(l.quantity * l.unitPrice)}</strong>
                    <Stepper
                      value={l.quantity}
                      set={(n) =>
                        setCart((c) => {
                          if (!n) {
                            const next = { ...c };
                            delete next[l.variant.id];
                            return next;
                          }
                          const max =
                            (c[l.variant.id]?.quantity || 0) +
                            availableFor(l.variant, c);
                          return {
                            ...c,
                            [l.variant.id]: {
                              ...c[l.variant.id],
                              quantity: Math.min(max, n),
                            },
                          };
                        })
                      }
                    />
                  </div>
                </article>
              ))}
            </div>
            <div className="review-customer">
              <div className="review-section-head">
                <b>Customer</b>
                <label className="check compact-check">
                  <input
                    type="checkbox"
                    checked={walkIn}
                    onChange={(e) => {
                      setWalkIn(e.target.checked);
                      setError("");
                    }}
                  />
                  Walk-in
                </label>
              </div>
              {!walkIn && <label className="sr-only" htmlFor="review-customer-name">Customer name</label>}
              {!walkIn && <input
                id="review-customer-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setCustomer(null);
                  setError("");
                }}
                name="customerName"
                autoComplete="off"
                placeholder="Start typing a name…"
              />}
              {suggestions.length > 0 && <div className="review-suggestions">
                {suggestions.map((c) => (
                  <button
                    type="button"
                    className="suggestion"
                    key={c.id}
                    onClick={() => {
                      setCustomer(c);
                      setName(c.name);
                      setSuggestions([]);
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>}
            </div>
            {!walkIn && (
              <div className="segments payment-status-options" role="group" aria-label="Payment status">
                {([
                  ["paid", "Paid"],
                  ["partial", "Partial"],
                  ["unpaid", "Pay Later"],
                ] as const).map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    className={payment === value ? "active" : ""}
                    aria-pressed={payment === value}
                    onClick={() => {
                      setPayment(value);
                      setPartialAmount("");
                      if (value === "unpaid") setPaymentMethod("");
                      setError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {!walkIn && payment === "partial" && (
              <label className="partial-payment-field">
                <span>Amount received</span>
                <div>
                  <span aria-hidden="true">₱</span>
                  <input
                    type="number"
                    name="partialAmount"
                    inputMode="decimal"
                    min="0.01"
                    max={Math.max(0, total - 0.01)}
                    step="0.01"
                    value={partialAmount}
                    placeholder="0.00"
                    onChange={(event) => {
                      setPartialAmount(event.target.value);
                      setError("");
                    }}
                  />
                </div>
                <small>
                  Remaining: {php.format(Math.max(0, total - (Number(partialAmount) || 0)))}
                </small>
              </label>
            )}
            {(walkIn || payment === "paid" || payment === "partial") && (
              <div className="review-payment-method">
                <b>Payment method</b>
                <div className="segments payment-methods" role="group" aria-label="Payment method">
                  {([
                    ["cash", "Cash"],
                    ["gcash", "GCash"],
                    ["bank_transfer", "Bank transfer"],
                  ] as const).map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      className={paymentMethod === value ? "active" : ""}
                      aria-pressed={paymentMethod === value}
                      onClick={() => {
                        setPaymentMethod(value);
                        setError("");
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {!paymentMethod && <small>Choose one to complete the sale.</small>}
              </div>
            )}            {error && <p className="error" role="alert" aria-live="polite">{error}</p>}
            <button type="button" className="primary review-complete" disabled={saving || !lines.length} onClick={save}>
              {saving ? "Completing…" : `Complete Sale · ${php.format(total)}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
function StockPage({
  business,
  day,
  variants,
  stock,
  offeringStock,
  reload,
}: {
  business: Business;
  day: Day | null;
  variants: Variant[];
  stock: Stock[];
  offeringStock: Record<number, number>;
  reload: () => void;
}) {
  const [open, setOpen] = useState(false),
    [product, setProduct] = useState(""),
    [variant, setVariant] = useState(""),
    [price, setPrice] = useState(""),
    [todayQty, setTodayQty] = useState("0"),
    [packOpen, setPackOpen] = useState(false),
    [packProductId, setPackProductId] = useState(""),
    [packName, setPackName] = useState(""),
    [packPrice, setPackPrice] = useState(""),
    [packQty, setPackQty] = useState<Record<number, number>>({}),
    [addQty, setAddQty] = useState<Record<number, number>>({}),
    [addingToday, setAddingToday] = useState(false),
    [expandedAddToday, setExpandedAddToday] = useState<Record<number, boolean>>({}),
    [showProducts, setShowProducts] = useState(false),
    [catalog, setCatalog] = useState<Variant[]>([]),
    [editing, setEditing] = useState<Variant | null>(null),
    [editProduct, setEditProduct] = useState(""),
    [editVariant, setEditVariant] = useState(""),
    [editPrice, setEditPrice] = useState(""),
    [editPackQty, setEditPackQty] = useState<Record<number, number>>({}),
    [error, setError] = useState(""),
    [removingStock, setRemovingStock] = useState(false),
    [removeVariant, setRemoveVariant] = useState<Variant | null>(null),
    [removeQuantity, setRemoveQuantity] = useState("1"),
    [removeReason, setRemoveReason] = useState("returned_home"),
    [removeError, setRemoveError] = useState(""),
    [expandedInventory, setExpandedInventory] = useState<Record<number, boolean>>({});

  const missingToday = day ? variants : [];
  const missingTodayGroups = groupVariantsByProduct(missingToday);
  const selectedTodayCount = missingToday.filter(
    (item) => (addQty[item.id] || 0) > 0,
  ).length;
  const remainingByVariant = new Map(
    stock.map((item) => [item.variant_id, item.brought_quantity]),
  );
  const sellingRemaining = (item: Variant) => {
    const recipe = componentDemand(item, 1);
    return Math.max(0, Math.min(offeringStock[item.id] || 0,
      recipe.length ? Math.min(...recipe.map(component =>
        Math.floor((remainingByVariant.get(component.component_variant_id) || 0) / component.quantity))) : 0));
  };
  const inventoryGroups = groupVariantsByProduct(variants.filter(item => sellingRemaining(item) > 0));
  const activeCatalogCount = catalog.filter((item) => item.is_active).length;
  const catalogGroups = useMemo(
    () => groupVariantsByProduct(catalog),
    [catalog],
  );
  const activeBaseCatalog = catalog.filter(
    (item) => item.is_active && !item.is_bundle && item.package_quantity === 1,
  );
  const packComponents = activeBaseCatalog.filter(
    (item) => String(item.product_id) === packProductId,
  );
  const packTotal = packComponents.reduce(
    (sum, item) => sum + (packQty[item.id] || 0),
    0,
  );
  const catalogProducts = [
    ...new Map(
      catalog
        .filter((item) => item.products)
        .map((item) => [item.product_id, item.products as Product]),
    ).values(),
  ];
  const editComponents = editing
    ? activeBaseCatalog.filter((item) => item.product_id === editing.product_id)
    : [];
  const editTotal = editComponents.reduce(
    (sum, item) => sum + (editPackQty[item.id] || 0),
    0,
  );

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    const [variantsResult, componentsResult] = await Promise.all([
      supabase
        .from("product_variants")
        .select(
          "id,product_id,name,package_quantity,default_price,is_active,is_bundle,products(id,name)",
        )
        .eq("business_id", business.id)
        .order("is_active", { ascending: false })
        .order("name", { ascending: true }),
      supabase
        .from("variant_components")
        .select("bundle_variant_id,component_variant_id,quantity")
        .eq("business_id", business.id),
    ]);
    if (variantsResult.error) return setError(variantsResult.error.message);
    if (componentsResult.error) return setError(componentsResult.error.message);
    const items = (variantsResult.data || []) as unknown as Variant[];
    const rows = (componentsResult.data || []) as VariantComponent[];
    const byId = new Map(items.map((item) => [item.id, item]));
    setCatalog(
      items.map((item) => ({
        ...item,
        components: rows
          .filter((row) => row.bundle_variant_id === item.id)
          .map((row) => ({ ...row, component: byId.get(row.component_variant_id) })),
      })),
    );
  }, [business.id]);
  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  function refresh() {
    void loadCatalog();
    reload();
  }

  async function add() {
    if (!supabase) return;
    setError("");
    const productName = product.trim(),
      variantName = variant.trim();
    if (!productName || !variantName)
      return setError("Enter the product and flavor.");
    const parsedPackageQty = 1;
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0)
      return setError("Enter a valid price.");
    const parsedTodayQty = Number(todayQty);
    if (day && (!Number.isInteger(parsedTodayQty) || parsedTodayQty < 0))
      return setError("Enter a whole number for the selected day's quantity.");
    if (
      day &&
      parsedTodayQty > 0 &&
      !window.confirm(
        `Save ${productName} ${variantName} and add ${stockLabel(parsedTodayQty, { package_quantity: parsedPackageQty })} to ${displayDate(day.sale_date)}?`,
      )
    )
      return;
    let id: number;
    const found = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .ilike("name", productName)
      .maybeSingle();
    if (found.data) id = found.data.id;
    else {
      const p = await supabase
        .from("products")
        .insert({ business_id: business.id, name: productName })
        .select("id")
        .single();
      if (p.error) return setError(p.error.message);
      id = p.data.id;
    }
    const r = await supabase
      .from("product_variants")
      .insert({
        business_id: business.id,
        product_id: id,
        name: variantName,
        package_quantity: parsedPackageQty,
        default_price: parsedPrice,
      })
      .select("id")
      .single();
    if (r.error) return setError(r.error.message);
    if (day && parsedTodayQty > 0) {
      const stockResult = await supabase.from("daily_stock").insert({
        business_id: business.id,
        selling_day_id: day.id,
        variant_id: r.data.id,
        brought_quantity: parsedTodayQty,
      });
      if (stockResult.error) return setError(stockResult.error.message);
    }
    setOpen(false);
    setProduct("");
    setVariant("");
    setPrice("");
    setTodayQty("0");
    refresh();
  }

  async function addPack() {
    if (!supabase) return;
    setError("");
    const name = packName.trim(),
      productId = Number(packProductId),
      parsedPrice = Number(packPrice),
      selected = packComponents.filter((item) => (packQty[item.id] || 0) > 0);
    if (!productId || !name)
      return setError("Choose a product and name the pack.");
    if (!selected.length || packTotal < 2)
      return setError("Choose at least two pieces for this pack.");
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0)
      return setError("Enter a valid pack price.");
    const result = await supabase
      .from("product_variants")
      .insert({
        business_id: business.id,
        product_id: productId,
        name,
        package_quantity: packTotal,
        default_price: parsedPrice,
        is_bundle: true,
      })
      .select("id")
      .single();
    if (result.error) return setError(result.error.message);
    const componentsResult = await supabase
      .from("variant_components")
      .insert(
        selected.map((item) => ({
          business_id: business.id,
          bundle_variant_id: result.data.id,
          component_variant_id: item.id,
          quantity: packQty[item.id],
        })),
      );
    if (componentsResult.error) {
      await supabase
        .from("product_variants")
        .delete()
        .eq("id", result.data.id)
        .eq("business_id", business.id);
      return setError(componentsResult.error.message);
    }
    setPackOpen(false);
    setPackProductId("");
    setPackName("");
    setPackPrice("");
    setPackQty({});
    refresh();
  }
  async function addSelectedToToday() {
    if (!supabase || !day) return;
    setError("");
    const selected = missingToday.filter(
      (item) => (addQty[item.id] || 0) > 0,
    );
    if (!selected.length)
      return setError("Choose at least one quantity to add.");
    if (
      selected.some(
        (item) => item.is_bundle && !componentDemand(item, 1).length,
      )
    )
      return setError("One selected pack has no recipe yet.");
    const summary = selected
      .map(
        (item) =>
          (item.products?.name || "Product") +
          " " +
          item.name +
          ": " +
          addQty[item.id],
      )
      .join("\n");
    if (!window.confirm("Add these items to " + displayDate(day.sale_date) + "?\n\n" + summary)) return;

    setAddingToday(true);
    const componentTotals = new Map<number, number>();
    for (const item of selected)
      for (const component of componentDemand(item, addQty[item.id] || 0))
        componentTotals.set(
          component.component_variant_id,
          (componentTotals.get(component.component_variant_id) || 0) +
            component.quantity,
        );

    const rows = [...componentTotals].map(
      ([componentVariantId, quantity]) => {
        const existing = stock.find(
          (item) => item.variant_id === componentVariantId,
        );
        return {
          business_id: business.id,
          selling_day_id: day.id,
          variant_id: componentVariantId,
          brought_quantity:
            (existing?.initial_quantity ??
              existing?.brought_quantity ??
              0) + quantity,
        };
      },
    );
    const { error } = await supabase
      .from("daily_stock")
      .upsert(rows, { onConflict: "selling_day_id,variant_id" });
    if (error) {
      setAddingToday(false);
      return setError(error.message);
    }

    const existingOfferings = await supabase
      .from("selling_day_variants")
      .select("variant_id,brought_quantity")
      .eq("selling_day_id", day.id)
      .in(
        "variant_id",
        selected.map((item) => item.id),
      );
    if (existingOfferings.error) {
      setAddingToday(false);
      return setError(existingOfferings.error.message);
    }
    const currentOfferings = new Map(
      (existingOfferings.data || []).map((item) => [
        item.variant_id,
        item.brought_quantity,
      ]),
    );
    const offeringResult = await supabase.from("selling_day_variants").upsert(
      selected.map((item) => ({
        selling_day_id: day.id,
        variant_id: item.id,
        brought_quantity:
          Number(currentOfferings.get(item.id) || 0) +
          (addQty[item.id] || 0),
      })),
      { onConflict: "selling_day_id,variant_id" },
    );
    setAddingToday(false);
    if (offeringResult.error) return setError(offeringResult.error.message);
    setAddQty({});
    refresh();
  }
  async function removeFromToday(variant: Variant) {
    if (!supabase || !day || removingStock) return;
    setRemoveError("");
    const quantity = Number(removeQuantity);
    const remaining = sellingRemaining(variant);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > remaining)
      return setRemoveError("Enter a whole number from 1 to " + remaining + ".");
    const label = `${variant.products?.name || "Product"} ${variant.name}`;
    const reasons: Record<string, string> = {
      returned_home: "returned home", damaged: "damaged", giveaway: "given away",
      correction: "a mistake / correction",
    };
    if (!reasons[removeReason]) return setRemoveError("Choose a removal reason.");
    if (
      !window.confirm(
        `Remove ${stockLabel(quantity, variant)} of ${label} as ${reasons[removeReason]}?\n\n${stockLabel(remaining - quantity, variant)} will remain.`,
      )
    )
      return;
    setRemovingStock(true);
    try {
      const { error } = await supabase.rpc("remove_prepared_stock", {
        p_selling_day_id: day.id, p_variant_id: variant.id,
        p_quantity: quantity, p_kind: removeReason,
      });
      if (error) setRemoveError(error.message);
      else {
        setRemoveVariant(null);
        refresh();
      }
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : "Unable to remove stock. Refresh and try again.");
    } finally {
      setRemovingStock(false);
    }
  }

  async function setVariantActive(variant: Variant, active: boolean) {
    if (!supabase) return;
    setError("");
    const label = `${variant.products?.name || "Product"} ${variant.name}`;
    if (
      !window.confirm(
        active
          ? `Make ${label} active again? It will show in Sell and Stock.`
          : `Make ${label} inactive? It will be hidden from Sell, but reports stay intact.`,
      )
    )
      return;
    const { error } = await supabase
      .from("product_variants")
      .update({ is_active: active })
      .eq("id", variant.id)
      .eq("business_id", business.id);
    if (error) setError(error.message);
    else {
      setEditing(null);
      refresh();
    }
  }

  async function archiveVariant(variant: Variant, remaining = 0) {
    if (!supabase) return;
    setError("");
    const label = `${variant.products?.name || "Product"} ${variant.name}`;
    if (
      !window.confirm(
        `Remove ${label} from the product list? Existing sales stay in reports.`,
      )
    )
      return;
    const { error } = await supabase
      .from("product_variants")
      .update({ is_active: false })
      .eq("id", variant.id)
      .eq("business_id", business.id);
    if (error) return setError(error.message);
    if (day && remaining > 0) {
      const { error: stockError } = await supabase
        .from("stock_adjustments")
        .insert({
          business_id: business.id,
          selling_day_id: day.id,
          variant_id: variant.id,
          kind: "returned_home",
          quantity_delta: -remaining,
          note: "Removed product from list",
        });
      if (stockError) return setError(stockError.message);
    }
    setEditing(null);
    refresh();
  }

  async function deleteVariant(variant: Variant) {
    if (!supabase) return;
    setError("");
    const label = `${variant.products?.name || "Product"} ${variant.name}`;
    if (
      !window.confirm(
        `Permanently delete ${label}? This only works if it has no stock or sales history. Use Inactive for old products.`,
      )
    )
      return;
    const { error } = await supabase
      .from("product_variants")
      .delete()
      .eq("id", variant.id)
      .eq("business_id", business.id);
    if (error)
      setError(`${error.message}. If this item has history, make it inactive instead.`);
    else {
      setEditing(null);
      refresh();
    }
  }

  function startEdit(item: Variant) {
    setEditing(item);
    setEditProduct(item.products?.name || "");
    setEditVariant(item.name);
    setEditPrice(String(item.default_price));
    setEditPackQty(
      Object.fromEntries(
        (item.components || []).map((component) => [
          component.component_variant_id,
          component.quantity,
        ]),
      ),
    );
    setError("");
  }

  async function saveEdit() {
    if (!supabase || !editing) return;
    setError("");
    const productName = editProduct.trim(),
      variantName = editVariant.trim(),
      parsedPackageQty = editing.is_bundle ? editTotal : 1,
      parsedPrice = Number(editPrice),
      selectedComponents = editComponents.filter(
        (item) => (editPackQty[item.id] || 0) > 0,
      );
    if (!productName || !variantName)
      return setError("Enter the product and pack or flavor name.");
    if (editing.is_bundle && (!selectedComponents.length || editTotal < 2))
      return setError("Choose at least two pieces for this pack.");
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0)
      return setError("Enter a valid price.");
    const productResult = await supabase
      .from("products")
      .update({ name: productName })
      .eq("id", editing.product_id)
      .eq("business_id", business.id);
    if (productResult.error) return setError(productResult.error.message);
    const variantResult = await supabase
      .from("product_variants")
      .update({
        name: variantName,
        package_quantity: parsedPackageQty,
        default_price: parsedPrice,
      })
      .eq("id", editing.id)
      .eq("business_id", business.id);
    if (variantResult.error) return setError(variantResult.error.message);
    if (editing.is_bundle) {
      const deleteResult = await supabase
        .from("variant_components")
        .delete()
        .eq("business_id", business.id)
        .eq("bundle_variant_id", editing.id);
      if (deleteResult.error) return setError(deleteResult.error.message);
      const componentResult = await supabase
        .from("variant_components")
        .insert(
          selectedComponents.map((item) => ({
            business_id: business.id,
            bundle_variant_id: editing.id,
            component_variant_id: item.id,
            quantity: editPackQty[item.id],
          })),
        );
      if (componentResult.error) return setError(componentResult.error.message);
    }
    setEditing(null);
    setEditPackQty({});
    refresh();
  }
  return (
    <section>
      <div className="heading split">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>{showProducts ? "Product list" : day && day.sale_date !== today() ? "Stock · " + displayDate(day.sale_date) : "Daily stock"}</h1>
          <span>
            {showProducts
              ? `${activeCatalogCount} active · ${catalog.length - activeCatalogCount} inactive`
              : day
                ? "Ready to sell · remaining pieces and packs."
                : "Products still available."}
          </span>
        </div>
        <div className="heading-actions">
          <button className="secondary compact" onClick={() => setShowProducts((value) => !value)}>
            {showProducts ? "Stock" : "Products"}
          </button>
          {showProducts && (
            <button className="secondary compact" onClick={() => setPackOpen(true)}>
              Add pack
            </button>
          )}
          <button type="button" className="icon" aria-label="Add product" onClick={() => setOpen(true)}>
            <PackagePlus aria-hidden="true" />
          </button>
        </div>
      </div>
      {error && <p className="error page-error" role="alert" aria-live="polite">{error}</p>}
      {!showProducts && (
        <>
      {inventoryGroups.length ? (
        <div className="sell-groups">
          {inventoryGroups.map((group, index) => {
            const expanded = expandedInventory[group.id] ?? index === 0;
            return <div className="sell-product" key={group.id}>
              <button type="button" className="sell-product-head product-collapse"
                aria-expanded={expanded} aria-controls={"inventory-" + group.id}
                onClick={() => setExpandedInventory(current => ({ ...current, [group.id]: !expanded }))}>
                <i aria-hidden="true">{group.name.slice(0, 1)}</i>
                <div><h2>{group.name}</h2><span>{group.variants.length} selling options</span></div>
                <ChevronDown aria-hidden="true" />
              </button>
              {expanded && <div id={"inventory-" + group.id}>
              {group.variants.map(variant => (
              <div className="row" key={variant.id}>
                <div>
                  <b>{variant.name}</b>
                  <span>
                    {unitLabel(variant)} · {php.format(variant.default_price)}
                  </span>
                  {variant.is_bundle && <small>{bundleContents(variant)}</small>}
                </div>
                <div className="stock-actions">
                  <strong>{sellingRemaining(variant)} {variant.package_quantity === 1 ? "pcs" : "packs"} left</strong>
                  <button
                    className="secondary danger compact"
                    disabled={!day || removingStock}
                    onClick={() => {
                      setRemoveVariant(variant);
                      setRemoveQuantity("1");
                      setRemoveReason("returned_home");
                      setRemoveError("");
                    }}
                  >
                    Remove from day
                  </button>
                </div>
              </div>
              ))}
              </div>}
            </div>;
          })}
        </div>
      ) : (
        <Empty
          title="No stock yet"
          text={
            day
              ? "Add an item to this day's stock."
              : "Add products, then start the selected date from Sell."
          }
          action={
            <button className="secondary" onClick={() => setOpen(true)}>
              Add product
            </button>
          }
        />
      )}
      {day && missingToday.length > 0 && (
        <section className="block add-today">
          <Heading
            label="Forgot something?"
            title={day.sale_date === today() ? "Add to today" : "Add to " + displayDate(day.sale_date)}
            text="Set quantities, then add everything once."
          />
          <div className="sell-groups start-groups">
            {missingTodayGroups.map((group, groupIndex) => {
              const isExpanded =
                  expandedAddToday[group.id] ?? groupIndex === 0,
                entered = group.variants.filter(
                  (variant) => (addQty[variant.id] || 0) > 0,
                ).length,
                contentId = "add-today-product-" + group.id;
              return (
                <section className="sell-product" key={group.id}>
                  <button
                    type="button"
                    className="sell-product-head product-collapse"
                    aria-expanded={isExpanded}
                    aria-controls={contentId}
                    onClick={() =>
                      setExpandedAddToday((current) => ({
                        ...current,
                        [group.id]: !isExpanded,
                      }))
                    }
                  >
                    <i aria-hidden="true">
                      {group.name.slice(0, 1) || "P"}
                    </i>
                    <div>
                      <h2>{group.name}</h2>
                      <span>
                        {group.variants.length} options {" / "}
                        {entered || "None"} entered
                      </span>
                    </div>
                    <ChevronDown
                      className="collapse-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {isExpanded && (
                    <div className="sell-variants" id={contentId}>
                      {group.variants.map((v) => (
                        <article className="start-variant" key={v.id}>
                          <div className="sell-variant-copy">
                            <div className="sell-variant-title">
                              <b>{v.name}</b>
                              <span className="sell-kind">
                                {v.is_bundle ? "Pack" : "Piece"}
                              </span>
                            </div>
                            {v.is_bundle && (
                              <span className="recipe">
                                {bundleContents(v)}
                              </span>
                            )}
                            <small>
                              <strong>{php.format(v.default_price)}</strong>
                              <span> / {unitLabel(v)}</span>
                            </small>
                          </div>
                          <div className="quantity-input">
                            <span>Quantity</span>
                            <Stepper
                              value={addQty[v.id] || 0}
                              set={(n) =>
                                setAddQty((current) => ({
                                  ...current,
                                  [v.id]: n,
                                }))
                              }
                            />
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
            <button
              className="primary add-today-submit"
              disabled={!selectedTodayCount || addingToday}
              onClick={() => void addSelectedToToday()}
            >
              {addingToday
                ? "Adding…"
                : selectedTodayCount
                  ? "Add " + selectedTodayCount + " selected to this day"
                  : "Choose quantities to add"}
            </button>
          </div>
        </section>
      )}
        </>
      )}      {showProducts && (
      <section className="block product-manager">
        {catalog.length ? (
          <div className="sell-groups product-list-groups">
            {catalogGroups.map((group) => (
              <section className="sell-product" key={group.id}>
                <header className="sell-product-head">
                  <i aria-hidden="true">{group.name.slice(0, 1) || "P"}</i>
                  <div>
                    <h2>{group.name}</h2>
                    <span>
                      {group.variants.length}{" "}
                      {group.variants.length === 1 ? "option" : "options"}
                    </span>
                  </div>
                </header>
                <div className="sell-variants">
                  {group.variants.map((item) => {
                    const remaining = remainingByVariant.get(item.id) || 0;
                    return (
                      <article className="product-list-variant" key={item.id}>
                        <div className="sell-variant-copy">
                          <div className="sell-variant-title">
                            <b>{item.name}</b>
                            <span className="sell-kind">
                              {item.is_bundle ? "Pack" : "Piece"}
                            </span>
                          </div>
                          {item.is_bundle && (
                            <span className="recipe">{bundleContents(item)}</span>
                          )}
                          <small>
                            <strong>{php.format(item.default_price)}</strong>
                            <span> · {unitLabel(item)}</span>
                          </small>
                          <span
                            className={item.is_active ? "status active" : "status"}
                          >
                            {item.is_active ? "Active" : "Inactive"}
                            {remaining > 0
                              ? ` · ${stockLabel(remaining, item)} left on this date`
                              : ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="product-action-icon"
                          aria-label={`Edit ${group.name} ${item.name}`}
                          title="Edit"
                          onClick={() => startEdit(item)}
                        >
                          <Pencil aria-hidden="true" />
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>        ) : (
          <Empty
            title="No products yet"
            text="Add products here before selling."
            action={
              <button className="secondary" onClick={() => setOpen(true)}>
                Add product
              </button>
            }
          />
        )}
      </section>
      )}
      {removeVariant && (
        <div className="backdrop">
          <form className="sheet" role="dialog" aria-modal="true" aria-labelledby="remove-stock-title"
            onSubmit={event => { event.preventDefault(); void removeFromToday(removeVariant); }}>
            <div className="sheethead">
              <h2 id="remove-stock-title">Remove stock</h2>
              <button type="button" disabled={removingStock} aria-label="Cancel stock removal"
                onClick={() => setRemoveVariant(null)}><X aria-hidden="true" /></button>
            </div>
            <p>{removeVariant.products?.name} · {removeVariant.name} · {unitLabel(removeVariant)}</p>
            <p>{stockLabel(sellingRemaining(removeVariant), removeVariant)} available</p>
            <label>
              How many {removeVariant.package_quantity === 1 ? "pieces" : "packs"}?
              <input type="number" inputMode="numeric" min="1" step="1"
                max={sellingRemaining(removeVariant)} required value={removeQuantity}
                disabled={removingStock} onChange={event => setRemoveQuantity(event.target.value)} />
            </label>
            <label>
              Reason
              <select value={removeReason} disabled={removingStock}
                onChange={event => setRemoveReason(event.target.value)}>
                <option value="returned_home">Returned home</option>
                <option value="damaged">Damaged</option>
                <option value="giveaway">Given away / free</option>
                <option value="correction">Mistake / correction</option>
              </select>
            </label>
            {Number.isInteger(Number(removeQuantity)) && Number(removeQuantity) >= 1 &&
              Number(removeQuantity) <= sellingRemaining(removeVariant) && (
                <p>{stockLabel(sellingRemaining(removeVariant) - Number(removeQuantity), removeVariant)} will remain.</p>
              )}
            {removeError && <p className="error" role="alert">{removeError}</p>}
            <button type="submit" className="primary" disabled={removingStock}>
              {removingStock ? "Removing…" : "Review removal"}
            </button>
          </form>
        </div>
      )}
      {packOpen && (
        <div className="backdrop">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-pack-title">
            <div className="sheethead">
              <h2 id="add-pack-title">Add selling pack</h2>
              <button type="button" aria-label="Close add pack" onClick={() => setPackOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <p className="sheet-note">
              Define the contents once. Stock will be shared across pieces and packs.
            </p>
            <label>
              Product
              <select
                name="packProduct"
                autoComplete="off"
                value={packProductId}
                onChange={(e) => {
                  setPackProductId(e.target.value);
                  setPackQty({});
                }}
              >
                <option value="">Choose a product</option>
                {catalogProducts.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pack name
              <input
                name="packName"
                autoComplete="off"
                value={packName}
                onChange={(e) => setPackName(e.target.value)}
                placeholder="Mixed 6 pcs"
              />
            </label>
            {packProductId && (
              <div className="pack-components">
                <span className="field-hint">Pieces in this pack</span>
                {packComponents.length ? (
                  packComponents.map((item) => (
                    <div className="row pack-component" key={item.id}>
                      <div>
                        <b>{item.name}</b>
                        <span>How many pieces?</span>
                      </div>
                      <Stepper
                        value={packQty[item.id] || 0}
                        set={(n) =>
                          setPackQty((current) => ({
                            ...current,
                            [item.id]: n,
                          }))
                        }
                      />
                    </div>
                  ))
                ) : (
                  <p className="helper">Add a flavor to this product first.</p>
                )}
                <p className="pack-total">
                  Total: <b>{packTotal} pcs</b>
                </p>
              </div>
            )}
            <label>
              Pack price
              <input
                inputMode="decimal"
                name="packPrice"
                value={packPrice}
                onChange={(e) => setPackPrice(e.target.value)}
                placeholder="₱ 90.00"
              />
            </label>
            <button className="primary" onClick={addPack}>
              Save selling pack
            </button>
          </div>
        </div>
      )}
      {open && (
        <div className="backdrop">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-product-title">
            <div className="sheethead">
              <h2 id="add-product-title">Add product</h2>
              <button type="button" aria-label="Close add product" onClick={() => setOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <label>
              Product
              <input
                name="productName"
                autoComplete="off"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Cookies…"
              />
            </label>
            <label>
              Flavor or variant
              <input
                name="variantName"
                autoComplete="off"
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                placeholder="Chocolate chip…"
              />
            </label>
            <label>
              Price per selling unit
              <input
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="₱ 0.00"
              />
            </label>
            {day && (
              <label>
                Quantity for selected date
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  name="todayQuantity"
                  value={todayQty}
                  onChange={(e) => setTodayQty(e.target.value)}
                  placeholder="0"
                />
              </label>
            )}
            <button className="primary" onClick={add}>
              Save product
            </button>
          </div>
        </div>
      )}
      {editing && (
        <div className="backdrop">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="edit-product-title">
            <div className="sheethead">
              <h2 id="edit-product-title">Edit product</h2>
              <button type="button" aria-label="Close edit product" onClick={() => setEditing(null)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <label>
              Product
              <input
                name="editProduct"
                autoComplete="off"
                value={editProduct}
                onChange={(e) => setEditProduct(e.target.value)}
                placeholder="Cookies…"
              />
            </label>
            <label>
              Flavor or variant
              <input
                name="editVariant"
                autoComplete="off"
                value={editVariant}
                onChange={(e) => setEditVariant(e.target.value)}
                placeholder="Chocolate chip…"
              />
            </label>
            {editing.is_bundle && (
              <div className="pack-components">
                <span className="field-hint">Pieces in this pack</span>
                {editComponents.map((item) => (
                  <div className="row pack-component" key={item.id}>
                    <div>
                      <b>{item.name}</b>
                      <span>How many pieces?</span>
                    </div>
                    <Stepper
                      value={editPackQty[item.id] || 0}
                      set={(n) =>
                        setEditPackQty((current) => ({
                          ...current,
                          [item.id]: n,
                        }))
                      }
                    />
                  </div>
                ))}
                <p className="pack-total">
                  Total: <b>{editTotal} pcs</b>
                </p>
              </div>
            )}
            <label>
              Price per selling unit
              <input
                inputMode="decimal"
                name="editPrice"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="₱ 0.00"
              />
            </label>
            <button className="primary" onClick={saveEdit}>
              Save changes
            </button>
            <div className="edit-management">
              <div>
                <b>Product status</b>
                <p>Inactive products are hidden from Sell but stay in reports.</p>
              </div>
              {editing.is_active ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void archiveVariant(
                      editing,
                      remainingByVariant.get(editing.id) || 0,
                    )
                  }
                >
                  <EyeOff aria-hidden="true" />
                  Make inactive
                </button>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => void setVariantActive(editing, true)}
                >
                  <Eye aria-hidden="true" />
                  Activate product
                </button>
              )}
              <button
                type="button"
                className="secondary danger"
                onClick={() => void deleteVariant(editing)}
              >
                <Trash2 aria-hidden="true" />
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function CustomerMerge({ business }: { business: Business }) {
  const [customers, setCustomers] = useState<Customer[]>([]),
    [sourceId, setSourceId] = useState(""),
    [targetId, setTargetId] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const loadCustomers = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("customers")
      .select("id,name")
      .eq("business_id", business.id)
      .order("name");
    setCustomers((data || []) as Customer[]);
  }, [business.id]);
  useEffect(() => { void loadCustomers(); }, [loadCustomers]);
  async function merge() {
    if (!supabase || !sourceId || !targetId || busy) return;
    const source = customers.find((item) => item.id === Number(sourceId));
    const target = customers.find((item) => item.id === Number(targetId));
    if (!source || !target || source.id === target.id)
      return setMessage("Choose two different customers.");
    if (!window.confirm("Merge " + source.name + " into " + target.name + "? All sales and balances will use " + target.name + "."))
      return;
    setBusy(true);
    setMessage("");
    const { error } = await supabase.rpc("merge_customers", {
      p_source_customer_id: source.id,
      p_target_customer_id: target.id,
    });
    if (error) setMessage(error.message);
    else {
      setMessage("Customers merged.");
      setSourceId("");
      setTargetId("");
      await loadCustomers();
    }
    setBusy(false);
  }
  return (
    <div className="settings-tool">
      <div><Users aria-hidden="true" /><span><b>Merge duplicate customers</b><p>Move purchase history and balances into one name.</p></span></div>
      {customers.length < 2 ? <small>Add at least 2 customers to use this.</small> : (
        <>
          <label>Duplicate name<select value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">Choose…</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label>Keep this name<select value={targetId} onChange={(event) => setTargetId(event.target.value)}><option value="">Choose…</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <button type="button" className="secondary" disabled={busy || !sourceId || !targetId} onClick={() => void merge()}>{busy ? "Merging…" : "Merge customers"}</button>
        </>
      )}
      {message && <small role="status" aria-live="polite">{message}</small>}
    </div>
  );
}
function Reports({ business, userId, initialDate }: { business: Business; userId: string; initialDate: string }) {
  const reportRequests = useRef({ version: 0 });
  const [view, setView] = useState<"daily" | "outstanding">("daily"),
    [period, setPeriod] = useState<"day" | "week" | "month">("day"),
    [selectedDate, setSelectedDate] = useState(initialDate),
    [sales, setSales] = useState<Sale[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [expandedCustomer, setExpandedCustomer] = useState<string | null>(null),
    [loadingReports, setLoadingReports] = useState(true),
    [paying, setPaying] = useState(false),
    [balancePaymentMethod, setBalancePaymentMethod] =
      useState<PaymentMethod>(""),
    [reportError, setReportError] = useState("");
  const fullDate = useMemo(
    () =>
      new Intl.DateTimeFormat("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
      }).format(new Date(selectedDate + "T12:00:00+08:00")),
    [selectedDate],
  );
  const dateRange = useMemo(() => {
    const anchor = new Date(selectedDate + "T12:00:00+08:00");
    let start = selectedDate;
    let end = selectedDate;
    if (period === "week") {
      const mondayOffset = (anchor.getDay() + 6) % 7;
      const monday = new Date(anchor);
      monday.setDate(anchor.getDate() - mondayOffset);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      start = monday.toISOString().slice(0, 10);
      end = sunday.toISOString().slice(0, 10);
    } else if (period === "month") {
      start = selectedDate.slice(0, 7) + "-01";
      const monthEnd = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
      end = monthEnd.toISOString().slice(0, 10);
    }
    return { start, end };
  }, [period, selectedDate]);
  const load = useCallback(async () => {
    if (!supabase) return;
    const request = ++reportRequests.current.version;
    setLoadingReports(true);
    setReportError("");
    setSales([]);
    try {
    let query = supabase
      .from("sales")
      .select(
        "id,customer_id,customer_name,total,payment_status,payment_method,amount_paid,sold_at,voided_at,void_reason,sale_items(id,product_name,variant_name,quantity,unit_price,line_total)",
      )
            .eq("business_id", business.id)
      .is("voided_at", null)
      .order("sold_at", { ascending: false });
    if (view === "daily") {
      query = query
        .gte("sold_at", dateRange.start + "T00:00:00+08:00")
        .lte("sold_at", dateRange.end + "T23:59:59.999+08:00");
    } else {
      query = query.eq("payment_status", "unpaid");
    }
    const { data, error } = await query;
    if (request !== reportRequests.current.version) return;
    if (error) setReportError(error.message);
    setSales((data || []) as Sale[]);
    setLoadingReports(false);
    } catch (error) {
      if (request !== reportRequests.current.version) return;
      setReportError(error instanceof Error ? error.message : "Unable to load reports. Please try again.");
      setLoadingReports(false);
    }
  }, [business.id, dateRange, view]);
  useEffect(() => {
    const requests = reportRequests.current;
    setSelected([]);
    setExpandedCustomer(null);
    void load();
    return () => { ++requests.version; };
  }, [load]);
  const total = useMemo(
    () =>
      sales.reduce(
        (sum, sale) =>
          sum + (view === "outstanding" ? balanceDue(sale) : Number(sale.total)),
        0,
      ),
    [sales, view],
  );
  const selectedTotal = useMemo(
    () =>
      sales
        .filter((sale) => selected.includes(sale.id))
        .reduce((sum, sale) => sum + balanceDue(sale), 0),
    [sales, selected],
  );
  const paidTotal = sales.reduce(
    (sum, sale) => sum + Number(sale.amount_paid),
    0,
  );
  const unpaidTotal = sales.reduce(
    (sum, sale) => sum + balanceDue(sale),
    0,
  );  const bestSellers = useMemo(() => {
    const items = new Map<string, { name: string; quantity: number; total: number }>();
    for (const sale of sales)
      for (const item of sale.sale_items || []) {
        const key = item.product_name + "|" + item.variant_name;
        const current = items.get(key) || {
          name: item.product_name + " · " + item.variant_name,
          quantity: 0,
          total: 0,
        };
        current.quantity += item.quantity;
        current.total += Number(item.line_total);
        items.set(key, current);
      }
    return [...items.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 3);
  }, [sales]);
  function exportCsv() {
    const rows = [["Date", "Customer", "Payment status", "Payment method", "Amount paid", "Balance", "Product", "Variant", "Quantity", "Unit Price", "Total"]];
    const groupedSales = new Map<string, Sale[]>();
    for (const sale of sales) {
      const key = sale.customer_id
        ? "id:" + sale.customer_id
        : "name:" + (sale.customer_name || "Unnamed customer").trim().toLocaleLowerCase();
      groupedSales.set(key, [...(groupedSales.get(key) || []), sale]);
    }
    const customerGroups = [...groupedSales.values()].sort((a, b) =>
      (a[0]?.customer_name || "Unnamed customer").localeCompare(
        b[0]?.customer_name || "Unnamed customer",
      ),
    );
    for (const customerSales of customerGroups) {
      let showCustomer = true;
      let customerTotal = 0;
      for (const sale of [...customerSales].sort(
        (a, b) => new Date(a.sold_at).getTime() - new Date(b.sold_at).getTime(),
      )) {
        for (const item of sale.sale_items || []) {
          rows.push([
            new Date(sale.sold_at).toLocaleDateString("en-PH"),
            showCustomer ? sale.customer_name || "Unnamed customer" : "",
            salePaymentLabel(sale),
            paymentMethodLabel(sale.payment_method),
            String(sale.amount_paid),
            String(balanceDue(sale)),
            item.product_name,
            item.variant_name,
            String(item.quantity),
            String(item.unit_price),
            String(item.line_total),
          ]);
          customerTotal += Number(item.line_total);
          showCustomer = false;
        }
      }
      rows.push(["", "", "", "", "", "", "Customer total", "", "", "", String(customerTotal)]);
    }
    const csv = rows.map((row) => row.map((value) => '"' + String(value).replace(/"/g, '""') + '"').join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "biztally-report-" + selectedDate + ".csv";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function downloadPdf() {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 12;
    const contentWidth = pageWidth - margin * 2;
    let y = 14;
    const money = (value: number) =>
      "PHP " + Number(value).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const addPageIfNeeded = (height: number) => {
      if (y + height <= pageHeight - 12) return;
      pdf.addPage();
      y = 14;
    };

    pdf.setFillColor(255, 240, 247);
    pdf.roundedRect(margin, y, contentWidth, 22, 3, 3, "F");
    pdf.setTextColor(173, 45, 101);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(15);
    pdf.text("BizTally Sales Report", margin + 5, y + 8);
    pdf.setTextColor(80, 60, 70);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(fullDate, margin + 5, y + 15);
    pdf.text(
      money(sales.reduce((sum, sale) => sum + Number(sale.total), 0)),
      pageWidth - margin - 5,
      y + 12,
      { align: "right" },
    );
    y += 27;

    const groupedSales = new Map<string, Sale[]>();
    for (const sale of sales) {
      const key = sale.customer_id
        ? "id:" + sale.customer_id
        : "name:" + (sale.customer_name || "Unnamed customer").trim().toLocaleLowerCase();
      groupedSales.set(key, [...(groupedSales.get(key) || []), sale]);
    }
    const groups = [...groupedSales.values()].sort((a, b) =>
      (a[0]?.customer_name || "Unnamed customer").localeCompare(
        b[0]?.customer_name || "Unnamed customer",
      ),
    );

    for (const customerSales of groups) {
      const sortedSales = [...customerSales].sort(
        (a, b) => new Date(a.sold_at).getTime() - new Date(b.sold_at).getTime(),
      );
      const customerTotal = sortedSales.reduce(
        (sum, sale) => sum + Number(sale.total),
        0,
      );
      addPageIfNeeded(18);
      pdf.setFillColor(250, 245, 248);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, "F");
      pdf.setTextColor(35, 25, 30);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(11);
      pdf.text(
        customerSales[0]?.customer_name || "Unnamed customer",
        margin + 4,
        y + 6.5,
      );
      pdf.setTextColor(173, 45, 101);
      pdf.text(money(customerTotal), pageWidth - margin - 4, y + 6.5, {
        align: "right",
      });
      y += 13;

      for (const sale of sortedSales) {
        const items = sale.sale_items || [];
        addPageIfNeeded(9 + items.length * 6);
        const time = new Intl.DateTimeFormat("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: "Asia/Manila",
        }).format(new Date(sale.sold_at));
        pdf.setTextColor(95, 75, 85);
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(8.5);
        const methodLabel = paymentMethodLabel(sale.payment_method);
        const timeLabel = time + (methodLabel ? "  ·  " + methodLabel : "") + "  |";
        const statusLabel = salePaymentLabel(sale);
        const statusX = margin + 5 + pdf.getTextWidth(timeLabel);
        pdf.text(timeLabel, margin + 3, y);
        if (sale.payment_status === "paid") {
          pdf.setFillColor(226, 247, 235);
          pdf.setTextColor(30, 122, 74);
        } else {
          pdf.setFillColor(255, 232, 240);
          pdf.setTextColor(183, 48, 99);
        }
        pdf.roundedRect(
          statusX - 1.2,
          y - 3.5,
          pdf.getTextWidth(statusLabel) + 3.2,
          4.8,
          1.4,
          1.4,
          "F",
        );
        pdf.text(statusLabel, statusX + 0.4, y);
        pdf.setTextColor(95, 75, 85);
        pdf.text(money(sale.total), pageWidth - margin - 3, y, {
          align: "right",
        });
        y += 5;
        pdf.setFont("helvetica", "normal");
        pdf.setFontSize(8.5);
        for (const item of items) {
          const description =
            item.product_name + " - " + item.variant_name + "  x" + item.quantity;
          pdf.setTextColor(45, 40, 42);
          pdf.text(description, margin + 6, y, {
            maxWidth: contentWidth - 45,
          });
          pdf.text(money(item.line_total), pageWidth - margin - 3, y, {
            align: "right",
          });
          y += 5.5;
        }
        y += 2;
      }
      y += 2;
    }

    const pageCount = pdf.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(7.5);
      pdf.setTextColor(135, 120, 128);
      pdf.text(
        "BizTally  |  Page " + page + " of " + pageCount,
        pageWidth / 2,
        pageHeight - 6,
        { align: "center" },
      );
    }
    pdf.save("biztally-report-" + selectedDate + ".pdf");
  }
  async function voidSale(sale: Sale) {
    if (!supabase) return;
    const reason = window.prompt("Why are you voiding this sale?", "Entry mistake");
    if (reason === null) return;
    if (!window.confirm("Void " + php.format(sale.total) + " sale for " + sale.customer_name + "? Stock and balances will be corrected."))
      return;
    const { error } = await supabase.rpc("void_sale", { p_sale_id: sale.id, p_reason: reason });
    if (error) setReportError(error.message);
    else await load();
  }  const balances = useMemo<CustomerBalance[]>(() => {
    const byCustomer = new Map<string, CustomerBalance>();
    for (const sale of sales) {
      const name = sale.customer_name || "Unnamed customer";
      const key = sale.customer_id
        ? "id:" + sale.customer_id
        : "name:" + name.toLowerCase();
      const current = byCustomer.get(key) || {
        key,
        customerId: sale.customer_id,
        name,
        total: 0,
        count: 0,
        sales: [],
      };
      current.total += balanceDue(sale);
      current.count += 1;
      current.sales.push(sale);
      byCustomer.set(key, current);
    }
    return [...byCustomer.values()].sort((a, b) => b.total - a.total);
  }, [sales]);
  function toggleSelected(saleId: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...current.filter((id) => id !== saleId), saleId]
        : current.filter((id) => id !== saleId),
    );
  }
  async function paid() {
    if (!supabase || paying || !selected.length) return;
    if (!balancePaymentMethod)
      return setReportError("Choose a payment method.");
    const chosen = sales.filter((sale) => selected.includes(sale.id));
    const customerId = chosen[0]?.customer_id;
    if (!customerId || chosen.some((sale) => sale.customer_id !== customerId))
      return setReportError("Choose orders from only 1 customer at a time.");
    if (
      !window.confirm(
        "Mark " +
          php.format(selectedTotal) +
          " from " +
          chosen[0].customer_name +
          " as paid via " +
          paymentMethodLabel(balancePaymentMethod) +
          "?",
      )
    )
      return;
    setPaying(true);
    setReportError("");
    const result = await supabase.from("payment_commands").insert({
      id: crypto.randomUUID(),
      business_id: business.id,
      customer_id: customerId,
      sale_ids: selected,
      payment_method: balancePaymentMethod,
      created_by: userId,
    });
    if (result.error) setReportError(result.error.message);
    else {
      setSelected([]);
      setBalancePaymentMethod("");
      await load();
    }
    setPaying(false);
  }
  return (
    <section className="reports-page">
      <Heading
        label="Reports"
        title={view === "daily" ? php.format(total) : php.format(total)}
        text={
          view === "daily"
            ? fullDate + " sales"
            : balances.length +
              (balances.length === 1 ? " customer to collect from" : " customers to collect from")
        }
      />
      <div className="segments report-tabs" role="tablist" aria-label="Report view">
        <button
          type="button"
          role="tab"
          className={view === "daily" ? "active" : ""}
          aria-selected={view === "daily"}
          onClick={() => setView("daily")}
        >
          Daily Sales
        </button>
        <button
          type="button"
          role="tab"
          className={view === "outstanding" ? "active" : ""}
          aria-selected={view === "outstanding"}
          onClick={() => setView("outstanding")}
        >
          Balances
        </button>
      </div>

      {view === "daily" && (
        <label className="report-calendar">
          <span><CalendarDays aria-hidden="true" /> Choose a Day</span>
          <input
            type="date"
            name="reportDate"
            value={selectedDate}
            max={today()}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
      )}

      {view === "daily" && (
        <>
          <div className="segments report-period" role="group" aria-label="Report period">
            {(["day", "week", "month"] as const).map((option) => (
              <button type="button" className={period === option ? "active" : ""} onClick={() => setPeriod(option)} key={option}>
                {option[0].toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
          <div className="report-summary-grid">
            <div><span>Collected</span><b>{php.format(paidTotal)}</b></div>
            <div><span>Pay Later</span><b>{php.format(unpaidTotal)}</b></div>
          </div>
          {bestSellers.length > 0 && (
            <div className="best-sellers">
              <b>Best Sellers</b>
              {bestSellers.map((item) => <span key={item.name}>{item.name}<strong>{item.quantity} sold</strong></span>)}
            </div>
          )}
        </>
      )}
      <div className="report-actions">
        <button type="button" className="secondary compact" disabled={!sales.length} onClick={exportCsv}>Export CSV</button>
        <button type="button" className="secondary compact" disabled={!sales.length} onClick={downloadPdf}>Download PDF</button>
      </div>
      {reportError && (
        <p className="error" role="alert" aria-live="polite">
          {reportError}
        </p>
      )}

      {loadingReports ? (
        <div className="report-loading" role="status" aria-live="polite">
          Loading report…
        </div>
      ) : view === "daily" ? (
        sales.length ? (
          <div className="report-order-list">
            {sales.map((sale) => (
              <article className="report-order" key={sale.id}>
                <div className="report-order-head">
                  <div>
                    <b>{sale.customer_name || "Walk-in"}</b>
                    <span>
                      {new Intl.DateTimeFormat("en-PH", {
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: "Asia/Manila",
                      }).format(new Date(sale.sold_at))}
                    </span>
                  </div>
                  <div>
                    <strong>{php.format(sale.total)}</strong>
                    <span className={
                      "payment-pill " +
                      (sale.payment_status === "paid"
                        ? "paid"
                        : Number(sale.amount_paid) > 0
                          ? "partial"
                          : "unpaid")
                    }>
                      {salePaymentLabel(sale)}
                    </span>
                    {sale.payment_method && (
                      <span className="payment-method-label">
                        {paymentMethodLabel(sale.payment_method)}
                      </span>
                    )}
                    {sale.payment_status === "unpaid" && Number(sale.amount_paid) > 0 && (
                      <span className="partial-payment-summary">
                        Paid {php.format(sale.amount_paid)} · Balance {php.format(balanceDue(sale))}
                      </span>
                    )}
                  </div>
                </div>
                <div className="report-items">
                  {(sale.sale_items || []).map((item) => (
                    <div key={item.id}>
                      <span>
                        {item.quantity}× {item.product_name} · {item.variant_name}
                      </span>
                      <b>{php.format(item.line_total)}</b>
                    </div>
                  ))}
                </div>
                <button type="button" className="void-sale" onClick={() => void voidSale(sale)}>Void / correct sale</button>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="No Sales"
            text={"No sales were recorded on " + fullDate + "."}
          />
        )
      ) : balances.length ? (
        <div className="balance-list">
          {balances.map((person) => {
            const expanded = expandedCustomer === person.key;
            const personSelected = person.sales.filter((sale) =>
              selected.includes(sale.id),
            ).length;
            return (
              <section className="balance-person" key={person.key}>
                <button
                  type="button"
                  className="balance-person-head"
                  aria-expanded={expanded}
                  aria-controls={"balance-" + person.key.replace(/[^a-z0-9]/gi, "-")}
                  onClick={() =>
                    setExpandedCustomer(expanded ? null : person.key)
                  }
                >
                  <span className="customer-avatar" aria-hidden="true">
                    {person.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <b>{person.name}</b>
                    <small>
                      {person.count} unpaid {person.count === 1 ? "purchase" : "purchases"}
                    </small>
                  </span>
                  <strong>{php.format(person.total)}</strong>
                  <ChevronDown aria-hidden="true" />
                </button>
                {expanded && (
                  <div
                    className="balance-details"
                    id={"balance-" + person.key.replace(/[^a-z0-9]/gi, "-")}
                  >
                    <div className="balance-detail-summary">
                      <span>Purchase Details</span>
                      <button
                        type="button"
                        onClick={() => {
                          const ids = person.sales.map((sale) => sale.id);
                          const allSelected = ids.every((id) => selected.includes(id));
                          setSelected((current) =>
                            allSelected
                              ? current.filter((id) => !ids.includes(id))
                              : [...current.filter((id) => !ids.includes(id)), ...ids],
                          );
                        }}
                      >
                        {personSelected === person.count ? "Clear All" : "Select All"}
                      </button>
                    </div>
                    {person.sales.map((sale) => (
                      <label className="balance-order" key={sale.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(sale.id)}
                          onChange={(event) =>
                            toggleSelected(sale.id, event.target.checked)
                          }
                        />
                        <span className="balance-order-copy">
                          <span className="balance-order-date">
                            <ReceiptText aria-hidden="true" />
                            {new Intl.DateTimeFormat("en-PH", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              timeZone: "Asia/Manila",
                            }).format(new Date(sale.sold_at))}
                          </span>
                          {(sale.sale_items || []).map((item) => (
                            <span className="balance-item" key={item.id}>
                              {item.quantity}× {item.product_name} · {item.variant_name}
                            </span>
                          ))}
                        </span>
                        <strong>{php.format(balanceDue(sale))}</strong>
                      </label>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <Empty
          title="All Settled"
          text="Nobody has an outstanding balance."
        />
      )}

      {selected.length > 0 && (
        <div className="sticky report-payment-panel">
          <div className="report-payment-summary">
            <b>How did they pay?</b>
            <span>{selected.length} selected · {php.format(selectedTotal)}</span>
          </div>
          <div className="segments payment-methods" role="group" aria-label="Balance payment method">
            {([
              ["cash", "Cash"],
              ["gcash", "GCash"],
              ["bank_transfer", "Bank transfer"],
            ] as const).map(([value, label]) => (
              <button
                type="button"
                key={value}
                className={balancePaymentMethod === value ? "active" : ""}
                aria-pressed={balancePaymentMethod === value}
                onClick={() => {
                  setBalancePaymentMethod(value);
                  setReportError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="primary report-pay"
            disabled={paying}
            onClick={() => void paid()}
          >
            {paying ? "Recording Payment…" : "Mark as Paid"}
          </button>
        </div>
      )}
    </section>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(true),
    [business, setBusiness] = useState<Business | null>(null),
    [variants, setVariants] = useState<Variant[]>([]),
    [day, setDay] = useState<Day | null>(null),
    [activeDate, setActiveDate] = useState(today),
    [loadedDate, setLoadedDate] = useState<string | null>(null),
    [loadError, setLoadError] = useState(""),
    [reopening, setReopening] = useState(false),
    [stock, setStock] = useState<Stock[]>([]),
    [dayVariantStock, setDayVariantStock] = useState<Record<number, number>>({}),
    [tab, setTab] = useState<"sell" | "stock" | "reports">("sell"),
    [settings, setSettings] = useState(false),
    [online, setOnline] = useState(() => navigator.onLine),
    [finishingDay, setFinishingDay] = useState(false),
    [resettingDay, setResettingDay] = useState(false),
    [settingsError, setSettingsError] = useState("");
  const loadVersion = useRef(0);
  const activeDateRef = useRef(activeDate);
  const loadBusiness = useCallback(async () => {
    if (!supabase) return null;
    const { data } = await supabase
      .from("business_members")
      .select("businesses(id,name,join_code)")
      .limit(1)
      .maybeSingle();
    const b = data?.businesses as unknown as Business | null;
    setBusiness(b);
    return b;
  }, []);
  const load = useCallback(
    async (arg?: Business | null) => {
      if (!supabase) return;
      if (activeDate !== activeDateRef.current) return;
      const b = arg || business;
      if (!b) return;
      const version = ++loadVersion.current;
      setLoadError("");
      try {
      const [v, d, componentResult] = await Promise.all([
        supabase
          .from("product_variants")
          .select(
            "id,product_id,name,package_quantity,default_price,is_active,is_bundle,products(id,name)",
          )
          .eq("business_id", b.id)
          .eq("is_active", true),
        supabase
          .from("selling_days")
          .select("*")
          .eq("business_id", b.id)
          .eq("sale_date", activeDate)
          .maybeSingle(),
        supabase
          .from("variant_components")
          .select("bundle_variant_id,component_variant_id,quantity")
          .eq("business_id", b.id),
      ]);
      if (version !== loadVersion.current) return;
      if (v.error || d.error || componentResult.error)
        throw new Error(v.error?.message || d.error?.message || componentResult.error?.message);
      const rawVariants = (v.data || []) as unknown as Variant[];
      const componentRows = (componentResult.data || []) as {
        bundle_variant_id: number;
        component_variant_id: number;
        quantity: number;
      }[];
      const byId = new Map(rawVariants.map((item) => [item.id, item]));
      const enrichedVariants = rawVariants.map((item) => ({
        ...item,
        components: componentRows
          .filter((component) => component.bundle_variant_id === item.id)
          .map((component) => ({
            ...component,
            component: byId.get(component.component_variant_id),
          })),
      }));
      setVariants(enrichedVariants);
      setDay(d.data as Day | null);
      if (d.data) {
        const [s, sold, adjusted, offered] = await Promise.all([
          supabase
            .from("daily_stock")
            .select(
              "id,variant_id,brought_quantity,product_variants!inner(id,product_id,name,package_quantity,default_price,is_active,is_bundle,products(id,name))",
            )
            .eq("selling_day_id", d.data.id)
            .eq("product_variants.is_active", true),
          supabase
            .from("sale_items")
            .select(
              "variant_id,quantity,sales!inner(selling_day_id,voided_at),sale_item_components(component_variant_id,quantity)",
            )
            .eq("sales.selling_day_id", d.data.id)
            .is("sales.voided_at", null),
          supabase
            .from("stock_adjustments")
            .select("variant_id,quantity_delta")
            .eq("selling_day_id", d.data.id),
          supabase
            .from("selling_day_variants")
            .select("variant_id,brought_quantity")
            .eq("selling_day_id", d.data.id),
        ]);
        if (version !== loadVersion.current) return;
        if (s.error || sold.error || adjusted.error || offered.error)
          throw new Error(s.error?.message || sold.error?.message || adjusted.error?.message || offered.error?.message);
        const soldByVariant = new Map<number, number>();
        const soldUnitsByVariant = new Map<number, number>();
        for (const row of sold.data || []) {
          soldUnitsByVariant.set(
            row.variant_id,
            (soldUnitsByVariant.get(row.variant_id) || 0) + row.quantity,
          );
          const components = (row.sale_item_components || []) as {
            component_variant_id: number;
            quantity: number;
          }[];
          if (components.length) {
            for (const component of components)
              soldByVariant.set(
                component.component_variant_id,
                (soldByVariant.get(component.component_variant_id) || 0) +
                  component.quantity,
              );
          } else {
            soldByVariant.set(
              row.variant_id,
              (soldByVariant.get(row.variant_id) || 0) + row.quantity,
            );
          }
        }
        const adjustedByVariant = new Map<number, number>();
        for (const row of adjusted.data || [])
          adjustedByVariant.set(
            row.variant_id,
            (adjustedByVariant.get(row.variant_id) || 0) + row.quantity_delta,
          );
        const available = ((s.data || []) as unknown as Stock[]).map((row) => ({
          ...row,
          initial_quantity: row.brought_quantity,
          brought_quantity: Math.max(
            0,
            row.brought_quantity +
              (adjustedByVariant.get(row.variant_id) || 0) -
              (soldByVariant.get(row.variant_id) || 0),
          ),
        }));
        setStock(available);
        setDayVariantStock(
          Object.fromEntries(
            (offered.data || []).map((item) => [
              Number(item.variant_id),
              Math.max(
                0,
                Number(item.brought_quantity) -
                  (soldUnitsByVariant.get(Number(item.variant_id)) || 0),
              ),
            ]),
          ),
        );
      } else {
        setStock([]);
        setDayVariantStock({});
      }
      setLoadedDate(activeDate);
      } catch (error) {
        if (version === loadVersion.current)
          setLoadError(error instanceof Error ? error.message : "Unable to load this selling date. Please try again.");
      }
    },
    [business, activeDate],
  );
  function changeSellingDate(date: string) {
    if (!date || date > today() || date === activeDate) return;
    if (!window.confirm("Switch to " + displayDate(date) + "? Any unsubmitted selections will be cleared.")) return;
    ++loadVersion.current;
    activeDateRef.current = date;
    setLoadedDate(null);
    setDay(null);
    setStock([]);
    setDayVariantStock({});
    setSettingsError("");
    setActiveDate(date);
  }
  async function reopenDay() {
    if (!supabase || !day || reopening) return;
    if (!window.confirm("Reopen " + displayDate(day.sale_date) + " to add missed sales? Existing sales and stock will be preserved.")) return;
    setReopening(true);
    setLoadError("");
    try {
      const { error } = await supabase.rpc("reopen_selling_day", { p_selling_day_id: day.id });
      if (error) throw error;
      await load();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not reopen this day. Please try again.");
    } finally {
      setReopening(false);
    }
  }
  useEffect(() => {
    if (!supabase) return setLoading(false);
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return supabase.auth.onAuthStateChange((_e, s) => setSession(s)).data
      .subscription.unsubscribe;
  }, []);
  useEffect(() => {
    if (session) void loadBusiness();
    else setBusiness(null);
  }, [session, loadBusiness]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);
  async function finishDay() {
    if (!supabase || !day || finishingDay) return;
    setFinishingDay(true);
    setSettingsError("");
    const { data, error } = await supabase
      .from("sales")
      .select("total,amount_paid,payment_status")
      .eq("selling_day_id", day.id)
      .is("voided_at", null);
    if (error) {
      setSettingsError(error.message);
      setFinishingDay(false);
      return;
    }
    const daySales = (data || []) as { total: number; amount_paid: number; payment_status: string }[];
    const salesTotal = daySales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const unpaid = daySales
      .filter((sale) => sale.payment_status === "unpaid")
      .reduce((sum, sale) => sum + balanceDue(sale), 0);
    const remaining = stock.reduce((sum, item) => sum + item.brought_quantity, 0);
    const confirmed = window.confirm(
      "Finish " + displayDate(activeDate) + "?\n\nSales: " + php.format(salesTotal) +
      "\nOutstanding: " + php.format(unpaid) +
      "\nRemaining pieces: " + remaining +
      "\n\nThis closes the selected date. You can explicitly reopen it if you missed a sale.",
    );
    if (!confirmed) {
      setFinishingDay(false);
      return;
    }
    const result = await supabase.rpc("close_selling_day", {
      p_selling_day_id: day.id,
    });
    if (result.error) setSettingsError(result.error.message);
    else {
      await load();
      setSettings(false);
      setTab("reports");
    }
    setFinishingDay(false);
  }  async function resetDay() {
    if (!supabase || !business || !day || resettingDay) return;
    const confirmed = window.confirm(
      "Reset " + displayDate(activeDate) + " and return to Start Day? This removes that date's starting stock and stock changes. You cannot reset after recording a sale.",
    );
    if (!confirmed) return;
    setResettingDay(true);
    setSettingsError("");
    const { count, error: salesError } = await supabase
      .from("sales")
      .select("id", { count: "exact", head: true })
      .eq("selling_day_id", day.id);
    if (salesError) {
      setSettingsError(salesError.message);
      setResettingDay(false);
      return;
    }
    if ((count || 0) > 0) {
      setSettingsError(
        "This day already has sales, so it cannot be reset. Your sales and balances are protected.",
      );
      setResettingDay(false);
      return;
    }
    const { error } = await supabase.rpc("reset_selling_day", {
      p_selling_day_id: day.id,
    });
    if (error) {
      setSettingsError(
        error.code === "23503"
          ? "This day already has sales, so it cannot be reset."
          : error.message,
      );
      setResettingDay(false);
      return;
    }
    await load();
    setResettingDay(false);
    setSettings(false);
    setTab("sell");
  }
  if (loading) return <main className="center">Loading…</main>;
  if (!supabase)
    return <main className="center">Supabase is not configured.</main>;
  if (!session) return <Auth />;
  if (!business)
    return (
      <Setup
        userId={session.user.id}
        onDone={() => void loadBusiness().then(load)}
      />
    );
  return (
    <div className="app">
      <header className="top">
        <div>
          <small>BizTally</small>
          <b>{business.name}</b>
        </div>
        <button type="button" aria-label="Open settings" onClick={() => setSettings(true)}>
          <Settings aria-hidden="true" />
        </button>
      </header>
      {!online && <div className="offline-banner" role="status"><WifiOff aria-hidden="true" /> Offline — sales will not be submitted until you reconnect.</div>}
      <main>
        {tab !== "reports" && (
          <div className={"selling-date-bar" + (activeDate !== today() ? " historical" : "")}>
            <label htmlFor="selling-date"><CalendarDays aria-hidden="true" /> Selling date</label>
            <input id="selling-date" type="date" value={activeDate} max={today()}
              disabled={reopening} onChange={(event) => changeSellingDate(event.target.value)} />
            {activeDate !== today() && <>
              <small>Entering sales and stock for {displayDate(activeDate)} only.</small>
              <button type="button" className="secondary compact" onClick={() => changeSellingDate(today())}>Back to today</button>
            </>}
          </div>
        )}
        {loadError && tab !== "reports" && (
          <div role="alert"><p className="error">{loadError}</p>
            <button type="button" className="secondary" onClick={() => void load()}>Retry loading this date</button>
          </div>
        )}
        {!loadError && loadedDate !== activeDate && tab !== "reports" && (
          <p role="status">Loading {displayDate(activeDate)}…</p>
        )}
        {loadedDate === activeDate && !loadError && tab === "sell" &&
          (variants.length === 0 ? (
            <Empty
              title="Add your first product"
              text="Go to Stock to set up a product."
              action={
                <button className="secondary" onClick={() => setTab("stock")}>
                  Go to Stock
                </button>
              }
            />
          ) : day && (day.closed_at || day.status === "closed") ? (
            <Empty title="Day Finished" text={displayDate(activeDate) + " is closed. Reopen it to enter missed sales without resetting its stock."}
              action={<button type="button" className="secondary" disabled={reopening} onClick={() => void reopenDay()}>{reopening ? "Reopening…" : "Reopen to add missed sales"}</button>} />
          ) : day ? (
            <Sell
              key={activeDate}
              business={business}
              userId={session.user.id}
              day={day}
              variants={
                Object.keys(dayVariantStock).length
                  ? variants.filter((variant) => {
                      if ((dayVariantStock[variant.id] || 0) < 1) return false;
                      const recipe = componentDemand(variant, 1);
                      return (
                        recipe.length > 0 &&
                        recipe.every((component) =>
                          stock.some(
                            (item) =>
                              item.variant_id ===
                                component.component_variant_id &&
                              item.brought_quantity >= component.quantity,
                          ),
                        )
                      );
                    })
                  : variants
              }
              offeringStock={dayVariantStock}
              stock={stock}
              reload={() => void load()}
            />
          ) : (
            <StartDay
              key={activeDate}
              saleDate={activeDate}
              business={business}
              variants={variants}
              done={() => void load()}
            />
          ))}
        {loadedDate === activeDate && !loadError && tab === "stock" && (
          <StockPage
            key={activeDate}
            business={business}
            day={day}
            variants={variants}
            stock={stock}
            offeringStock={dayVariantStock}
            reload={() => void load()}
          />
        )}{" "}
        {tab === "reports" && (
          <Reports business={business} userId={session.user.id} initialDate={activeDate} />
        )}
      </main>
      <nav aria-label="Primary navigation">
        {(
          [
            { id: "sell", Icon: ShoppingBag },
            { id: "stock", Icon: Box },
            { id: "reports", Icon: BarChart3 },
          ] as const
        ).map((x) => (
          <button
            type="button"
            className={tab === x.id ? "active" : ""}
            aria-current={tab === x.id ? "page" : undefined}
            onClick={() => setTab(x.id)}
            key={x.id}
          >
            <x.Icon aria-hidden="true" />
            <span>{x.id[0].toUpperCase() + x.id.slice(1)}</span>
          </button>
        ))}
      </nav>
      {settings && (
        <div className="backdrop">
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="shop-settings-title">
            <div className="sheethead">
              <h2 id="shop-settings-title">Shop settings</h2>
              <button type="button" aria-label="Close settings" onClick={() => setSettings(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="code">
              <span>Invite code</span>
              <b>{business.join_code}</b>
              <p>Share this with your other account.</p>
            </div>
            <div className="settings-tool finish-day">
              <div><CheckCircle2 aria-hidden="true" /><span><b>Finish {displayDate(activeDate)}</b><p>Review sales, outstanding balances, and remaining stock for the selected date.</p></span></div>
              <button type="button" className="primary" disabled={!day || Boolean(day.closed_at) || finishingDay} onClick={() => void finishDay()}>
                {finishingDay ? "Finishing…" : day?.closed_at ? "Day finished" : day ? "Finish day" : "Day not started"}
              </button>
            </div>
            <CustomerMerge business={business} />
            <div className="settings-tool install-guide">
              <div><Smartphone aria-hidden="true" /><span><b>Install on iPhone</b><p>In Safari, tap Share, then “Add to Home Screen.” BizTally opens like an app and keeps its shell available offline.</p></span></div>
            </div>            <div className="settings-reset">
              <div>
                <b>Reset my day</b>
                <p>
                  Return to Start Day and enter what you brought again. Available
                  only before the first sale.
                </p>
              </div>
              <button
                type="button"
                className="secondary danger"
                disabled={!day || resettingDay}
                onClick={() => void resetDay()}
              >
                <RotateCcw aria-hidden="true" />
                {resettingDay
                  ? "Resetting…"
                  : day
                    ? "Reset " + displayDate(activeDate)
                    : "Day not started"}
              </button>
            </div>
            {settingsError && (
              <p className="error" role="alert" aria-live="polite">
                {settingsError}
              </p>
            )}
            <button
              type="button"
              className="secondary"
              onClick={() => supabase?.auth.signOut()}
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
