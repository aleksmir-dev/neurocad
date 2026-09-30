# neurocad/core/engine/lib/word/constants.py

"""
Constants shared across the word module.

Kept in a dedicated module so that both `service.py` and the
editor I/O helpers can import them without creating a circular
import (media.py needs MEDIA_URL; service.py needs media.py).

Namespace: CoreEngineLibWordConstants
"""

#: Public URL prefix for media files. The matching filesystem
#: directory is `media/<nav_id>/`.
MEDIA_URL = "/media"

#: Special filenames that keep their original name on upload
#: (no random suffix) — site root files.
SPECIAL_NAMES = {"favicon.ico", "robots.txt", "sitemap.xml"}