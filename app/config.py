# app/config.py

from pydantic_settings import BaseSettings
from typing import Dict, List, Optional
import json
from pathlib import Path

class Settings(BaseSettings):
    """Настройки приложения"""
    
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 9025
    DEBUG: bool = True
    DATABASE_URL: str
    SECRET_KEY: str = "your-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24
    DEVELOP: bool = False
    
    # Пользователи (JSON строка)
    USERS: str = "{}"

    # Доступ к CRM issue days (логины через пробел)
    CORE_CRM_ISSUE_DAYS: str = ""    

    # Доступ к SUDPO issue themcomp (логины через пробел)
    CORE_SUDPO_ISSUE_THEMCOMP: str = ""   

    # Доступ к формированию отчетов в СФР
    CORE_TEACH_SFR: str = ""

    # Настройки ЕФС
    EFS_ORG_INN: str = ""
    EFS_ORG_CPP: str = ""
    EFS_ORG_UC_NAME: str = ""
    EFS_ORG_CH_NAME: str = ""
    EFS_ORG_CODE: str = ""
    EFS_FSR_CODE: str = ""
    EFS_ORG_OKVED: str = ""
    EFS_ORG_PHONE: str = ""
    EFS_ORG_EMAIL: str = ""
    EFS_ORG_STATE: str = ""
    EFS_ORG_COUNTRY: str = ""
    EFS_EVENT_TYPE_BEG: int = 9
    EFS_EVENT_TYPE_END: int = 10
    EFS_ORG_VF: str = ""
    EFS_ORG_OKZ: str = ""
    EFS_LEAD_UC_FIO: str = ""
    EFS_LEAD_UC_PROF: str = ""
    EFS_LEAD_CH_FIO: str = ""
    EFS_LEAD_CH_PROF: str = ""
    EFS_ORG_REASON: str = ""
    EFS_PROG: str = ""
    EFS_TZ_REGION: str = ""
    EFS_ORG_OGRN: str = ""    
    
    @property
    def users_dict(self) -> Dict[str, int]:
        """Возвращает словарь пользователей {логин: id}"""
        try:
            return json.loads(self.USERS)
        except json.JSONDecodeError:
            return {}
    
    @property
    def crm_issue_days_allowed_ids(self) -> List[int]:
        """Возвращает список ID пользователей, которым разрешён доступ к CRM issue days"""
        result = []
        if not self.CORE_CRM_ISSUE_DAYS:
            return result
        users = self.users_dict
        for login in self.CORE_CRM_ISSUE_DAYS.split():
            login = login.strip()
            if login in users:
                result.append(users[login])
        return result
    
    @property
    def sudpo_issue_themcomp_allowed_ids(self) -> List[int]:
        """Возвращает список ID пользователей, которым разрешён доступ к SUDPO issue themcomp"""
        result = []
        if not self.CORE_SUDPO_ISSUE_THEMCOMP:
            return result
        users = self.users_dict
        for login in self.CORE_SUDPO_ISSUE_THEMCOMP.split():
            login = login.strip()
            if login in users:
                result.append(users[login])
        return result 

    @property
    def core_teach_sfr_allowed_ids(self) -> List[int]:
        result = []
        if not self.CORE_TEACH_SFR: return result
        users = self.users_dict
        for login in self.CORE_TEACH_SFR.split():
            login = login.strip()
            if login in users:
                result.append(users[login])
        return result      
       
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"

settings = Settings()