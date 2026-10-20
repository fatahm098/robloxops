# Portofolio otomatis ke X

Setiap komisi yang selesai dibuatkan **draf** portofolio. Tidak ada yang tayang
tanpa persetujuan manusia: draf masuk antrean di `/portfolio`, desainer
memeriksa caption, lalu klik **Publish**.

## Alur

```
status proyek → delivered / approved
  └─ web: requestPortfolioDraft()   (projects/actions.ts)
        ├─ buat signed URL deliverable (1 jam)
        └─ POST {WORKER_URL}/portfolio/draft
              └─ app/social.py::draft_for_project
                    ├─ LLM: caption ≤ 240 char, maks 2 hashtag
                    └─ insert portfolio_posts (status = queued)

/portfolio → [Publish]
  └─ POST /portfolio/publish
        └─ upload media (v1.1) → POST /2/tweets (v2)
              ├─ sukses → status=published + external_url
              └─ gagal  → status=failed + error (bisa dicoba lagi)
```

## Tabel

| Tabel | Isi |
| --- | --- |
| `social_accounts` | metadata akun (handle, status). Token **tidak** di sini. |
| `portfolio_posts` | antrean review: caption, media, status, external_url |

Status: `queued` → `publishing` → `published` / `failed`, atau `rejected`.
Satu post aktif per proyek per platform (index unik parsial); post `rejected`
tidak menghalangi percobaan berikutnya.

Token disimpan di Supabase Vault sebagai `X_API_KEY`, `X_API_SECRET`,
`X_ACCESS_TOKEN`, `X_ACCESS_SECRET` (whitelist `tenant_secrets` diperluas di
migrasi `0017_social_portfolio.sql`). UI hanya menampilkan 4 karakter terakhir.

## Setup aplikasi X

1. Buat app di [X Developer Portal](https://developer.x.com/) dengan tipe
   **Read and write**.
2. Aktifkan permission `tweet.write` dan `media.write`.
3. Generate **Access Token & Secret** untuk akun yang akan memposting
   (user context, bukan bearer token app-only).
4. Isi keempat nilai di **Settings → Integrations / API Keys**, lalu isi handle
   di bagian **Akun X untuk portofolio**.

## Batasan yang disengaja

- **Hanya gambar.** Video butuh chunked upload (`INIT`/`APPEND`/`FINALIZE`) dan
  belum didukung.
- **Tanpa retry otomatis.** Kalau X menolak (rate limit, token kedaluwarsa),
  post menjadi `failed` dan desainer bisa klik Publish lagi setelah memperbaiki
  caption atau token.
- **Tanpa OAuth flow otomatis.** Token diisi manual; alur "Connect with X"
  adalah pekerjaan berikutnya.
- **Caption bisa diedit** sebelum publish (`savePortfolioCaption`, RLS update).

## Uji cepat

```bash
# draf
curl -s localhost:8080/portfolio/draft \
  -H "authorization: Bearer $INTERNAL_WORKER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"11111111-1111-4111-8111-111111111111","project_id":"33333333-3333-4333-8333-333333333333","media":[]}'

# publish
curl -s localhost:8080/portfolio/publish \
  -H "authorization: Bearer $INTERNAL_WORKER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"11111111-1111-4111-8111-111111111111","post_id":"<uuid>"}'
```

Tanpa kredensial X, `publish` mengembalikan `status: "failed"` dengan
`error: "X account is not connected"` — draf tetap aman di antrean.
