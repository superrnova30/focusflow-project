const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { requireAuth } = require('../middleware/auth');
const xendit = require('../lib/xendit');
const {
  premiumState,
  expireLapsedSubscriptions,
  settlePaidPayment,
} = require('../lib/premium');

const router = express.Router();

// Benefits shown on the premium page. Kept on the server so the pricing screen
// and any future client stay in sync with one source of truth.
const PLAN_BENEFITS = [
  { key: 'unlimitedCards', label: 'Unlimited Cards', basic: true, unlimited: true },
  { key: 'unlimitedHearts', label: 'Unlimited Hearts', basic: false, unlimited: true },
  { key: 'unlimitedAiTutor', label: 'Unlimited AI Tutor', basic: false, unlimited: true },
  { key: 'unlimitedHints', label: 'Unlimited Hints', basic: false, unlimited: true },
  { key: 'unlimitedPrompts', label: 'Unlimited Prompts', basic: false, unlimited: true },
];

function buildReturnUrl(kind) {
  const configured = process.env[kind === 'success' ? 'PREMIUM_SUCCESS_URL' : 'PREMIUM_FAILURE_URL'];
  if (configured) return configured;
  const frontend = process.env.FRONTEND_URL || process.env.ND_URL || 'http://localhost:19006';
  return `${frontend.replace(/\/$/, '')}/premium/${kind === 'success' ? 'success' : 'failed'}`;
}

function publicPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    plan: payment.plan,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    checkoutUrl: payment.checkoutUrl,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
    expiresAt: payment.expiresAt,
  };
}

/**
 * GET /api/premium/plan
 * Public-ish plan info (auth required so it is scoped to a real user): price,
 * benefits, and whether payments are actually available on this server.
 */
router.get('/plan', requireAuth, async (req, res) => {
  const { price, currency, durationDays, plan } = xendit.planConfig();
  res.json({
    plan: {
      id: plan,
      name: 'Go Unlimited',
      price,
      currency,
      durationDays,
      heading: 'AI Powered Pomodoro Unlimited members get higher grades',
      benefits: PLAN_BENEFITS,
    },
    paymentsEnabled: xendit.paymentsAvailable(),
    testMode: xendit.isTestMode(),
    sandbox: xendit.isSandboxMode(),
  });
});

/**
 * GET /api/premium/status
 * The student's current entitlement. Safe to call on every app boot — this is
 * what makes premium survive logout/login and page refreshes.
 */
router.get('/status', requireAuth, async (req, res) => {
  // Opportunistically expire lapsed subscriptions so the response is truthful.
  await expireLapsedSubscriptions();

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const payments = await prisma.payment.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const activePending = payments.find((p) => p.status === 'PENDING' && p.checkoutUrl) || null;

  res.json({
    premium: premiumState(user),
    // Lets the app resume an in-flight checkout instead of creating a new one.
    pendingPayment: publicPayment(activePending),
    payments: payments.map(publicPayment),
    paymentsEnabled: xendit.paymentsAvailable(),
    testMode: xendit.isTestMode(),
    sandbox: xendit.isSandboxMode(),
  });
});

/**
 * POST /api/premium/checkout
 * Creates a real Xendit invoice and returns the hosted checkout URL. The amount
 * comes from server config; the client cannot influence it.
 */
router.post('/checkout', requireAuth, async (req, res) => {
  try {
    if (!xendit.paymentsAvailable()) {
      return res.status(503).json({
        // Keep the machine-readable code for the client; the human-readable
        // message must not expose server configuration to students.
        error: 'Payments are temporarily unavailable. Please try again later.',
        code: 'XENDIT_NOT_CONFIGURED',
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: 'Account no longer exists' });

    const { price, currency, plan, durationDays } = xendit.planConfig();

    // Reuse an unexpired pending invoice so double-tapping "See Plans" does not
    // create duplicate charges.
    const existing = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: 'PENDING',
        checkoutUrl: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing && existing.checkoutUrl) {
      return res.json({
        payment: publicPayment(existing),
        checkoutUrl: existing.checkoutUrl,
        reused: true,
        testMode: xendit.isTestMode(),
      });
    }

    const externalId = `FF-${user.id.slice(0, 10)}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        provider: 'xendit',
        plan,
        amount: price,
        currency,
        status: 'PENDING',
        externalId,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    let invoice;
    try {
      invoice = await xendit.createInvoice({
        user,
        externalId,
        description: `FocusFlow Go Unlimited — ${durationDays} days`,
        successUrl: buildReturnUrl('success'),
        failureUrl: buildReturnUrl('failure'),
      });
    } catch (err) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', rawPayload: { error: err.message, body: err.body } },
      });
      console.error('Xendit invoice creation failed:', err.message);
      // The provider's error text is for server logs only — never for the client.
      return res.status(502).json({
        error: 'Could not start the payment. Please try again.',
      });
    }

    const checkoutUrl = xendit.checkoutUrlFor(invoice);

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        xenditInvoiceId: invoice.id || null,
        checkoutUrl,
        expiresAt: invoice.expiry_date ? new Date(invoice.expiry_date) : payment.expiresAt,
        rawPayload: { created: invoice },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        action: 'premium_checkout_started',
        meta: { paymentId: updated.id, amount: price, currency, plan },
      },
    });

    return res.status(201).json({
      payment: publicPayment(updated),
      checkoutUrl,
      reused: false,
      testMode: xendit.isTestMode(),
    });
  } catch (err) {
    console.error('Premium checkout error', err);
    return res.status(500).json({ error: 'Could not start the payment. Please try again.' });
  }
});

/**
 * POST /api/premium/verify
 * Called when the student returns from Xendit. Fetches the invoice directly
 * from Xendit and upgrades the account only if Xendit reports it PAID. The
 * client's own claim of success is never trusted.
 */
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const paymentId = req.body ? req.body.paymentId : undefined;
    const invoiceId = req.body ? req.body.invoiceId : undefined;
    const externalId = req.body ? req.body.externalId : undefined;

    const payment = await prisma.payment.findFirst({
      where: {
        userId: req.user.id, // scoped: a student can only verify their own payment
        ...(paymentId ? { id: paymentId } : {}),
        ...(invoiceId ? { xenditInvoiceId: invoiceId } : {}),
        ...(externalId ? { externalId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) return res.status(404).json({ error: 'Payment not found' });

    const alreadyPaid = payment.status === 'PAID';

    if (!xendit.paymentsAvailable()) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      return res.json({
        verified: alreadyPaid,
        premium: premiumState(user),
        payment: publicPayment(payment),
        message: 'Payments are temporarily unavailable.',
      });
    }

    if (!payment.xenditInvoiceId) {
      return res.status(400).json({ error: 'This payment has no Xendit invoice to verify yet.' });
    }

    const invoice = await xendit.getInvoice(payment.xenditInvoiceId);
    const status = xendit.invoiceStatusToPaymentStatus(invoice.status);

    if (status === 'PAID') {
      await settlePaidPayment({ payment, invoice, source: 'client_verify' });
    } else if (status !== 'PENDING') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status, rawPayload: { verified: invoice } },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });

    await prisma.activityLog.create({
      data: {
        userId: req.user.id,
        action: status === 'PAID' ? 'premium_activated' : 'premium_verify_checked',
        meta: { paymentId: payment.id, xenditStatus: invoice.status },
      },
    });

    return res.json({
      verified: status === 'PAID',
      xenditStatus: invoice.status,
      premium: premiumState(user),
      payment: publicPayment(fresh),
    });
  } catch (err) {
    console.error('Premium verify error', err);
    return res.status(502).json({ error: 'Could not verify the payment right now. Please try again.' });
  }
});

/**
 * POST /api/premium/webhook
 * Xendit calls this when an invoice's status changes. This is the primary,
 * out-of-band path to activation — it works even if the student closes the
 * browser before returning. The callback token is verified first, and the
 * authoritative invoice is then re-fetched from Xendit.
 */
router.post('/webhook', async (req, res) => {
  try {
    if (!xendit.verifyWebhook(req)) {
      console.warn('Rejected Xendit webhook with invalid callback token');
      return res.status(401).json({ error: 'Invalid callback token' });
    }

    const body = req.body || {};
    const event = body.event || body.status || '';
    const isInvoiceEvent = /invoice/i.test(String(event)) || Boolean(body.id && body.external_id);
    if (!isInvoiceEvent) return res.json({ ok: true, ignored: true });

    const externalId = body.external_id;
    const invoiceId = body.id;

    const payment = await prisma.payment.findFirst({
      where: {
        ...(externalId ? { externalId } : {}),
        ...(!externalId && invoiceId ? { xenditInvoiceId: invoiceId } : {}),
      },
    });

    if (!payment) {
      // Acknowledge so Xendit stops retrying — but never guess at an upgrade.
      console.warn('Xendit webhook for unknown payment', { externalId, invoiceId });
      return res.json({ ok: true, unknown: true });
    }

    // Re-fetch from Xendit so the webhook body alone can never grant access.
    let invoice = body;
    try {
      if (invoiceId) invoice = await xendit.getInvoice(invoiceId);
    } catch (e) {
      console.warn('Could not re-fetch invoice during webhook:', e.message);
    }

    const status = xendit.invoiceStatusToPaymentStatus(invoice.status);

    if (status === 'PAID') {
      await settlePaidPayment({ payment, invoice, source: 'webhook' });
    } else if (status !== 'PENDING') {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status, rawPayload: { webhook: invoice } },
      });
    }

    return res.json({ ok: true, status });
  } catch (err) {
    console.error('Xendit webhook error', err);
    // 500 makes Xendit retry the delivery.
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/premium/sandbox/pay
 * Development-only helper. Simulates the student completing checkout in the
 * Xendit-hosted page, then runs the EXACT same verification + settlement path a
 * real payment would (getInvoice -> settlePaidPayment). Disabled in production
 * and when a real Xendit key is configured.
 */
router.post('/sandbox/pay', requireAuth, async (req, res) => {
  if (!xendit.isSandboxMode()) {
    return res.status(403).json({
      error: 'Sandbox payments are disabled.',
    });
  }

  try {
    const paymentId = req.body ? req.body.paymentId : undefined;
    const payment = await prisma.payment.findFirst({
      where: { userId: req.user.id, ...(paymentId ? { id: paymentId } : {}) },
      orderBy: { createdAt: 'desc' },
    });

    if (!payment) return res.status(404).json({ error: 'No pending payment found' });

    // Simulate what Xendit reports once the student completes the hosted
    // checkout. We deliberately do NOT flip our own row to PAID here: that is
    // settlePaidPayment's job, and marking it earlier would trip its
    // already-settled guard and skip the account upgrade entirely.
    const invoice = await xendit.getInvoice(payment.xenditInvoiceId, { simulatePaid: true });

    const result = await settlePaidPayment({
      payment,
      invoice,
      source: 'sandbox',
    });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    return res.json({
      ok: true,
      sandbox: true,
      premium: premiumState(user),
      payment: publicPayment(result.payment || payment),
    });
  } catch (err) {
    console.error('Sandbox payment failed', err);
    return res.status(500).json({ error: 'Sandbox payment failed' });
  }
});

module.exports = router;
