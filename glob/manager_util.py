import traceback

import aiohttp
import json
import threading
import os
from datetime import datetime


cache_lock = threading.Lock()

comfyui_manager_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
cache_dir = os.path.join(comfyui_manager_path, '.cache')


try:
    from distutils.version import StrictVersion
except:
    print(f"[ComfyUI-Manager]  'distutils' package not found. Activating fallback mode for compatibility.")
    class StrictVersion:
        def __init__(self, version_string):
            self.version_string = version_string
            self.major = 0
            self.minor = 0
            self.patch = 0
            self.pre_release = None
            self.parse_version_string()

        def parse_version_string(self):
            parts = self.version_string.split('.')
            if not parts:
                raise ValueError("Version string must not be empty")

            self.major = int(parts[0])
            self.minor = int(parts[1]) if len(parts) > 1 else 0
            self.patch = int(parts[2]) if len(parts) > 2 else 0

            # Handling pre-release versions if present
            if len(parts) > 3:
                self.pre_release = parts[3]

        def __str__(self):
            version = f"{self.major}.{self.minor}.{self.patch}"
            if self.pre_release:
                version += f"-{self.pre_release}"
            return version

        def __eq__(self, other):
            return (self.major, self.minor, self.patch, self.pre_release) == \
                (other.major, other.minor, other.patch, other.pre_release)

        def __lt__(self, other):
            if (self.major, self.minor, self.patch) == (other.major, other.minor, other.patch):
                return self.pre_release_compare(self.pre_release, other.pre_release) < 0
            return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)

        @staticmethod
        def pre_release_compare(pre1, pre2):
            if pre1 == pre2:
                return 0
            if pre1 is None:
                return 1
            if pre2 is None:
                return -1
            return -1 if pre1 < pre2 else 1

        def __le__(self, other):
            return self == other or self < other

        def __gt__(self, other):
            return not self <= other

        def __ge__(self, other):
            return not self < other

        def __ne__(self, other):
            return not self == other


def simple_hash(input_string):
    hash_value = 0
    for char in input_string:
        hash_value = (hash_value * 31 + ord(char)) % (2**32)

    return hash_value


def is_file_created_within_one_day(file_path):
    if not os.path.exists(file_path):
        return False

    file_creation_time = os.path.getctime(file_path)
    current_time = datetime.now().timestamp()
    time_difference = current_time - file_creation_time

    return time_difference <= 86400


async def get_data(uri, silent=False):
    if not silent:
        print(f"FETCH DATA from: {uri}", end="")

    if uri.startswith("http"):
        async with aiohttp.ClientSession(trust_env=True, connector=aiohttp.TCPConnector(verify_ssl=False)) as session:
            async with session.get(uri) as resp:
                json_text = await resp.text()
    else:
        with cache_lock:
            with open(uri, "r", encoding="utf-8") as f:
                json_text = f.read()

    json_obj = json.loads(json_text)

    if not silent:
        print(f" [DONE]")

    return json_obj


async def get_data_with_cache(uri, silent=False, cache_mode=True):
    cache_uri = str(simple_hash(uri)) + '_' + os.path.basename(uri).replace('&', "_").replace('?', "_").replace('=', "_")
    cache_uri = os.path.join(cache_dir, cache_uri+'.json')

    if cache_mode and is_file_created_within_one_day(cache_uri):
        json_obj = await get_data(cache_uri, silent=silent)
    else:
        json_obj = await get_data(uri, silent=silent)

        with cache_lock:
            with open(cache_uri, "w", encoding='utf-8') as file:
                json.dump(json_obj, file, indent=4, sort_keys=True)
                if not silent:
                    print(f"[ComfyUI-Manager] default cache updated: {uri}")

    return json_obj


def sanitize_tag(x):
    return x.replace('<', '&lt;').replace('>', '&gt;')
