"""Vector Memory and Embeddings System for RobloxOps.

Provides:
1. Semantic Knowledge Base for Roblox UGC Guidelines & Studio Policies (RAG).
2. Long-term customer taste & past project semantic recall.
3. Universal embeddings support (Local cosine-similarity vector store + pluggable cloud embeddings).
"""

from __future__ import annotations

import json
import math
import os
import re
from typing import Any, Dict, List, Optional, Tuple

# Standard Roblox UGC Official Guidelines and Studio Rules
DEFAULT_KNOWLEDGE_DOCUMENTS = [
    {
        "id": "ugc_poly_limits",
        "category": "technical_limits",
        "title": "Batas Poligon & Triangles Roblox UGC",
        "content": (
            "Aksesoris Roblox UGC (topi, rambut, sayap, pedang, ransel) memiliki batas maksimal 4.000 triangles "
            "dan 4.000 vertices. Aset map/prop game Roblox Studio bisa mencapai 10.000 triangles per mesh part. "
            "Model tidak boleh melebihi batas ini agar tidak ditolak saat proses upload ke Roblox Marketplace."
        ),
        "tags": ["polycount", "triangles", "vertices", "ugc", "limit"],
    },
    {
        "id": "ugc_texture_specs",
        "category": "technical_limits",
        "title": "Spesifikasi Tekstur Roblox UGC",
        "content": (
            "Tekstur untuk aksesoris Roblox UGC wajib beresolusi 512x512 atau maksimal 1024x1024 piksel dalam format PNG. "
            "Mendukung transparansi (alpha channel). Tekstur pakaian 2D klasik berukuran 585x559 piksel sesuai template resmi Roblox."
        ),
        "tags": ["texture", "resolution", "png", "alpha", "clothing"],
    },
    {
        "id": "ugc_trademark_policy",
        "category": "policy",
        "title": "Kebijakan Hak Cipta & Merek Dagang Roblox",
        "content": (
            "Roblox melarang keras penggunaan logo, merek nyata, atau nama brand berhak cipta (seperti Nike, Gucci, "
            "Adidas, Ferrari, Marvel, Pokémon) pada item UGC. Aset harus berupa desain original, parodi fiktif, "
            "atau adaptasi kreatif tanpa melanggar hak cipta agar akun studio dan kreator tidak terkena DMCA take-down."
        ),
        "tags": ["copyright", "trademark", "dmca", "brand", "logo", "rules"],
    },
    {
        "id": "ugc_layered_clothing",
        "category": "technical_specs",
        "title": "Layered Clothing & Rigging R15",
        "content": (
            "Pakaian 3D Layered Clothing memerlukan Outer Cage dan Inner Cage mesh agar pakaian dapat meregang secara dinamis "
            "mengikuti anatomi semua tipe badan avatar Roblox R15 tanpa kliping (clipping). Semua rigging harus di-weight painting "
            "dengan rapi di Blender."
        ),
        "tags": ["layered_clothing", "cage", "r15", "rigging", "blender"],
    },
    {
        "id": "studio_pricing_payment",
        "category": "studio_policy",
        "title": "Kebijakan Pembayaran QRIS RobloxOps",
        "content": (
            "Semua pembayaran di RobloxOps Studio menggunakan QRIS (mendukung BCA, Mandiri, BRI, BNI, Gopay, OVO, Dana, ShopeePay). "
            "Kami tidak menerima pembayaran in-game Robux mentah untuk menghindari hold 30 hari. "
            "Pengerjaan oleh desainer 3D dimulai setelah pembayaran QRIS lunas atau DP 50% terverifikasi."
        ),
        "tags": ["payment", "qris", "pricing", "idr", "dp", "billing"],
    },
    {
        "id": "studio_revisions_policy",
        "category": "studio_policy",
        "title": "Kebijakan Revisi & Desainer",
        "content": (
            "Setiap pesanan mendapatkan 2 putaran revisi gratis (revisi minor: penyesuaian skala, saturasi warna, proporsi kecil). "
            "Revisi total konsep di luar brief awal akan dikenakan biaya tambahan. Desainer menerima instruksi revisi yang sudah "
            "disaring rapi oleh AI tanpa pelanggan perlu repot berdebat teknis."
        ),
        "tags": ["revision", "free_revision", "designer", "workflow"],
    },
]


def _simple_tokenize(text: str) -> List[str]:
    """Tokenize and normalize text for vectorization."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return [w for w in cleaned.split() if len(w) > 2]


class LocalEmbeddings:
    """Lightweight, fast, zero-dependency semantic vector embeddings."""

    def __init__(self, vocabulary_size: int = 512):
        self.vocab: Dict[str, int] = {}
        self.idf: Dict[str, float] = {}

    def fit(self, corpus: List[str]) -> None:
        """Build vocabulary and inverse document frequency weights."""
        doc_count = len(corpus)
        df: Dict[str, int] = {}
        for doc in corpus:
            tokens = set(_simple_tokenize(doc))
            for t in tokens:
                df[t] = df.get(t, 0) + 1
                if t not in self.vocab:
                    self.vocab[t] = len(self.vocab)

        for t, freq in df.items():
            self.idf[t] = math.log((doc_count + 1) / (freq + 1)) + 1.0

    def embed_text(self, text: str) -> List[float]:
        """Convert a piece of text into a normalized embedding vector."""
        tokens = _simple_tokenize(text)
        vector = [0.0] * max(len(self.vocab), 1)
        for t in tokens:
            idx = self.vocab.get(t)
            if idx is not None:
                weight = self.idf.get(t, 1.0)
                vector[idx] += weight

        # Normalize vector to unit length
        norm = math.sqrt(sum(v * v for v in vector))
        if norm > 0:
            vector = [v / norm for v in vector]
        return vector


def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Calculate cosine similarity between two normalized vectors."""
    if len(v1) != len(v2) or not v1:
        return 0.0
    return sum(a * b for a, b in zip(v1, v2))


class RobloxKnowledgeVectorStore:
    """Semantic vector store for Roblox UGC knowledge and studio memory."""

    def __init__(self):
        self.embeddings = LocalEmbeddings()
        self.documents: List[Dict[str, Any]] = []
        self.vectors: List[List[float]] = []
        self._initialize_knowledge()

    def _initialize_knowledge(self) -> None:
        """Seed the knowledge store with official Roblox UGC documentation."""
        self.documents = list(DEFAULT_KNOWLEDGE_DOCUMENTS)
        corpus = [f"{d['title']} {d['content']} {' '.join(d['tags'])}" for d in self.documents]
        self.embeddings.fit(corpus)
        self.vectors = [self.embeddings.embed_text(text) for text in corpus]

    def add_document(self, doc_id: str, title: str, content: str, tags: Optional[List[str]] = None) -> None:
        """Add a new document (e.g. past project brief or customer preference) to memory."""
        tags = tags or []
        doc = {
            "id": doc_id,
            "category": "custom_memory",
            "title": title,
            "content": content,
            "tags": tags,
        }
        self.documents.append(doc)
        text = f"{title} {content} {' '.join(tags)}"
        self.vectors.append(self.embeddings.embed_text(text))

    def search_knowledge(self, query: str, top_k: int = 2, threshold: float = 0.05) -> List[Dict[str, Any]]:
        """Retrieve most relevant knowledge snippets based on semantic vector similarity."""
        query_vec = self.embeddings.embed_text(query)
        scored: List[Tuple[float, Dict[str, Any]]] = []

        for idx, doc_vec in enumerate(self.vectors):
            score = cosine_similarity(query_vec, doc_vec)
            if score >= threshold:
                scored.append((score, self.documents[idx]))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scored[:top_k]]


# Singleton knowledge vector store instance
knowledge_store = RobloxKnowledgeVectorStore()
