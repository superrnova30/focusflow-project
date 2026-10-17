const express = require("express");
const crypto = require("crypto");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const xendit = require("../lib/xendit");
const { settlePaidPayment, isPremiumActive } = require("../lib/premium");
const { shopCatalog, findCoinPack, MAX_STREAK_FREEZES } = require("../lib/shop");
const { MAX_HEARTS, loadUserGamification } = require("../lib/gamification");
const { buildGameState } = require("../lib/memorize");

const router = express.Router();
router.use(requireAuth);

function buildReturnUrl(kind) {
  const configured = process.env[kind === "success" ? "SHOP_SUCCESS_URL" : "SHOP_FAILURE_URL"];
  if (configured) return configured;
  const frontend = process.env.FRONTEND_URL || process.env.ND_URL || "http://localhost:19006";
  return `${frontend.replace(/\/$/, "")}/shop/${kind === "success" ? "success" : "failed"}`;
}

function publicPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    kind: payment.kind,
    plan: payment.plan,
    coinsGranted: payment.coinsGranted || 0,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    checkoutUrl: payment.checkoutUrl,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
    expiresAt: payment.expiresAt,
  };
}

function walletPayload(user) {
  const premium = isPremiumActive(user);
  const game = buildGameState(user, premium);
  return {
    coins: game.coins,
    hearts: game.hearts,
    hints: game.hints,
    streakFreezes: user.streakFreezes || 0,
    maxHearts: MAX_HEARTS,
    maxStreakFreezes: MAX_STREAK_FREEZES,
    unlimitedHearts: Boolean(game.unlimitedHearts),
    unlimitedHints: Boolean(game.unlimitedHints),
  };
}

router.get("/catalog", async (req, res) => {
  const user = await loadUserGamification(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const catalog = shopCatalog();
  res.json({
    ...walletPayload(user),
    rewards: catalog.rewards,
    packs: catalog.packs,
    paymentsEnabled: xendit.paymentsAvailable(),
    testMode: xendit.isTestMode(),
    sandbox: xendit.isSandboxMode(),
    xenditHostedCheckout: xendit.isXenditConfigured(),
    testModeInstructions: xendit.isTestMode() ? xendit.testModeCheckoutInstructions() : null,
  });
});

router.post("/coins/checkout", async (req, res) => {
  try {
    if (!xendit.paymentsAvailable()) {
      return res.status(503).json({
        error: "Payments are temporarily unavailable. Please try again later.",
        code: "XENDIT_NOT_CONFIGURED",
      });
    }

    const pack = findCoinPack(req.body?.packId);
    if (!pack) return res.status(400).json({ error: "Choose a coin pack to purchase." });

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(401).json({ error: "Account no longer exists" });

    const existing = await prisma.payment.findFirst({
      where: {
        userId: user.id,
        status: "PENDING",
        kind: "coins",
        plan: pack.id,
        checkoutUrl: { not: null },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing && existing.checkoutUrl && xendit.isHostedCheckoutUrl(existing.checkoutUrl)) {
      return res.json({
        payment: publicPayment(existing),
        checkoutUrl: existing.checkoutUrl,
        reused: true,
        testMode: xendit.isTestMode(),
        localSandbox: false,
        testModeInstructions: xendit.isTestMode() ? xendit.testModeCheckoutInstructions() : null,
      });
    }

    if (existing && existing.checkoutUrl && !xendit.isHostedCheckoutUrl(existing.checkoutUrl)) {
      await prisma.payment.update({
        where: { id: existing.id },
        data: { checkoutUrl: null, status: existing.status === "PENDING" ? "FAILED" : existing.status },
      });
    }

    const externalId = `FFC-${user.id.slice(0, 10)}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        provider: "xendit",
        kind: "coins",
        plan: pack.id,
        coinsGranted: pack.coins,
        amount: pack.amount,
        currency: pack.currency,
        status: "PENDING",
        externalId,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    let invoice;
    try {
      invoice = await xendit.createInvoice({
        user,
        externalId,
        amount: pack.amount,
        currency: pack.currency,
        description: `PomodAI ${pack.name} — ${pack.coins} coins (GCash)`,
        successUrl: buildReturnUrl("success"),
        failureUrl: buildReturnUrl("failure"),
        items: [
          {
            name: `${pack.coins} PomodAI coins`,
            quantity: 1,
            price: pack.amount,
            category: "Digital goods",
          },
        ],
        metadata: { userId: user.id, kind: "coins", packId: pack.id, coins: pack.coins },
      });
    } catch (err) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED", rawPayload: { error: String(err.message || err) } },
      });
      throw err;
    }

    const checkoutUrl = xendit.checkoutUrlFor(invoice);
    const localSandbox = Boolean(xendit.isSandboxMode() || invoice.local_sandbox);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        xenditInvoiceId: invoice.id || null,
        checkoutUrl: checkoutUrl || null,
        rawPayload: { invoice },
      },
    });

    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    return res.json({
      payment: publicPayment(fresh),
      checkoutUrl,
      reused: false,
      localSandbox,
      testMode: xendit.isTestMode(),
      testModeInstructions: xendit.isTestMode() ? xendit.testModeCheckoutInstructions() : null,
    });
  } catch (err) {
    console.error("Coin pack checkout error", err);
    return res.status(500).json({ error: "Could not start the payment. Please try again." });
  }
});

router.post("/coins/verify", async (req, res) => {
  try {
    const paymentId = req.body ? req.body.paymentId : undefined;
    const invoiceId = req.body ? req.body.invoiceId : undefined;
    const externalId = req.body ? req.body.externalId : undefined;

    const payment = await prisma.payment.findFirst({
      where: {
        userId: req.user.id,
        kind: "coins",
        ...(paymentId ? { id: paymentId } : {}),
        ...(invoiceId ? { xenditInvoiceId: invoiceId } : {}),
        ...(externalId ? { externalId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (!payment) return res.status(404).json({ error: "Payment not found" });

    if (!xendit.paymentsAvailable()) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      return res.json({
        verified: payment.status === "PAID",
        wallet: walletPayload(user),
        payment: publicPayment(payment),
        message: "Payments are temporarily unavailable.",
      });
    }

    if (!payment.xenditInvoiceId) {
      return res.status(400).json({ error: "This payment has no Xendit invoice to verify yet." });
    }

    const invoice = await xendit.getInvoice(payment.xenditInvoiceId);
    const status = xendit.invoiceStatusToPaymentStatus(invoice.status);

    if (status === "PAID") {
      await settlePaidPayment({ payment, invoice, source: "shop_verify" });
    } else if (status !== "PENDING") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status, rawPayload: { verified: invoice } },
      });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });

    return res.json({
      verified: status === "PAID",
      pending: status === "PENDING",
      failed: status === "FAILED" || status === "EXPIRED",
      xenditStatus: String(invoice.status || "").toUpperCase(),
      coinsGranted: fresh.coinsGranted || 0,
      wallet: walletPayload(user),
      payment: publicPayment(fresh),
    });
  } catch (err) {
    console.error("Coin pack verify error", err);
    return res.status(502).json({ error: "Could not verify the payment right now. Please try again." });
  }
});

router.post("/coins/sandbox/pay", async (req, res) => {
  if (!xendit.isSandboxMode()) {
    return res.status(403).json({ error: "Sandbox payments are disabled." });
  }

  try {
    const paymentId = req.body ? req.body.paymentId : undefined;
    const payment = await prisma.payment.findFirst({
      where: { userId: req.user.id, kind: "coins", ...(paymentId ? { id: paymentId } : {}) },
      orderBy: { createdAt: "desc" },
    });

    if (!payment) return res.status(404).json({ error: "No pending coin payment found" });

    const invoice = await xendit.getInvoice(payment.xenditInvoiceId, { simulatePaid: true });
    await settlePaidPayment({ payment, invoice, source: "sandbox" });
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    return res.json({
      ok: true,
      sandbox: true,
      verified: true,
      coinsGranted: fresh.coinsGranted || 0,
      wallet: walletPayload(user),
      payment: publicPayment(fresh),
    });
  } catch (err) {
    console.error("Coin sandbox payment failed", err);
    return res.status(500).json({ error: "Sandbox payment failed" });
  }
});

module.exports = router;
