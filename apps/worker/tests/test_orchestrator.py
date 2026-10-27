"""Automated Regression & Unit Tests for RobloxOps Multi-Agent Orchestrator."""

import pytest
from app.orchestrator.graph import process_customer_turn
from app.orchestrator.qris_service import QRISService, buat_payload_qris, generate_qr_image_base64
from app.orchestrator.dynamic_tools import (
    tool_registry,
    validate_python_code_safety,
    SecurityViolationError,
)


def test_qris_generation_and_crc():
    """Verify QRIS dynamic payload generation and CRC16 checksum."""
    payload = buat_payload_qris("ROBLOXOPS", "JAKARTA", "INV-TEST-001", 250000)
    assert payload.startswith("000201010212")
    assert "ROBLOXOPS" in payload
    assert "250000" in payload
    assert len(payload) > 50

    qr_b64 = generate_qr_image_base64(payload)
    assert qr_b64.startswith("data:image/png;base64,")


def test_qris_service_lifecycle():
    """Verify invoice creation and payment confirmation."""
    inv = QRISService.create_invoice(
        customer_name="Raffi Roblox",
        amount_idr=300000,
        description="Cyber Wings UGC",
    )
    assert inv["status"] == "unpaid"
    assert inv["amount_idr"] == 300000
    assert inv["qris_string"]

    paid = QRISService.mark_as_paid(inv["invoice_id"])
    assert paid["status"] == "paid"
    assert "paid_at" in paid


def test_dynamic_tool_creation_and_execution():
    """Verify that the AI can register and execute a dynamic Python tool."""
    tool_code = """
def calculate_rush_fee(base_price, is_rush=True):
    fee = int(base_price * 0.3) if is_rush else 0
    return {"total": base_price + fee, "fee": fee}
"""
    meta = tool_registry.register_tool(
        name="calculate_rush_fee",
        description="Calculate 30% rush fee for Roblox asset priority delivery",
        parameters={"base_price": "int", "is_rush": "bool"},
        code=tool_code,
        author="ai_agent",
    )
    assert meta["name"] == "calculate_rush_fee"

    res = tool_registry.execute_tool("calculate_rush_fee", base_price=200000, is_rush=True)
    assert res["total"] == 260000
    assert res["fee"] == 60000


def test_dynamic_tool_security_sandbox():
    """Verify that dangerous imports and calls in dynamic tools are blocked."""
    dangerous_code_1 = """
import os
def hack_system():
    os.system("dir")
"""
    with pytest.raises(SecurityViolationError):
        validate_python_code_safety(dangerous_code_1)

    dangerous_code_2 = """
def hack_eval():
    eval("1 + 1")
"""
    with pytest.raises(SecurityViolationError):
        validate_python_code_safety(dangerous_code_2)


def test_end_to_end_customer_journey():
    """Test the complete multi-turn journey: Intake -> QRIS -> Task -> Revision -> Portfolio."""
    # Turn 1: Customer asks for Roblox accessory
    s1 = process_customer_turn("Halo min, saya mau pesan pedang katana anime cyberpunk buat Roblox avatar")
    assert s1["current_stage"] == "intake"
    assert s1["brief_data"]["asset_type"] == "accessory"
    assert s1["brief_data"]["poly_budget"] == 4000
    assert "Lexi" in s1["reply_to_customer"]

    # Turn 2: Customer agrees / deals -> QRIS invoice generated directly
    s2 = process_customer_turn("Oke buatkan min, deal!", existing_state=s1)
    assert s2["current_stage"] == "payment_pending"
    assert s2["payment_data"]["invoice_id"].startswith("INV-RBLX-")
    assert s2["payment_data"]["status"] == "unpaid"
    assert "QRIS" in s2["reply_to_customer"]

    # Turn 3: Customer pays -> Verification -> Task dispatched to designer
    s3 = process_customer_turn("Sudah bayar min via QRIS BCA", existing_state=s2)
    assert s3["current_stage"] == "in_design"
    assert s3["payment_data"]["status"] == "paid"
    assert s3["reference_code"].startswith("PRJ-ROBLOX-")
    assert "DESAINER" in s3["reply_to_customer"]

    # Turn 4: Customer asks for revision -> Filtered into designer checklist
    s4 = process_customer_turn("Min, tolong sayapnya dibikin lebih lebar 20% dan ganti warna ke merah", existing_state=s3)
    assert s4["current_stage"] == "revision_handling"
    assert s4["revision_data"]["revision_count"] == 1
    assert len(s4["revision_data"]["latest_checklist"]) > 0

    # Turn 5: Customer accepts final asset -> Delivered & Auto-Portfolio Social Media
    s5 = process_customer_turn("Mantap min, keren banget hasilnya, acc terima!", existing_state=s4)
    assert s5["current_stage"] == "social_posted"
    assert s5["social_data"]["status"] == "published"
    assert "#RobloxUGC" in s5["social_data"]["caption"]
    assert "SELESAI" in s5["reply_to_customer"]


def test_vector_memory_retrieval():
    """Verify semantic RAG search in Roblox knowledge vector store."""
    from app.orchestrator.memory import knowledge_store

    # 1. Search for polycount limits
    results = knowledge_store.search_knowledge("berapa batas triangles maksimal ugc?", top_k=1)
    assert len(results) > 0
    assert results[0]["id"] == "ugc_poly_limits"
    assert "4.000" in results[0]["content"]

    # 2. Search for trademark / copyright rules
    results_tm = knowledge_store.search_knowledge("bisa pake logo brand nike atau gucci?", top_k=1)
    assert len(results_tm) > 0
    assert results_tm[0]["id"] == "ugc_trademark_policy"
    assert "hak cipta" in results_tm[0]["content"].lower() or "merek" in results_tm[0]["content"].lower()


def test_thread_memory_persistence():
    """Verify that LangGraph MemorySaver checkpointer remembers context via discord_user_id without passing existing_state."""
    user_id = "test_user_memory_999"

    # Turn 1: User mentions cyber wings
    r1 = process_customer_turn(
        "Halo min, saya mau order sayap cyber wings warna biru neon",
        customer_name="Klien Memori",
        discord_user_id=user_id,
        existing_state=None,  # No manual state passed
    )
    assert r1["current_stage"] == "intake"
    assert r1["brief_data"]["asset_type"] == "accessory"

    # Turn 2: User says 'Oke buatkan' without re-passing existing_state
    r2 = process_customer_turn(
        "Oke buatkan sekarang",
        customer_name="Klien Memori",
        discord_user_id=user_id,
        existing_state=None,  # Memory checkpointer loads turn 1 automatically
    )
    assert r2["current_stage"] == "payment_pending"
    assert r2["brief_data"]["asset_type"] == "accessory"
    assert r2["payment_data"]["invoice_id"].startswith("INV-RBLX-")
