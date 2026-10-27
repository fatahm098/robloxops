"""LangGraph Orchestrator for RobloxOps Multi-Agent Pipeline.

Coordinates specialized agents:
- Intake Agent (Lexi)
- Billing & QRIS Agent
- Task & Designer Dispatcher Agent
- Revision Handling Agent
- Social Media & Auto-Portfolio Agent
- Dynamic Tool Creation Engine
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

from .state import AgentState
from .dynamic_tools import tool_registry
from .agents.intake_agent import intake_agent_node
from .agents.billing_agent import billing_agent_node
from .agents.task_agent import task_agent_node
from .agents.revision_agent import revision_agent_node
from .agents.social_media_agent import social_media_agent_node

logger = logging.getLogger("robloxops.orchestrator")


def supervisor_router(state: AgentState) -> Literal["intake", "billing", "task", "revision", "social", "end"]:
    """Decide which specialized agent should handle the incoming customer message."""
    user_msg = (state.get("latest_user_message") or "").lower()
    stage = state.get("current_stage") or "intake"
    payment = state.get("payment_data") or {}

    # 1. Revision detection
    revision_words = ["revisi", "ubah", "ganti", "kurang", "warnanya", "ukurannya", "bisa tolong", "perbaiki", "tambahin"]
    if any(w in user_msg for w in revision_words) and stage in ["in_design", "qa_review", "revision_handling"]:
        return "revision"

    # 2. Acceptance / Finished delivery -> Auto portfolio & social
    accept_words = ["terima", "acc", "bagus banget", "mantap min", "keren banget", "selesai", "makasih min", "puas"]
    if any(w in user_msg for w in accept_words) and stage in ["in_design", "qa_review", "revision_handling"]:
        return "social"

    # 3. Payment / QRIS handling
    confirm_payment_words = [
        "sudah bayar", "dah bayar", "cek bayar", "lunas", "bukti transfer",
        "udah transfer", "sudah transfer", "paid"
    ]
    request_qris_words = [
        "minta qris", "buatkan qris", "kirim qris", "buatkan invoice",
        "lanjut bayar", "bayar sekarang", "minta invoice"
    ]
    if any(w in user_msg for w in confirm_payment_words) and payment.get("invoice_id"):
        return "billing"
    if any(w in user_msg for w in request_qris_words):
        return "billing"

    # 4. If payment was just verified, dispatch task
    if payment.get("status") == "paid" and stage == "in_design" and not state.get("reference_code"):
        return "task"

    # 5. Default to Intake (Lexi)
    return "intake"


def build_robloxops_graph():
    """Build and compile the LangGraph StateGraph."""
    workflow = StateGraph(AgentState)

    # Register nodes
    workflow.add_node("intake", intake_agent_node)
    workflow.add_node("billing", billing_agent_node)
    workflow.add_node("task", task_agent_node)
    workflow.add_node("revision", revision_agent_node)
    workflow.add_node("social", social_media_agent_node)

    # Set conditional entrypoint driven by supervisor router
    workflow.set_conditional_entry_point(
        supervisor_router,
        {
            "intake": "intake",
            "billing": "billing",
            "task": "task",
            "revision": "revision",
            "social": "social",
            "end": END,
        }
    )

    # Connect edge transitions
    # Intake node: if brief confirmed, chain directly to billing to generate QRIS
    def intake_next(state: AgentState) -> str:
        if state.get("current_stage") == "payment_pending" and state.get("next_step") == "billing_agent":
            return "billing"
        return "end"

    workflow.add_conditional_edges("intake", intake_next, {"billing": "billing", "end": END})

    # Billing node: if payment verified, chain directly to task dispatcher for the designer
    def billing_next(state: AgentState) -> str:
        if state.get("current_stage") == "in_design" and state.get("next_step") == "task_agent":
            return "task"
        return "end"

    workflow.add_conditional_edges("billing", billing_next, {"task": "task", "end": END})
    workflow.add_edge("task", END)
    workflow.add_edge("revision", END)
    workflow.add_edge("social", END)

    return workflow.compile(checkpointer=memory_checkpointer)


# Global checkpointer & compiled graph singleton
memory_checkpointer = MemorySaver()
robloxops_graph = build_robloxops_graph()


def process_customer_turn(
    message: str,
    customer_name: str = "Pelanggan",
    discord_user_id: str = "0",
    tenant_id: str = "default_tenant",
    existing_state: Dict[str, Any] | None = None,
) -> AgentState:
    """Entrypoint function to run one customer message turn through the multi-agent graph with persistent memory."""
    thread_id = f"discord:{discord_user_id}"
    config = {"configurable": {"thread_id": thread_id}}

    state_input: AgentState = dict(existing_state or {})
    state_input["latest_user_message"] = message
    state_input["customer_name"] = customer_name
    state_input["discord_user_id"] = discord_user_id
    state_input["tenant_id"] = tenant_id

    # Append user turn to messages list
    history = state_input.get("messages") or []
    history.append({"role": "user", "content": message})
    state_input["messages"] = history

    # Run graph with LangGraph thread memory checkpointer
    result = robloxops_graph.invoke(state_input, config=config)

    # Append agent reply to messages list
    agent_reply = result.get("reply_to_customer") or "Ada yang bisa saya bantu terkait aset Roblox Anda?"
    history.append({"role": "assistant", "content": agent_reply})
    result["messages"] = history

    return result
