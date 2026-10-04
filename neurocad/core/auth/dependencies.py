# app/core/auth/dependencies.py

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

from ...config import settings
from .service import CoreAuthService

security = HTTPBearer(auto_error=False)


class CoreAuthDependencies:
    """Authentication dependencies."""

    @staticmethod
    def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
        """
        Create a JWT.

        `data` is copied as-is: every field except the reserved
        ones (`exp`) ends up in the payload. For impersonation,
        callers put `sub` (target user id) and `imp_by` (admin id
        who is acting as that user) in here.
        """
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode.update({"exp": expire})
        return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    @staticmethod
    def get_token_from_request(request: Request) -> Optional[str]:
        """Read the token from the Authorization header or from a cookie."""
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            return auth_header[7:]

        token = request.cookies.get("access_token")
        if token:
            return token

        return None

    @staticmethod
    async def get_current_user(
        request: Request,
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ) -> Dict[str, Any]:
        """
        Required authentication.

        Returns a user dict (see serialize_user in
        core/auth/service.py) or raises 401.

        Impersonation
        -------------
        If the JWT carries an `imp_by` field, the token was issued
        by an admin who is acting "as another user". In that case
        `sub` is the target user id and `imp_by` is the admin id.
        We put `imp_by` into the returned dict under the key
        `impersonated_by`, so downstream code (middleware,
        endpoints, admin checks) can tell impersonation from a
        normal session — and, for example, forbid dangerous
        operations.

        Nothing is written to the DB: impersonation is a property
        of the session (the token), not of the user.
        """
        token = CoreAuthDependencies.get_token_from_request(request)

        if not token:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "message": "Требуется авторизация"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: int = payload.get("sub")
            if user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        "success": False,
                        "message": "Недействительный токен"
                    },
                    headers={"WWW-Authenticate": "Bearer"}
                )

            # Impersonation marker — see the docstring above.
            # We accept it as int only; anything else is treated
            # as "not impersonated" (defensive — we control what
            # goes into the token, but old tokens live on).
            raw_imp_by = payload.get("imp_by")
            try:
                imp_by: Optional[int] = int(raw_imp_by) if raw_imp_by is not None else None
            except (TypeError, ValueError):
                imp_by = None
        except JWTError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "message": "Недействительный токен"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )

        log = request.app.state.log if hasattr(request.app.state, 'log') else None
        user = await CoreAuthService.get_user_by_id(int(user_id), log=log)

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "success": False,
                    "message": "Пользователь не найден"
                },
                headers={"WWW-Authenticate": "Bearer"}
            )

        # Attach the impersonation marker for this request.
        # get_user_by_id returns a dict (see serialize_user),
        # so a simple key assignment is enough.
        if imp_by is not None:
            user["impersonated_by"] = imp_by

        return user

    @staticmethod
    async def get_current_user_optional(
        request: Request,
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ) -> Optional[Dict[str, Any]]:
        """
        Optional authentication.

        Returns the user dict, or None if not authenticated.
        Impersonation is handled exactly as in get_current_user.
        """
        token = CoreAuthDependencies.get_token_from_request(request)

        if not token:
            return None

        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
            user_id: int = payload.get("sub")
            if user_id is None:
                return None

            raw_imp_by = payload.get("imp_by")
            try:
                imp_by: Optional[int] = int(raw_imp_by) if raw_imp_by is not None else None
            except (TypeError, ValueError):
                imp_by = None
        except JWTError:
            return None

        log = request.app.state.log if hasattr(request.app.state, 'log') else None
        user = await CoreAuthService.get_user_by_id(int(user_id), log=log)

        if user is not None and imp_by is not None:
            user["impersonated_by"] = imp_by

        return user


# Backwards-compatible aliases for the existing codebase.
create_access_token = CoreAuthDependencies.create_access_token
get_token_from_request = CoreAuthDependencies.get_token_from_request
get_current_user = CoreAuthDependencies.get_current_user
get_current_user_optional = CoreAuthDependencies.get_current_user_optional