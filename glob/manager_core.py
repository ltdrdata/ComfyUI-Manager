import os
import sys
import subprocess
import re
import shutil
import configparser
import platform

import git
from git.remote import RemoteProgress
from urllib.parse import urlparse
from tqdm.auto import tqdm
import time
import yaml
import zipfile
from concurrent.futures import ThreadPoolExecutor, as_completed

orig_print = print

from rich import print
from packaging import version

import uuid
import requests

glob_path = os.path.join(os.path.dirname(__file__))  # ComfyUI-Manager/glob
sys.path.append(glob_path)

import cm_global
import cnr_utils
from manager_util import *


version_code = [2, 48, 1]
version_str = f"V{version_code[0]}.{version_code[1]}" + (f'.{version_code[2]}' if len(version_code) > 2 else '')


def download_url(url, dest_folder, filename):
    # Ensure the destination folder exists
    if not os.path.exists(dest_folder):
        os.makedirs(dest_folder)

    # Full path to save the file
    dest_path = os.path.join(dest_folder, filename)

    # Download the file
    response = requests.get(url, stream=True)
    if response.status_code == 200:
        with open(dest_path, 'wb') as file:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    file.write(chunk)
    else:
        raise Exception(f"Failed to download file from {url}")


custom_nodes_path = os.path.abspath(os.path.join(comfyui_manager_path, '..'))


comfy_path = os.environ.get('COMFYUI_PATH')
if comfy_path is None:
    comfy_path = os.path.abspath(os.path.join(custom_nodes_path, '..'))

channel_list_path = os.path.join(comfyui_manager_path, 'channels.list')
config_path = os.path.join(comfyui_manager_path, "config.ini")
startup_script_path = os.path.join(comfyui_manager_path, "startup-scripts")
git_script_path = os.path.join(comfyui_manager_path, "git_helper.py")
cached_config = None
js_path = None

comfy_ui_required_revision = 1930
comfy_ui_required_commit_datetime = datetime(2024, 1, 24, 0, 0, 0)

comfy_ui_revision = "Unknown"
comfy_ui_commit_datetime = datetime(1900, 1, 1, 0, 0, 0)

channel_dict = None
channel_list = None
pip_map = None


def remap_pip_package(pkg):
    if pkg in cm_global.pip_overrides:
        res = cm_global.pip_overrides[pkg]
        print(f"[ComfyUI-Manager] '{pkg}' is remapped to '{res}'")
        return res
    else:
        return pkg


def get_installed_packages():
    global pip_map

    if pip_map is None:
        try:
            result = subprocess.check_output([sys.executable, '-m', 'pip', 'list'], universal_newlines=True)

            pip_map = {}
            for line in result.split('\n'):
                x = line.strip()
                if x:
                    y = line.split()
                    if y[0] == 'Package' or y[0].startswith('-'):
                        continue

                    pip_map[y[0]] = y[1]
        except subprocess.CalledProcessError as e:
            print(f"[ComfyUI-Manager] Failed to retrieve the information of installed pip packages.")
            return set()

    return pip_map


def clear_pip_cache():
    global pip_map
    pip_map = None


def is_blacklisted(name):
    name = name.strip()

    pattern = r'([^<>!=]+)([<>!=]=?)(.*)'
    match = re.search(pattern, name)

    if match:
        name = match.group(1)

    if name in cm_global.pip_downgrade_blacklist:
        pips = get_installed_packages()

        if match is None:
            if name in pips:
                return True
        elif match.group(2) in ['<=', '==', '<']:
            if name in pips:
                if StrictVersion(pips[name]) >= StrictVersion(match.group(3)):
                    return True

    return False


def is_installed(name):
    name = name.strip()

    if name.startswith('#'):
        return True

    pattern = r'([^<>!=]+)([<>!=]=?)(.*)'
    match = re.search(pattern, name)

    if match:
        name = match.group(1)

    if name in cm_global.pip_downgrade_blacklist:
        pips = get_installed_packages()

        if match is None:
            if name in pips:
                return True
        elif match.group(2) in ['<=', '==', '<']:
            if name in pips:
                if StrictVersion(pips[name]) >= StrictVersion(match.group(3)):
                    print(f"[ComfyUI-Manager] skip black listed pip installation: '{name}'")
                    return True

    return name.lower() in get_installed_packages()


def normalize_channel(channel):
    if channel is None:
        return None
    elif channel.startswith('https://'):
        return channel

    tmp_dict = get_channel_dict()
    channel_url = tmp_dict.get(channel)
    if channel_url:
        return channel_url

    raise Exception(f"Invalid channel name '{channel}'")


class ManagedResult:
    def __init__(self, action):
        self.action = action
        self.items = []
        self.result = True
        self.to_path = None
        self.msg = None
        self.target = None
        self.postinstall = lambda: True

    def append(self, item):
        self.items.append(item)

    def fail(self, msg):
        self.result = False
        self.msg = msg
        return self

    def with_target(self, target):
        self.target = target
        return self

    def with_msg(self, msg):
        self.msg = msg
        return self

    def with_postinstall(self, postinstall):
        self.postinstall = postinstall
        return self


class UnifiedManager:
    def __init__(self):
        self.cnr_inactive_nodes = {}       # node_id -> node_version -> fullpath
        self.nightly_inactive_nodes = {}   # node_id -> fullpath
        self.unknown_inactive_nodes = {}   # node_id -> repo url * fullpath
        self.active_nodes = {}             # node_id -> node_version * fullpath
        self.unknown_active_nodes = {}     # node_id -> repo url * fullpath
        self.cnr_map = {}                  # node_id -> cnr info
        self.repo_cnr_map = {}             # repo_url -> cnr info
        self.custom_node_map_cache = {}    # (channel, mode) -> augmented custom node list json
        self.processed_install = set()

    def resolve_unspecified_version(self, node_name, guess_mode=None):
        if guess_mode == 'active':
            # priority:
            # 1. CNR/nightly active nodes
            # 2. unknown
            # 3. Fail

            if node_name in self.cnr_map:
                version_spec = self.get_from_cnr_active_nodes(node_name)

                if version_spec is None:
                    if node_name in self.unknown_active_nodes:
                        version_spec = "unknown"
                    else:
                        return None

            elif node_name in self.unknown_active_nodes:
                version_spec = "unknown"
            else:
                return None

        elif guess_mode == 'inactive':
            # priority:
            # 1. CNR latest in inactive
            # 2. nightly
            # 3. unknown
            # 4. Fail

            if node_name in self.cnr_map:
                latest = self.get_from_cnr_inactive_nodes(node_name)

                if latest is not None:
                    version_spec = latest[0]
                else:
                    if node_name in self.nightly_inactive_nodes:
                        version_spec = "nightly"
                    else:
                        version_spec = "unknown"

            elif node_name in self.unknown_inactive_nodes:
                version_spec = "unknown"
            else:
                return None

        else:
            # priority:
            # 1. CNR latest in world
            # 2. unknown

            if node_name in self.cnr_map:
                version_spec = self.cnr_map[node_name]['latest_version']['version']
            else:
                version_spec = "unknown"

        return version_spec

    def resolve_node_spec(self, node_name, guess_mode=None):
        """
        resolve to 'node_name, version_spec' from version string

        version string:
            node_name@latest
            node_name@nightly
            node_name@unknown
            node_name@<version>
            node_name

        if guess_mode is 'active' or 'inactive'
            return can be 'None' based on state check
        otherwise
            return 'unknown' version when failed to guess
        """

        spec = node_name.split('@')

        if len(spec) == 2:
            node_name = spec[0]
            version_spec = spec[1]

            if version_spec == 'latest':
                if node_name not in self.cnr_map:
                    print(f"ERROR: '{node_name}' is not a CNR node.")
                    return None
                else:
                    version_spec = self.cnr_map[node_name]['latest_version']['version']

        elif guess_mode in ['active', 'inactive']:
            node_name = spec[0]
            version_spec = self.resolve_unspecified_version(node_name, guess_mode=guess_mode)
            if version_spec is None:
                return None
        else:
            node_name = spec[0]
            version_spec = self.resolve_unspecified_version(node_name)
            if version_spec is None:
                return None

        return node_name, version_spec, len(spec) > 1

    def resolve_ver(self, fullpath):
        """
        resolve version of unclassified custom node based on remote url in .git/config
        """
        git_config_path = os.path.join(fullpath, '.git', 'config')

        if not os.path.exists(git_config_path):
            return "unknown"

        config = configparser.ConfigParser()
        config.read(git_config_path)

        for k, v in config.items():
            if k.startswith('remote ') and 'url' in v:
                cnr = self.repo_cnr_map.get(v['url'])
                if cnr:
                    return "nightly"
                else:
                    return "unknown"

    def resolve_id_from_repo(self, fullpath):
        git_config_path = os.path.join(fullpath, '.git', 'config')

        if not os.path.exists(git_config_path):
            return None

        config = configparser.ConfigParser()
        config.read(git_config_path)

        for k, v in config.items():
            if k.startswith('remote ') and 'url' in v:
                cnr = self.repo_cnr_map.get(v['url'])
                if cnr:
                    return "nightly", cnr['id'], v['url']
                else:
                    return "unknown", v['url'].split('/')[-1], v['url']

    def resolve_unknown(self, node_id, fullpath):
        res = self.resolve_id_from_repo(fullpath)

        if res is None:
            self.unknown_inactive_nodes[node_id] = '', fullpath
            return

        ver_spec, node_id, url = res

        if ver_spec == 'nightly':
            self.nightly_inactive_nodes[node_id] = fullpath
        else:
            self.unknown_inactive_nodes[node_id] = url, fullpath

    def update_cache_at_path(self, fullpath, is_disabled):
        name = os.path.basename(fullpath)

        if name.endswith(".disabled"):
            node_spec = name[:-9]
            is_disabled = True
        else:
            node_spec = name

        if '@' in node_spec:
            node_spec = node_spec.split('@')
            node_id = node_spec[0]
            if node_id is None:
                node_version = 'unknown'
            else:
                node_version = node_spec[1].replace("_", ".")

            if node_version != 'unknown':
                if node_id not in self.cnr_map:
                    # fallback
                    v = node_version

                    self.cnr_map[node_id] = {
                        'id': node_id,
                        'name': node_id,
                        'latest_version': {'version': v},
                        'publisher': {'id': 'N/A', 'name': 'N/A'}
                    }

            elif node_version == 'unknown':
                res = self.resolve_id_from_repo(fullpath)
                if res is None:
                    print(f"Custom node unresolved: {fullpath}")
                    return

                node_version, node_id, _ = res
        else:
            res = self.resolve_id_from_repo(fullpath)
            if res is None:
                print(f"Custom node unresolved: {fullpath}")
                return

            node_version, node_id, _ = res

        if not is_disabled:
            # active nodes
            if node_version == 'unknown':
                self.unknown_active_nodes[node_id] = node_version, fullpath
            else:
                self.active_nodes[node_id] = node_version, fullpath
        else:
            if node_version == 'unknown':
                self.resolve_unknown(node_id, fullpath)
            elif node_version == 'nightly':
                self.nightly_inactive_nodes[node_id] = fullpath
            else:
                self.add_to_cnr_inactive_nodes(node_id, node_version, fullpath)

    def is_updatable(self, node_id):
        cur_ver = self.get_cnr_active_version(node_id)
        latest_ver = self.cnr_map[node_id]['latest_version']['version']

        if cur_ver and latest_ver:
            return self.safe_version(latest_ver) > self.safe_version(cur_ver)

        return False

    def fetch_or_pull_git_repo(self, is_pull=False):
        updated = set()
        failed = set()

        def check_update(node_name, fullpath, ver_spec):
            try:
                if is_pull:
                    is_updated, success = git_repo_update_check_with(fullpath, do_update=True)
                else:
                    is_updated, success = git_repo_update_check_with(fullpath, do_fetch=True)

                return f"{node_name}@{ver_spec}", is_updated, success
            except Exception:
                traceback.print_exc()

            return f"{node_name}@{ver_spec}", False, False

        with ThreadPoolExecutor() as executor:
            futures = []

            for k, v in self.unknown_active_nodes.items():
                futures.append(executor.submit(check_update, k, v[1], 'unknown'))

            for k, v in self.active_nodes.values():
                if v[0] == 'nightly':
                    futures.append(executor.submit(check_update, k, v[1], 'nightly'))

            for future in as_completed(futures):
                item, is_updated, success = future.result()

                if is_updated:
                    updated.add(item)

                if not success:
                    failed.add(item)

        return dict(updated=list(updated), failed=list(failed))

    def is_enabled(self, node_id, version_spec=None):
        """
        1. true if node_id@<specified_version> is enabled
        2. true if node_id@<any> is enabled and version_spec==None
        3. false otherwise

        remark: latest version_spec is not allowed. Must be resolved before call.
        """
        if version_spec == "cnr":
            return self.get_cnr_active_version(node_id) not in [None, 'nightly']
        elif version_spec == 'unknown' and self.is_unknown_active(node_id):
            return True
        elif version_spec is not None and self.get_cnr_active_version(node_id) == version_spec:
            return True
        elif version_spec is None and (node_id in self.active_nodes or node_id in self.unknown_active_nodes):
            return True
        return False

    def is_disabled(self, node_id, version_spec=None):
        """
        1. node_id@unknown is disabled if version_spec is @unknown
        2. node_id@nightly is disabled if version_spec is @nightly
        4. node_id@<specified_version> is disabled if version_spec is not None
        5. not exists (active node_id) if version_spec is None

        remark: latest version_spec is not allowed. Must be resolved before call.
        """
        if version_spec == "unknown":
            return node_id in self.unknown_inactive_nodes
        elif version_spec == "nightly":
            return node_id in self.nightly_inactive_nodes
        elif version_spec == "cnr":
            res = self.cnr_inactive_nodes.get(node_id, None)
            if res is None:
                return False

            res = [x for x in res.keys() if x != 'nightly']
            return len(res) > 0
        elif version_spec is not None:
            return version_spec in self.cnr_inactive_nodes.get(node_id, [])

        if node_id in self.nightly_inactive_nodes:
            return True
        elif node_id in self.unknown_inactive_nodes:
            return True

        target = self.cnr_inactive_nodes.get(node_id, None)
        if target is not None and target == version_spec:
            return True

        return False

    def is_registered_in_cnr(self, node_id):
        return node_id in self.cnr_map

    def get_cnr_active_version(self, node_id):
        res = self.active_nodes.get(node_id)
        if res:
            return res[0]
        else:
            return None

    def is_unknown_active(self, node_id):
        return node_id in self.unknown_active_nodes

    def add_to_cnr_inactive_nodes(self, node_id, ver, fullpath):
        ver_map = self.cnr_inactive_nodes.get(node_id)
        if ver_map is None:
            ver_map = {}
            self.cnr_inactive_nodes[node_id] = ver_map

        ver_map[ver] = fullpath

    def get_from_cnr_active_nodes(self, node_id):
        ver_path = self.active_nodes.get(node_id)
        if ver_path is None:
            return None

        return ver_path[0]

    def get_from_cnr_inactive_nodes(self, node_id, ver=None):
        ver_map = self.cnr_inactive_nodes.get(node_id)
        if ver_map is None:
            return None

        if ver is not None:
            return ver_map.get(ver)

        latest = None
        for k, v in ver_map.items():
            if latest is None:
                latest = self.safe_version(k), v
                continue

            cur_ver = self.safe_version(k)
            if cur_ver > latest[0]:
                latest = cur_ver, v

        return latest

    async def reload(self, cache_mode):
        self.custom_node_map_cache = {}
        self.cnr_inactive_nodes = {}      # node_id -> node_version -> fullpath
        self.nightly_inactive_nodes = {}  # node_id -> fullpath
        self.unknown_inactive_nodes = {}  # node_id -> repo url * fullpath
        self.unknown_active_nodes = {}    # node_id -> repo url * fullpath
        self.active_nodes = {}            # node_id -> node_version * fullpath

        # reload 'cnr_map' and 'repo_cnr_map'
        cnrs = await cnr_utils.get_cnr_data(cache_mode=cache_mode)

        for x in cnrs:
            self.cnr_map[x['id']] = x

            if 'repository' in x:
                self.repo_cnr_map[x['repository']] = x

        # reload node status info from custom_nodes/*
        for x in os.listdir(custom_nodes_path):
            fullpath = os.path.join(custom_nodes_path, x)
            if os.path.isdir(fullpath):
                if x not in ['__pycache__', '.disabled']:
                    self.update_cache_at_path(fullpath, is_disabled=False)

        # reload node status info from custom_nodes/.disabled/*
        disabled_dir = os.path.join(custom_nodes_path, '.disabled')
        if os.path.exists(disabled_dir):
            for x in os.listdir(disabled_dir):
                fullpath = os.path.join(disabled_dir, x)
                if os.path.isdir(fullpath):
                    self.update_cache_at_path(fullpath, is_disabled=True)

    @staticmethod
    async def load_nightly(channel, mode):
        res = {}

        channel_url = normalize_channel(channel)
        if channel:
            if mode not in ['remote', 'local', 'cache']:
                print(f"[bold red]ERROR: Invalid mode is specified `--mode {mode}`[/bold red]", file=sys.stderr)
                return {}

        json_obj = await get_data_by_mode(mode, 'custom-node-list.json', channel_url=channel_url)
        for x in json_obj['custom_nodes']:
            for y in x['files']:
                if 'github.com' in y and not (y.endswith('.py') or y.endswith('.js')):
                    repo_name = y.split('/')[-1]
                    res[repo_name] = (x, False)

            if 'id' in x:
                if x['id'] not in res:
                    res[x['id']] = (x, True)

        return res

    async def get_custom_nodes(self, channel, mode):
        channel = normalize_channel(channel)

        cache = self.custom_node_map_cache.get((channel, mode))

        if cache is not None:
            return cache

        nodes = await self.load_nightly(channel, mode)

        res = {}
        added_cnr = set()
        for v in nodes.values():
            v = v[0]
            if len(v['files']) == 1:
                cnr = self.repo_cnr_map.get(v['files'][0])
                if cnr:
                    if 'latest_version' not in cnr:
                        v['cnr_latest'] = '0.0.0'
                    else:
                        v['cnr_latest'] = cnr['latest_version']['version']
                    v['id'] = cnr['id']
                    v['author'] = cnr['publisher']['name']
                    v['title'] = cnr['name']
                    v['description'] = cnr['description']
                    v['health'] = '-'
                    added_cnr.add(cnr['id'])
                    node_id = v['id']
                else:
                    node_id = v['files'][0].split('/')[-1]
                res[node_id] = v
            elif len(v['files']) > 1:
                res[v['files'][0]] = v  # A custom node composed of multiple url is treated as a single repository with one representative path

        self.custom_node_map_cache[(channel, mode)] = res
        return res

    @staticmethod
    def safe_version(ver_str):
        try:
            return version.parse(ver_str)
        except:
            return version.parse("0.0.0")

    def execute_install_script(self, url, repo_path, lazy_mode=False, instant_execution=False):
        install_script_path = os.path.join(repo_path, "install.py")
        requirements_path = os.path.join(repo_path, "requirements.txt")

        if lazy_mode:
            install_cmd = ["#LAZY-INSTALL-SCRIPT", sys.executable]
            return try_install_script(url, repo_path, install_cmd)
        else:
            if os.path.exists(requirements_path):
                print("Install: pip packages")
                with open(requirements_path, "r") as requirements_file:
                    for line in requirements_file:
                        package_name = remap_pip_package(line.strip())
                        if package_name and not package_name.startswith('#') and package_name not in self.processed_install:
                            self.processed_install.add(package_name)
                            install_cmd = [sys.executable, "-m", "pip", "install", package_name]
                            if package_name.strip() != "" and not package_name.startswith('#'):
                                return try_install_script(url, repo_path, install_cmd, instant_execution=instant_execution)

            if os.path.exists(install_script_path) and install_script_path not in self.processed_install:
                self.processed_install.add(install_script_path)
                print(f"Install: install script")
                install_cmd = [sys.executable, "install.py"]
                return try_install_script(url, repo_path, install_cmd, instant_execution=instant_execution)

        return True

    def unified_fix(self, node_id, version_spec, instant_execution=False):
        """
        fix dependencies
        """

        result = ManagedResult('fix')

        info = self.active_nodes.get(node_id)
        if info is None or not os.path.exists(info[1]):
            return result.fail(f'not found: {node_id}@{version_spec}')

        self.execute_install_script(node_id, info[1], instant_execution=instant_execution)

        return result

    def cnr_switch_version(self, node_id, version_spec=None, instant_execution=False, return_postinstall=False):
        """
        switch between cnr version
        """

        # 1. download
        result = ManagedResult('switch-cnr')

        node_info = cnr_utils.install_node(node_id, version_spec)
        if node_info is None or not node_info.download_url:
            return result.fail(f'not available node: {node_id}@{version_spec}')

        version_spec = node_info.version

        if self.active_nodes[node_id][0] == version_spec:
            return ManagedResult('skip').with_msg("Up to date")

        archive_name = f"CNR_temp_{str(uuid.uuid4())}.zip"  # should be unpredictable name - security precaution
        download_path = os.path.join(custom_nodes_path, archive_name)
        download_url(node_info.download_url, custom_nodes_path, archive_name)

        # 2. extract files into <node_id>@<cur_ver>
        install_path = self.active_nodes[node_id][1]
        extracted = cnr_utils.extract_package_as_zip(download_path, install_path)
        os.remove(download_path)

        if extracted is None:
            shutil.rmtree(install_path)
            return result.fail(f'Empty archive file: {node_id}@{version_spec}')

        # 3. calculate garbage files (.tracking - extracted)
        tracking_info_file = os.path.join(install_path, '.tracking')
        prev_files = set()
        with open(tracking_info_file, 'r') as f:
            for line in f:
                prev_files.add(line.strip())
        garbage = prev_files.difference(extracted)
        garbage = [os.path.join(custom_nodes_path, x) for x in garbage]

        # 4-1. remove garbage files
        for x in garbage:
            if os.path.isfile(x):
                os.remove(x)

        # 4-2. remove garbage dir if empty
        for x in garbage:
            if os.path.isdir(x):
                if not os.listdir(x):
                    os.rmdir(x)

        # 5. rename dir name <node_id>@<prev_ver> ==> <node_id>@<cur_ver>
        new_install_path = os.path.join(custom_nodes_path, f"{node_id}@{version_spec.replace('.', '_')}")
        print(f"'{install_path}' is moved to '{new_install_path}'")
        shutil.move(install_path, new_install_path)

        # 6. create .tracking file
        tracking_info_file = os.path.join(new_install_path, '.tracking')
        with open(tracking_info_file, "w", encoding='utf-8') as file:
            file.write('\n'.join(list(extracted)))

        # 7. post install
        result.target = version_spec

        def postinstall():
            res = self.execute_install_script(f"{node_id}@{version_spec}", new_install_path, instant_execution=instant_execution)
            return res

        if return_postinstall:
            return result.with_postinstall(postinstall)
        else:
            if not postinstall():
                return result.fail(f"Failed to execute install script: {node_id}@{version_spec}")

        return result

    def unified_enable(self, node_id, version_spec=None):
        """
        priority if version_spec == None
        1. CNR latest in disk
        2. nightly
        3. unknown

        remark: latest version_spec is not allowed. Must be resolved before call.
        """

        result = ManagedResult('enable')

        if version_spec is None:
            version_spec = self.resolve_unspecified_version(node_id, guess_mode='inactive')
            if version is None:
                return result.fail(f'Specified inactive node not exists: {node_id}')

        if self.is_enabled(node_id, version_spec):
            return ManagedResult('skip').with_msg('Already enabled')

        if not self.is_disabled(node_id, version_spec):
            return ManagedResult('skip').with_msg('Not installed')

        from_path = None
        to_path = None

        if version_spec == 'unknown':
            repo_and_path = self.unknown_inactive_nodes.get(node_id)
            if repo_and_path is None:
                return result.fail(f'Specified inactive node not exists: {node_id}@unknown')
            from_path = repo_and_path[1]
            to_path = os.path.join(custom_nodes_path, f"{node_id}@unknown")
        elif version_spec == 'nightly':
            self.unified_disable(node_id, False)
            from_path = self.nightly_inactive_nodes.get(node_id)
            if from_path is None:
                return result.fail(f'Specified inactive node not exists: {node_id}@nightly')
            to_path = os.path.join(custom_nodes_path, f"{node_id}@nightly")
        elif version_spec is not None:
            self.unified_disable(node_id, False)
            cnr_info = self.cnr_inactive_nodes.get(node_id)

            if cnr_info is None or len(cnr_info) == 0:
                return result.fail(f'Specified inactive cnr node not exists: {node_id}')

            if version_spec == "cnr":
                version_spec = next(iter(cnr_info))

            if version_spec not in cnr_info:
                return result.fail(f'Specified inactive node not exists: {node_id}@{version_spec}')

            from_path = cnr_info[version_spec]
            to_path = os.path.join(custom_nodes_path, f"{node_id}@{version_spec.replace('.', '_')}")

        if from_path is None or not os.path.exists(from_path):
            return result.fail(f'Specified inactive node path not exists: {from_path}')

        # move from disk
        shutil.move(from_path, to_path)

        # update cache
        if version_spec == 'unknown':
            del self.unknown_inactive_nodes[node_id]
            self.unknown_active_nodes[node_id] = to_path
            return result.with_target(to_path)
        elif version_spec == 'nightly':
            del self.nightly_inactive_nodes[node_id]
        else:
            del self.cnr_inactive_nodes[node_id][version_spec]

        self.active_nodes[node_id] = version_spec, to_path
        return result.with_target(to_path)

    def unified_disable(self, node_id, is_unknown):
        result = ManagedResult('disable')

        if is_unknown:
            version_spec = 'unknown'
        else:
            version_spec = None

        if not self.is_enabled(node_id, version_spec):
            if not self.is_disabled(node_id, version_spec):
                return ManagedResult('skip').with_msg('Not installed')
            else:
                return ManagedResult('skip').with_msg('Already disabled')

        if is_unknown:
            repo_and_path = self.unknown_active_nodes.get(node_id)
            to_path = os.path.join(custom_nodes_path, '.disabled', f"{node_id}@unknown")

            if repo_and_path is None or not os.path.exists(repo_and_path[1]):
                return result.fail(f'Specified active node not exists: {node_id}@unknown')

            shutil.move(repo_and_path[1], to_path)
            result.append((repo_and_path[1], to_path))

            self.unknown_inactive_nodes[node_id] = repo_and_path[0], to_path
            del self.unknown_active_nodes[node_id]

            return result

        ver_and_path = self.active_nodes.get(node_id)

        if ver_and_path is None or not os.path.exists(ver_and_path[1]):
            return result.fail(f'Specified active node not exists: {node_id}')

        to_path = os.path.join(custom_nodes_path, '.disabled', f"{node_id}@{ver_and_path[0].replace('.', '_')}")
        shutil.move(ver_and_path[1], to_path)
        result.append((ver_and_path[1], to_path))

        if ver_and_path[0] == 'nightly':
            self.nightly_inactive_nodes[node_id] = to_path
        else:
            self.add_to_cnr_inactive_nodes(node_id, ver_and_path[0], to_path)

        del self.active_nodes[node_id]

        return result

    def unified_uninstall(self, node_id, is_unknown):
        """
        Remove whole installed custom nodes including inactive nodes
        """
        result = ManagedResult('uninstall')

        if is_unknown:
            # remove from actives
            repo_and_path = self.unknown_active_nodes.get(node_id)

            is_removed = False

            if repo_and_path is not None and os.path.exists(repo_and_path[1]):
                rmtree(repo_and_path[1])
                result.append(repo_and_path[1])
                del self.unknown_active_nodes[node_id]

                is_removed = True

            # remove from inactives
            repo_and_path = self.unknown_inactive_nodes.get(node_id)

            if repo_and_path is not None and os.path.exists(repo_and_path[1]):
                rmtree(repo_and_path[1])
                result.append(repo_and_path[1])
                del self.unknown_inactive_nodes[node_id]

                is_removed = True

            if is_removed:
                return result
            else:
                return ManagedResult('skip')

        # remove from actives
        ver_and_path = self.active_nodes.get(node_id)

        if ver_and_path is not None and os.path.exists(ver_and_path[1]):
            shutil.rmtree(ver_and_path[1])
            result.items.append(ver_and_path)
            del self.active_nodes[node_id]

        # remove from nightly inactives
        fullpath = self.nightly_inactive_nodes.get(node_id)
        if fullpath is not None and os.path.exists(fullpath):
            shutil.rmtree(fullpath)
            result.items.append(('nightly', fullpath))
            del self.nightly_inactive_nodes[node_id]

        # remove from cnr inactives
        ver_map = self.cnr_inactive_nodes.get(node_id)
        if ver_map is not None:
            for key, fullpath in ver_map.items():
                shutil.rmtree(fullpath)
                result.items.append((key, fullpath))
            del self.cnr_inactive_nodes[node_id]

        if len(result.items) == 0:
            return ManagedResult('skip').with_msg('Not installed')

        return result

    def cnr_install(self, node_id, version_spec=None, instant_execution=False, return_postinstall=False):
        result = ManagedResult('install-cnr')

        node_info = cnr_utils.install_node(node_id, version_spec)
        if node_info is None or not node_info.download_url:
            return result.fail(f'not available node: {node_id}@{version_spec}')

        archive_name = f"CNR_temp_{str(uuid.uuid4())}.zip"  # should be unpredictable name - security precaution
        download_path = os.path.join(custom_nodes_path, archive_name)

        # re-download. I cannot trust existing file.
        if os.path.exists(download_path):
            os.remove(download_path)

        # install_path
        install_path = os.path.join(custom_nodes_path, f"{node_id}@{version_spec.replace('.', '_')}")
        if os.path.exists(install_path):
            return result.fail(f'Install path already exists: {install_path}')

        download_url(node_info.download_url, custom_nodes_path, archive_name)
        os.makedirs(install_path, exist_ok=True)
        extracted = cnr_utils.extract_package_as_zip(download_path, install_path)
        os.remove(download_path)
        result.to_path = install_path

        if extracted is None:
            shutil.rmtree(install_path)
            return result.fail(f'Empty archive file: {node_id}@{version_spec}')

        # create .tracking file
        tracking_info_file = os.path.join(install_path, '.tracking')
        with open(tracking_info_file, "w", encoding='utf-8') as file:
            file.write('\n'.join(extracted))

        result.target = version_spec

        def postinstall():
            return self.execute_install_script(node_id, install_path, instant_execution=instant_execution)

        if return_postinstall:
            return result.with_postinstall(postinstall)
        else:
            if not postinstall():
                return result.fail(f"Failed to execute install script: {node_id}@{version_spec}")

        return result

    def repo_install(self, url, repo_path, instant_execution=False, return_postinstall=False):
        result = ManagedResult('install-git')
        result.append(url)

        if not is_valid_url(url):
            return result.fail(f"Invalid git url: {url}")

        if url.endswith("/"):
            url = url[:-1]
        try:
            print(f"Download: git clone '{url}'")

            # Clone the repository from the remote URL
            if not instant_execution and platform.system() == 'Windows':
                res = manager_funcs.run_script([sys.executable, git_script_path, "--clone", custom_nodes_path, url, repo_path], cwd=custom_nodes_path)
                if res != 0:
                    return result.fail(f"Failed to clone repo: {url}")
            else:
                repo = git.Repo.clone_from(url, repo_path, recursive=True, progress=GitProgress())
                repo.git.clear_cache()
                repo.close()

            def postinstall():
                return self.execute_install_script(url, repo_path, instant_execution=instant_execution)

            if return_postinstall:
                return result.with_postinstall(postinstall)
            else:
                if not postinstall():
                    return result.fail(f"Failed to execute install script: {url}")

        except Exception as e:
            return result.fail(f"Install(git-clone) error: {url} / {e}")

        print("Installation was successful.")
        return result

    def repo_update(self, repo_path, instant_execution=False, return_postinstall=False):
        result = ManagedResult('update-git')

        if not os.path.exists(os.path.join(repo_path, '.git')):
            return result.fail(f'Path not found: {repo_path}')

        # version check
        repo = git.Repo(repo_path)

        if repo.head.is_detached:
            switch_to_default_branch(repo)

        current_branch = repo.active_branch
        branch_name = current_branch.name

        if current_branch.tracking_branch() is None:
            print(f"[ComfyUI-Manager] There is no tracking branch ({current_branch})")
            remote_name = 'origin'
        else:
            remote_name = current_branch.tracking_branch().remote_name
        remote = repo.remote(name=remote_name)

        try:
            remote.fetch()
        except Exception as e:
            if 'detected dubious' in str(e):
                print(f"[ComfyUI-Manager] Try fixing 'dubious repository' error on 'ComfyUI' repository")
                safedir_path = comfy_path.replace('\\', '/')
                subprocess.run(['git', 'config', '--global', '--add', 'safe.directory', safedir_path])
                try:
                    remote.fetch()
                except Exception:
                    print(f"\n[ComfyUI-Manager] Failed to fixing repository setup. Please execute this command on cmd: \n"
                          f"-----------------------------------------------------------------------------------------\n"
                          f'git config --global --add safe.directory "{safedir_path}"\n'
                          f"-----------------------------------------------------------------------------------------\n")

        commit_hash = repo.head.commit.hexsha
        remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

        if commit_hash != remote_commit_hash:
            git_pull(repo_path)

            if len(repo.remotes) > 0:
                url = repo.remotes[0].url
            else:
                url = "unknown repo"

            def postinstall():
                return self.execute_install_script(url, repo_path, instant_execution=instant_execution)

            if return_postinstall:
                return result.with_postinstall(postinstall)
            else:
                if not postinstall():
                    return result.fail(f"Failed to execute install script: {url}")

            return result
        else:
            return ManagedResult('skip').with_msg('Up to date')

    def unified_update(self, node_id, version_spec=None, instant_execution=False, return_postinstall=False):
        if version_spec is None:
            version_spec = self.resolve_unspecified_version(node_id, guess_mode='active')

        if version_spec is None:
            return ManagedResult('update').fail(f'Update not available: {node_id}@{version_spec}')

        if version_spec == 'nightly':
            return self.repo_update(self.active_nodes[node_id][1], instant_execution=instant_execution, return_postinstall=return_postinstall).with_target('nightly')
        elif version_spec == 'unknown':
            return self.repo_update(self.unknown_active_nodes[node_id][1], instant_execution=instant_execution, return_postinstall=return_postinstall).with_target('unknown')
        else:
            return self.cnr_switch_version(node_id, instant_execution=instant_execution, return_postinstall=return_postinstall)

    async def install_by_id(self, node_id, version_spec=None, channel=None, mode=None, instant_execution=False, return_postinstall=False):
        """
        priority if version_spec == None
        1. CNR latest
        2. unknown

        remark: latest version_spec is not allowed. Must be resolved before call.
        """

        repo_url = None
        if version_spec is None:
            if self.is_enabled(node_id):
                return ManagedResult('skip')
            elif self.is_disabled(node_id):
                return self.unified_enable(node_id)
            else:
                version_spec = self.resolve_unspecified_version(node_id)

        if version_spec == 'unknown' or version_spec == 'nightly':
            custom_nodes = await self.get_custom_nodes(channel, mode)
            the_node = custom_nodes.get(node_id)
            if the_node is not None:
                repo_url = the_node['files'][0]
            else:
                result = ManagedResult('install')
                return result.fail(f"Node '{node_id}@{version_spec}' not found in [{channel}, {mode}]")

        if self.is_enabled(node_id, version_spec):
            return ManagedResult('skip').with_target(f"{node_id}@{version_spec}")

        elif self.is_disabled(node_id, version_spec):
            return self.unified_enable(node_id, version_spec)

        elif version_spec == 'unknown' or version_spec == 'nightly':
            if version_spec == 'nightly':
                # disable cnr nodes
                if self.is_enabled(node_id, 'cnr'):
                    self.unified_disable(node_id, False)

            to_path = os.path.abspath(os.path.join(custom_nodes_path, f"{node_id}@{version_spec.replace('.', '_')}"))
            res = self.repo_install(repo_url, to_path, instant_execution=instant_execution, return_postinstall=return_postinstall)
            if res.result:
                if version_spec == 'unknown':
                    self.unknown_active_nodes[node_id] = to_path
                elif version_spec == 'nightly':
                    self.active_nodes[node_id] = 'nightly', to_path

            return res.with_target(version_spec)

        if self.is_enabled(node_id, 'nightly'):
            # disable nightly nodes
            self.unified_disable(node_id, 'nightly')  # NOTE: don't return from here

        if self.is_disabled(node_id, version_spec):
            # enable and return if specified version is disabled
            return self.unified_enable(node_id, version_spec)

        if self.is_disabled(node_id, "cnr"):
            # enable and switch version if cnr is disabled (not specified version)
            self.unified_enable(node_id, "cnr")
            return self.cnr_switch_version(node_id, version_spec, return_postinstall=return_postinstall)

        if self.is_enabled(node_id, "cnr"):
            return self.cnr_switch_version(node_id, version_spec, return_postinstall=return_postinstall)

        res = self.cnr_install(node_id, version_spec, instant_execution=instant_execution, return_postinstall=return_postinstall)
        if res.result:
            self.active_nodes[node_id] = version_spec, res.to_path

        return res

    async def migrate_unmanaged_nodes(self):
        """
        fix path for nightly and unknown nodes of unmanaged nodes
        """
        await self.reload('cache')
        await self.get_custom_nodes('default', 'cache')

        print(f"Migration: STAGE 1")
        # migrate nightly inactive
        fixes = {}
        for x, v in self.nightly_inactive_nodes.items():
            if v.endswith('@nightly'):
                continue

            new_path = os.path.join(custom_nodes_path, '.disabled', f"{x}@nightly")
            shutil.move(v, new_path)
            fixes[x] = new_path

        self.nightly_inactive_nodes.update(fixes)

        print(f"Migration: STAGE 2")
        # migrate unknown inactive
        fixes = {}
        for x, v in self.unknown_inactive_nodes.items():
            if v[1].endswith('@unknown'):
                continue

            new_path = os.path.join(custom_nodes_path, '.disabled', f"{x}@unknown")
            shutil.move(v[1], new_path)
            fixes[x] = v[0], new_path

        self.unknown_inactive_nodes.update(fixes)

        print(f"Migration: STAGE 3")
        # migrate unknown active nodes
        fixes = {}
        for x, v in self.unknown_active_nodes.items():
            if v[1].endswith('@unknown'):
                continue

            new_path = os.path.join(custom_nodes_path, f"{x}@unknown")
            shutil.move(v[1], new_path)
            fixes[x] = v[0], new_path

        self.unknown_active_nodes.update(fixes)

        print(f"Migration: STAGE 4")
        # migrate active nodes
        fixes = {}
        for x, v in self.active_nodes.items():
            if v[0] not in ['nightly']:
                continue

            if v[1].endswith('@nightly'):
                continue

            new_path = os.path.join(custom_nodes_path, f"{x}@nightly")
            shutil.move(v[1], new_path)
            fixes[x] = v[0], new_path

        self.active_nodes.update(fixes)

        print(f"DONE")


unified_manager = UnifiedManager()


def get_channel_dict():
    global channel_dict

    if channel_dict is None:
        channel_dict = {}

        if not os.path.exists(channel_list_path):
            shutil.copy(channel_list_path+'.template', channel_list_path)

        with open(os.path.join(comfyui_manager_path, 'channels.list'), 'r') as file:
            channels = file.read()
            for x in channels.split('\n'):
                channel_info = x.split("::")
                if len(channel_info) == 2:
                    channel_dict[channel_info[0]] = channel_info[1]

    return channel_dict


def get_channel_list():
    global channel_list

    if channel_list is None:
        channel_list = []
        for k, v in get_channel_dict().items():
            channel_list.append(f"{k}::{v}")

    return channel_list


class ManagerFuncs:
    def __init__(self):
        pass

    def get_current_preview_method(self):
        return "none"

    def run_script(self, cmd, cwd='.'):
        if len(cmd) > 0 and cmd[0].startswith("#"):
            print(f"[ComfyUI-Manager] Unexpected behavior: `{cmd}`")
            return 0

        new_env = os.environ.copy()
        new_env["COMFYUI_PATH"] = comfy_path
        subprocess.check_call(cmd, cwd=cwd, env=new_env)

        return 0


manager_funcs = ManagerFuncs()


def write_config():
    config = configparser.ConfigParser()
    config['default'] = {
        'preview_method': manager_funcs.get_current_preview_method(),
        'badge_mode': get_config()['badge_mode'],
        'git_exe':  get_config()['git_exe'],
        'channel_url': get_config()['channel_url'],
        'share_option': get_config()['share_option'],
        'bypass_ssl': get_config()['bypass_ssl'],
        "file_logging": get_config()['file_logging'],
        'default_ui': get_config()['default_ui'],
        'component_policy': get_config()['component_policy'],
        'double_click_policy': get_config()['double_click_policy'],
        'windows_selector_event_loop_policy': get_config()['windows_selector_event_loop_policy'],
        'model_download_by_agent': get_config()['model_download_by_agent'],
        'downgrade_blacklist': get_config()['downgrade_blacklist'],
        'security_level': get_config()['security_level'],
    }
    with open(config_path, 'w') as configfile:
        config.write(configfile)


def read_config():
    try:
        config = configparser.ConfigParser()
        config.read(config_path)
        default_conf = config['default']

        # policy migration: disable_unsecure_features -> security_level
        if 'disable_unsecure_features' in default_conf:
            if default_conf['disable_unsecure_features'].lower() == 'true':
                security_level = 'strong'
            else:
                security_level = 'normal'
        else:
            security_level = default_conf['security_level'] if 'security_level' in default_conf else 'normal'

        return {
                    'preview_method': default_conf['preview_method'] if 'preview_method' in default_conf else manager_funcs.get_current_preview_method(),
                    'badge_mode': default_conf['badge_mode'] if 'badge_mode' in default_conf else 'none',
                    'git_exe': default_conf['git_exe'] if 'git_exe' in default_conf else '',
                    'channel_url': default_conf['channel_url'] if 'channel_url' in default_conf else 'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main',
                    'share_option': default_conf['share_option'] if 'share_option' in default_conf else 'all',
                    'bypass_ssl': default_conf['bypass_ssl'].lower() == 'true' if 'bypass_ssl' in default_conf else False,
                    'file_logging': default_conf['file_logging'].lower() == 'true' if 'file_logging' in default_conf else True,
                    'default_ui': default_conf['default_ui'] if 'default_ui' in default_conf else 'none',
                    'component_policy': default_conf['component_policy'] if 'component_policy' in default_conf else 'workflow',
                    'double_click_policy': default_conf['double_click_policy'] if 'double_click_policy' in default_conf else 'copy-all',
                    'windows_selector_event_loop_policy': default_conf['windows_selector_event_loop_policy'].lower() == 'true' if 'windows_selector_event_loop_policy' in default_conf else False,
                    'model_download_by_agent': default_conf['model_download_by_agent'].lower() == 'true' if 'model_download_by_agent' in default_conf else False,
                    'downgrade_blacklist': default_conf['downgrade_blacklist'] if 'downgrade_blacklist' in default_conf else '',
                    'security_level': security_level
               }

    except Exception:
        return {
            'preview_method': manager_funcs.get_current_preview_method(),
            'badge_mode': 'none',
            'git_exe': '',
            'channel_url': 'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main',
            'share_option': 'all',
            'bypass_ssl': False,
            'file_logging': True,
            'default_ui': 'none',
            'component_policy': 'workflow',
            'double_click_policy': 'copy-all',
            'windows_selector_event_loop_policy': False,
            'model_download_by_agent': False,
            'downgrade_blacklist': '',
            'security_level': 'normal',
        }


def get_config():
    global cached_config

    if cached_config is None:
        cached_config = read_config()

    return cached_config


def switch_to_default_branch(repo):
    default_branch = repo.git.symbolic_ref('refs/remotes/origin/HEAD').replace('refs/remotes/origin/', '')
    repo.git.checkout(default_branch)


def try_install_script(url, repo_path, install_cmd, instant_execution=False):
    if not instant_execution and ((len(install_cmd) > 0 and install_cmd[0].startswith('#')) or (platform.system() == "Windows" and comfy_ui_commit_datetime.date() >= comfy_ui_required_commit_datetime.date())):
        if not os.path.exists(startup_script_path):
            os.makedirs(startup_script_path)

        script_path = os.path.join(startup_script_path, "install-scripts.txt")
        with open(script_path, "a") as file:
            obj = [repo_path] + install_cmd
            file.write(f"{obj}\n")

        return True
    else:
        if len(install_cmd) == 5 and install_cmd[2:4] == ['pip', 'install']:
            if is_blacklisted(install_cmd[4]):
                print(f"[ComfyUI-Manager] skip black listed pip installation: '{install_cmd[4]}'")
                return True

        print(f"\n## ComfyUI-Manager: EXECUTE => {install_cmd}")
        code = manager_funcs.run_script(install_cmd, cwd=repo_path)

        if platform.system() != "Windows":
            try:
                if comfy_ui_commit_datetime.date() < comfy_ui_required_commit_datetime.date():
                    print("\n\n###################################################################")
                    print(f"[WARN] ComfyUI-Manager: Your ComfyUI version ({comfy_ui_revision})[{comfy_ui_commit_datetime.date()}] is too old. Please update to the latest version.")
                    print(f"[WARN] The extension installation feature may not work properly in the current installed ComfyUI version on Windows environment.")
                    print("###################################################################\n\n")
            except:
                pass

        if code != 0:
            if url is None:
                url = os.path.dirname(repo_path)
            print(f"install script failed: {url}")
            return False

        return True


# use subprocess to avoid file system lock by git (Windows)
def __win_check_git_update(path, do_fetch=False, do_update=False):
    if do_fetch:
        command = [sys.executable, git_script_path, "--fetch", path]
    elif do_update:
        command = [sys.executable, git_script_path, "--pull", path]
    else:
        command = [sys.executable, git_script_path, "--check", path]

    new_env = os.environ.copy()
    new_env["COMFYUI_PATH"] = comfy_path
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=custom_nodes_path)
    output, _ = process.communicate()
    output = output.decode('utf-8').strip()

    if 'detected dubious' in output:
        # fix and try again
        safedir_path = path.replace('\\', '/')
        try:
            print(f"[ComfyUI-Manager] Try fixing 'dubious repository' error on '{safedir_path}' repo")
            process = subprocess.Popen(['git', 'config', '--global', '--add', 'safe.directory', safedir_path], env=new_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            output, _ = process.communicate()

            process = subprocess.Popen(command, env=new_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            output, _ = process.communicate()
            output = output.decode('utf-8').strip()
        except Exception:
            print(f'[ComfyUI-Manager] failed to fixing')

        if 'detected dubious' in output:
            print(f'\n[ComfyUI-Manager] Failed to fixing repository setup. Please execute this command on cmd: \n'
                  f'-----------------------------------------------------------------------------------------\n'
                  f'git config --global --add safe.directory "{safedir_path}"\n'
                  f'-----------------------------------------------------------------------------------------\n')

    if do_update:
        if "CUSTOM NODE PULL: Success" in output:
            process.wait()
            print(f"\rUpdated: {path}")
            return True, True    # updated
        elif "CUSTOM NODE PULL: None" in output:
            process.wait()
            return False, True   # there is no update
        else:
            print(f"\rUpdate error: {path}")
            process.wait()
            return False, False  # update failed
    else:
        if "CUSTOM NODE CHECK: True" in output:
            process.wait()
            return True, True
        elif "CUSTOM NODE CHECK: False" in output:
            process.wait()
            return False, True
        else:
            print(f"\rFetch error: {path}")
            print(f"\n{output}\n")
            process.wait()
            return False, True


def __win_check_git_pull(path):
    new_env = os.environ.copy()
    new_env["COMFYUI_PATH"] = comfy_path
    command = [sys.executable, git_script_path, "--pull", path]
    process = subprocess.Popen(command, env=new_env, cwd=custom_nodes_path)
    process.wait()


def execute_install_script(url, repo_path, lazy_mode=False, instant_execution=False):
    install_script_path = os.path.join(repo_path, "install.py")
    requirements_path = os.path.join(repo_path, "requirements.txt")

    if lazy_mode:
        install_cmd = ["#LAZY-INSTALL-SCRIPT",  sys.executable]
        try_install_script(url, repo_path, install_cmd)
    else:
        if os.path.exists(requirements_path):
            print("Install: pip packages")
            with open(requirements_path, "r") as requirements_file:
                for line in requirements_file:
                    package_name = remap_pip_package(line.strip())
                    if package_name and not package_name.startswith('#'):
                        install_cmd = [sys.executable, "-m", "pip", "install", package_name]
                        if package_name.strip() != "" and not package_name.startswith('#'):
                            try_install_script(url, repo_path, install_cmd, instant_execution=instant_execution)

        if os.path.exists(install_script_path):
            print(f"Install: install script")
            install_cmd = [sys.executable, "install.py"]
            try_install_script(url, repo_path, install_cmd, instant_execution=instant_execution)

    return True


def git_repo_update_check_with(path, do_fetch=False, do_update=False):
    """

    perform update check for git custom node
    and fetch or update if flag is on

    :param path: path to git custom node
    :param do_fetch: do fetch during check
    :param do_update: do update during check
    :return: update state * success
    """
    if do_fetch:
        orig_print(f"\x1b[2K\rFetching: {path}", end='')
    elif do_update:
        orig_print(f"\x1b[2K\rUpdating: {path}", end='')

    # Check if the path is a git repository
    if not os.path.exists(os.path.join(path, '.git')):
        raise ValueError(f'Not a git repository: {path}')

    if platform.system() == "Windows":
        updated, success = __win_check_git_update(path, do_fetch, do_update)
        if updated and success:
            execute_install_script(None, path, lazy_mode=True)
        return updated, success
    else:
        # Fetch the latest commits from the remote repository
        repo = git.Repo(path)

        remote_name = 'origin'
        remote = repo.remote(name=remote_name)

        if not do_update and repo.head.is_detached:
            if do_fetch:
                remote.fetch()

            return True, True  # detached branch is treated as updatable

        if repo.head.is_detached:
            switch_to_default_branch(repo)

        current_branch = repo.active_branch
        branch_name = current_branch.name

        # Get the current commit hash
        commit_hash = repo.head.commit.hexsha

        if do_fetch or do_update:
            remote.fetch()

        if do_update:
            if repo.is_dirty():
                repo.git.stash()

            if f'{remote_name}/{branch_name}' not in repo.refs:
                switch_to_default_branch(repo)
                current_branch = repo.active_branch
                branch_name = current_branch.name

            remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

            if commit_hash == remote_commit_hash:
                repo.close()
                return False, True

            try:
                remote.pull()
                repo.git.submodule('update', '--init', '--recursive')
                new_commit_hash = repo.head.commit.hexsha

                if commit_hash != new_commit_hash:
                    execute_install_script(None, path)
                    print(f"\nUpdated: {path}")
                    return True, True
                else:
                    return False, False

            except Exception as e:
                print(f"\nUpdating failed: {path}\n{e}", file=sys.stderr)
                return False, False

        if repo.head.is_detached:
            repo.close()
            return True, True

        # Get commit hash of the remote branch
        current_branch = repo.active_branch
        branch_name = current_branch.name

        if f'{remote_name}/{branch_name}' in repo.refs:
            remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha
        else:
            return True, True  # Assuming there's an update if it's not the default branch.

        # Compare the commit hashes to determine if the local repository is behind the remote repository
        if commit_hash != remote_commit_hash:
            # Get the commit dates
            commit_date = repo.head.commit.committed_datetime
            remote_commit_date = repo.refs[f'{remote_name}/{branch_name}'].object.committed_datetime

            # Compare the commit dates to determine if the local repository is behind the remote repository
            if commit_date < remote_commit_date:
                repo.close()
                return True, True

        repo.close()

    return False, True


class GitProgress(RemoteProgress):
    def __init__(self):
        super().__init__()
        self.pbar = tqdm()

    def update(self, op_code, cur_count, max_count=None, message=''):
        self.pbar.total = max_count
        self.pbar.n = cur_count
        self.pbar.pos = 0
        self.pbar.refresh()


def is_valid_url(url):
    try:
        # Check for HTTP/HTTPS URL format
        result = urlparse(url)
        if all([result.scheme, result.netloc]):
            return True
    finally:
        # Check for SSH git URL format
        pattern = re.compile(r"^(.+@|ssh:\/\/).+:.+$")
        if pattern.match(url):
            return True
    return False


async def gitclone_install(url, instant_execution=False, msg_prefix=''):
    await unified_manager.reload('cache')
    await unified_manager.get_custom_nodes('default', 'cache')

    print(f"{msg_prefix}Install: {url}")

    result = ManagedResult('install-git')

    if not is_valid_url(url):
        return result.fail(f"Invalid git url: '{url}'")

    if url.endswith("/"):
        url = url[:-1]
    try:
        cnr = unified_manager.repo_cnr_map.get(url)
        if cnr:
            cnr_id = cnr['id']
            return await unified_manager.install_by_id(cnr_id, version_spec='nightly')
        else:
            repo_name = os.path.splitext(os.path.basename(url))[0]
            node_dir = f"{repo_name}@unknown"
            repo_path = os.path.join(custom_nodes_path, node_dir)
            disabled_repo_path1 = os.path.join(custom_nodes_path, '.disabled', node_dir)
            disabled_repo_path2 = os.path.join(custom_nodes_path, repo_name+'.disabled')  # old style

            if os.path.exists(repo_path):
                return result.fail(f"Already exists: '{repo_path}'")

            if os.path.exists(disabled_repo_path1):
                return result.fail(f"Already exists (disabled): '{disabled_repo_path1}'")

            if os.path.exists(disabled_repo_path2):
                return result.fail(f"Already exists (disabled): '{disabled_repo_path2}'")

            print(f"CLONE into '{repo_path}'")

            # Clone the repository from the remote URL
            if not instant_execution and platform.system() == 'Windows':
                res = manager_funcs.run_script([sys.executable, git_script_path, "--clone", custom_nodes_path, url, repo_path], cwd=custom_nodes_path)
                if res != 0:
                    return result.fail(f"Failed to clone '{url}' into  '{repo_path}'")
            else:
                repo = git.Repo.clone_from(url, repo_path, recursive=True, progress=GitProgress())
                repo.git.clear_cache()
                repo.close()

            execute_install_script(url, repo_path, instant_execution=instant_execution)
            print("Installation was successful.")
            return result.with_target(repo_path)

    except Exception as e:
        traceback.print_exc()
        print(f"Install(git-clone) error: {url} / {e}", file=sys.stderr)
        return result.fail(f"Install(git-clone) error: {url} / {e}")


def git_pull(path):
    # Check if the path is a git repository
    if not os.path.exists(os.path.join(path, '.git')):
        raise ValueError('Not a git repository')

    # Pull the latest changes from the remote repository
    if platform.system() == "Windows":
        return __win_check_git_pull(path)
    else:
        repo = git.Repo(path)

        if repo.is_dirty():
            repo.git.stash()

        if repo.head.is_detached:
            switch_to_default_branch(repo)

        current_branch = repo.active_branch
        remote_name = current_branch.tracking_branch().remote_name
        remote = repo.remote(name=remote_name)

        remote.pull()
        repo.git.submodule('update', '--init', '--recursive')

        repo.close()

    return True


async def get_data_by_mode(mode, filename, channel_url=None):
    if channel_url in get_channel_dict():
        channel_url = get_channel_dict()[channel_url]

    try:
        if mode == "local":
            uri = os.path.join(comfyui_manager_path, filename)
            json_obj = await get_data(uri)
        else:
            if channel_url is None:
                uri = get_config()['channel_url'] + '/' + filename
            else:
                uri = channel_url + '/' + filename

            cache_uri = str(simple_hash(uri))+'_'+filename
            cache_uri = os.path.join(cache_dir, cache_uri)

            if mode == "cache":
                if is_file_created_within_one_day(cache_uri):
                    json_obj = await get_data(cache_uri)
                else:
                    json_obj = await get_data(uri)
                    with cache_lock:
                        with open(cache_uri, "w", encoding='utf-8') as file:
                            json.dump(json_obj, file, indent=4, sort_keys=True)
            else:
                json_obj = await get_data(uri)
                with cache_lock:
                    with open(cache_uri, "w", encoding='utf-8') as file:
                        json.dump(json_obj, file, indent=4, sort_keys=True)
    except Exception as e:
        print(f"[ComfyUI-Manager] Due to a network error, switching to local mode.\n=> {filename}\n=> {e}")
        uri = os.path.join(comfyui_manager_path, filename)
        json_obj = await get_data(uri)

    return json_obj


def gitclone_fix(files, instant_execution=False):
    print(f"Try fixing: {files}")
    for url in files:
        if not is_valid_url(url):
            print(f"Invalid git url: '{url}'")
            return False

        if url.endswith("/"):
            url = url[:-1]
        try:
            repo_name = os.path.splitext(os.path.basename(url))[0]
            repo_path = os.path.join(custom_nodes_path, repo_name)

            if os.path.exists(repo_path+'.disabled'):
                repo_path = repo_path+'.disabled'

            if not execute_install_script(url, repo_path, instant_execution=instant_execution):
                return False

        except Exception as e:
            print(f"Install(git-clone) error: {url} / {e}", file=sys.stderr)
            return False

    print(f"Attempt to fixing '{files}' is done.")
    return True


def pip_install(packages):
    install_cmd = ['#FORCE', sys.executable, "-m", "pip", "install", '-U'] + packages
    try_install_script('pip install via manager', '..', install_cmd)


def rmtree(path):
    retry_count = 3

    while True:
        try:
            retry_count -= 1

            if platform.system() == "Windows":
                manager_funcs.run_script(['attrib', '-R', path + '\\*', '/S'])
            shutil.rmtree(path)

            return True

        except Exception as ex:
            print(f"ex: {ex}")
            time.sleep(3)

            if retry_count < 0:
                raise ex

            print(f"Uninstall retry({retry_count})")


def gitclone_uninstall(files):
    import os

    print(f"Uninstall: {files}")
    for url in files:
        if url.endswith("/"):
            url = url[:-1]
        try:
            dir_name = os.path.splitext(os.path.basename(url))[0].replace(".git", "")
            dir_path = os.path.join(custom_nodes_path, dir_name)

            # safety check
            if dir_path == '/' or dir_path[1:] == ":/" or dir_path == '':
                print(f"Uninstall(git-clone) error: invalid path '{dir_path}' for '{url}'")
                return False

            install_script_path = os.path.join(dir_path, "uninstall.py")
            disable_script_path = os.path.join(dir_path, "disable.py")
            if os.path.exists(install_script_path):
                uninstall_cmd = [sys.executable, "uninstall.py"]
                code = manager_funcs.run_script(uninstall_cmd, cwd=dir_path)

                if code != 0:
                    print(f"An error occurred during the execution of the uninstall.py script. Only the '{dir_path}' will be deleted.")
            elif os.path.exists(disable_script_path):
                disable_script = [sys.executable, "disable.py"]
                code = manager_funcs.run_script(disable_script, cwd=dir_path)
                if code != 0:
                    print(f"An error occurred during the execution of the disable.py script. Only the '{dir_path}' will be deleted.")

            if os.path.exists(dir_path):
                rmtree(dir_path)
            elif os.path.exists(dir_path + ".disabled"):
                rmtree(dir_path + ".disabled")
        except Exception as e:
            print(f"Uninstall(git-clone) error: {url} / {e}", file=sys.stderr)
            return False

    print("Uninstallation was successful.")
    return True


def gitclone_set_active(files, is_disable):
    import os

    if is_disable:
        action_name = "Disable"
    else:
        action_name = "Enable"

    print(f"{action_name}: {files}")
    for url in files:
        if url.endswith("/"):
            url = url[:-1]
        try:
            dir_name = os.path.splitext(os.path.basename(url))[0].replace(".git", "")
            dir_path = os.path.join(custom_nodes_path, dir_name)

            # safety check
            if dir_path == '/' or dir_path[1:] == ":/" or dir_path == '':
                print(f"{action_name}(git-clone) error: invalid path '{dir_path}' for '{url}'")
                return False

            if is_disable:
                current_path = dir_path
                new_path = dir_path + ".disabled"
            else:
                current_path = dir_path + ".disabled"
                new_path = dir_path

            shutil.move(current_path, new_path)

            if is_disable:
                if os.path.exists(os.path.join(new_path, "disable.py")):
                    disable_script = [sys.executable, "disable.py"]
                    try_install_script(url, new_path, disable_script)
            else:
                if os.path.exists(os.path.join(new_path, "enable.py")):
                    enable_script = [sys.executable, "enable.py"]
                    try_install_script(url, new_path, enable_script)

        except Exception as e:
            print(f"{action_name}(git-clone) error: {url} / {e}", file=sys.stderr)
            return False

    print(f"{action_name} was successful.")
    return True


def gitclone_update(files, instant_execution=False, skip_script=False, msg_prefix=""):
    import os

    print(f"{msg_prefix}Update: {files}")
    for url in files:
        if url.endswith("/"):
            url = url[:-1]
        try:
            repo_name = os.path.splitext(os.path.basename(url))[0].replace(".git", "")
            repo_path = os.path.join(custom_nodes_path, repo_name)

            if os.path.exists(repo_path+'.disabled'):
                repo_path = repo_path+'.disabled'

            git_pull(repo_path)

            if not skip_script:
                if instant_execution:
                    if not execute_install_script(url, repo_path, lazy_mode=False, instant_execution=True):
                        return False
                else:
                    if not execute_install_script(url, repo_path, lazy_mode=True):
                        return False

        except Exception as e:
            print(f"Update(git-clone) error: {url} / {e}", file=sys.stderr)
            return False

    if not skip_script:
        print("Update was successful.")
    return True


def update_path(repo_path, instant_execution=False):
    if not os.path.exists(os.path.join(repo_path, '.git')):
        return "fail"

    # version check
    repo = git.Repo(repo_path)

    if repo.head.is_detached:
        switch_to_default_branch(repo)

    current_branch = repo.active_branch
    branch_name = current_branch.name

    if current_branch.tracking_branch() is None:
        print(f"[ComfyUI-Manager] There is no tracking branch ({current_branch})")
        remote_name = 'origin'
    else:
        remote_name = current_branch.tracking_branch().remote_name
    remote = repo.remote(name=remote_name)

    try:
        remote.fetch()
    except Exception as e:
        if 'detected dubious' in str(e):
            print(f"[ComfyUI-Manager] Try fixing 'dubious repository' error on 'ComfyUI' repository")
            safedir_path = comfy_path.replace('\\', '/')
            subprocess.run(['git', 'config', '--global', '--add', 'safe.directory', safedir_path])
            try:
                remote.fetch()
            except Exception:
                print(f"\n[ComfyUI-Manager] Failed to fixing repository setup. Please execute this command on cmd: \n"
                      f"-----------------------------------------------------------------------------------------\n"
                      f'git config --global --add safe.directory "{safedir_path}"\n'
                      f"-----------------------------------------------------------------------------------------\n")

    commit_hash = repo.head.commit.hexsha
    remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

    if commit_hash != remote_commit_hash:
        git_pull(repo_path)
        execute_install_script("ComfyUI", repo_path, instant_execution=instant_execution)
        return "updated"
    else:
        return "skipped"


def lookup_customnode_by_url(data, target):
    for x in data['custom_nodes']:
        if target in x['files']:
            dir_name = os.path.splitext(os.path.basename(target))[0].replace(".git", "")
            dir_path = os.path.join(custom_nodes_path, dir_name)
            if os.path.exists(dir_path):
                x['installed'] = 'True'
            elif os.path.exists(dir_path + ".disabled"):
                x['installed'] = 'Disabled'
            return x

    return None


def simple_check_custom_node(url):
    dir_name = os.path.splitext(os.path.basename(url))[0].replace(".git", "")
    dir_path = os.path.join(custom_nodes_path, dir_name)
    if os.path.exists(dir_path):
        return 'installed'
    elif os.path.exists(dir_path+'.disabled'):
        return 'disabled'

    return 'not-installed'


def check_state_of_git_node_pack_single(item, do_fetch=False, do_update_check=True, do_update=False):
    if item['version'] == 'unknown':
        dir_path = unified_manager.unknown_active_nodes.get(item['id'])[1]
    elif item['version'] == 'nightly':
        dir_path = unified_manager.active_nodes.get(item['id'])[1]
    else:
        # skip CNR nodes
        dir_path = None

    if dir_path and os.path.exists(dir_path):
        if do_update_check:
            update_state, success = git_repo_update_check_with(dir_path, do_fetch, do_update)
            if (do_update_check or do_update) and update_state:
                item['update-state'] = 'true'
            elif do_update and not success:
                item['update-state'] = 'fail'


def get_installed_pip_packages():
    # extract pip package infos
    pips = subprocess.check_output([sys.executable, '-m', 'pip', 'freeze'], text=True).split('\n')

    res = {}
    for x in pips:
        if x.strip() == "":
            continue

        if ' @ ' in x:
            spec_url = x.split(' @ ')
            res[spec_url[0]] = spec_url[1]
        else:
            res[x] = ""

    return res


def get_current_snapshot():
    # Get ComfyUI hash
    repo_path = comfy_path

    if not os.path.exists(os.path.join(repo_path, '.git')):
        print(f"ComfyUI update fail: The installed ComfyUI does not have a Git repository.")
        return {}

    repo = git.Repo(repo_path)
    comfyui_commit_hash = repo.head.commit.hexsha

    git_custom_nodes = {}
    cnr_custom_nodes = {}
    file_custom_nodes = []

    # Get custom nodes hash
    for path in os.listdir(custom_nodes_path):
        if path in ['.disabled', '__pycache__']:
            continue

        fullpath = os.path.join(custom_nodes_path, path)

        if os.path.isdir(fullpath):
            is_disabled = path.endswith(".disabled")

            try:
                git_dir = os.path.join(fullpath, '.git')

                parsed_spec = path.split('@')

                if len(parsed_spec) == 1:
                    node_id = parsed_spec[0]
                    ver_spec = 'unknown'
                else:
                    node_id, ver_spec = parsed_spec
                    ver_spec = ver_spec.replace('_', '.')

                if len(ver_spec) > 1 and ver_spec not in ['nightly', 'latest', 'unknown']:
                    if is_disabled:
                        continue  # don't restore disabled state of CNR node.

                    cnr_custom_nodes[node_id] = ver_spec

                elif not os.path.exists(git_dir):
                    continue

                else:
                    repo = git.Repo(fullpath)
                    commit_hash = repo.head.commit.hexsha
                    url = repo.remotes.origin.url
                    git_custom_nodes[url] = dict(hash=commit_hash, disabled=is_disabled)
            except:
                print(f"Failed to extract snapshots for the custom node '{path}'.")

        elif path.endswith('.py'):
            is_disabled = path.endswith(".py.disabled")
            filename = os.path.basename(path)
            item = {
                'filename': filename,
                'disabled': is_disabled
            }

            file_custom_nodes.append(item)

    pip_packages = get_installed_pip_packages()

    return {
        'comfyui': comfyui_commit_hash,
        'git_custom_nodes': git_custom_nodes,
        'cnr_custom_nodes': cnr_custom_nodes,
        'file_custom_nodes': file_custom_nodes,
        'pips': pip_packages,
    }


def save_snapshot_with_postfix(postfix, path=None):
    if path is None:
        now = datetime.now()

        date_time_format = now.strftime("%Y-%m-%d_%H-%M-%S")
        file_name = f"{date_time_format}_{postfix}"

        path = os.path.join(comfyui_manager_path, 'snapshots', f"{file_name}.json")
    else:
        file_name = path.replace('\\', '/').split('/')[-1]
        file_name = file_name.split('.')[-2]

    snapshot = get_current_snapshot()
    if path.endswith('.json'):
        with open(path, "w") as json_file:
            json.dump(snapshot, json_file, indent=4)

        return file_name + '.json'

    elif path.endswith('.yaml'):
        with open(path, "w") as yaml_file:
            snapshot = {'custom_nodes': snapshot}
            yaml.dump(snapshot, yaml_file, allow_unicode=True)

        return path


async def extract_nodes_from_workflow(filepath, mode='local', channel_url='default'):
    # prepare json data
    workflow = None
    if filepath.endswith('.json'):
        with open(filepath, "r", encoding="UTF-8", errors="ignore") as json_file:
            try:
                workflow = json.load(json_file)
            except:
                print(f"Invalid workflow file: {filepath}")
                exit(-1)

    elif filepath.endswith('.png'):
        from PIL import Image
        with Image.open(filepath) as img:
            if 'workflow' not in img.info:
                print(f"The specified .png file doesn't have a workflow: {filepath}")
                exit(-1)
            else:
                try:
                    workflow = json.loads(img.info['workflow'])
                except:
                    print(f"This is not a valid .png file containing a ComfyUI workflow: {filepath}")
                    exit(-1)

    if workflow is None:
        print(f"Invalid workflow file: {filepath}")
        exit(-1)

    # extract nodes
    used_nodes = set()

    def extract_nodes(sub_workflow):
        for x in sub_workflow['nodes']:
            node_name = x.get('type')

            # skip virtual nodes
            if node_name in ['Reroute', 'Note']:
                continue

            if node_name is not None and not node_name.startswith('workflow/'):
                used_nodes.add(node_name)

    if 'nodes' in workflow:
        extract_nodes(workflow)

        if 'extra' in workflow:
            if 'groupNodes' in workflow['extra']:
                for x in workflow['extra']['groupNodes'].values():
                    extract_nodes(x)

    # lookup dependent custom nodes
    ext_map = await get_data_by_mode(mode, 'extension-node-map.json', channel_url)

    rext_map = {}
    preemption_map = {}
    patterns = []
    for k, v in ext_map.items():
        if k == 'https://github.com/comfyanonymous/ComfyUI':
            for x in v[0]:
                if x not in preemption_map:
                    preemption_map[x] = []

                preemption_map[x] = k
            continue

        for x in v[0]:
            if x not in rext_map:
                rext_map[x] = []

            rext_map[x].append(k)

        if 'preemptions' in v[1]:
            for x in v[1]['preemptions']:
                if x not in preemption_map:
                    preemption_map[x] = []

                preemption_map[x] = k

        if 'nodename_pattern' in v[1]:
            patterns.append((v[1]['nodename_pattern'], k))

    # identify used extensions
    used_exts = set()
    unknown_nodes = set()

    for node_name in used_nodes:
        ext = preemption_map.get(node_name)

        if ext is None:
            ext = rext_map.get(node_name)
            if ext is not None:
                ext = ext[0]

        if ext is None:
            for pat_ext in patterns:
                if re.search(pat_ext[0], node_name):
                    ext = pat_ext[1]
                    break

        if ext == 'https://github.com/comfyanonymous/ComfyUI':
            pass
        elif ext is not None:
            if 'Fooocus' in ext:
                print(f">> {node_name}")

            used_exts.add(ext)
        else:
            unknown_nodes.add(node_name)

    return used_exts, unknown_nodes


def unzip(model_path):
    if not os.path.exists(model_path):
        print(f"[ComfyUI-Manager] unzip: File not found: {model_path}")
        return False

    base_dir = os.path.dirname(model_path)
    filename = os.path.basename(model_path)
    target_dir = os.path.join(base_dir, filename[:-4])

    os.makedirs(target_dir, exist_ok=True)

    with zipfile.ZipFile(model_path, 'r') as zip_ref:
        zip_ref.extractall(target_dir)

    # Check if there's only one directory inside the target directory
    contents = os.listdir(target_dir)
    if len(contents) == 1 and os.path.isdir(os.path.join(target_dir, contents[0])):
        nested_dir = os.path.join(target_dir, contents[0])
        # Move each file and sub-directory in the nested directory up to the target directory
        for item in os.listdir(nested_dir):
            shutil.move(os.path.join(nested_dir, item), os.path.join(target_dir, item))
        # Remove the now empty nested directory
        os.rmdir(nested_dir)

    os.remove(model_path)
    return True


def map_to_unified_keys(json_obj):
    res = {}
    for k, v in json_obj.items():
        cnr = unified_manager.repo_cnr_map.get(k)
        if cnr:
            res[cnr['id']] = v
        else:
            res[k] = v

    return res


async def get_unified_total_nodes(channel, mode):
    await unified_manager.reload(mode)

    res = await unified_manager.get_custom_nodes(channel, mode)

    # collect pure cnr ids (i.e. not exists in custom-node-list.json)
    # populate state/updatable field to non-pure cnr nodes
    cnr_ids = set(unified_manager.cnr_map.keys())
    for k, v in res.items():
        # resolve cnr_id from repo url
        files_in_json = v.get('files', [])
        cnr_id = None
        if len(files_in_json) == 1:
            cnr = unified_manager.repo_cnr_map.get(files_in_json[0])
            if cnr:
                cnr_id = cnr['id']

        if cnr_id is not None:
            # cnr or nightly version
            cnr_ids.remove(cnr_id)
            updatable = False
            cnr = unified_manager.cnr_map[cnr_id]

            if cnr_id in unified_manager.active_nodes:
                # installed
                v['state'] = 'enabled'
                if unified_manager.active_nodes[cnr_id][0] != 'nightly':
                    updatable = unified_manager.is_updatable(cnr_id)
                else:
                    updatable = False
                v['active_version'] = unified_manager.active_nodes[cnr_id][0]
                v['version'] = v['active_version']

                if cm_global.try_call(api="cm.is_import_failed_extension", name=unified_manager.active_nodes[cnr_id][1]):
                    v['import-fail'] = True

            elif cnr_id in unified_manager.cnr_inactive_nodes:
                # disabled
                v['state'] = 'disabled'
                v['version'] = unified_manager.get_from_cnr_inactive_nodes(cnr_id)[0]
            elif cnr_id in unified_manager.nightly_inactive_nodes:
                # disabled
                v['state'] = 'disabled'
                v['version'] = 'nightly'
            else:
                # not installed
                v['state'] = 'not-installed'

            if 'version' not in v:
                v['version'] = cnr['latest_version']['version']

            v['update-state'] = 'true' if updatable else 'false'
        else:
            # unknown version
            v['version'] = 'unknown'

            if unified_manager.is_enabled(k, 'unknown'):
                v['state'] = 'enabled'
                v['active_version'] = 'unknown'

                if cm_global.try_call(api="cm.is_import_failed_extension", name=unified_manager.unknown_active_nodes[k][1]):
                    v['import-fail'] = True

            elif unified_manager.is_disabled(k, 'unknown'):
                v['state'] = 'disabled'
            else:
                v['state'] = 'not-installed'

    # add items for pure cnr nodes
    for cnr_id in cnr_ids:
        cnr = unified_manager.cnr_map[cnr_id]
        author = cnr['publisher']['name']
        title = cnr['name']
        reference = f"https://registry.comfy.org/nodes/{cnr['id']}"
        install_type = "cnr"
        description = cnr.get('description', '')

        ver = None
        active_version = None
        updatable = False
        import_fail = None
        if cnr_id in unified_manager.active_nodes:
            # installed
            state = 'enabled'
            updatable = unified_manager.is_updatable(cnr_id)
            active_version = unified_manager.active_nodes[cnr['id']][0]
            ver = active_version

            if cm_global.try_call(api="cm.is_import_failed_extension", name=unified_manager.active_nodes[cnr_id][1]):
                import_fail = True

        elif cnr['id'] in unified_manager.cnr_inactive_nodes:
            # disabled
            state = 'disabled'
        elif cnr['id'] in unified_manager.nightly_inactive_nodes:
            # disabled
            state = 'disabled'
            ver = 'nightly'
        else:
            # not installed
            state = 'not-installed'

        if ver is None:
            ver = cnr['latest_version']['version']

        item = dict(author=author, title=title, reference=reference, install_type=install_type,
                    description=description, state=state, updatable=updatable, version=ver)

        if active_version:
            item['active_version'] = active_version

        if import_fail:
            item['import-fail'] = True

        res[cnr_id] = item

    return res


def populate_github_stats(node_packs, json_obj_github):
    for k, v in node_packs.items():
        url = v['reference']
        if url in json_obj_github:
            v['stars'] = json_obj_github[url]['stars']
            v['last_update'] = json_obj_github[url]['last_update']
            v['trust'] = json_obj_github[url]['author_account_age_days'] > 180
        else:
            v['stars'] = -1
            v['last_update'] = -1
            v['trust'] = False


async def restore_snapshot(snapshot_path, git_helper_extras=None):
    cloned_repos = []
    checkout_repos = []
    skipped_repos = []
    enabled_repos = []
    disabled_repos = []
    is_failed = False

    def extract_infos(msg):
        nonlocal is_failed

        for x in msg:
            if x.startswith("CLONE: "):
                cloned_repos.append(x[7:])
            elif x.startswith("CHECKOUT: "):
                checkout_repos.append(x[10:])
            elif x.startswith("SKIPPED: "):
                skipped_repos.append(x[9:])
            elif x.startswith("ENABLE: "):
                enabled_repos.append(x[8:])
            elif x.startswith("DISABLE: "):
                disabled_repos.append(x[9:])
            elif 'APPLY SNAPSHOT: False' in x:
                is_failed = True

    print(f"Restore snapshot.")

    postinstalls = []

    # for cnr restore
    with open(snapshot_path, 'r', encoding="UTF-8") as snapshot_file:
        if snapshot_path.endswith('.json'):
            info = json.load(snapshot_file)
        elif snapshot_path.endswith('.yaml'):
            info = yaml.load(snapshot_file, Loader=yaml.SafeLoader)
            info = info['custom_nodes']

        cnr_info = info.get('cnr_custom_nodes')
        if cnr_info is not None:
            # disable not listed cnr nodes
            todo_disable = []
            for k, v in unified_manager.active_nodes.items():
                if v[0] != 'nightly':
                    if k not in cnr_info:
                        todo_disable.append(k)

            for x in todo_disable:
                unified_manager.unified_disable(x, False)

            # install listed cnr nodes
            for k, v in cnr_info.items():
                ps = await unified_manager.install_by_id(k, version_spec=v, instant_execution=True, return_postinstall=True)
                if ps is not None and ps.result:
                    if hasattr(ps, 'postinstall'):
                        postinstalls.append(ps.postinstall)
                    else:
                        print(f"cm-cli: unexpected [0001]")

    # for git restore
    if git_helper_extras is None:
        git_helper_extras = []

    cmd_str = [sys.executable, git_script_path, '--apply-snapshot', snapshot_path] + git_helper_extras
    new_env = os.environ.copy()
    new_env["COMFYUI_PATH"] = comfy_path
    output = subprocess.check_output(cmd_str, cwd=custom_nodes_path, text=True, env=new_env)
    msg_lines = output.split('\n')
    extract_infos(msg_lines)

    for repo_path in cloned_repos:
        unified_manager.execute_install_script('', repo_path, instant_execution=True)

    for ps in postinstalls:
        ps()

    # reload
    await unified_manager.migrate_unmanaged_nodes()

    # print summary
    for x in cloned_repos:
        print(f"[ INSTALLED ] {x}")
    for x in checkout_repos:
        print(f"[  CHECKOUT ] {x}")
    for x in enabled_repos:
        print(f"[  ENABLED  ] {x}")
    for x in disabled_repos:
        print(f"[  DISABLED ] {x}")

    if is_failed:
        print(output)
        print("[bold red]ERROR: Failed to restore snapshot.[/bold red]")


# check need to migrate
need_to_migrate = False

async def check_need_to_migrate():
    global need_to_migrate

    legacy_custom_nodes = []

    try:
        import folder_paths
    except:
        try:
            sys.path.append(comfy_path)
            import folder_paths
        except:
            raise Exception(f"Invalid COMFYUI_PATH: {comfy_path}")

    node_paths = folder_paths.get_folder_paths("custom_nodes")
    for x in node_paths:
        subdirs = [d for d in os.listdir(x) if os.path.isdir(os.path.join(x, d))]
        for subdir in subdirs:
            if subdir in ['.disabled', '__pycache__']:
                continue

            if '@' not in subdir:
                need_to_migrate = True
                legacy_custom_nodes.append(subdir)

    if len(legacy_custom_nodes) > 0:
        print("\n--------------------- ComfyUI-Manager migration notice --------------------")
        print("The following custom nodes were installed using the old management method and require migration:")
        print(", ".join(legacy_custom_nodes))
        print("---------------------------------------------------------------------------\n")

