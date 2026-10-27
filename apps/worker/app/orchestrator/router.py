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
from fastapi import APIRouter, HTTPException, Request
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
    tenant_id: Optional[str] = None
    author_id: Optional[str] = None
    channel_id: Optional[str] = None


async def persist_dispatched_project(
    db: Any,
    tenant_id: str,
    author_id: str,
    customer_name: str,
    thread_id: str,
    state: Dict[str, Any],
) -> None:
    if not db or not tenant_id:
        return
    try:
        # 1. Upsert customer
        cust_row = await db.fetchrow(
            tenant_id,
            """
            INSERT INTO customers (tenant_id, discord_user_id, discord_username, display_name)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (tenant_id, discord_user_id)
            DO UPDATE SET display_name = EXCLUDED.display_name
            RETURNING id
            """,
            tenant_id,
            author_id or f"user-{customer_name}",
            customer_name,
            customer_name,
        )
        customer_id = cust_row["id"] if cust_row else None
        if not customer_id:
            return

        brief = state.get("brief_data") or {}
        asset_type = brief.get("asset_type", "accessory")
        style = brief.get("style", "Custom")
        title = f"Create {asset_type.capitalize()}: {style}"

        # 2. Check if project already exists for this thread
        existing_proj = await db.fetchrow(
            tenant_id,
            "SELECT id, reference_code FROM projects WHERE tenant_id = $1 AND discord_thread_id = $2 LIMIT 1",
            tenant_id,
            thread_id,
        )
        if existing_proj:
            state["reference_code"] = existing_proj["reference_code"]
        else:
            # Insert project
            proj_row = await db.fetchrow(
                tenant_id,
                """
                INSERT INTO projects (
                    tenant_id, customer_id, title, status, project_type,
                    payment_status, discord_thread_id
                )
                VALUES ($1, $2, $3, 'in_design', $4, 'paid', $5)
                RETURNING id, reference_code
                """,
                tenant_id,
                customer_id,
                title,
                asset_type,
                thread_id,
            )
            project_id = proj_row["id"]
            state["reference_code"] = proj_row["reference_code"]

            # Insert task for the 3D designer
            poly = brief.get("poly_budget", 4000)
            tex = brief.get("texture_res", "1024x1024")
            task_desc = f"Style: {style}\nMax Tris: {poly}\nTexture: {tex}\nFormat: .fbx & .rbxm"
            await db.execute(
                tenant_id,
                """
                INSERT INTO tasks (tenant_id, project_id, title, description, status)
                VALUES ($1, $2, $3, $4, 'in_progress')
                """,
                tenant_id,
                project_id,
                f"3D Modeling & Texturing: {asset_type.capitalize()}",
                task_desc,
            )
    except Exception as e:
        logger.warning("Could not persist dispatched project: %s", e)


@router.post("/chat")
async def chat_endpoint(req: ChatTurnRequest, request: Request) -> Dict[str, Any]:
    """Execute one customer turn through the LangGraph multi-agent network."""
    try:
        result = process_customer_turn(
            message=req.message,
            customer_name=req.customer_name,
            discord_user_id=req.thread_id,
        )

        # If project reached in_design, persist to DB so designer sees it on web dashboard
        if result.get("current_stage") == "in_design":
            db = getattr(request.app.state, "db", None)
            target_tenant = req.tenant_id or "11111111-1111-4111-8111-111111111111"
            await persist_dispatched_project(
                db=db,
                tenant_id=target_tenant,
                author_id=req.author_id or req.thread_id,
                customer_name=req.customer_name,
                thread_id=req.thread_id,
                state=result,
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
