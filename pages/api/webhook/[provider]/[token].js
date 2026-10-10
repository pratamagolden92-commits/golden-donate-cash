import { prisma } from "../../../../lib/prisma";

// Webhook generik untuk provider selain Saweria (Bagi-Bagi, Sociabuzz).
// URL: https://golden-donate-cash.vercel.app/api/webhook/<provider>/<webhookToken>
//
// PERHATIAN: jalur ini TIDAK memverifikasi signature, hanya mengandalkan
// webhookToken di URL. Anggap token itu rahasia. Saweria sengaja diblokir di sini
// dan harus lewat /api/w/<APIKEY>/saweria yang memverifikasi signature.

function clean(value, fallback, max) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { provider, token } = req.query;

  if (provider === "saweria") {
    return res.status(410).json({
      error: "use_signed_saweria_endpoint",
      hint: "/api/w/<APIKEY>/saweria",
    });
  }

  const providerRow = await prisma.provider.findUnique({
    where: { webhookToken: token },
  });

  if (!providerRow || providerRow.type !== provider) {
    return res.status(404).json({ error: "provider_not_found" });
  }
  if (!providerRow.enabled) {
    return res.status(403).json({ error: "provider_disabled" });
  }

  const body = req.body || {};

  // --- Sesuaikan bagian ini dengan payload asli tiap provider ---
  const donorName = clean(body.donor_name || body.supporter_name, "Anonim", 60);
  const message = clean(body.message || body.comment, "", 500) || null;
  const amount = Math.floor(Number(body.amount || body.amount_raw || 0));
  // -------------------------------------------------------------

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  try {
    const donation = await prisma.donation.create({
      data: {
        donorName,
        amount,
        message,
        provider,
        status: "pending",
        workspaceId: providerRow.workspaceId,
      },
    });
    return res.status(200).json({ ok: true, donationId: donation.id });
  } catch (err) {
    console.error("webhook error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
