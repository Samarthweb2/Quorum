"""
Shared pytest fixtures for Quorum test suite.
"""

import pytest
from tests.fake_transport import FakeNetwork


@pytest.fixture
def fake_network():
    return FakeNetwork()
