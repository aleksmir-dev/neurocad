# neurocad/utils/templates.py

from fastapi import Request
from fastapi.templating import Jinja2Templates
from pathlib import Path
import time

from .paths import package_dir

# Static version (changes on server restart).
STATIC_VERSION = str(int(time.time()))

# Jinja2Templates search order:
#   1. User overrides (project1/)
#   2. Package (neurocad/)
templates = Jinja2Templates(directory=[
    str(Path(".")),            # project1/ (cwd)
    str(package_dir()),        # neurocad/
])


# ============================================
# STATIC FILTER
# ============================================

def static_url(path: str) -> str:
    """Return static file URL with version."""
    return f"/static/{path}?v={STATIC_VERSION}"


templates.env.filters['static'] = static_url
templates.env.globals['static_version'] = STATIC_VERSION


# ============================================
# GLOBAL TEMPLATE FUNCTIONS
# ============================================

def get_user(request: Request):
    """Get user from request.state."""
    return getattr(request.state, "user", None)


def is_authenticated(request: Request):
    """Check if user is authenticated."""
    return getattr(request.state, "is_authenticated", False)


templates.env.globals['get_user'] = get_user
templates.env.globals['is_authenticated'] = is_authenticated