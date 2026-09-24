import { prisma } from "../../../../lib/prisma";

// URL ini yang ditempel di pengaturan webhook Saweria/Bagi-Bagi/Sociabuzz:
// https://domain-lo.com/api/webhook/saweria/<webhookToken>
//
// CATATAN: body parsing di bawah ini format GENERIK (donor, amount, message).
// Nanti pas script Saweria/Bagi-Bagi asli lo dikirim, kita sesuaikan bagian
// "ambil data dari body" di bawah supaya cocok sama payload asli tiap provider.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const { provider, token } = req.query;

  const providerRow = await prisma.provider.findUnique({
    where: { webhookToken: token },
  });

  if (!providerRow || providerRow.type !== provider) {
    return res.status(404).json({ error: "provider_not_found" });
  }
  if (!providerRow.enabled) {
    return res.status(403).json({ error: "provider_disabled" });
  }

  // --- Sesuaikan bagian ini dengan payload asli tiap provider nanti ---
  const donorName = req.body.donor_name || req.body.supporter_name || "Anonim";
  const amount = Number(req.body.amount || req.body.amount_raw || 0);
  const message = req.body.message || req.body.comment || null;
  // ---------------------------------------------------------------

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: "invalid_amount" });
  }

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
}
