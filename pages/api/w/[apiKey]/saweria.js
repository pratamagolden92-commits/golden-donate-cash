import crypto from "crypto";
import { prisma } from "../../../../lib/prisma";

// URL yang ditempel di Saweria (Integrations -> Webhook):
// https://golden-donate-cash.vercel.app/api/w/<APIKEY>/saweria

function clean(value, fallback, max) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
  return text || fallback;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { apiKey } = req.query;
  const workspace = await prisma.workspace.findUnique({
    where: { apiKey },
    include: { providers: true },
  });

  if (!workspace || workspace.archived) {
    return res.status(401).json({ error: "invalid_api_key" });
  }

  const saweria = workspace.providers.find((p) => p.type === "saweria");
  if (!saweria || !saweria.enabled) {
    return res.status(403).json({ error: "saweria_disabled" });
  }
  if (!saweria.streamKey) {
    return res.status(403).json({ error: "stream_key_not_set" });
  }

  const body = req.body || {};

  // --- Verifikasi signature dari Saweria ---
  const signature = req.headers["saweria-callback-signature"];
  if (!signature) {
    return res.status(403).json({ error: "missing_signature" });
  }
  const expected = crypto
    .createHmac("sha256", saweria.streamKey)
    .update(
      `${body.version}${body.id}${body.amount_raw}${body.donator_name}${body.donator_email}`
    )
    .digest("hex");
  if (!safeEqual(signature, expected)) {
    console.warn("saweria signature mismatch", { bodyKeys: Object.keys(body) });
    return res.status(401).json({ error: "invalid_signature" });
  }

  // Abaikan event yang bukan donasi
  if (body.type && body.type !== "donation") {
    return res.status(200).json({ ok: true, ignored: true });
  }

  const donorName = clean(body.donator_name || body.username, "Anonim", 60);
  const message = clean(body.message, "", 500) || null;
  const amount = Math.floor(Number(body.amount_raw ?? body.amount ?? 0));

  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  try {
    const donation = await prisma.donation.create({
      data: {
        // id dari Saweria -> kiriman ulang otomatis ditolak (tidak dobel)
        ...(typeof body.id === "string" && body.id ? { id: `saw_${body.id}` } : {}),
        donorName,
        amount,
        message,
        provider: "saweria",
        status: "pending",
        workspaceId: workspace.id,
      },
    });
    return res.status(200).json({ ok: true, donationId: donation.id });
  } catch (err) {
    if (err?.code === "P2002") {
      // sudah pernah masuk: balas 200 supaya Saweria tidak mengulang lagi
      return res.status(200).json({ ok: true, duplicate: true });
    }
    console.error("saweria webhook error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
