/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  BarChart3,
  Box,
  Minus,
  PackagePlus,
  Plus,
  Settings,
  ShoppingBag,
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
  products?: Product;
};
type Day = { id: number; sale_date: string };
type Stock = {
  id: number;
  variant_id: number;
  brought_quantity: number;
  product_variants: Variant;
};
type Cart = {
  variant: Variant;
  available: number;
  quantity: number;
  unitPrice: number;
};
type Customer = { id: number; name: string };
type Sale = {
  id: string;
  customer_id: number | null;
  customer_name: string;
  total: number;
  payment_status: string;
  sold_at: string;
};
const php = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
});
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
    new Date(),
  );

const unitLabel = (variant: Pick<Variant, "package_quantity">) =>
  variant.package_quantity === 1 ? "1 pc" : `${variant.package_quantity} pcs`;
const stockLabel = (
  quantity: number,
  variant: Pick<Variant, "package_quantity">,
) =>
  variant.package_quantity === 1
    ? `${quantity} pcs`
    : `${quantity} ${quantity === 1 ? "pack" : "packs"} (${quantity * variant.package_quantity} pcs)`;
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {msg && <small>{msg}</small>}
          <button className="primary" disabled={busy}>
            {busy ? "Please wait…" : signup ? "Sign up" : "Log in"}
          </button>
        </form>
        <button className="link" onClick={() => setSignup(!signup)}>
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
    <div className="logo">
      <ShoppingBag />
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
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button type="button" className="primary" onClick={create}>
            Create shop
          </button>
          <i>or</i>
          <label>
            Invite code
            <input value={code} onChange={(e) => setCode(e.target.value)} />
          </label>
          <button type="button" className="secondary" onClick={join}>
            Join shop
          </button>
          {error && <small>{error}</small>}
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
    <div className="empty">
      <Box />
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
}: {
  business: Business;
  variants: Variant[];
  done: () => void;
}) {
  const [q, setQ] = useState<Record<number, number>>({}),
    [error, setError] = useState("");
  async function start() {
    if (!supabase) return;
    const chosen = variants.filter((v) => (q[v.id] || 0) > 0);
    if (!chosen.length) return setError("Add at least one item.");
    const d = await supabase
      .from("selling_days")
      .insert({ business_id: business.id, sale_date: today() })
      .select()
      .single();
    if (d.error) return setError(d.error.message);
    const r = await supabase.from("daily_stock").insert(
      chosen.map((v) => ({
        business_id: business.id,
        selling_day_id: d.data.id,
        variant_id: v.id,
        brought_quantity: q[v.id],
      })),
    );
    if (r.error) setError(r.error.message);
    else done();
  }
  return (
    <section>
      <Heading
        label="Good morning"
        title="What did you bring?"
        text="Enter today's starting quantity by selling unit."
      />
      <div className="card">
        {variants.map((v) => (
          <div className="row" key={v.id}>
            <div>
              <b>{v.products?.name}</b>
              <span>
                {v.name} · {unitLabel(v)} · {php.format(v.default_price)}
              </span>
            </div>
            <Stepper
              value={q[v.id] || 0}
              set={(n) => setQ((x) => ({ ...x, [v.id]: n }))}
            />
          </div>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      <button className="primary sticky" onClick={start}>
        Start selling
      </button>
    </section>
  );
}
function Stepper({ value, set }: { value: number; set: (n: number) => void }) {
  return (
    <div className="step">
      <button onClick={() => set(Math.max(0, value - 1))}>
        <Minus />
      </button>
      <span>{value}</span>
      <button onClick={() => set(value + 1)}>
        <Plus />
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
  stock,
  reload,
}: {
  business: Business;
  userId: string;
  day: Day;
  stock: Stock[];
  reload: () => void;
}) {
  const [cart, setCart] = useState<Record<number, Cart>>({}),
    [review, setReview] = useState(false),
    [name, setName] = useState(""),
    [customer, setCustomer] = useState<Customer | null>(null),
    [suggestions, setSuggestions] = useState<Customer[]>([]),
    [walkIn, setWalkIn] = useState(false),
    [payment, setPayment] = useState<"paid" | "unpaid">("paid"),
    [error, setError] = useState("");
  const lines = Object.values(cart),
    total = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!supabase || name.trim().length < 2 || customer)
        return setSuggestions([]);
      const { data } = await supabase
        .from("customers")
        .select("id,name")
        .eq("business_id", business.id)
        .ilike("normalized_name", `${name.trim().toLowerCase()}%`)
        .limit(5);
      setSuggestions((data || []) as Customer[]);
    }, 200);
    return () => clearTimeout(t);
  }, [name, customer, business.id]);
  function add(s: Stock) {
    const v = s.product_variants;
    setCart((c) => ({
      ...c,
      [v.id]: c[v.id]
        ? {
            ...c[v.id],
            quantity: Math.min(s.brought_quantity, c[v.id].quantity + 1),
          }
        : {
            variant: v,
            available: s.brought_quantity,
            quantity: 1,
            unitPrice: Number(v.default_price),
          },
    }));
  }
  function decrease(s: Stock) {
    const v = s.product_variants;
    setCart((c) => {
      const item = c[v.id];
      if (!item) return c;
      if (item.quantity <= 1) {
        const next = { ...c };
        delete next[v.id];
        return next;
      }
      return {
        ...c,
        [v.id]: { ...item, quantity: item.quantity - 1 },
      };
    });
  }
  async function save() {
    if (!supabase) return;
    if (!walkIn && !name.trim()) return setError("Enter a customer name.");
    const r = await supabase.from("sale_commands").insert({
      id: crypto.randomUUID(),
      business_id: business.id,
      selling_day_id: day.id,
      customer_id: customer?.id || null,
      customer_name: walkIn ? null : name.trim(),
      is_walk_in: walkIn,
      payment_status: walkIn ? "paid" : payment,
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
      reload();
    }
  }
  return (
    <section>
      <Heading label="Today" title="New sale" text="Use + or - to adjust items." />
      <div className="grid">
        {stock.map((s) => {
          const v = s.product_variants,
            picked = cart[v.id]?.quantity || 0,
            remaining = Math.max(0, s.brought_quantity - picked),
            label = `${v.products?.name || "Product"} ${v.name}`;
          return (
            <article
              className={`product ${!s.brought_quantity ? "disabled" : ""}`}
              key={s.id}
            >
              <i>{v.products?.name.slice(0, 1)}</i>
              <b>{v.products?.name}</b>
              <span>{v.name} · {unitLabel(v)}</span>
              <small>
                {php.format(v.default_price)} · {stockLabel(remaining, v)} left
              </small>
              {picked > 0 && <em>{picked}</em>}
              <div className="product-actions" aria-label={`${label} quantity`}>
                <button
                  type="button"
                  disabled={!picked}
                  onClick={() => decrease(s)}
                  aria-label={`Decrease ${label}`}
                >
                  <Minus />
                </button>
                <span>{picked}</span>
                <button
                  type="button"
                  disabled={!remaining}
                  onClick={() => add(s)}
                  aria-label={`Add ${label}`}
                >
                  <Plus />
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {lines.length > 0 && (
        <button className="cart" onClick={() => setReview(true)}>
          <span>{lines.reduce((s, l) => s + l.quantity, 0)} items</span>
          <b>Review · {php.format(total)}</b>
        </button>
      )}
      {review && (
        <div className="backdrop">
          <div className="sheet">
            <div className="sheethead">
              <h2>Review sale</h2>
              <button onClick={() => setReview(false)}>
                <X />
              </button>
            </div>
            {lines.map((l) => (
              <div className="row" key={l.variant.id}>
                <div>
                  <b>
                    {l.variant.products?.name} · {l.variant.name} · {unitLabel(l.variant)}
                  </b>
                  <label>
                    Price
                    <input
                      inputMode="decimal"
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
                  </label>
                </div>
                <Stepper
                  value={l.quantity}
                  set={(n) =>
                    setCart((c) =>
                      n
                        ? {
                            ...c,
                            [l.variant.id]: {
                              ...c[l.variant.id],
                              quantity: Math.min(l.available, n),
                            },
                          }
                        : Object.fromEntries(
                            Object.entries(c).filter(
                              ([k]) => Number(k) !== l.variant.id,
                            ),
                          ),
                    )
                  }
                />
              </div>
            ))}
            <label>
              Customer
              <input
                disabled={walkIn}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setCustomer(null);
                }}
                placeholder="Start typing a name"
              />
            </label>
            {suggestions.map((c) => (
              <button
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
            <label className="check">
              <input
                type="checkbox"
                checked={walkIn}
                onChange={(e) => setWalkIn(e.target.checked)}
              />{" "}
              Walk-in customer
            </label>
            {!walkIn && (
              <div className="segments">
                <button
                  className={payment === "paid" ? "active" : ""}
                  onClick={() => setPayment("paid")}
                >
                  Paid
                </button>
                <button
                  className={payment === "unpaid" ? "active" : ""}
                  onClick={() => setPayment("unpaid")}
                >
                  Pay later
                </button>
              </div>
            )}
            {error && <p className="error">{error}</p>}
            <button className="primary" onClick={save}>
              Complete · {php.format(total)}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function StockPage({
  business,
  stock,
  reload,
}: {
  business: Business;
  stock: Stock[];
  reload: () => void;
}) {
  const [open, setOpen] = useState(false),
    [product, setProduct] = useState(""),
    [variant, setVariant] = useState(""),
    [packageQty, setPackageQty] = useState("1"),
    [price, setPrice] = useState(""),
    [error, setError] = useState("");
  async function add() {
    if (!supabase) return;
    setError("");
    if (!product.trim() || !variant.trim())
      return setError("Enter the product and flavor.");
    const parsedPackageQty = Number(packageQty);
    if (!Number.isInteger(parsedPackageQty) || parsedPackageQty < 1)
      return setError("Enter pieces per selling unit.");
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0)
      return setError("Enter a valid price.");
    let id: number;
    const found = await supabase
      .from("products")
      .select("id")
      .eq("business_id", business.id)
      .ilike("name", product.trim())
      .maybeSingle();
    if (found.data) id = found.data.id;
    else {
      const p = await supabase
        .from("products")
        .insert({ business_id: business.id, name: product.trim() })
        .select("id")
        .single();
      if (p.error) return setError(p.error.message);
      id = p.data.id;
    }
    const r = await supabase.from("product_variants").insert({
      business_id: business.id,
      product_id: id,
      name: variant.trim(),
      package_quantity: parsedPackageQty,
      default_price: parsedPrice,
    });
    if (r.error) setError(r.error.message);
    else {
      setOpen(false);
      setProduct("");
      setVariant("");
      setPackageQty("1");
      setPrice("");
      reload();
    }
  }
  return (
    <section>
      <div className="heading split">
        <div>
          <p className="eyebrow">Inventory</p>
          <h1>Today’s stock</h1>
          <span>Products still available.</span>
        </div>
        <button className="icon" onClick={() => setOpen(true)}>
          <PackagePlus />
        </button>
      </div>
      {stock.length ? (
        <div className="card">
          {stock.map((s) => (
            <div className="row" key={s.id}>
              <div>
                <b>{s.product_variants.products?.name}</b>
                <span>{s.product_variants.name} · {unitLabel(s.product_variants)}</span>
              </div>
              <strong>{stockLabel(s.brought_quantity, s.product_variants)} left</strong>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          title="No stock yet"
          text="Add products, then start today from Sell."
          action={
            <button className="secondary" onClick={() => setOpen(true)}>
              Add product
            </button>
          }
        />
      )}{" "}
      {open && (
        <div className="backdrop">
          <div className="sheet">
            <div className="sheethead">
              <h2>Add product</h2>
              <button onClick={() => setOpen(false)}>
                <X />
              </button>
            </div>
            <label>
              Product
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                placeholder="Cookies"
              />
            </label>
            <label>
              Flavor or variant
              <input
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                placeholder="Chocolate chip"
              />
            </label>
            <label>
              Pieces per selling unit
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={packageQty}
                onChange={(e) => setPackageQty(e.target.value)}
                placeholder="1"
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
            {error && <p className="error">{error}</p>}
            <button className="primary" onClick={add}>
              Save product
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Reports({ business, userId }: { business: Business; userId: string }) {
  const [view, setView] = useState<"daily" | "outstanding">("daily"),
    [sales, setSales] = useState<Sale[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const load = useCallback(async () => {
    if (!supabase) return;
    let q = supabase
      .from("sales")
      .select("*")
      .eq("business_id", business.id)
      .order("sold_at", { ascending: false });
    q =
      view === "daily"
        ? q.eq("selling_days.sale_date", today())
        : q.eq("payment_status", "unpaid");
    if (view === "daily")
      q = supabase
        .from("sales")
        .select("*")
        .eq("business_id", business.id)
        .gte("sold_at", `${today()}T00:00:00+08:00`)
        .lte("sold_at", `${today()}T23:59:59+08:00`)
        .order("sold_at", { ascending: false });
    const { data } = await q;
    setSales((data || []) as Sale[]);
  }, [business.id, view]);
  useEffect(() => {
    void load();
  }, [load]);
  const total = useMemo(
    () => sales.reduce((s, x) => s + Number(x.total), 0),
    [sales],
  );
  async function paid() {
    if (!supabase) return;
    const chosen = sales.filter((s) => selected.includes(s.id)),
      customerId = chosen[0]?.customer_id;
    if (!customerId || chosen.some((s) => s.customer_id !== customerId))
      return alert("Select orders from one customer at a time.");
    const r = await supabase.from("payment_commands").insert({
      id: crypto.randomUUID(),
      business_id: business.id,
      customer_id: customerId,
      sale_ids: selected,
      created_by: userId,
    });
    if (r.error) alert(r.error.message);
    else {
      setSelected([]);
      load();
    }
  }
  return (
    <section>
      <Heading
        label="Reports"
        title={
          view === "daily" ? php.format(total) : `${sales.length} unpaid orders`
        }
        text={
          view === "daily"
            ? "Today’s sales"
            : `Outstanding ${php.format(total)}`
        }
      />
      <div className="segments">
        <button
          className={view === "daily" ? "active" : ""}
          onClick={() => setView("daily")}
        >
          Daily sales
        </button>
        <button
          className={view === "outstanding" ? "active" : ""}
          onClick={() => setView("outstanding")}
        >
          Outstanding
        </button>
      </div>
      {sales.length ? (
        <div className="card">
          {sales.map((s) => (
            <label className="row sale" key={s.id}>
              {view === "outstanding" && (
                <input
                  type="checkbox"
                  checked={selected.includes(s.id)}
                  onChange={(e) =>
                    setSelected((x) =>
                      e.target.checked
                        ? [...x, s.id]
                        : x.filter((id) => id !== s.id),
                    )
                  }
                />
              )}
              <div>
                <b>{s.customer_name}</b>
                <span>
                  {new Date(s.sold_at).toLocaleTimeString("en-PH", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <strong>{php.format(s.total)}</strong>
            </label>
          ))}
        </div>
      ) : (
        <Empty
          title={view === "daily" ? "No sales yet" : "All settled"}
          text={
            view === "daily"
              ? "Completed sales appear here."
              : "No outstanding balances."
          }
        />
      )}{" "}
      {selected.length > 0 && (
        <button className="primary sticky" onClick={paid}>
          Mark selected as paid
        </button>
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
    [stock, setStock] = useState<Stock[]>([]),
    [tab, setTab] = useState<"sell" | "stock" | "reports">("sell"),
    [settings, setSettings] = useState(false);
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
      const b = arg || business;
      if (!b) return;
      const [v, d] = await Promise.all([
        supabase
          .from("product_variants")
          .select("id,product_id,name,package_quantity,default_price,products(id,name)")
          .eq("business_id", b.id)
          .eq("is_active", true),
        supabase
          .from("selling_days")
          .select("*")
          .eq("business_id", b.id)
          .eq("sale_date", today())
          .maybeSingle(),
      ]);
      setVariants((v.data || []) as unknown as Variant[]);
      setDay(d.data as Day | null);
      if (d.data) {
        const [s, sold, adjusted] = await Promise.all([
          supabase
            .from("daily_stock")
            .select(
              "id,variant_id,brought_quantity,product_variants(id,product_id,name,package_quantity,default_price,products(id,name))",
            )
            .eq("selling_day_id", d.data.id),
          supabase
            .from("sale_items")
            .select("variant_id,quantity,sales!inner(selling_day_id)")
            .eq("sales.selling_day_id", d.data.id),
          supabase
            .from("stock_adjustments")
            .select("variant_id,quantity_delta")
            .eq("selling_day_id", d.data.id),
        ]);
        const soldByVariant = new Map<number, number>();
        for (const row of sold.data || [])
          soldByVariant.set(
            row.variant_id,
            (soldByVariant.get(row.variant_id) || 0) + row.quantity,
          );
        const adjustedByVariant = new Map<number, number>();
        for (const row of adjusted.data || [])
          adjustedByVariant.set(
            row.variant_id,
            (adjustedByVariant.get(row.variant_id) || 0) + row.quantity_delta,
          );
        const available = ((s.data || []) as unknown as Stock[]).map((row) => ({
          ...row,
          brought_quantity: Math.max(
            0,
            row.brought_quantity +
              (adjustedByVariant.get(row.variant_id) || 0) -
              (soldByVariant.get(row.variant_id) || 0),
          ),
        }));
        setStock(available);
      } else setStock([]);
    },
    [business],
  );
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
    if (session) void loadBusiness().then(load);
    else setBusiness(null);
  }, [session, loadBusiness, load]);
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
        <button onClick={() => setSettings(true)}>
          <Settings />
        </button>
      </header>
      <main>
        {tab === "sell" &&
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
          ) : day ? (
            <Sell
              business={business}
              userId={session.user.id}
              day={day}
              stock={stock}
              reload={() => void load()}
            />
          ) : (
            <StartDay
              business={business}
              variants={variants}
              done={() => void load()}
            />
          ))}
        {tab === "stock" && (
          <StockPage
            business={business}
            stock={stock}
            reload={() => void load()}
          />
        )}{" "}
        {tab === "reports" && (
          <Reports business={business} userId={session.user.id} />
        )}
      </main>
      <nav>
        {(
          [
            { id: "sell", Icon: ShoppingBag },
            { id: "stock", Icon: Box },
            { id: "reports", Icon: BarChart3 },
          ] as const
        ).map((x) => (
          <button
            className={tab === x.id ? "active" : ""}
            onClick={() => setTab(x.id)}
            key={x.id}
          >
            <x.Icon />
            <span>{x.id[0].toUpperCase() + x.id.slice(1)}</span>
          </button>
        ))}
      </nav>
      {settings && (
        <div className="backdrop">
          <div className="sheet">
            <div className="sheethead">
              <h2>Shop settings</h2>
              <button onClick={() => setSettings(false)}>
                <X />
              </button>
            </div>
            <div className="code">
              <span>Invite code</span>
              <b>{business.join_code}</b>
              <p>Share this with your other account.</p>
            </div>
            <button
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
