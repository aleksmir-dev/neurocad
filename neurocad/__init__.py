# neurocad/__init__.py

"""NeuroCad — core engine + CMS + visual editor for FastAPI."""

__version__ = "0.1.0"

from .app import NeuroCad

__all__ = [
    "NeuroCad",
    "__version__",
]