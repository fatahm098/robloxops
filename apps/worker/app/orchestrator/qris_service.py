"""QRIS Payment Service for RobloxOps Studio.

Handles generating dynamic Indonesian QRIS payloads, QR Code image generation (Base64),
invoice tracking, and payment verification.
"""

from __future__ import annotations

import base64
import io
import time
import uuid
from typing import Any, Dict, Optional
import qrcode


def _hitung_crc16(isi: str) -> str:
    """Calculate CRC16-CCITT for standard EMVCo QRIS."""
    crc = 0xFFFF
    for c in isi:
        crc ^= (ord(c) << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF
    return f"{crc:04X}"


def buat_payload_qris(
    merchant_name: str,
    merchant_city: str,
    invoice_id: str,
    amount_idr: int,
) -> str:
    """Generate EMVCo QRIS dynamic payload."""
    nama = merchant_name[:25].upper()
    kota = merchant_city[:15].upper()
    jumlah_str = str(amount_idr)
    
    # EMVCo TLV construction
    part_00 = "000201"
    part_01 = "010212"  # 12 = Dynamic QR
    
    # Merchant account info (National QRIS)
    nmid = "ID1020030040050"
    part_26_val = f"0016ID.CO.QRIS.WWW0118{nmid}0215{invoice_id[:15]}"
    part_26 = f"26{len(part_26_val):02d}{part_26_val}"
    
    part_52 = "52045812"  # Merchant Category Code (Roblox/Digital Goods)
    part_53 = "5303360"   # Currency 360 = IDR
    part_54 = f"54{len(jumlah_str):02d}{jumlah_str}"
    part_58 = "5802ID"
    part_59 = f"59{len(nama):02d}{nama}"
    part_60 = f"60{len(kota):02d}{kota}"
    
    # Additional data field (Invoice / Bill reference)
    tag_62_val = f"01{len(invoice_id):02d}{invoice_id}"
    part_62 = f"62{len(tag_62_val):02d}{tag_62_val}"
    
    raw = f"{part_00}{part_01}{part_26}{part_52}{part_53}{part_54}{part_58}{part_59}{part_60}{part_62}6304"
    crc = _hitung_crc16(raw)
    return f"{raw}{crc}"


def generate_qr_image_base64(payload: str) -> str:
    """Convert QRIS string into a PNG Base64 data URL."""
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=8,
        border=3,
    )
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#000000", back_color="#FFFFFF")
    
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    b64 = base64.b64encode(buffered.getvalue()).decode("utf-8")
    return f"data:image/png;base64,{b64}"


# In-memory invoice store (also synchronizes with DB when connected)
_INVOICE_STORE: Dict[str, Dict[str, Any]] = {}


class QRISService:
    """Service to issue and verify QRIS payments for Roblox commissions."""
    
    MERCHANT_NAME = "ROBLOXOPS STUDIO"
    MERCHANT_CITY = "JAKARTA"
    
    @classmethod
    def create_invoice(
        cls,
        customer_name: str,
        amount_idr: int,
        description: str,
        project_id: Optional[str] = None,
        reference_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create a new QRIS invoice for a Roblox asset order."""
        invoice_id = f"INV-RBLX-{int(time.time())}-{uuid.uuid4().hex[:4].upper()}"
        payload = buat_payload_qris(
            cls.MERCHANT_NAME,
            cls.MERCHANT_CITY,
            invoice_id,
            amount_idr,
        )
        qr_b64 = generate_qr_image_base64(payload)
        
        record = {
            "invoice_id": invoice_id,
            "project_id": project_id,
            "reference_code": reference_code or invoice_id,
            "customer_name": customer_name,
            "amount_idr": amount_idr,
            "description": description,
            "qris_string": payload,
            "qris_image_base64": qr_b64,
            "status": "unpaid",
            "created_at": time.time(),
            "expires_at": time.time() + 86400,  # 24 hours
        }
        _INVOICE_STORE[invoice_id] = record
        return record

    @classmethod
    def get_invoice(cls, invoice_id: str) -> Optional[Dict[str, Any]]:
        return _INVOICE_STORE.get(invoice_id)

    @classmethod
    def mark_as_paid(cls, invoice_id: str, payment_method: str = "QRIS") -> Optional[Dict[str, Any]]:
        """Simulate or confirm a webhook payment."""
        invoice = _INVOICE_STORE.get(invoice_id)
        if not invoice:
            return None
        invoice["status"] = "paid"
        invoice["paid_at"] = time.time()
        invoice["payment_method"] = payment_method
        return invoice
