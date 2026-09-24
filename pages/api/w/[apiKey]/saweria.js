import { prisma } from "../../../../lib/prisma";

// Ini yang ditempel di pengaturan webhook Saweria (dashboard Saweria kamu):
// https://domain-lo.com/api/w/<APIKEY>/saweria
//
// Payload asli dari Saweria formatnya kira-kira: { donator_name, amount_raw, amount, message, ... }
// Kalau nanti ternyata field-nya beda, kirim contoh payload asli (dari log Saweria atau
// dari testing), gue sesuaikan bagian "ambil data dari body" di bawah.
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

  const body = req.body || {};
  const donorName = body.donator_name || body.username || "Anonim";
  const amount = Number(body.amount_raw ?? body.amount ?? 0);
  const message = body.message || null;

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "invalid_amount" });
  }

  const donation = await prisma.donation.create({
    data: {
      donorName,
      amount,
      message,
      provider: "saweria",
      status: "pending",
      workspaceId: workspace.id,
    },
  });

  return res.status(200).json({ ok: true, donationId: donation.id });
}
