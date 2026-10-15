# neurocad/core/engine/lib/botinv/exporter.py

"""
XLSX exporter for the inventory module (botinv).

Builds an .xlsx workbook from the data returned by
service.get_export_data(sheet_id). The exporter itself does NOT
touch the database — the service is the single point of access
to the models.

The resulting file contains one sheet ("Ведомость") with the
following columns, in order:

    A  Инв. №           inv_num           (text — leading zeros matter)
    B  Наименование     name
    C  Кабинет до       room_before       (from the original upload)
    D  Кабинет после    room_after        (set on the first find)
    E  Найдена          found             "да" / "нет"
    F  Отмечена         marked_at         DD.MM.YYYY HH:MM
    G  Примечание       note              (cumulative journal)

The header row is frozen (freeze_panes="A2") and bold. Column
widths are set for readability. Rows keep their input order —
the same order as list_items().

Public function:

    build_workbook(sheet, items) -> bytes
        Returns the raw .xlsx bytes, ready to be streamed back by
        the route (see route.py → export_sheet).

The workbook is written to a BytesIO buffer and returned as
bytes. The route layer wraps it in a StreamingResponse with the
correct Content-Type and Content-Disposition headers.

No dependency beyond openpyxl (see pyproject.toml).
"""

import io
from datetime import datetime
from typing import Any, Dict, List, Optional

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter


# ============================================
# COLUMN DEFINITIONS
# ============================================
#
# Each entry: (header, width, field, formatter).
#   header    — text in the first row;
#   width     — column width in Excel units;
#   field     — key in the item dict (or "sheet" for a constant);
#   formatter — callable (value, item) -> cell value, or None.
#
# The order in this list IS the column order in the file. To add
# a column, add an entry here and a corresponding field in the
# item dict produced by service._item_to_dict.

_COLUMNS = [
    ("Инв. №",        20, "inv_num",     None),
    ("Наименование",  50, "name",        None),
    ("Кабинет до",    14, "room_before", None),
    ("Кабинет после", 14, "room_after",  None),
    ("Найдена",       10, "found",       lambda v, it: "да" if v else "нет"),
    ("Отмечена",      18, "marked_at",   lambda v, it: _fmt_marked_at(v)),
    ("Примечание",    60, "note",        None),
]


# ============================================
# PUBLIC
# ============================================

def build_workbook(sheet: Dict[str, Any], items: List[Dict[str, Any]]) -> bytes:
    """
    Build the .xlsx workbook and return it as bytes.

    Parameters
    ----------
    sheet : dict
        The sheet metadata as returned by service._sheet_to_dict.
        Used for the sheet title (top of the file) — not for the
        column data.
    items : list[dict]
        The items as returned by service._item_to_dict.

    Returns
    -------
    bytes
        The raw .xlsx content, ready for StreamingResponse.
    """
    wb = Workbook()
    ws = wb.active
    ws.title = "Ведомость"

    # ---- Title row (merged across all columns) ----
    title_text = _build_title(sheet)
    last_col = get_column_letter(len(_COLUMNS))
    ws.merge_cells(f"A1:{last_col}1")
    title_cell = ws["A1"]
    title_cell.value = title_text
    title_cell.font = Font(bold=True, size=13)
    title_cell.alignment = Alignment(horizontal="left", vertical="center")

    # ---- Header row ----
    header_row = 2
    header_font = Font(bold=True)
    header_fill = PatternFill("solid", fgColor="EEF2FF")

    for col_idx, (header, _width, _field, _fmt) in enumerate(_COLUMNS, start=1):
        cell = ws.cell(row=header_row, column=col_idx, value=header)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")

    # ---- Data rows ----
    first_data_row = header_row + 1
    for row_offset, item in enumerate(items):
        row_idx = first_data_row + row_offset
        for col_idx, (_header, _width, field, fmt) in enumerate(_COLUMNS, start=1):
            value = item.get(field)
            if fmt is not None:
                value = fmt(value, item)
            # openpyxl accepts str / int / float / bool / None.
            # Everything else is coerced to str.
            if value is not None and not isinstance(value, (str, int, float, bool)):
                value = str(value)
            ws.cell(row=row_idx, column=col_idx, value=value)

    # ---- Column widths ----
    for col_idx, (_header, width, _field, _fmt) in enumerate(_COLUMNS, start=1):
        letter = get_column_letter(col_idx)
        ws.column_dimensions[letter].width = width

    # ---- Freeze the header row ----
    # Data starts at row 3; freeze_panes="A3" pins rows 1–2.
    ws.freeze_panes = "A3"

    # ---- Write to bytes ----
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()


def build_filename(sheet: Dict[str, Any]) -> str:
    """
    Build a human-readable filename for the Content-Disposition
    header.

    Format:
        vedomost_<date>_<safe-name>.xlsx

    The date is the sheet's batch_date (or today if missing), the
    name is transliterated to ASCII to avoid Content-Disposition
    encoding problems in some browsers.

    Example:
        vedomost_2026-10-15_inventarizaciya.xlsx
    """
    batch = sheet.get("batch_date") or datetime.now().strftime("%Y-%m-%d")
    # Strip any time part if it somehow leaked in (batch_date is
    # stored as DATE in the DB, so it is normally YYYY-MM-DD).
    batch = str(batch).split("T")[0]

    raw_name = sheet.get("name") or "inventarizaciya"
    safe_name = _translit(raw_name)[:40] or "inventarizaciya"

    return f"vedomost_{batch}_{safe_name}.xlsx"


# ============================================
# INTERNAL HELPERS
# ============================================

def _build_title(sheet: Dict[str, Any]) -> str:
    """
    Build the title shown in the merged cell above the header.

    Example:
        Ведомость "Инвентаризация октябрь 2026" — 15.10.2026
    """
    name = sheet.get("name") or "Без названия"
    batch = sheet.get("batch_date")
    if batch:
        batch_str = _fmt_date(batch)
        return f'Ведомость "{name}" — {batch_str}'
    return f'Ведомость "{name}"'


def _fmt_marked_at(value: Any) -> Optional[str]:
    """
    Format marked_at (an ISO datetime string) as DD.MM.YYYY HH:MM.
    Returns None if the value is empty.
    """
    if not value:
        return None
    try:
        # service._item_to_dict emits isoformat(), so parse it.
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return str(value)
    return dt.strftime("%d.%m.%Y %H:%M")


def _fmt_date(value: Any) -> str:
    """
    Format a YYYY-MM-DD string (or a date object) as DD.MM.YYYY.
    """
    if not value:
        return ""
    if isinstance(value, str):
        try:
            d = datetime.strptime(value.split("T")[0], "%Y-%m-%d")
            return d.strftime("%d.%m.%Y")
        except ValueError:
            return value
    # date / datetime object
    try:
        return value.strftime("%d.%m.%Y")
    except AttributeError:
        return str(value)


# Transliteration table — Russian → ASCII. Only what is needed to
# build a safe filename. Anything not covered is dropped.
_TRANSLIT_TABLE = {
    "а": "a",  "б": "b",  "в": "v",  "г": "g",  "д": "d",
    "е": "e",  "ё": "e",  "ж": "zh", "з": "z",  "и": "i",
    "й": "y",  "к": "k",  "л": "l",  "м": "m",  "н": "n",
    "о": "o",  "п": "p",  "р": "r",  "с": "s",  "т": "t",
    "у": "u",  "ф": "f",  "х": "h",  "ц": "c",  "ч": "ch",
    "ш": "sh", "щ": "sch","ъ": "",   "ы": "y",  "ь": "",
    "э": "e",  "ю": "yu", "я": "ya",
    "А": "A",  "Б": "B",  "В": "V",  "Г": "G",  "Д": "D",
    "Е": "E",  "Ё": "E",  "Ж": "Zh", "З": "Z",  "И": "I",
    "Й": "Y",  "К": "K",  "Л": "L",  "М": "M",  "Н": "N",
    "О": "O",  "П": "P",  "Р": "R",  "С": "S",  "Т": "T",
    "У": "U",  "Ф": "F",  "Х": "H",  "Ц": "C",  "Ч": "Ch",
    "Ш": "Sh", "Щ": "Sch","Ъ": "",   "Ы": "Y",  "Ь": "",
    "Э": "E",  "Ю": "Yu", "Я": "Ya",
}


def _translit(text: str) -> str:
    """
    Transliterate a Russian string to ASCII and keep only
    [A-Za-z0-9_-]. Spaces become underscores.
    """
    out = []
    for ch in str(text):
        if ch in _TRANSLIT_TABLE:
            out.append(_TRANSLIT_TABLE[ch])
        elif ch.isascii() and (ch.isalnum() or ch in "-_"):
            out.append(ch)
        elif ch in " .":
            out.append("_")
        # Everything else is dropped.
    return "".join(out)