"""Task & Project Dispatcher Agent for RobloxOps.

Transforms customer requirements into actionable 3D modeling tasks for the Roblox designer
so that the designer only needs to build the model in Blender/Roblox Studio.
"""

from __future__ import annotations

import time
import uuid
from typing import Any, Dict
from ..state import AgentState


def task_agent_node(state: AgentState) -> AgentState:
    """Task dispatcher node: formats technical brief and dispatches to designer."""
    brief = state.get("brief_data") or {}
    payment = state.get("payment_data") or {}
    customer_name = state.get("customer_name") or "Pelanggan"
    
    asset_type = brief.get("asset_type", "accessory")
    style = brief.get("style", "Custom")
    poly_budget = brief.get("poly_budget", 4000)
    texture_res = brief.get("texture_res", "1024x1024")
    palette = ", ".join(brief.get("color_palette") or ["Default Theme"])
    refs = ", ".join(brief.get("references") or ["None provided"])
    
    project_code = state.get("reference_code") or f"PRJ-ROBLOX-{int(time.time())}"
    state["reference_code"] = project_code
    
    # Structured task card for the designer dashboard
    task_card = {
        "task_id": str(uuid.uuid4()),
        "project_code": project_code,
        "title": f"Create {asset_type.capitalize()}: {style}",
        "status": "in_progress",
        "deadline_hours": 48,
        "specifications": {
            "asset_type": asset_type,
            "style": style,
            "max_triangles": poly_budget,
            "texture_resolution": texture_res,
            "color_palette": palette,
            "reference_links": refs,
            "format": ".fbx and .rbxm",
        },
        "customer_contact": customer_name,
        "invoice_status": payment.get("status", "paid"),
    }
    
    state["current_stage"] = "in_design"
    state["next_step"] = "wait_designer"
    state["reply_to_customer"] = (
        f"🎨 **TUGAS RESMI TELAH DITERUSKAN KE DESAINER!**\n\n"
        f"Kode Proyek: `{project_code}`\n"
        f"Spesifikasi Teknis:\n"
        f"• **Format Aset**: Roblox Studio (.rbxm) & Blender (.fbx)\n"
        f"• **Maksimal Poligon**: {poly_budget} triangles\n"
        f"• **Resolusi Tekstur**: {texture_res}\n\n"
        f"Desainer kami sudah menerima lembar kerja ini di dashboard internal. "
        f"Kamu tidak perlu repot memikirkan teknisnya lagi—santai saja! "
        f"Begitu desainer selesai mengunggah file draf, saya akan langsung mengirimkan preview-nya ke sini."
    )
    
    state["discord_embed"] = {
        "title": f"📋 Project #{project_code} Dispatched",
        "description": "Desainer sedang mengerjakan aset di Blender / Roblox Studio.",
        "color": 0x99CBFF,
        "fields": [
            {"name": "Item", "value": f"{asset_type.capitalize()} ({style})", "inline": True},
            {"name": "Polycount Target", "value": f"Max {poly_budget} tris", "inline": True},
            {"name": "Status", "value": "Sedang Dikerjakan Desainer ⏳", "inline": True},
        ]
    }
    return state
