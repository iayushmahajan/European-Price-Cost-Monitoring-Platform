import os

# Never load the developer's real connection/provider configuration during tests.
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["ANALYTICS_DATABASE_URL"] = "sqlite://"
os.environ["AI_PROVIDER"] = "foundry_local"
os.environ["AI_API_URL"] = "http://provider.test/v1/chat/completions"
os.environ["AI_MODEL"] = "phi-4-mini"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.db import get_db
from app.main import app
from app.models import Base


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def reset_provider_cooldowns():
    from app.services.provider_limits import cooldowns
    cooldowns.clear()
    yield
    cooldowns.clear()
