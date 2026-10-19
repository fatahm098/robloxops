"""Runtime configuration (environment driven)."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    database_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    internal_worker_token: str = "dev-internal-token"
    worker_id: str = "worker-local"
    worker_batch_size: int = 5
    worker_poll_seconds: float = 2.0

    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model_fast: str = "gpt-4o-mini"
    llm_model_mid: str = "gpt-4o-mini"
    llm_model_vision: str = "gpt-4o"
    llm_timeout_seconds: float = 30.0

    discord_bot_token: str = ""
    discord_application_id: str = ""
    discord_worker_url: str = "http://localhost:8080"

    log_level: str = "INFO"

    @property
    def llm_enabled(self) -> bool:
        return bool(self.llm_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
