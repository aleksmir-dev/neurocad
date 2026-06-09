# app/core/node/auth/service.py

from sqlalchemy import text
from ....utils.mysql import get_db
from ....utils.sqlite import get_db_sqlite
from ....utils.hash import get_hash_string
from ..models import User
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


def shorten_name(full_name: str) -> str:
    """Преобразует 'Иванов Иван Иванович' в 'Иванов И.И.'"""
    if not full_name:
        return full_name
    
    parts = full_name.strip().split()
    if len(parts) >= 2:
        surname = parts[0]
        initials = ''.join([f"{part[0]}." for part in parts[1:]])
        return f"{surname} {initials}"
    return full_name


class AuthService:
    @staticmethod
    async def authenticate_user(login: str, hashed_password: str):
        """Проверка пользователя в MySQL и синхронизация с SQLite"""
        logger.info(f"🔐 authenticate_user called for login: {login}")
        
        async for session in get_db():
            sql = text('''
                SELECT `id`, `sign` AS `user_name`
                FROM `users`
                WHERE (`is_delete` = 0)
                AND (`login` = :login)
                AND (`pass` = :password)
            ''')
            
            result = await session.execute(sql, {
                'login': login, 
                'password': hashed_password
            })
            user = result.mappings().first()
            
            if user is None:
                logger.warning(f"❌ User not found in MySQL for login: {login}")
                return None
            
            logger.info(f"✅ User found in MySQL: id={user['id']}, name={user.get('user_name')}")
            
            # Преобразуем ФИО в "Фамилия И.О."
            shortened_name = shorten_name(user.get('user_name'))
            
            # Синхронизация с SQLite
            await AuthService.sync_user_to_sqlite(
                user_id=user['id'],
                login=login,
                name=shortened_name
            )
            
            return {
                "user_id": user['id'],
                "username": shortened_name
            }
    
    @staticmethod
    async def sync_user_to_sqlite(user_id: int, login: str, name: str = None):
        """Создать или обновить пользователя в SQLite"""
        logger.info(f"📦 sync_user_to_sqlite called: user_id={user_id}, login={login}, name={name}")
        
        try:
            async for sqlite_session in get_db_sqlite():
                logger.debug(f"📦 Got SQLite session")
                
                from sqlalchemy import select
                stmt = select(User).where(User.id == user_id)
                result = await sqlite_session.execute(stmt)
                existing_user = result.scalar_one_or_none()
                
                if existing_user:
                    logger.info(f"📦 User {user_id} already exists in SQLite, updating...")
                    existing_user.login = login
                    existing_user.name = name
                    existing_user.last_seen = datetime.now()
                else:
                    logger.info(f"📦 User {user_id} not found in SQLite, creating...")
                    new_user = User(
                        id=user_id,
                        login=login,
                        name=name,
                        last_seen=datetime.now()
                    )
                    sqlite_session.add(new_user)
                
                await sqlite_session.commit()
                logger.info(f"✅ User {user_id} successfully saved to SQLite")
                
        except Exception as e:
            logger.error(f"❌ Error in sync_user_to_sqlite: {e}")
            import traceback
            logger.error(traceback.format_exc())
    
    @staticmethod
    async def login(login: str, password: str):
        """Логин с автоматическим хэшированием"""
        logger.info(f"🔐 login called for: {login}")
        hashed_password = get_hash_string(password)
        return await AuthService.authenticate_user(login, hashed_password)
    
    @staticmethod
    async def get_user_by_id(user_id: int):
        """Получение данных пользователя по ID из MySQL (с is_superadmin из SQLite)"""
        logger.debug(f"👤 get_user_by_id called: user_id={user_id}")
        
        async for session in get_db():
            sql = text('''
                SELECT 
                    `id`,
                    `login`,
                    `sign`,
                    `is_delete`
                FROM `users`
                WHERE `id` = :user_id
            ''')
            
            result = await session.execute(sql, {'user_id': user_id})
            user = result.mappings().first()
            
            if user is None:
                logger.warning(f"❌ User {user_id} not found in MySQL")
                return None
            
            logger.debug(f"✅ User {user_id} found in MySQL: login={user['login']}")
            
            # Получаем is_superadmin из SQLite
            is_superadmin = False
            async for sqlite_session in get_db_sqlite():
                from sqlalchemy import select
                from ..models import User as SQLiteUser
                stmt = select(SQLiteUser).where(SQLiteUser.id == user_id)
                result = await sqlite_session.execute(stmt)
                sqlite_user = result.scalar_one_or_none()
                if sqlite_user:
                    is_superadmin = sqlite_user.is_superadmin
            
            # Преобразуем ФИО в "Фамилия И.О." при возврате
            sign = user.get('sign')
            shortened_sign = shorten_name(sign) if sign else None
            
            print(f"🔧 is_superadmin for user {user_id}: {is_superadmin}")
            
            return {
                "id": user['id'],
                "login": user['login'],
                "sign": shortened_sign,
                "is_delete": bool(user.get('is_delete', 0)),
                "is_superadmin": is_superadmin
            }