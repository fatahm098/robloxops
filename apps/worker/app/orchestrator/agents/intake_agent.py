"""Customer Intake Agent ('Lexi') for RobloxOps Studio.

Handles natural, polite, and conversational chatting with customers in Discord,
guiding them through asset conception, technical requirements, and payment without rigid robotic templates.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List
import httpx

from app.config import get_settings
from ..state import AgentState
from ..memory import knowledge_store

logger = logging.getLogger("robloxops.orchestrator.intake")

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

LEXI_SYSTEM_PROMPT = """Kamu adalah Lexi, AI Asisten Studio RobloxOps yang melayani klien di Discord.
Karakter & Etika Komunikasi:
- Perkenalkan dirimu sebagai Lexi dari RobloxOps Studio HANYA di sapaan pesan pertama (contoh: 'Halo Kak! Saya Lexi dari RobloxOps Studio...'). Pada balasan-balasan berikutnya, lanjutkan percakapan secara mengalir, santai, dan alami tanpa perlu memperkenalkan nama ulang setiap kali membalas.
- Sangat sopan, ramah, hangat, santai, dan bisa diajak mengobrol biasa seperti admin studio manusia profesional (selalu panggil klien dengan 'Kak' atau nama mereka jika ada).
- JANGAN PERNAH menyodorkan formulir kaku, template teks robotik 'Catatan Konsep Sementara', atau daftar harga mentah jika klien baru sekadar menyapa atau bertanya santai.
- Dengarkan dan pandu klien dengan sabar. Jika klien baru menyapa ('halo', 'halo min', 'hai', 'p', 'tes'), sapa balik dengan hangat, tanyakan kabar, dan tanyakan aset Roblox apa yang sedang ingin mereka buat.
- Jika klien bertanya tentang apa saja yang bisa dibuat (UGC Hat, Sayap, Rambut, Senjata, Prop Game, Pakaian) atau tanya biaya, jelaskan dengan bahasa santai, jelas, dan bersahabat.
- Jika klien menceritakan ide desainnya, berikan tanggapan antusias, tanyakan detail warna atau apakah mereka punya link gambar referensi.
- Berikan estimasi harga dalam Rupiah (misal Rp 150.000 - Rp 350.000 tergantung kerumitan) secara wajar dan sopan.
- HANYA jika klien sudah jelas-jelas sepakat dengan konsep & harga dan meminta pembayaran / invoice QRIS (misal: 'oke deal buatkan invoice', 'oke buatkan sekarang', 'oke lanjut QRIS', 'siap bayar min', 'gas bikin qris-nya'), konfirmasikan dengan senang hati dan WAJIB sertakan kode [DEAL_CONFIRMED] di baris paling akhir balasanmu."""


def extract_brief_details(text: str, existing: Dict[str, Any]) -> Dict[str, Any]:
    """Extract Roblox asset requirements from customer message."""
    data = dict(existing or {})
    pesan = text.lower()

    # 1. Asset Type detection
    if any(k in pesan for k in ["baju", "celana", "outfit", "clothing", "uniform", "jersey", "suit"]):
        data["asset_type"] = "clothing"
    elif any(k in pesan for k in ["topi", "sayap", "pedang", "katana", "helm", "accessory", "aksesoris", "ugc", "masker", "rambut"]):
        data["asset_type"] = "accessory"
    elif any(k in pesan for k in ["map", "gedung", "rumah", "prop", "mobil", "senjata", "game asset"]):
        data["asset_type"] = "game_asset"
    elif any(k in pesan for k in ["partikel", "vfx", "fx", "aura"]):
        data["asset_type"] = "fx"

    # 2. Style detection
    if "cyberpunk" in pesan or "futuristic" in pesan or "neon" in pesan:
        data["style"] = "Cyberpunk / Sci-Fi"
    elif "anime" in pesan or "manga" in pesan:
        data["style"] = "Anime Stylized"
    elif "realistic" in pesan or "militer" in pesan or "tactical" in pesan:
        data["style"] = "Realistic Tactical"
    elif "low poly" in pesan or "kartun" in pesan:
        data["style"] = "Low Poly Cartoon"

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

    # 5. Technical specs (only if asset_type has been identified)
    if data.get("asset_type"):
        data["poly_budget"] = UGC_POLY_LIMITS.get(data["asset_type"], 4000)
        data["texture_res"] = "1024x1024" if data["asset_type"] != "clothing" else "585x559"
        data["estimated_price_idr"] = BASE_PRICING.get(data["asset_type"], 250_000)

    return data


def intake_agent_node(state: AgentState) -> AgentState:
    """Intake node: process customer message via conversational Groq LLM, maintaining warmth and memory."""
    user_msg = state.get("latest_user_message") or ""
    brief = extract_brief_details(user_msg, state.get("brief_data") or {})
    state["brief_data"] = brief

    customer_name = state.get("customer_name") or "Kak"

    # Build multi-turn conversational message list
    history_messages: List[Dict[str, str]] = state.get("messages") or []
    llm_messages = [{"role": "system", "content": LEXI_SYSTEM_PROMPT}]

    # Append recent conversation history (last 8 turns for context)
    for m in history_messages[-8:]:
        role = "assistant" if m.get("role") in ("assistant", "ai") else "user"
        content = m.get("content") or ""
        if content:
            llm_messages.append({"role": role, "content": content})

    # Ensure the latest turn is present
    if not llm_messages or llm_messages[-1].get("content") != user_msg:
        llm_messages.append({"role": "user", "content": user_msg})

    ai_reply = ""
    try:
        settings = get_settings()
        if settings.llm_api_key:
            headers = {"Authorization": f"Bearer {settings.llm_api_key}"}
            payload = {
                "model": settings.llm_model_fast,
                "temperature": 0.7,
                "messages": llm_messages,
            }
            with httpx.Client(timeout=15.0) as client:
                resp = client.post(
                    f"{settings.llm_base_url.rstrip('/')}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    ai_reply = resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning("Groq call failed in intake_agent: %s", e)

    # Polite natural fallback if LLM is unavailable
    if not ai_reply:
        ai_reply = (
            f"Halo {customer_name}! 👋 Senang bisa terhubung.\n"
            f"Saya Lexi dari RobloxOps Studio. Ada ide atau konsep aset Roblox yang ingin Kakak buat hari ini? "
            f"Ceritakan saja santai ya, saya siap bantu pandu! 😊"
        )
    else:
        # Introduce Lexi warmly on first turn if not already mentioned
        is_first_turn = len([m for m in history_messages if m.get("role") in ("assistant", "ai")]) == 0
        if is_first_turn and "lexi" not in ai_reply.lower():
            ai_reply = f"Halo Kak! Saya Lexi dari RobloxOps Studio 👋\n{ai_reply}"

    # Check for confirmation deal tag
    has_deal_tag = "[DEAL_CONFIRMED]" in ai_reply
    cleaned_reply = ai_reply.replace("[DEAL_CONFIRMED]", "").strip()

    # Fallback keyword confirmation if customer clearly confirms deal/payment
    pesan_lower = user_msg.lower()
    deal_phrases = [
        "buatkan invoice",
        "bayar qris",
        "minta qris",
        "minta invoice",
        "kirim qris",
        "oke deal",
        "deal!",
        "lanjut bayar",
        "buatkan qris",
        "oke buatkan",
        "oke saya bayar",
        "siap bayar",
        "langsung bayar",
        "gas bikin qris",
        "gas buatkan invoice",
    ]
    explicit_deal = (
        (any(k in pesan_lower for k in deal_phrases) or bool(re.search(r"\bdeal\b", pesan_lower)))
        and "batal" not in pesan_lower
    )

    if (has_deal_tag or explicit_deal) and brief.get("asset_type"):
        state["current_stage"] = "payment_pending"
        state["next_step"] = "billing_agent"
        state["reply_to_customer"] = cleaned_reply
        return state

    state["current_stage"] = "intake"
    state["next_step"] = "wait_user"
    state["reply_to_customer"] = cleaned_reply
    return state
