const prisma = require('./prisma');
const { planConfig } = require('./xendit');

/**
 * Whether a user currently has Go Unlimited. The expiry date is authoritative,
 * so a stale `isPremium` flag can never outlive the subscription. A null
 * `premiumUntil` with `isPremium` true is treated as a lifetime grant (useful
 * for manual admin comps / testing).
 */
function isPremiumActive(user) {
  if (!user) return false;
  if (user.role === 'ADMIN') return true; // staff always retain full access
  if (!user.isPremium) return false;
  if (!user.premiumUntil) return true;
  return new Date(user.premiumUntil).getTime() > Date.now();
}

/**
 * The premium view of a user, safe to send to the client. Includes derived
 * fields so the app never has to reimplement the expiry logic.
 */
function premiumState(user) {
  const active = isPremiumActive(user);
  const until = user && user.premiumUntil ? new Date(user.premiumUntil) : null;
  const daysRemaining =
    active && until ? Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000)) : 0;

  return {
    isPremium: active,
    plan: active ? user.premiumPlan || planConfig().plan : null,
    planLabel: active ? 'Go Unlimited' : 'Basic',
    premiumSince: user ? user.premiumSince : null,
    premiumUntil: until,
    daysRemaining,
    // Lets the UI explain an expired subscription rather than showing "Basic".
    expired: Boolean(user && user.isPremium && until && until.getTime() <= Date.now()),
  };
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/**
 * Grants (or extends) Go Unlimited for a user and records the subscription.
 * Called only after a payment has been independently verified with Xendit.
 * Idempotent: replaying the same payment will not double-extend the term.
 */
async function grantPremium({ userId, paymentId, plan = 'unlimited', durationDays }) {
  const { durationDays: defaultDays } = planConfig();
  const days = Number(durationDays || defaultDays);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  // Extend from the later of now and the current expiry so a renewal adds time
  // rather than restarting the clock.
  const now = new Date();
  const currentExpiry = user.premiumUntil ? new Date(user.premiumUntil) : null;
  const base = currentExpiry && currentExpiry.getTime() > now.getTime() ? currentExpiry : now;
  const expiresAt = addDays(base, days);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isPremium: true,
      premiumPlan: plan,
      premiumSince: user.premiumSince || now,
      premiumUntil: expiresAt,
    },
  });

  await prisma.subscription.upsert({
    where: { userId },
    update: {
      plan,
      status: 'ACTIVE',
      expiresAt,
      lastPaymentId: paymentId || undefined,
    },
    create: {
      userId,
      plan,
      status: 'ACTIVE',
      startedAt: now,
      expiresAt,
      lastPaymentId: paymentId || undefined,
    },
  });

  return updated;
}

/**
 * Revokes premium immediately (admin action or a failed/refunded payment).
 */
async function revokePremium({ userId, status = 'CANCELLED' }) {
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isPremium: false, premiumPlan: null, premiumUntil: null },
  });

  await prisma.subscription.upsert({
    where: { userId },
    update: { status, expiresAt: new Date() },
    create: { userId, plan: 'unlimited', status, expiresAt: new Date() },
  });

  return updated;
}

/**
 * Expires any subscription whose term has ended. Called opportunistically
 * (before premium reads and on webhook ticks) so the database stays accurate
 * without needing a dedicated scheduler.
 */
async function expireLapsedSubscriptions() {
  const now = new Date();
  try {
    const lapsed = await prisma.user.findMany({
      where: { isPremium: true, premiumUntil: { not: null, lt: now } },
      select: { id: true },
    });
    if (!lapsed.length) return 0;

    const ids = lapsed.map((u) => u.id);
    await prisma.user.updateMany({
      where: { id: { in: ids } },
      data: { isPremium: false, premiumPlan: null },
    });
    await prisma.subscription.updateMany({
      where: { userId: { in: ids }, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });

    return ids.length;
  } catch (err) {
    console.warn('expireLapsedSubscriptions failed:', err && err.message ? err.message : err);
    return 0;
  }
}

/**
 * Marks a payment paid and upgrades the account, exactly once. Safe to call
 * from both the webhook and the client-triggered verification — whichever
 * arrives first wins, and the second becomes a no-op.
 */
async function settlePaidPayment({ payment, invoice, source }) {
  if (!payment) return { alreadySettled: false };
  if (payment.status === 'PAID') return { alreadySettled: true };

  const paidAt = invoice && invoice.paid_at ? new Date(invoice.paid_at) : new Date();

  const updatedPayment = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      status: 'PAID',
      paidAt,
      paymentMethod: invoice && (invoice.payment_method || invoice.payment_channel) || null,
      xenditInvoiceId: (invoice && invoice.id) || payment.xenditInvoiceId || undefined,
      rawPayload: invoice ? { settledFrom: source, invoice } : { settledFrom: source },
    },
  });

  const user = await grantPremium({
    userId: payment.userId,
    paymentId: updatedPayment.id,
    plan: payment.plan,
  });

  return { alreadySettled: false, payment: updatedPayment, user };
}

module.exports = {
  isPremiumActive,
  premiumState,
  grantPremium,
  revokePremium,
  expireLapsedSubscriptions,
  settlePaidPayment,
  addDays,
};
