// ── SHARED UTILITIES — Common Print Co. Storefront ────────────────────────
// Used across all storefront pages

// ── CONFIG ────────────────────────────────────────────────────────────────
export const WORKER_URL = 'https://storefront-api.matt-zmud.workers.dev';
export const FIREBASE_PROJECT_ID = 'common-print-portal';

// ── FIRESTORE REST HELPERS ────────────────────────────────────────────────
function getToken() {
  return window._sfAuth?.currentUser?.getIdToken() ?? Promise.reject('Not authenticated');
}

function fsBase() {
  return `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

// Convert Firestore field value to JS
function fromFsValue(val) {
  if (!val) return null;
  if ('stringValue'  in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue'  in val) return val.doubleValue;
  if ('booleanValue' in val) return val.booleanValue;
  if ('nullValue'    in val) return null;
  if ('timestampValue' in val) return val.timestampValue;
  if ('arrayValue'   in val) return (val.arrayValue.values || []).map(fromFsValue);
  if ('mapValue'     in val) return fromFsFields(val.mapValue.fields || {});
  return null;
}

// Convert Firestore fields object to plain JS object
export function fromFsFields(fields = {}) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fromFsValue(v);
  return out;
}

// Convert JS value to Firestore field value
function toFsValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean')  return { booleanValue: val };
  if (typeof val === 'number')   return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
  if (typeof val === 'string')   return { stringValue: val };
  if (Array.isArray(val))        return { arrayValue: { values: val.map(toFsValue) } };
  if (typeof val === 'object')   return { mapValue: { fields: toFsFields(val) } };
  return { stringValue: String(val) };
}

// Convert plain JS object to Firestore fields
export function toFsFields(obj = {}) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = toFsValue(v);
  return out;
}

// Get a document
export async function fsGet(path) {
  const token = await getToken();
  const res   = await fetch(`${fsBase()}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return null;
  const doc = await res.json();
  return doc.fields ? { id: path.split('/').pop(), ...fromFsFields(doc.fields) } : null;
}

// Get a document without auth (for public reads)
export async function fsGetPublic(path) {
  const res = await fetch(`${fsBase()}/${path}`);
  if (!res.ok) return null;
  const doc = await res.json();
  return doc.fields ? { id: path.split('/').pop(), ...fromFsFields(doc.fields) } : null;
}

// List a collection
export async function fsList(path) {
  const token = await getToken();
  const res   = await fetch(`${fsBase()}/${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents || []).map(d => ({
    id: d.name.split('/').pop(),
    ...fromFsFields(d.fields)
  }));
}

// List without auth
export async function fsListPublic(path) {
  const res = await fetch(`${fsBase()}/${path}`);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.documents || []).map(d => ({
    id: d.name.split('/').pop(),
    ...fromFsFields(d.fields)
  }));
}

// Set (create/overwrite) a document
export async function fsSet(path, data) {
  const token = await getToken();
  const res   = await fetch(`${fsBase()}/${path}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFsFields(data) })
  });
  return res.ok;
}

// Update specific fields
export async function fsUpdate(path, data) {
  const token  = await getToken();
  const fields = toFsFields(data);
  const mask   = Object.keys(fields).map(k => `updateMask.fieldPaths=${k}`).join('&');
  const res    = await fetch(`${fsBase()}/${path}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields })
  });
  return res.ok;
}

// Delete a document
export async function fsDelete(path) {
  const token = await getToken();
  const res   = await fetch(`${fsBase()}/${path}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}

// Query a collection
export async function fsQuery(collectionPath, filters = [], orderBy = null, limit = null) {
  const token   = await getToken();
  const [parent, ...parts] = collectionPath.split('/');
  const collectionId = parts.pop();
  const parentPath   = parts.length ? `${parent}/${parts.join('/')}` : parent;

  const query = {
    structuredQuery: {
      from: [{ collectionId }],
      where: filters.length === 1
        ? { fieldFilter: filters[0] }
        : filters.length > 1
        ? { compositeFilter: { op: 'AND', filters: filters.map(f => ({ fieldFilter: f })) } }
        : undefined,
      ...(orderBy ? { orderBy: [{ field: { fieldPath: orderBy.field }, direction: orderBy.dir || 'ASCENDING' }] } : {}),
      ...(limit ? { limit } : {}),
    }
  };
  if (!filters.length) delete query.structuredQuery.where;

  const res = await fetch(`${fsBase()}/${parentPath}:runQuery`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  const data = await res.json();
  return (data || [])
    .filter(r => r.document)
    .map(r => ({ id: r.document.name.split('/').pop(), ...fromFsFields(r.document.fields) }));
}

// ── ID GENERATION ─────────────────────────────────────────────────────────
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── FORMATTING ────────────────────────────────────────────────────────────
export function fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return iso; }
}

export function fmtDateTime(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }); }
  catch { return iso; }
}

export function fmtCurrency(cents) {
  return '$' + (cents / 100).toFixed(2);
}

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPhone(val) {
  const digits = val.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0,3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
}

// ── TOAST NOTIFICATIONS ───────────────────────────────────────────────────
export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `sf-toast sf-toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

// ── WORKER API CALL ───────────────────────────────────────────────────────
export async function callWorker(action, data = {}) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...data })
  });
  if (!res.ok) throw new Error(`Worker error: ${res.status}`);
  return res.json();
}

// ── CART HELPERS (sessionStorage) ────────────────────────────────────────
const CART_KEY = 'sf_cart';

export function getCart() {
  try { return JSON.parse(sessionStorage.getItem(CART_KEY) || '[]'); }
  catch { return []; }
}

export function saveCart(items) {
  sessionStorage.setItem(CART_KEY, JSON.stringify(items));
}

export function clearCart() {
  sessionStorage.removeItem(CART_KEY);
}

export function addToCart(item) {
  const cart  = getCart();
  const existing = cart.find(i => i.productId === item.productId && i.qty === item.qty);
  if (existing) { existing.qty += item.qty; }
  else { cart.push(item); }
  saveCart(cart);
  return cart;
}

export function cartTotal(items) {
  return items.reduce((sum, i) => sum + i.lineTotal, 0);
}

// ── PRICING HELPERS ───────────────────────────────────────────────────────
// Given a product with pricingTiers [{minQty, unitPrice}] sorted ascending,
// return unit price for a given quantity
export function getUnitPrice(product, qty) {
  if (!product.pricingTiers || !product.pricingTiers.length) return product.basePrice || 0;
  const sorted = [...product.pricingTiers].sort((a, b) => b.minQty - a.minQty);
  const tier   = sorted.find(t => qty >= t.minQty);
  return tier ? tier.unitPrice : (product.basePrice || 0);
}

// Calculate shipping for an order
export function calcShipping(subtotal, storefront) {
  const threshold = storefront.freeShippingThreshold || 0;
  const flatRate  = storefront.shippingRate || 0;
  if (threshold > 0 && subtotal >= threshold) return 0;
  return flatRate;
}
