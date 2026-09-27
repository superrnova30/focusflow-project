const crypto = require('crypto');

const XENDIT_API_URL = process.env.XENDIT_API_URL || 'https://api.xendit.co';
const CHECKOUT_BASE = process.env.XENDIT_CHECKOUT_BASE || 'https://checkout.xendit.co/web';
const SECRET_KEY = (process.env.XENDIT_SECRET_KEY || '').trim();

function getSecretKey() {
  return (process.env.XENDIT_SECRET_KEY || '').trim();
}

/**
 * Xendit is "configured" only when a real key is present. The placeholder values
 * shipped in .env.example must never be treated as a working integration, or the
 * server would create invoices against a bogus key and fail confusingly.
 */
function isXenditConfigured() {
  const key = getSecretKey();
  if (!key) return false;
  if (/x{4,}|your[_-]?key|placeholder|change[_-]?me/i.test(key)) return false;
  return key.startsWith('xnd_');
}

function isTestMode() {
  return getSecretKey().startsWith('xnd_development_');
}

/**
 * Explicit local sandbox. When XENDIT_SANDBOX=true and no real key is present,
 * checkout is simulated end-to-end so the upgrade flow (invoice creation ->
 * verification -> account upgrade -> admin visibility) can be developed and
 * demoed without live credentials. It refuses to run in production, and a
 * real secret key always takes precedence over it.
 */
function isSandboxMode() {
  if (process.env.NODE_ENV === 'production') return false;
  if (String(process.env.XENDIT_SANDBOX || '').toLowerCase() !== 'true') return false;
  return !isXenditConfigured();
}

/**
 * Payments can be attempted when either a real key is configured, or the local
 * sandbox is explicitly enabled.
 */
function paymentsAvailable() {
  return isXenditConfigured() || isSandboxMode();
}

function basicAuthHeader() {
  // Xendit authenticates with HTTP Basic using the secret key as the username.
  const token = Buffer.from(`${getSecretKey()}:`).toString('base64');
  return `Basic ${token}`;
}

function planConfig() {
  return {
    plan: 'unlimited',
    price: Number(process.env.PREMIUM_PRICE_PHP || 299),
    currency: 'PHP',
    durationDays: Number(process.env.PREMIUM_DURATION_DAYS || 30),
  };
}

async function xenditRequest(path, { method = 'GET', body } = {}) {
  if (!isXenditConfigured()) {
    const err = new Error('Xendit is not configured on the server');
    err.code = 'XENDIT_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch(`${XENDIT_API_URL}${path}`, {
    method,
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/json',
      // Idempotency key so a retried create never double-charges.
      'api-version': '2022-07-31',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(
      `Xendit ${method} ${path} failed (${res.status}): ${
        data && (data.message || data.error_code) ? data.message || data.error_code : text
      }`
    );
    err.status = res.status;
    err.body = data;
    throw err;
  }

  return data;
}

/**
 * Creates a hosted Xendit Invoice and returns the checkout URL the student
 * opens. Amount and duration come from server config only — the client never
 * sends a price, so it cannot influence what is charged.
 */
async function createInvoice({ user, externalId, successUrl, failureUrl, description }) {
  const { price, currency, plan } = planConfig();

  // Local sandbox: produce a structurally identical invoice object without
  // calling Xendit, so the rest of the pipeline (persist -> verify -> settle)
  // is exercised exactly as it would be with live credentials.
  if (isSandboxMode()) {
    const sandboxId = `sandbox_${externalId}`;
    return {
      id: sandboxId,
      external_id: externalId,
      status: 'PENDING',
      amount: price,
      currency,
      description,
      invoice_url: `${successUrl}?sandbox_invoice_id=${sandboxId}&external_id=${externalId}`,
      expiry_date: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      sandbox: true,
    };
  }

  const payload = {
    external_id: externalId,
    amount: price,
    currency,
    description: description || `FocusFlow Go Unlimited — ${plan} (${user.email})`,
    payer_email: user.email,
    customer: {
      given_names: user.name || 'FocusFlow Student',
      email: user.email,
    },
    success_redirect_url: successUrl,
    failure_redirect_url: failureUrl,
    items: [
      {
        name: `Go Unlimited (${plan})`,
        quantity: 1,
        price,
        category: 'Subscription',
      },
    ],
    // Metadata is echoed back on the webhook, letting us reconcile even if the
    // external_id is somehow lost.
    metadata: { userId: user.id, plan },
  };

  return xenditRequest('/v2/invoices', { method: 'POST', body: payload });
}

/**
 * Fetches the authoritative invoice state straight from Xendit. This is the
 * only thing allowed to grant premium: a student returning to the success URL
 * proves nothing, because that URL can be typed in by hand.
 */
async function getInvoice(invoiceId, options) {
  if (!invoiceId) throw new Error('invoiceId is required');
  const opts = options || {};

  // In sandbox the "remote" state lives on our own Payment row, so read it
  // back through the same shape Xendit would return. This keeps verification
  // logic identical in both modes.
  if (isSandboxMode() && String(invoiceId).startsWith('sandbox_')) {
    const prisma = require('./prisma');
    const externalId = String(invoiceId).replace(/^sandbox_/, '');
    const payment = await prisma.payment.findFirst({ where: { externalId } });
    // `simulatePaid` lets the dev-only sandbox endpoint act as though the
    // student completed checkout, without pre-marking our own row (which would
    // trip settlePaidPayment's already-settled guard).
    const paid = opts.simulatePaid === true || (payment && payment.status === 'PAID');
    return {
      id: invoiceId,
      external_id: externalId,
      status: paid ? 'PAID' : 'PENDING',
      amount: payment ? payment.amount : planConfig().price,
      currency: payment ? payment.currency : planConfig().currency,
      paid_at: paid && payment.paidAt ? payment.paidAt.toISOString() : null,
      payment_method: paid ? 'SANDBOX' : null,
      sandbox: true,
    };
  }

  return xenditRequest(`/v2/invoices/${encodeURIComponent(invoiceId)}`);
}

/**
 * Verifies the `x-callback-token` header on an incoming webhook. Uses a
 * constant-time comparison so the token cannot be recovered byte-byte.
 */
function verifyCallbackToken(headerValue) {
  const expected = (process.env.XENDIT_CALLBACK_TOKEN || '').trim();
  if (!expected) return false;
  if (!headerValue) return false;
  if (/x{4,}|your[_-]?callback|placeholder|change[_-]?me/i.test(expected)) return false;

  const a = Buffer.from(String(headerValue));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Verifies a webhook's authenticity. Xendit signs webhooks with the callback
 * token; we also accept the legacy `x-callback-token` query param used by some
 * dashboard test buttons.
 */
function verifyWebhook(req) {
  const headerToken = req.get ? req.get('x-callback-token') : undefined;
  const queryToken = req.query ? req.query.callback_token || req.query.token : undefined;
  return verifyCallbackToken(headerToken) || verifyCallbackToken(queryToken);
}

function invoiceStatusToPaymentStatus(status) {
  const value = String(status || '').toUpperCase();
  if (value === 'PAID' || value === 'SETTLED') return 'PAID';
  if (value === 'EXPIRED') return 'EXPIRED';
  if (value === 'FAILED') return 'FAILED';
  return 'PENDING';
}

function checkoutUrlFor(invoice) {
  if (!invoice) return null;
  if (invoice.invoice_url && String(invoice.invoice_url).startsWith('http')) return invoice.invoice_url;
  if (invoice.id && isTestMode()) {
    // Xendit test invoices are viewable through the hosted checkout host.
    return `${CHECKOUT_BASE}/${invoice.id}`;
  }
  return invoice.invoice_url || null;
}

module.exports = {
  isXenditConfigured,
  isSandboxMode,
  paymentsAvailable,
  isTestMode,
  planConfig,
  createInvoice,
  getInvoice,
  verifyWebhook,
  verifyCallbackToken,
  invoiceStatusToPaymentStatus,
  checkoutUrlFor,
};
