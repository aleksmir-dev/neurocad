# neurocad/__init__.py

"""
NeuroCad — core engine + CMS + visual editor for FastAPI.
"""

from importlib.metadata import version, PackageNotFoundError

try:
    __version__ = version("neurocad")
except PackageNotFoundError:
    __version__ = "0.0.0-dev"

from .app import NeuroCad
from .core.models.base import Base
from .config import settings

__all__ = [
    "NeuroCad",
    "Base",
    "settings",
    "__version__",
]