# Golden Donate Cash

Dashboard web untuk memantau donasi cash (Saweria, Bagi-Bagi, Sociabuzz) dari
game Roblox, dengan login Discord, multi-workspace per owner, dan panel admin
khusus super owner.

## 1. Jalanin di komputer sendiri dulu (opsional tapi disarankan)

```
npm install
cp .env.example .env
```

Isi `.env`:
- `NEXTAUTH_SECRET` — string acak, bisa generate pakai `openssl rand -base64 32`
- `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` — dari langkah 2 di bawah
- `SUPER_OWNER_DISCORD_ID` — Discord User ID akun kamu (klik kanan nama > Copy User ID, Developer Mode harus aktif dulu di Discord Settings > Advanced)

Lalu:
```
npx prisma migrate dev --name init
npm run dev
```
Buka http://localhost:3000

## 2. Bikin Discord Application (buat login)

1. Buka https://discord.com/developers/applications > New Application
2. Masuk ke tab **OAuth2** > catat **Client ID** dan **Client Secret**
3. Di **Redirects**, tambahkan:
   - `http://localhost:3000/api/auth/callback/discord` (buat coba-coba lokal)
   - `https://domain-produksi-kamu.com/api/auth/callback/discord` (isi setelah deploy)

## 3. Deploy ke Vercel

1. Push folder ini ke GitHub repo
2. Buka https://vercel.com > New Project > import repo tsb
3. Di **Environment Variables**, isi semua variabel dari `.env.example`
   (kecuali `DATABASE_URL` — lihat langkah 4)
4. Deploy

## 4. Database production

SQLite (`file:./dev.db`) cuma buat coba-coba lokal — di Vercel filesystem-nya
sementara, jadi data bisa hilang. Buat production, pakai Postgres gratis dari
salah satu ini:
- https://neon.tech
- https://supabase.com
- https://railway.app

Setelah dapat connection string:
1. Di `prisma/schema.prisma`, ganti `provider = "sqlite"` jadi `provider = "postgresql"`
2. Set `DATABASE_URL` di Vercel ke connection string tsb
3. Jalankan `npx prisma migrate deploy` (atau `npx prisma db push` buat cepat)

## 5. Sambungkan Roblox Studio (khusus asset WX_SAWERIA)

Sistem donasi kamu (asset **WX_SAWERIA**) sudah punya arsitektur sendiri: dia
polling ke sebuah URL ("pull") lalu konfirmasi balik ("ack"), bukan model
webhook sederhana. Backend project ini sudah dibikin cocok 1:1 dengan
kontrak itu, jadi kamu **tidak perlu ubah script Lua-nya sama sekali** —
cukup ubah beberapa baris di **Config**.

Buka **`ReplicatedStorage > WX Saweria > Config`** (ModuleScript) di Roblox
Studio, cari bagian `Config.Connection`, lalu ganti jadi:

```lua
Config.Connection = {
    WorkerBaseUrl = "https://domain-produksi-kamu.com/api/w/gld_live_xxxxxxxx", -- API key dari halaman API Key di web
    PullPath = "/pull",
    AckPath = "/ack",
    WebhookPath = "/saweria",
    PollInterval = 3,
    PullLimit = 10,
    UseMessagingService = true,
    MessagingTopic = "WX_SAWERIA_GLOBAL_V2",
}
```

Yang berubah cuma `WorkerBaseUrl` (arahkan ke domain kamu + API key
workspace) dan `PullPath`/`AckPath`/`WebhookPath` (dipendekkan karena
`/api/w/<key>` sudah ada di `WorkerBaseUrl`).

**Jangan lupa** di Roblox Studio: Game Settings > Security > aktifkan
**Allow HTTP Requests**.

## 6. Sambungkan Saweria

Di dashboard web, halaman **Provider**, aktifkan Saweria lalu salin
**Webhook URL**-nya (formatnya `.../api/w/<apiKey>/saweria`), tempel ke
pengaturan webhook di dashboard Saweria kamu.

Format payload di `pages/api/w/[apiKey]/saweria.js` saat ini mengasumsikan
Saweria mengirim field `donator_name`, `amount_raw`/`amount`, `message` —
kalau nanti ternyata beda setelah dites, kirim contoh payload aslinya
(dari log request Saweria) dan gue sesuaikan.

## 7. Donasi Palsu buat tes ujung-ke-ujung

Halaman **Donasi Palsu** di web membuat baris donasi langsung di database
(provider `"test"`) — donasi ini otomatis masuk ke antrean yang sama dan
akan ke-pull oleh Roblox Studio kamu di siklus polling berikutnya, tanpa
perlu donasi Saweria asli. Berguna buat mastiin `WorkerBaseUrl` di Config
sudah benar sebelum sambungin Saweria beneran.


## Catatan

Endpoint `/api/roblox/pending` dan `/api/roblox/claim` masih ada di project
ini sebagai fallback generik (kalau nanti kamu bikin sistem donasi custom
sendiri yang modelnya "ambil satu-satu, tandai selesai" alih-alih
pull-and-lease). Untuk asset WX_SAWERIA, yang dipakai adalah
`/api/w/[apiKey]/pull` dan `/api/w/[apiKey]/ack` seperti dijelaskan di atas.

Bagi-Bagi dan Sociabuzz belum ada di asset WX_SAWERIA versi ini (cuma
Saweria) — begitu kamu punya sistem serupa buat provider itu, kirim
script-nya dan kita sesuaikan endpoint webhook-nya (masih pakai
`/api/webhook/[provider]/[token]` yang generik).
