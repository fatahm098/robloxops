# Asisten Studio (in-web chat)

Chat di `/assistant` yang bisa **membaca dan mengubah** data studio. Berbeda
dengan bot Discord (yang melayani customer), asisten ini melayani **desainer**.

## Alur

```
Browser /assistant
  └─ server action  ──►  POST {WORKER_URL}/assistant/chat   (Bearer INTERNAL_WORKER_TOKEN)
                            └─ app/assistant.py: loop tool ≤ 4 langkah
                                  ├─ app/llm.py::_chat_raw(tools=…)
                                  ├─ app/assistant_tools.py  (SQL, tenant-scoped)
                                  └─ log_audit per tool call
```

Transcript disimpan di `assistant_threads` + `assistant_messages` (migrasi
`0016_assistant_chat.sql`). Satu thread per pengguna.

## Tool yang tersedia

| Tool | Jenis | Efek |
| --- | --- | --- |
| `studio_overview` | baca | jumlah proyek per status, task lewat tenggat, pendapatan bulan ini |
| `list_projects` | baca | daftar proyek (opsional filter status) |
| `get_project` | baca | detail proyek + kelengkapan brief + revisi terbuka |
| `list_tasks` | baca | daftar task |
| `create_project` | tulis | buat customer (jika perlu) + proyek baru |
| `update_project_status` | tulis | ubah status proyek |
| `create_task` | tulis | tambah task |
| `log_revision` | tulis | catat revisi + naikkan `revision_count` |
| `draft_customer_message` | tulis-terkendali | **antrekan** pesan ke `outbound_messages` |

Tidak ada tool `delete_*`. Itu keputusan desain: asisten tidak boleh menghapus
data, dan pesan ke customer tidak pernah terkirim otomatis.

## Batas keamanan

- `tenant_id` diambil dari sesi terautentikasi lalu di-inject ke setiap tool.
  Model **tidak pernah** menentukan tenant. Argumen yang tidak ada di skema
  (`tenant_id`, `id`, …) ditolak sebelum query dijalankan.
- Worker memakai service role (bypass RLS), jadi setiap statement di
  `assistant_tools.py` wajib punya `where tenant_id = $1`.
- Setiap tool call menulis baris `agent_audit_log` dengan
  `agent_name = "assistant_agent"` dan `action = "tool:<nama>"`. Isi pesan
  dipotong 60 karakter di audit, tidak pernah disalin penuh.
- `tenants.settings.ai_paused = true` menghentikan asisten sebelum LLM dipanggil.
- Loop dibatasi 4 langkah; setelah itu model dipaksa menjawab tanpa tool.

## Mode tampilan

- **Mode Desainer**: hanya ringkasan aksi tulis (`✓ Proyek ROB-107 dibuat`).
  Tidak ada nama tool, model, atau metrik.
- **Mode Developer**: `<details>` di bawah balasan berisi nama tool + hasilnya.

## Konfigurasi

| Env | Fungsi |
| --- | --- |
| `INTERNAL_WORKER_URL` | alamat worker (default `http://localhost:8080`) |
| `INTERNAL_WORKER_TOKEN` | token bearer yang sama dengan endpoint internal lain |

Kunci LLM per tenant diambil dari Vault (`LLM_API_KEY`, `LLM_BASE_URL`) dengan
fallback ke env proses. Tanpa kunci, `FakeLLM` menjawab dengan data nyata untuk
tool baca dan menolak semua penulisan.

## Uji cepat

```bash
curl -s localhost:8080/assistant/chat \
  -H "authorization: Bearer $INTERNAL_WORKER_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"tenant_id":"11111111-1111-4111-8111-111111111111","message":"ringkas proyek aktif"}'
```
