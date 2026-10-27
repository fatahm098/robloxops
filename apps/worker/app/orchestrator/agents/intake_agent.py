"""Customer Intake Agent ('Lexi') for RobloxOps Studio.

Handles chatting with customers in Discord, understanding asset needs,
extracting technical briefs, and preparing pricing estimates with RAG Vector Memory.
"""

from __future__ import annotations

import re
from typing import Any, Dict
from ..state import AgentState
from ..memory import knowledge_store

# Typical baseline pricing for Roblox studio commissions (in IDR)
BASE_PRICING = {
    "clothing": 150_000,       # 2D Clothing set (shirt + pants)
    "accessory": 250_000,      # UGC 3D Accessory (hat, back item, shoulder pet)
    "avatar_item": 300_000,    # Complex wearable bundle / armor
    "game_asset": 350_000,     # Map prop, weapon model, tool
    "fx": 200_000,             # Particle effects / vfx
    "other": 250_000,
}

UGC_POLY_LIMITS = {
    "accessory": 4000,
    "clothing": 4000,
    "avatar_item": 4000,
    "game_asset": 10000,
    "other": 4000,
}


def extract_brief_details(text: str, existing: Dict[str, Any]) -> Dict[str, Any]:
    """Extract Roblox asset requirements from customer message."""
    data = dict(existing or {})
    pesan = text.lower()

    # 1. Asset Type detection
    if any(k in pesan for k in ["baju", "celana", "outfit", "clothing", "uniform", "jersey", "suit"]):
        data["asset_type"] = "clothing"
    elif any(k in pesan for k in ["topi", "sayap", "pedang", "katana", "helm", "accessory", "aksesoris", "ugc", "masker"]):
        data["asset_type"] = "accessory"
    elif any(k in pesan for k in ["map", "gedung", "rumah", "prop", "mobil", "senjata", "game asset"]):
        data["asset_type"] = "game_asset"
    elif any(k in pesan for k in ["partikel", "vfx", "fx", "aura"]):
        data["asset_type"] = "fx"
    elif "asset_type" not in data:
        data["asset_type"] = "accessory"

    # 2. Style detection
    if "cyberpunk" in pesan or "futuristic" in pesan or "neon" in pesan:
        data["style"] = "Cyberpunk / Sci-Fi"
    elif "anime" in pesan or "manga" in pesan:
        data["style"] = "Anime Stylized"
    elif "realistic" in pesan or "militer" in pesan or "tactical" in pesan:
        data["style"] = "Realistic Tactical"
    elif "low poly" in pesan or "kartun" in pesan:
        data["style"] = "Low Poly Cartoon"
    elif "style" not in data:
        data["style"] = "Custom Stylized"

    # 3. Colors / Palettes
    colors = []
    if "hitam" in pesan or "black" in pesan:
        colors.append("#1A1A1A")
    if "putih" in pesan or "white" in pesan:
        colors.append("#FFFFFF")
    if "merah" in pesan or "red" in pesan:
        colors.append("#FF3366")
    if "biru" in pesan or "blue" in pesan or "cyan" in pesan:
        colors.append("#00D2FF")
    if "emas" in pesan or "gold" in pesan or "kuning" in pesan:
        colors.append("#FFD700")
    if colors:
        data["color_palette"] = list(set((data.get("color_palette") or []) + colors))

    # 4. Reference links
    urls = re.findall(r"https?://[^\s]+", text)
    if urls:
        data["references"] = list(set((data.get("references") or []) + urls))

    # 5. Technical specs
    data["poly_budget"] = UGC_POLY_LIMITS.get(data.get("asset_type", "accessory"), 4000)
    data["texture_res"] = "1024x1024" if data.get("asset_type") != "clothing" else "585x559"
    data["estimated_price_idr"] = BASE_PRICING.get(data.get("asset_type", "accessory"), 250_000)

    return data


def intake_agent_node(state: AgentState) -> AgentState:
    """Intake node: process customer message, retrieve knowledge memory, and guide to brief."""
    user_msg = state.get("latest_user_message") or ""
    brief = extract_brief_details(user_msg, state.get("brief_data") or {})
    state["brief_data"] = brief

    pesan_lower = user_msg.lower()
    
    # Check if customer wants to proceed / finalize deal
    deal_words = ["oke", "ok", "buatkan", "gas", "deal", "setuju", "bayar", "lanjut", "siap"]
    is_confirming = any(w in pesan_lower.split() for w in deal_words) and "batal" not in pesan_lower

    harga = brief.get("estimated_price_idr", 250_000)
    harga_format = f"Rp {harga:,}".replace(",", ".")
    tipe = brief.get("asset_type", "aset Roblox")
    style = brief.get("style", "Custom")

    # Semantic Knowledge Retrieval (RAG via Vector Store)
    matched_docs = knowledge_store.search_knowledge(user_msg, top_k=1, threshold=0.15)
    knowledge_note = ""
    if matched_docs:
        doc = matched_docs[0]
        knowledge_note = f"\n\n💡 **Informasi Tambahan ({doc['title']})**:\n{doc['content']}"

    if is_confirming and brief.get("asset_type"):
        state["current_stage"] = "payment_pending"
        state["next_step"] = "billing_agent"
        state["reply_to_customer"] = (
            f"Mantap! Rincian pesanan sudah lengkap:\n"
            f"• **Tipe Aset**: {tipe.capitalize()}\n"
            f"• **Gaya/Tema**: {style}\n"
            f"• **Batas Poligon**: Max {brief.get('poly_budget')} tris (Standar Roblox UGC)\n"
            f"• **Biaya Pembuatan**: **{harga_format}**\n\n"
            f"Saya langsung buatkan invoice pembayaran QRIS agar pesanan ini bisa langsung dikerjakan oleh tim desainer kami ya!"
            f"{knowledge_note}"
        )
        return state

    # Still in inquiry / gathering details
    state["current_stage"] = "intake"
    state["next_step"] = "wait_user"
    state["reply_to_customer"] = (
        f"Halo! Saya **Lexi**, AI Asisten RobloxOps Studio 👋\n"
        f"Saya siap bantu wujudkan aset Roblox impianmu!\n\n"
        f"📋 **Catatan Konsep Sementara**:\n"
        f"• Tipe: **{tipe.capitalize()}**\n"
        f"• Tema/Style: **{style}**\n"
        f"• Estimasi Biaya: **{harga_format}** (Pembayaran aman via QRIS)\n\n"
        f"Apakah ada link gambar referensi atau detail warna khusus yang kamu inginkan? "
        f"Kalau rincian di atas sudah cocok, ketik **'Oke'** atau **'Lanjut'** untuk langsung saya siapkan QRIS-nya!"
        f"{knowledge_note}"
    )
    return state
