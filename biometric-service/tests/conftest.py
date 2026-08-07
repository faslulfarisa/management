"""
pytest fixtures for the biometric adapter.
"""

import pytest

from app.config import get_settings
from app.security import _memory_nonces


@pytest.fixture(autouse=True)
def reset_settings_cache():
    get_settings.cache_clear()
    _memory_nonces.clear()
    yield
    get_settings.cache_clear()
    _memory_nonces.clear()
