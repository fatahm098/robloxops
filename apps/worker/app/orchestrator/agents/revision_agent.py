"""Revision Handling Agent for RobloxOps.

Filters customer feedback, translates subjective requests into clear,
actionable 3D modeling task checklists, and dispatches revisions to the designer.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List
from ..state import AgentState


def parse_feedback_into_actionable_items(text: str) -> List[str]:
    """Extract bullet points of concrete 3D adjustments from raw customer feedback."""
    items = []
    lines = text.split("\n")
    for line in lines:
        clean = line.strip(" -*•0123456789.")
        if len(clean) > 4:
            items.append(clean)
            
    if not items:
        # Fallback to sentence split
        sentences = re.split(r"[.!?]+", text)
        for s in sentences:
            c = s.strip()
            if len(c) > 5 and not any(w in c.lower() for w in ["halo", "makasih", "min", "tolong"]):
                items.append(c)

    return items if items else [text.strip()]


def revision_agent_node(state: AgentState) -> AgentState:
    """Revision node: processes customer critique and notifies designer."""
    user_msg = state.get("latest_user_message") or ""
    rev_data = state.get("revision_data") or {
        "revision_count": 0,
        "max_revisions": 2,
        "history": [],
    }
    
    current_count = rev_data.get("revision_count", 0) + 1
    max_rev = rev_data.get("max_revisions", 2)
    
    checklist = parse_feedback_into_actionable_items(user_msg)
    
    rev_entry = {
        "round": current_count,
        "raw_feedback": user_msg,
        "actionable_checklist": checklist,
        "status": "pending_designer",
    }
    
    rev_data["revision_count"] = current_count
    rev_data["latest_checklist"] = checklist
    history = rev_data.get("history", [])
    history.append(rev_entry)
    rev_data["history"] = history
    state["revision_data"] = rev_data
    
    checklist_md = "\n".join(f"  • {item}" for item in checklist)
    
    state["current_stage"] = "revision_handling"
    state["next_step"] = "wait_designer"
    
    state["reply_to_customer"] = (
        f"Terima kasih atas masukannya! Permintaan revisi **(Putaran {current_count}/{max_rev})** sudah saya catat.\n\n"
        f"📝 **Daftar Perbaikan untuk Desainer**:\n"
        f"{checklist_md}\n\n"
        f"Instruksi teknis ini sudah langsung masuk ke dashboard desainer kami. "
        f"Kamu tidak perlu khawatir, desainer akan langsung memodifikasi model dan saya kabari lagi secepatnya setelah preview revisi siap! 🚀"
    )
    
    state["discord_embed"] = {
        "title": f"🛠️ Revisi Putaran #{current_count} Diteruskan ke Desainer",
        "description": "Desainer sedang menerapkan perubahan berikut pada model:",
        "color": 0xFFA500,
        "fields": [
            {"name": "Poin Revisi", "value": checklist_md[:1024], "inline": False},
            {"name": "Status Kuota Revisi", "value": f"{current_count} dari {max_rev} revisi terpakai", "inline": True},
        ]
    }
    return state
