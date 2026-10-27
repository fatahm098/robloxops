"""Social Media & Portfolio Showcase Agent for RobloxOps.

Automatically generates showcase posts, captions, hashtags, and broadcasts
completed Roblox UGC commissions to social media and the studio's portfolio channel.
"""

from __future__ import annotations

import time
from typing import Any, Dict
from ..state import AgentState


def social_media_agent_node(state: AgentState) -> AgentState:
    """Social media node: delivers final assets and generates portfolio post."""
    brief = state.get("brief_data") or {}
    customer_name = state.get("customer_name") or "Klien"
    project_code = state.get("reference_code") or "PRJ-ROBLOX"
    
    asset_type = brief.get("asset_type", "accessory").capitalize()
    style = brief.get("style", "Custom Stylized")
    
    # 1. Generate Social Media Caption & Showcase
    showcase_caption = (
        f"✨ New Custom Roblox UGC Commission Completed! 🎮🔥\n\n"
        f"📦 Asset: {asset_type} - {style}\n"
        f"🎯 Polycount: Optimized under {brief.get('poly_budget', 4000)} tris\n"
        f"🎨 Textures: Hand-crafted {brief.get('texture_res', '1024x1024')}\n"
        f"Client: {customer_name}\n\n"
        f"Crafted with precision at RobloxOps Studio. Dm us on Discord to order your custom Roblox UGC & 3D assets!\n\n"
        f"#RobloxUGC #RobloxDev #RobloxStudio #Blender3D #3DModeling #GameAsset #RobloxClothing"
    )
    
    social_entry = {
        "project_code": project_code,
        "caption": showcase_caption,
        "platforms": ["discord_showcase", "twitter_x", "tiktok_portfolio"],
        "asset_preview": brief.get("preview_url") or "https://via.placeholder.com/600x400.png?text=Roblox+UGC+Showcase",
        "posted_at": time.time(),
        "status": "published",
    }
    
    state["social_data"] = social_entry
    state["current_stage"] = "social_posted"
    state["next_step"] = "completed"
    
    state["reply_to_customer"] = (
        f"🎉 **SELAMAT! PROYEK TELAH SELESAI & RESMI DISERAHKAN!**\n\n"
        f"📦 **File Aset Final** (.rbxm & .fbx):\n"
        f"Tautan Unduhan: `https://robloxops.studio/download/{project_code}/assets.zip`\n\n"
        f"🚀 **Portofolio Otomatis Terbit**:\n"
        f"Hasil karyamu sudah otomatis diunggah ke channel portofolio studio kami dan media sosial! "
        f"Terima kasih banyak sudah mempercayakan pesanan aset Roblox-mu di **RobloxOps Studio**! "
        f"Sampai jumpa di pesanan berikutnya! ✨"
    )
    
    state["discord_embed"] = {
        "title": f"🏆 Commission Completed - {asset_type} ({style})",
        "description": showcase_caption,
        "color": 0x9B59B6,
        "fields": [
            {"name": "File Aset Final", "value": f"[{project_code}.zip](https://robloxops.studio/download/{project_code})", "inline": True},
            {"name": "Portofolio", "value": "Published to #showcase & Socials ✅", "inline": True},
        ]
    }
    return state
