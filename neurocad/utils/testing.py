# neurocad/utils/testing.py

"""
Test utility for interacting with a running NeuroCad instance.
Provides a simple wrapper around requests.Session that handles
authentication for both admin and regular test users.
"""

import os
import requests
import json
from typing import Any, Dict, Optional
from dotenv import load_dotenv

# Hardcoded relative path to the test .env file from the project root.
_TEST_ENV_REL_PATH = "test/.env"

def _load_test_env():
    """Load the test .env file if it exists, otherwise print an error."""
    # Find the project root by going up from this file's location
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, "..", ".."))
    
    env_path = os.path.join(project_root, _TEST_ENV_REL_PATH)
    
    if os.path.exists(env_path):
        load_dotenv(dotenv_path=env_path, override=True)
    else:
        print(f"[TEST] ERROR: Файл {env_path} не найден. Пожалуйста, создайте его для тестов.")

# --- ОТЛАДКА ---
print("=== ОТЛАДКА TESTING.PY ===")
print(f"Текущая рабочая директория: {os.getcwd()}")
print(f"Путь к test/.env, который мы ищем: {os.path.join(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')), 'test/.env')}")
print(f"APP_PORT из os.getenv: {os.getenv('APP_PORT')}")
print("==========================")
# --- КОНЕЦ ОТЛАДКИ ---


_load_test_env()

class Tester:
    """
    HTTP client for testing the API.
    """

    def __new__(cls):
        """Singleton pattern: only one instance of Tester exists."""
        if not hasattr(cls, 'instance'):
            cls.instance = super(Tester, cls).__new__(cls)
            cls.instance._setup()
        return cls.instance

    def _setup(self):
        """Initialize the session and URLs."""
        # Приоритет: APP_URL -> APP_HOST + APP_PORT
        env_url = os.getenv("APP_URL")
        if env_url:
            self.base_url = env_url.rstrip("/")
        else:
            host = os.getenv("APP_HOST", "127.0.0.1")
            port = os.getenv("APP_PORT", "8000")
            self.base_url = f"http://{host}:{port}"

        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json"
        })

    def _login(self, login: str, password: str) -> bool:
        """Internal method to authenticate."""
        url = f"{self.base_url}/core/auth/login"
        print(f"[TEST] Logging in as {login}...")
        
        try:
            response = self.session.post(url, json={"login": login, "password": password})
            response.raise_for_status()
            print("[TEST] Login successful")
            return True
        except requests.exceptions.HTTPError:
            print(f"[TEST] Login failed: {response.status_code} {response.text}")
            return False
        except requests.exceptions.RequestException as e:
            print(f"[TEST] Connection error: {e}")
            return False

    def login_admin(self) -> bool:
        """Authenticate as the superadmin defined in settings."""
        login = os.getenv("SUPERADMIN_LOGIN", "admin")
        password = os.getenv("SUPERADMIN_PASSWORD", "admin")
        return self._login(login, password)

    def login_test(self) -> bool:
        """Authenticate as the regular test user defined in settings."""
        login = os.getenv("TEST_LOGIN", "test")
        password = os.getenv("TEST_PASSWORD", "test")
        return self._login(login, password)

    def post(self, endpoint: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Send a POST request and return the JSON response."""
        url = f"{self.base_url}{endpoint}"
        print(f"[TEST] POST {url}")
        
        try:
            response = self.session.post(url, json=payload)
            print(f"[TEST] Status: {response.status_code}")
            
            data = response.json()
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return data
            
        except requests.exceptions.HTTPError:
            print(f"[TEST] HTTP Error: {response.status_code} {response.text}")
            return {"error": response.text}
        except requests.exceptions.RequestException as e:
            print(f"[TEST] Connection error: {e}")
            return {"error": str(e)}
        except json.JSONDecodeError:
            print("[TEST] Raw response:", response.text)
            return {"error": "Invalid JSON response"}

    def get(self, endpoint: str) -> Dict[str, Any]:
        """Send a GET request and return the JSON response."""
        url = f"{self.base_url}{endpoint}"
        print(f"[TEST] GET {url}")
        
        try:
            response = self.session.get(url)
            print(f"[TEST] Status: {response.status_code}")
            
            data = response.json()
            print(json.dumps(data, indent=2, ensure_ascii=False))
            return data
            
        except requests.exceptions.HTTPError:
            print(f"[TEST] HTTP Error: {response.status_code} {response.text}")
            return {"error": response.text}
        except requests.exceptions.RequestException as e:
            print(f"[TEST] Connection error: {e}")
            return {"error": str(e)}
        except json.JSONDecodeError:
            print("[TEST] Raw response:", response.text)
            return {"error": "Invalid JSON response"}


# Short alias for import
req = Tester()