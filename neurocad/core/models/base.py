# neurocad/core/models/base.py

from sqlalchemy.orm import DeclarativeBase

class Base(DeclarativeBase):
    pass

# Импортируем все модели
from .access import Access
from .auth import PasswordReset
from .user import User
from .page import Page
from .nav import Nav
from .module import Module
from .setting import Setting
from .page_pres import PagePres
from .page_hist import PageHist
from .page_chat import PageChat
from .run import Run
from .balance import Balance
from .domain import Domain
from .creative import Creative
from .placement import Placement
from .placement_stat import PlacementStat
from .panel_limit import PanelLimit
from .panel_limit_hist import PanelLimitHist
from .panel_stat import PanelStat
from .panel_task import PanelTask
from .panel_task_hist import PanelTaskHist
from .backup_run import BackupRun
from .botinv_sheet import BotInvSheet
from .botinv_item import BotInvItem