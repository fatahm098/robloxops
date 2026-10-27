"""Dynamic Tool Creation and Execution Engine for RobloxOps.

Enables the AI Agent to autonomously generate, validate, register, and execute
custom Python tools at runtime.
"""

from __future__ import annotations

import ast
import json
import logging
import math
import os
import re
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("robloxops.dynamic_tools")

# Storage file for dynamically created tools to persist across restarts
TOOLS_STORAGE_PATH = os.path.join(
    os.path.dirname(__file__), "storage_dynamic_tools.json"
)

# Forbidden AST nodes and module imports to protect the host system
FORBIDDEN_IMPORTS = {
    "os", "sys", "subprocess", "shutil", "socket", "pty", "builtins",
    "posix", "nt", "importlib", "_thread", "threading", "multiprocessing",
}

FORBIDDEN_NAMES = {
    "eval", "exec", "open", "compile", "__import__", "globals", "locals",
    "breakpoint", "exit", "quit",
}


class SecurityViolationError(Exception):
    """Raised when dynamically generated tool code violates safety policy."""
    pass


def validate_python_code_safety(code: str) -> None:
    """Validate that Python code contains no dangerous imports or calls."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        raise ValueError(f"Kode Python memiliki kesalahan sintaks: {e}") from e

    for node in ast.walk(tree):
        # Disallow forbidden module imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod_name = alias.name.split(".")[0]
                if mod_name in FORBIDDEN_IMPORTS:
                    raise SecurityViolationError(
                        f"Impor modul '{mod_name}' tidak diizinkan demi keamanan sandbox."
                    )
        elif isinstance(node, ast.ImportFrom):
            mod_name = (node.module or "").split(".")[0]
            if mod_name in FORBIDDEN_IMPORTS:
                raise SecurityViolationError(
                    f"Impor dari modul '{mod_name}' tidak diizinkan demi keamanan sandbox."
                )
        # Disallow forbidden builtins
        elif isinstance(node, ast.Name):
            if node.id in FORBIDDEN_NAMES:
                raise SecurityViolationError(
                    f"Pemanggilan fungsi '{node.id}' dilarang dalam dynamic tool sandbox."
                )


class DynamicToolRegistry:
    """Registry that holds both predefined and AI-created dynamic tools."""

    def __init__(self, persistence_file: str = TOOLS_STORAGE_PATH):
        self.persistence_file = persistence_file
        self._tools: Dict[str, Dict[str, Any]] = {}
        self._compiled_callables: Dict[str, Callable] = {}
        self._load_persisted_tools()
        self._register_default_tools()

    def _register_default_tools(self) -> None:
        """Register built-in domain tools for Roblox studio operations."""
        # 1. UGC Polycount Validator
        self.register_tool(
            name="check_roblox_ugc_limits",
            description="Validasi batas teknis aset Roblox UGC (triangles/polygons dan texture resolution).",
            parameters={
                "asset_type": "string (accessory, clothing, avatar_item, game_prop)",
                "estimated_triangles": "integer",
                "texture_resolution": "string (e.g. 512x512, 1024x1024)",
            },
            code="""
def check_roblox_ugc_limits(asset_type, estimated_triangles, texture_resolution="1024x1024"):
    max_tris = {
        "accessory": 4000,
        "clothing": 4000,
        "avatar_item": 4000,
        "game_prop": 10000,
    }.get(asset_type.lower(), 4000)
    
    valid_tris = estimated_triangles <= max_tris
    valid_tex = texture_resolution in ["256x256", "512x512", "1024x1024"]
    
    return {
        "valid": valid_tris and valid_tex,
        "max_triangles_allowed": max_tris,
        "current_triangles": estimated_triangles,
        "triangle_status": "Lolos" if valid_tris else f"Melebihi batas {estimated_triangles}/{max_tris}",
        "texture_status": "Valid" if valid_tex else "Ukuran tekstur harus 512x512 atau 1024x1024",
    }
""",
            author="system",
        )

        # 2. Robux DevEx to IDR Converter
        self.register_tool(
            name="convert_robux_to_idr",
            description="Konversi nilai Robux ke Rupiah berdasarkan kurs DevEx resmi Roblox (kurs ~$0.0038/R$ * kurs USD/IDR).",
            parameters={"robux_amount": "integer"},
            code="""
def convert_robux_to_idr(robux_amount, usd_to_idr_rate=16000):
    # Roblox DevEx rate is approx $0.0038 per 1 Robux
    usd_val = robux_amount * 0.0038
    idr_val = int(usd_val * usd_to_idr_rate)
    return {
        "robux": robux_amount,
        "usd_equivalent": round(usd_val, 2),
        "idr_equivalent": idr_val,
        "idr_formatted": f"Rp {idr_val:,}".replace(",", ".")
    }
""",
            author="system",
        )

    def register_tool(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        code: str,
        author: str = "ai_agent",
    ) -> Dict[str, Any]:
        """Validate, compile, and store a tool created dynamically by AI."""
        # 1. Security Check
        validate_python_code_safety(code)

        # 2. Compile into callable function
        safe_globals = {
            "math": math,
            "re": re,
            "json": json,
            "round": round,
            "len": len,
            "int": int,
            "float": float,
            "str": str,
            "list": list,
            "dict": dict,
            "set": set,
            "sum": sum,
            "min": min,
            "max": max,
        }
        local_scope: Dict[str, Any] = {}
        exec(code, safe_globals, local_scope)

        func = local_scope.get(name)
        if not callable(func):
            # If function name didn't match exactly, find the first callable
            callables = [v for v in local_scope.values() if callable(v)]
            if not callables:
                raise ValueError(f"Kode yang diberikan tidak menghasilkan fungsi bernama '{name}'.")
            func = callables[0]

        tool_meta = {
            "name": name,
            "description": description,
            "parameters": parameters,
            "code": code,
            "author": author,
        }

        self._tools[name] = tool_meta
        self._compiled_callables[name] = func
        self._save_persisted_tools()
        logger.info("Dynamic tool '%s' registered successfully by '%s'.", name, author)
        return tool_meta

    def execute_tool(self, name: str, **kwargs: Any) -> Any:
        """Execute a dynamic tool by name."""
        if name not in self._compiled_callables:
            raise KeyError(f"Tool '{name}' tidak ditemukan di registry.")
        func = self._compiled_callables[name]
        return func(**kwargs)

    def list_tools(self) -> List[Dict[str, Any]]:
        """Return metadata for all available tools."""
        return list(self._tools.values())

    def _save_persisted_tools(self) -> None:
        try:
            with open(self.persistence_file, "w", encoding="utf-8") as f:
                json.dump(self._tools, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.warning("Gagal menyimpan dynamic tools: %s", e)

    def _load_persisted_tools(self) -> None:
        if not os.path.exists(self.persistence_file):
            return
        try:
            with open(self.persistence_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
            for name, meta in saved.items():
                try:
                    self.register_tool(
                        name=meta["name"],
                        description=meta["description"],
                        parameters=meta.get("parameters", {}),
                        code=meta["code"],
                        author=meta.get("author", "persisted"),
                    )
                except Exception as e:
                    logger.warning("Gagal memuat dynamic tool '%s': %s", name, e)
        except Exception as e:
            logger.warning("Gagal membaca file dynamic tools: %s", e)


# Global singleton registry
tool_registry = DynamicToolRegistry()
