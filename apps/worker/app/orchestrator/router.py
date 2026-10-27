"""FastAPI Router for RobloxOps Multi-Agent Orchestrator.

Provides endpoints for:
- /chat: Multi-turn customer intake & journey via LangGraph + Memory checkpointer
- /qris/create: Dynamic EMVCo QRIS IDR payment generation with Base64 QR image
- /qris/verify: Instant QRIS payment validation
- /tools: Dynamic self-tooling registry & safe AST sandboxed execution
- /tools/create: Autonomous Python tool creation by AI
- /memory/rag: Semantic vector search for Roblox UGC limits & studio policies
- /memory/thread: Short-term conversation thread inspector
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.orchestrator.graph import process_customer_turn, robloxops_graph
from app.orchestrator.qris_service import QRISService
from app.orchestrator.dynamic_tools import tool_registry, validate_python_code_safety, SecurityViolationError
from app.orchestrator.memory import knowledge_store

logger = logging.getLogger("robloxops.orchestrator.router")

router = APIRouter(prefix="/orchestrator", tags=["Multi-Agent Orchestrator"])


class ChatTurnRequest(BaseModel):
    thread_id: str = Field(default="thread-demo-001", description="Unique conversation session id")
    customer_name: str = Field(default="Pelanggan", description="Customer display name")
    message: str = Field(description="Incoming customer chat message")


class QRISCreateRequest(BaseModel):
    customer_name: str
    amount_idr: int = Field(gt=0, description="Amount in Indonesian Rupiah (IDR)")
    description: str = "Roblox 3D Commission"


class QRISVerifyRequest(BaseModel):
    invoice_id: str


class DynamicToolCreateRequest(BaseModel):
    name: str
    description: str
    python_code: str


class DynamicToolRunRequest(BaseModel):
    name: str
    kwargs: Dict[str, Any] = Field(default_factory=dict)


class RAGSearchRequest(BaseModel):
    query: str
    top_k: int = 3


@router.post("/chat")
async def chat_endpoint(req: ChatTurnRequest) -> Dict[str, Any]:
    """Execute one customer turn through the LangGraph multi-agent network."""
    try:
        result = process_customer_turn(
            message=req.message,
            customer_name=req.customer_name,
            discord_user_id=req.thread_id,
        )
        return {
            "thread_id": req.thread_id,
            "response": result.get("reply_to_customer", ""),
            "stage": result.get("current_stage", "intake"),
            "commission_spec": result.get("commission_spec"),
            "payment_data": result.get("payment_data"),
            "designer_task": result.get("designer_task"),
            "revision_notes": result.get("revision_notes"),
            "social_post": result.get("social_post"),
            "messages": result.get("messages", []),
        }
    except Exception as e:
        logger.error(f"Chat turn error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/qris/create")
async def create_qris_endpoint(req: QRISCreateRequest) -> Dict[str, Any]:
    """Create a new dynamic QRIS invoice with EMVCo CRC16 and Base64 QR code image."""
    inv = QRISService.create_invoice(
        customer_name=req.customer_name,
        amount_idr=req.amount_idr,
        description=req.description,
    )
    return inv


@router.post("/qris/verify")
async def verify_qris_endpoint(req: QRISVerifyRequest) -> Dict[str, Any]:
    """Simulate or verify QRIS payment callback."""
    inv = QRISService.mark_as_paid(req.invoice_id)
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return inv


@router.get("/tools")
async def list_tools_endpoint() -> List[Dict[str, Any]]:
    """List all registered dynamic tools."""
    return tool_registry.list_tools()


@router.post("/tools/create")
async def create_tool_endpoint(req: DynamicToolCreateRequest) -> Dict[str, Any]:
    """Register a new dynamic tool with AST security validation."""
    try:
        meta = tool_registry.register_tool(
            name=req.name,
            description=req.description,
            python_code=req.python_code,
        )
        return {"status": "success", "tool": meta}
    except SecurityViolationError as sve:
        raise HTTPException(status_code=400, detail=f"Security violation: {sve}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Tool registration error: {e}")


@router.post("/tools/run")
async def run_tool_endpoint(req: DynamicToolRunRequest) -> Dict[str, Any]:
    """Execute a dynamic tool in the safe sandbox."""
    try:
        output = tool_registry.execute_tool(req.name, **req.kwargs)
        return {"status": "success", "result": output}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Execution error: {e}")


@router.post("/memory/rag")
async def rag_search_endpoint(req: RAGSearchRequest) -> List[Dict[str, Any]]:
    """Query long-term vector store for Roblox UGC guidelines & policies."""
    results = knowledge_store.search(req.query, top_k=req.top_k)
    return results


@router.get("/memory/thread/{thread_id}")
async def get_thread_state_endpoint(thread_id: str) -> Dict[str, Any]:
    """Inspect short-term state in the LangGraph MemorySaver checkpointer."""
    try:
        config = {"configurable": {"thread_id": f"discord:{thread_id}"}}
        state_snapshot = robloxops_graph.get_state(config)
        return {
            "thread_id": thread_id,
            "exists": bool(state_snapshot.values),
            "values": state_snapshot.values,
            "next": list(state_snapshot.next),
        }
    except Exception as e:
        return {"thread_id": thread_id, "exists": False, "error": str(e)}
