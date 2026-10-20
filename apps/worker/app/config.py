"""Runtime configuration (environment driven)."""

from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_INTERNAL_TOKEN = "dev-internal-token"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "apps/worker/.env"), extra="ignore", case_sensitive=False
    )

    app_env: str = "development"

    database_url: str = ""
    supabase_url: str = ""
    supabase_service_role_key: str = ""

    internal_worker_token: str = DEV_INTERNAL_TOKEN
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

    @property
    def is_production(self) -> bool:
        return self.app_env.strip().lower() in {"production", "prod"}

    @model_validator(mode="after")
    def _reject_insecure_production_defaults(self) -> "Settings":
        """Refuse to boot in production with development-grade secrets.

        The worker is protected only by ``INTERNAL_WORKER_TOKEN`` and it talks
        to Postgres with the service role, which bypasses RLS. A well-known
        default token in production would let anyone on the network drive the
        worker and read every tenant's data.
        """
        if not self.is_production:
            return self

        problems: list[str] = []
        if self.internal_worker_token == DEV_INTERNAL_TOKEN:
            problems.append("INTERNAL_WORKER_TOKEN still uses the development default")
        elif len(self.internal_worker_token) < 24:
            problems.append("INTERNAL_WORKER_TOKEN must be at least 24 characters")

        if not self.supabase_service_role_key:
            problems.append("SUPABASE_SERVICE_ROLE_KEY is empty")
        if not self.database_url:
            problems.append("DATABASE_URL is empty")

        if problems:
            raise ValueError(
                "insecure worker configuration for APP_ENV=production: "
                + "; ".join(problems)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
