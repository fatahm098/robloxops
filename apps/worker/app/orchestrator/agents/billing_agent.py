"""Billing & QRIS Payment Agent for RobloxOps.

Handles issuing dynamic QRIS invoices, formatting Discord embed receipts,
and verifying payments before releasing tasks to designers.
"""

from __future__ import annotations

import time
from typing import Any, Dict
from ..qris_service import QRISService
from ..state import AgentState


def billing_agent_node(state: AgentState) -> AgentState:
    """Billing node: generate QRIS invoice or verify payment."""
    user_msg = (state.get("latest_user_message") or "").lower()
    brief = state.get("brief_data") or {}
    payment = state.get("payment_data") or {}
    customer_name = state.get("customer_name") or "Pelanggan"
    
    amount = brief.get("estimated_price_idr", 250_000)
    asset_desc = f"Pembuatan {brief.get('asset_type', 'Aset').capitalize()} Roblox ({brief.get('style', 'Custom')})"

    # Check if customer says they already paid
    if payment.get("invoice_id") and any(w in user_msg for w in ["sudah bayar", "dah bayar", "lunas", "cek bayar", "paid", "transfer"]):
        invoice_id = payment["invoice_id"]
        # Verify / mark paid
        paid_record = QRISService.mark_as_paid(invoice_id)
        if paid_record:
            payment["status"] = "paid"
            payment["paid_at"] = time.time()
            state["payment_data"] = payment
            state["current_stage"] = "in_design"
            state["next_step"] = "task_agent"
            state["reply_to_customer"] = (
                f"✅ **PEMBAYARAN QRIS BERHASIL DIVERIFIKASI!**\n\n"
                f"Terima kasih, **{customer_name}**! Pembayaran sebesar **Rp {amount:,}** telah kami terima.\n"
                f"📌 **Status**: Pesanan resmi diteruskan ke antrean kerja desainer 3D Roblox kami.\n"
                f"Desainer kami akan langsung membuat model di Blender/Roblox Studio. "
                f"Begitu draft model selesai, saya akan langsung mengirimkan preview-nya ke sini untuk kamu cek!"
            ).replace(",", ".")
            state["discord_embed"] = {
                "title": "🎉 Pembayaran Lunas - RobloxOps Studio",
                "description": f"Invoice `{invoice_id}` telah lunas diverifikasi.",
                "color": 0x00FF88,
                "fields": [
                    {"name": "Status Pesanan", "value": "🎨 In Design (Sedang Dikerjakan Desainer)", "inline": True},
                    {"name": "Total Lunas", "value": f"Rp {amount:,}".replace(",", "."), "inline": True},
                ]
            }
            return state

    # If no invoice exists yet or requested new QRIS
    if not payment.get("invoice_id") or payment.get("status") != "paid":
        inv = QRISService.create_invoice(
            customer_name=customer_name,
            amount_idr=amount,
            description=asset_desc,
            project_id=state.get("project_id"),
            reference_code=state.get("reference_code"),
        )
        state["payment_data"] = inv
        state["current_stage"] = "payment_pending"
        state["next_step"] = "wait_user"
        
        amount_fmt = f"Rp {amount:,}".replace(",", ".")
        state["reply_to_customer"] = (
            f"Berikut adalah invoice pembayaran resmi via **QRIS**:\n\n"
            f"🧾 **Invoice ID**: `{inv['invoice_id']}`\n"
            f"📦 **Pesanan**: {asset_desc}\n"
            f"💰 **Total Tagihan**: **{amount_fmt}**\n\n"
            f"📱 **Cara Pembayaran**:\n"
            f"1. Buka aplikasi m-Banking (BCA, Mandiri, BRI, BNI) atau e-Wallet (Gopay, OVO, Dana, ShopeePay).\n"
            f"2. Scan kode QRIS di bawah ini.\n"
            f"3. Konfirmasi pembayaran dan jika sudah berhasil, cukup balas chat ini dengan: **'Sudah bayar'**.\n\n"
            f"*Sistem kami akan memverifikasi pembayaran secara instan dan desainer langsung mulai bekerja!*"
        )
        
        state["discord_embed"] = {
            "title": "QRIS Pembayaran Resmi - RobloxOps Studio",
            "description": f"Scan QRIS di bawah untuk menyelesaikan pesanan {asset_desc}.",
            "color": 0x00A2FF,
            "fields": [
                {"name": "Nominal", "value": amount_fmt, "inline": True},
                {"name": "Invoice ID", "value": inv["invoice_id"], "inline": True},
                {"name": "Metode", "value": "Semua m-Banking & e-Wallet (QRIS)", "inline": True},
            ],
            "footer": {"text": "RobloxOps Studio Payment Gateway • Berlaku 24 Jam"}
        }
        return state

    return state
