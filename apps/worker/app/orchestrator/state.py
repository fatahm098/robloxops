"""LangGraph State Definition for RobloxOps Multi-Agent System."""

from __future__ import annotations

from typing import Annotated, Any, Dict, List, Literal, Optional
from typing_extensions import TypedDict
import operator

# Stages in the Roblox commission pipeline
CommissionStage = Literal[
    "intake",              # Chatting with customer, scoping, gathering requirements
    "brief_confirmation", # Brief complete, waiting customer confirmation
    "payment_pending",    # QRIS invoice issued, waiting for payment
    "in_design",          # Payment confirmed, task given to designer
    "qa_review",          # Asset uploaded, QA verified, watermarked preview sent
    "revision_handling",  # Customer requested revision, parsed into clear designer checklist
    "delivered",          # Accepted by customer, final assets delivered
    "social_posted",      # Showcase auto-posted to social media / portfolio
]

def add_messages(existing: List[Dict[str, Any]], new_messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Reducer for messages list to append new turns."""
    if not existing:
        return list(new_messages)
    return existing + list(new_messages)

class AgentState(TypedDict, total=False):
    """The central state flowing through the RobloxOps LangGraph."""
    # Conversation
    messages: Annotated[List[Dict[str, Any]], add_messages]
    latest_user_message: str
    reply_to_customer: str
    discord_embed: Optional[Dict[str, Any]]
    
    # Customer and Tenant Identity
    tenant_id: str
    customer_id: Optional[str]
    customer_name: str
    discord_user_id: str
    
    # Project Identity & Stage
    project_id: Optional[str]
    reference_code: Optional[str]
    current_stage: CommissionStage
    
    # Asset & Brief Technical Specifications
    brief_data: Dict[str, Any]
    
    # QRIS Payment Information
    payment_data: Dict[str, Any]
    
    # Revisions
    revision_data: Dict[str, Any]
    
    # Deliverables & QA
    deliverable_data: Dict[str, Any]
    
    # Social Media / Portfolio Showcase
    social_data: Dict[str, Any]
    
    # Dynamic Tools Created by AI
    active_tools: List[str]
    
    # Routing
    next_step: Optional[str]
    error: Optional[str]
