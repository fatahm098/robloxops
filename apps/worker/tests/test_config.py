"""The worker must refuse to start in production with development defaults."""

from __future__ import annotations

import pytest

from app.config import DEV_INTERNAL_TOKEN, Settings

PROD_BASE = {
    "app_env": "production",
    "database_url": "postgresql://u:p@db.example.com:5432/postgres",
    "supabase_service_role_key": "service-role-key",
    "internal_worker_token": "a" * 32,
}


def build(**overrides):
    return Settings(_env_file=None, **{**PROD_BASE, **overrides})


def test_production_accepts_a_real_token():
    settings = build()
    assert settings.is_production is True
    assert settings.internal_worker_token == "a" * 32


@pytest.mark.parametrize("app_env", ["production", "PRODUCTION", " prod "])
def test_production_rejects_the_default_token(app_env):
    with pytest.raises(ValueError, match="development default"):
        build(app_env=app_env, internal_worker_token=DEV_INTERNAL_TOKEN)


def test_production_rejects_a_short_token():
    with pytest.raises(ValueError, match="at least 24 characters"):
        build(internal_worker_token="too-short")


def test_production_requires_service_role_and_database_url():
    with pytest.raises(ValueError, match="SUPABASE_SERVICE_ROLE_KEY"):
        build(supabase_service_role_key="")
    with pytest.raises(ValueError, match="DATABASE_URL"):
        build(database_url="")


def test_development_keeps_the_default_token_working():
    settings = Settings(_env_file=None, app_env="development")
    assert settings.internal_worker_token == DEV_INTERNAL_TOKEN
    assert settings.is_production is False
