# app/utils/hash.py

import hashlib
import base64

def get_hash_string(text: str) -> str:
    """
    Многослойное хэширование пароля:
    1. MD5(text) → base64
    2. Добавляем 'SD' → MD5 → base64
    3. Добавляем 'EN' → SHA1 → base64
    """
    # Шаг 1: MD5(text) → base64
    md5_hash = hashlib.md5(text.encode('utf-8'), usedforsecurity=False).digest()
    md5_base64 = base64.b64encode(md5_hash).decode()
    
    # Шаг 2: Добавляем 'SD' → MD5 → base64
    md5_base64_salted = md5_base64 + 'SD'
    md5_hash_salted = hashlib.md5(md5_base64_salted.encode('utf-8'), usedforsecurity=False).digest()
    md5_base64_salted_hash = base64.b64encode(md5_hash_salted).decode()
    
    # Шаг 3: Добавляем 'EN' → SHA1 → base64
    sha_input = md5_base64_salted_hash + 'EN'
    sha1_hash = hashlib.sha1(sha_input.encode('utf-8'), usedforsecurity=False).digest()
    sha1_base64 = base64.b64encode(sha1_hash).decode()
    
    return sha1_base64

def verify_password(raw_password: str, hashed_password: str) -> bool:
    """
    Проверяет, соответствует ли пароль хэшу из БД
    """
    return get_hash_string(raw_password) == hashed_password
