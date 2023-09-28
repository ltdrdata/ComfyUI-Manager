import configparser
import shutil
import folder_paths
import os
import sys
import threading
import subprocess


def handle_stream(stream, prefix):
    for line in stream:
        print(prefix, line, end="")


def run_script(cmd, cwd='.'):
    process = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

    stdout_thread = threading.Thread(target=handle_stream, args=(process.stdout, ""))
    stderr_thread = threading.Thread(target=handle_stream, args=(process.stderr, "[!]"))

    stdout_thread.start()
    stderr_thread.start()

    stdout_thread.join()
    stderr_thread.join()

    return process.wait()


try:
    import git
except:
    my_path = os.path.dirname(__file__)
    requirements_path = os.path.join(my_path, "requirements.txt")

    print(f"## ComfyUI-Manager: installing dependencies")

    run_script([sys.executable, '-s', '-m', 'pip', 'install', '-r', requirements_path])

    try:
        import git
    except:
        print(f"## [ERROR] ComfyUI-Manager: Attempting to reinstall dependencies using an alternative method.")
        run_script([sys.executable, '-s', '-m', 'pip', 'install', '--user', '-r', requirements_path])

        try:
            import git
        except:
            print(f"## [ERROR] ComfyUI-Manager: Failed to install the GitPython package in the correct Python environment. Please install it manually in the appropriate environment. (You can seek help at https://app.element.io/#/room/%23comfyui_space%3Amatrix.org)")

    print(f"## ComfyUI-Manager: installing dependencies done.")


sys.path.append('../..')

from torchvision.datasets.utils import download_url

# ensure .js
print("### Loading: ComfyUI-Manager (V0.32)")

comfy_ui_required_revision = 1240
comfy_ui_revision = "Unknown"

comfy_path = os.path.dirname(folder_paths.__file__)
custom_nodes_path = os.path.join(comfy_path, 'custom_nodes')
js_path = os.path.join(comfy_path, "web", "extensions")

comfyui_manager_path = os.path.dirname(__file__)
local_db_model = os.path.join(comfyui_manager_path, "model-list.json")
local_db_alter = os.path.join(comfyui_manager_path, "alter-list.json")
local_db_custom_node_list = os.path.join(comfyui_manager_path, "custom-node-list.json")
local_db_extension_node_mappings = os.path.join(comfyui_manager_path, "extension-node-map.json")
git_script_path = os.path.join(os.path.dirname(__file__), "git_helper.py")

startup_script_path = os.path.join(comfyui_manager_path, "startup-scripts")
config_path = os.path.join(os.path.dirname(__file__), "config.ini")
cached_config = None


default_channels = 'default::https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main,recent::https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/node_db/new,'
with open(os.path.join(comfyui_manager_path, 'channels.list'), 'r') as file:
    channels = file.read()
    default_channels = channels.replace('\n', ',')


from comfy.cli_args import args
import latent_preview


def write_config():
    config = configparser.ConfigParser()
    config['default'] = {
        'preview_method': get_current_preview_method(),
        'badge_mode': get_config()['badge_mode'],
        'git_exe':  get_config()['git_exe'],
        'channel_url': get_config()['channel_url'],
        'channel_url_list': get_config()['channel_url_list']
    }
    with open(config_path, 'w') as configfile:
        config.write(configfile)


def read_config():
    try:
        config = configparser.ConfigParser()
        config.read(config_path)
        default_conf = config['default']

        channel_url_list_is_valid = True
        if 'channel_url_list' in default_conf and default_conf['channel_url_list'] != '':
            for item in default_conf['channel_url_list'].split(","):
                if len(item.split("::")) != 2:
                    channel_url_list_is_valid = False
                    break

        if channel_url_list_is_valid:
            ch_url_list = default_conf['channel_url_list']
        else:
            print(f"[WARN] ComfyUI-Manager: channel_url_list is invalid format")
            ch_url_list = ''

        return {
                    'preview_method': default_conf['preview_method'] if 'preview_method' in default_conf else get_current_preview_method(),
                    'badge_mode': default_conf['badge_mode'] if 'badge_mode' in default_conf else 'none',
                    'git_exe': default_conf['git_exe'] if 'git_exe' in default_conf else '',
                    'channel_url': default_conf['channel_url'] if 'channel_url' in default_conf else 'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main',
                    'channel_url_list': ch_url_list
               }

    except Exception:
        return {
            'preview_method': get_current_preview_method(),
            'badge_mode': 'none',
            'git_exe': '',
            'channel_url': 'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main',
            'channel_url_list': ''
        }


def get_config():
    global cached_config

    if cached_config is None:
        cached_config = read_config()

    return cached_config


def get_current_preview_method():
    if args.preview_method == latent_preview.LatentPreviewMethod.Auto:
        return "auto"
    elif args.preview_method == latent_preview.LatentPreviewMethod.Latent2RGB:
        return "latent2rgb"
    elif args.preview_method == latent_preview.LatentPreviewMethod.TAESD:
        return "taesd"
    else:
        return "none"


def set_preview_method(method):
    if method == 'auto':
        args.preview_method = latent_preview.LatentPreviewMethod.Auto
    elif method == 'latent2rgb':
        args.preview_method = latent_preview.LatentPreviewMethod.Latent2RGB
    elif method == 'taesd':
        args.preview_method = latent_preview.LatentPreviewMethod.TAESD
    else:
        args.preview_method = latent_preview.LatentPreviewMethod.NoPreviews

    get_config()['preview_method'] = args.preview_method


def set_badge_mode(mode):
    get_config()['badge_mode'] = mode


set_preview_method(get_config()['preview_method'])


def try_install_script(url, repo_path, install_cmd):
    int_comfyui_revision = 0

    if type(comfy_ui_revision) == int:
        int_comfyui_revision = comfy_ui_revision
    elif comfy_ui_revision.isdigit():
        int_comfyui_revision = int(comfy_ui_revision)

    if platform.system() == "Windows" and int_comfyui_revision >= comfy_ui_required_revision:
        if not os.path.exists(startup_script_path):
            os.makedirs(startup_script_path)

        script_path = os.path.join(startup_script_path, "install-scripts.txt")
        with open(script_path, "a") as file:
            obj = [repo_path] + install_cmd
            file.write(f"{obj}\n")

        return True
    else:
        print(f"\n## ComfyUI-Manager: EXECUTE => {install_cmd}")
        code = run_script(install_cmd, cwd=repo_path)

        if platform.system() == "Windows":
            try:
                if int(comfy_ui_revision) < comfy_ui_required_revision:
                    print("\n\n###################################################################")
                    print(f"[WARN] ComfyUI-Manager: Your ComfyUI version ({comfy_ui_revision}) is too old. Please update to the latest version.")
                    print(f"[WARN] The extension installation feature may not work properly in the current installed ComfyUI version on Windows environment.")
                    print("###################################################################\n\n")
            except:
                pass

        if code != 0:
            print(f"install script failed: {url}")
            return False

def print_comfyui_version():
    global comfy_ui_revision
    try:
        repo = git.Repo(os.path.dirname(folder_paths.__file__))

        comfy_ui_revision = len(list(repo.iter_commits('HEAD')))
        current_branch = repo.active_branch.name
        git_hash = repo.head.commit.hexsha

        try:
            if int(comfy_ui_revision) < comfy_ui_required_revision:
                print(f"\n\n## [WARN] ComfyUI-Manager: Your ComfyUI version ({comfy_ui_revision}) is too old. Please update to the latest version. ##\n\n")
        except:
            pass

        if current_branch == "master":
            print(f"### ComfyUI Revision: {comfy_ui_revision} [{git_hash[:8]}] | Released on '{repo.head.commit.committed_datetime.date()}'")
        else:
            print(f"### ComfyUI Revision: {comfy_ui_revision} on '{current_branch}' [{git_hash[:8]}] | Released on '{repo.head.commit.committed_datetime.date()}'")
    except:
        print("### ComfyUI Revision: UNKNOWN (The currently installed ComfyUI is not a Git repository)")


print_comfyui_version()


# use subprocess to avoid file system lock by git (Windows)
def __win_check_git_update(path, do_fetch=False, do_update=False):
    if do_fetch:
        command = [sys.executable, git_script_path, "--fetch", path]
    elif do_update:
        command = [sys.executable, git_script_path, "--pull", path]
    else:
        command = [sys.executable, git_script_path, "--check", path]

    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    output, _ = process.communicate()
    output = output.decode('utf-8').strip()

    if do_update:
        if "CUSTOM NODE PULL: True" in output:
            process.wait()
            print(f"\rUpdated: {path}")
            return True
        elif "CUSTOM NODE PULL: None" in output:
            process.wait()
            return True
        else:
            print(f"\rUpdate error: {path}")
            process.wait()
            return False
    else:
        if "CUSTOM NODE CHECK: True" in output:
            process.wait()
            return True
        elif "CUSTOM NODE CHECK: False" in output:
            process.wait()
            return False
        else:
            print(f"\rFetch error: {path}")
            process.wait()
            return False


def __win_check_git_pull(path):
    command = [sys.executable, git_script_path, "--pull", path]
    process = subprocess.Popen(command)
    process.wait()


def git_repo_has_updates(path, do_fetch=False, do_update=False):
    if do_fetch:
        print(f"\x1b[2K\rFetching: {path}", end='')
    elif do_update:
        print(f"\x1b[2K\rUpdating: {path}", end='')

    # Check if the path is a git repository
    if not os.path.exists(os.path.join(path, '.git')):
        raise ValueError('Not a git repository')

    if platform.system() == "Windows":
        return __win_check_git_update(path, do_fetch, do_update)
    else:
        # Fetch the latest commits from the remote repository
        repo = git.Repo(path)

        current_branch = repo.active_branch
        branch_name = current_branch.name

        remote_name = 'origin'
        remote = repo.remote(name=remote_name)

        # Get the current commit hash
        commit_hash = repo.head.commit.hexsha

        if do_fetch or do_update:
            remote.fetch()

        if do_update:
            try:
                remote.pull(rebase=True)
                repo.git.submodule('update', '--init', '--recursive')
                new_commit_hash = repo.head.commit.hexsha

                if commit_hash != new_commit_hash:
                    print(f"\x1b[2K\rUpdated: {path}")
                    return True
                else:
                    return False

            except Exception as e:
                print(f"\nUpdating failed: {path}\n{e}", file=sys.stderr)

        # Get commit hash of the remote branch
        remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

        # Compare the commit hashes to determine if the local repository is behind the remote repository
        if commit_hash != remote_commit_hash:
            # Get the commit dates
            commit_date = repo.head.commit.committed_datetime
            remote_commit_date = repo.refs[f'{remote_name}/{branch_name}'].object.committed_datetime

            # Compare the commit dates to determine if the local repository is behind the remote repository
            if commit_date < remote_commit_date:
                return True

    return False


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

        origin = repo.remote(name='origin')
        origin.pull(rebase=True)
        repo.git.submodule('update', '--init', '--recursive')
        
        repo.close()

    return True


async def get_data(uri):
    print(f"FETCH DATA from: {uri}")
    if uri.startswith("http"):
        async with aiohttp.ClientSession(trust_env=True) as session:
            async with session.get(uri) as resp:
                json_text = await resp.text()
    else:
        with open(uri, "r", encoding="utf-8") as f:
            json_text = f.read()

    json_obj = json.loads(json_text)
    return json_obj


def setup_js():
    import nodes
    js_dest_path = os.path.join(js_path, "comfyui-manager")

    if hasattr(nodes, "EXTENSION_WEB_DIRS"):
        if os.path.exists(js_dest_path):
            shutil.rmtree(js_dest_path)
    else:
        print(f"[WARN] ComfyUI-Manager: Your ComfyUI version is outdated. Please update to the latest version.")
        # setup js
        if not os.path.exists(js_dest_path):
            os.makedirs(js_dest_path)
        js_src_path = os.path.join(comfyui_manager_path, "js", "comfyui-manager.js")

        print(f"### ComfyUI-Manager: Copy .js from '{js_src_path}' to '{js_dest_path}'")
        shutil.copy(js_src_path, js_dest_path)


setup_js()


def setup_environment():
    git_exe = get_config()['git_exe']

    if git_exe != '':
        git.Git().update_environment(GIT_PYTHON_GIT_EXECUTABLE=git_exe)


setup_environment()


# Expand Server api

import server
from aiohttp import web
import aiohttp
import json
import zipfile
import urllib.request


def get_model_dir(data):
    if data['save_path'] != 'default':
        if '..' in data['save_path'] or data['save_path'].startswith('/'):
            print(f"[WARN] '{data['save_path']}' is not allowed path. So it will be saved into 'models/etc'.")
            base_model = "etc"
        else:
            if data['save_path'].startswith("custom_nodes"):
                base_model = os.path.join(comfy_path, data['save_path'])
            else:
                base_model = os.path.join(folder_paths.models_dir, data['save_path'])
    else:
        model_type = data['type']
        if model_type == "checkpoints":
            base_model = folder_paths.folder_names_and_paths["checkpoints"][0][0]
        elif model_type == "unclip":
            base_model = folder_paths.folder_names_and_paths["checkpoints"][0][0]
        elif model_type == "VAE":
            base_model = folder_paths.folder_names_and_paths["vae"][0][0]
        elif model_type == "lora":
            base_model = folder_paths.folder_names_and_paths["loras"][0][0]
        elif model_type == "T2I-Adapter":
            base_model = folder_paths.folder_names_and_paths["controlnet"][0][0]
        elif model_type == "T2I-Style":
            base_model = folder_paths.folder_names_and_paths["controlnet"][0][0]
        elif model_type == "controlnet":
            base_model = folder_paths.folder_names_and_paths["controlnet"][0][0]
        elif model_type == "clip_vision":
            base_model = folder_paths.folder_names_and_paths["clip_vision"][0][0]
        elif model_type == "gligen":
            base_model = folder_paths.folder_names_and_paths["gligen"][0][0]
        elif model_type == "upscale":
            base_model = folder_paths.folder_names_and_paths["upscale_models"][0][0]
        elif model_type == "embeddings":
            base_model = folder_paths.folder_names_and_paths["embeddings"][0][0]
        else:
            base_model = "etc"

    return base_model


def get_model_path(data):
    base_model = get_model_dir(data)
    return os.path.join(base_model, data['filename'])


def check_a_custom_node_installed(item, do_fetch=False, do_update_check=True, do_update=False):
    item['installed'] = 'None'

    if item['install_type'] == 'git-clone' and len(item['files']) == 1:
        dir_name = os.path.splitext(os.path.basename(item['files'][0]))[0].replace(".git", "")
        dir_path = os.path.join(custom_nodes_path, dir_name)
        if os.path.exists(dir_path):
            try:
                if do_update_check and git_repo_has_updates(dir_path, do_fetch, do_update):
                    item['installed'] = 'Update'
                else:
                    item['installed'] = 'True'
            except:
                item['installed'] = 'True'

        elif os.path.exists(dir_path + ".disabled"):
            item['installed'] = 'Disabled'

        else:
            item['installed'] = 'False'

    elif item['install_type'] == 'copy' and len(item['files']) == 1:
        dir_name = os.path.basename(item['files'][0])

        if item['files'][0].endswith('.py'):
            base_path = custom_nodes_path
        elif 'js_path' in item:
            base_path = os.path.join(js_path, item['js_path'])
        else:
            base_path = js_path

        file_path = os.path.join(base_path, dir_name)
        if os.path.exists(file_path):
            item['installed'] = 'True'
        elif os.path.exists(file_path + ".disabled"):
            item['installed'] = 'Disabled'
        else:
            item['installed'] = 'False'


def check_custom_nodes_installed(json_obj, do_fetch=False, do_update_check=True, do_update=False):
    if do_fetch:
        print("Start fetching...", end="")
    elif do_update:
        print("Start updating...", end="")
    elif do_update_check:
        print("Start update check...", end="")

    for item in json_obj['custom_nodes']:
        check_a_custom_node_installed(item, do_fetch, do_update_check, do_update)

    if do_fetch:
        print(f"\x1b[2K\rFetching done.")
    elif do_update:
        update_exists = any(item['installed'] == 'Update' for item in json_obj['custom_nodes'])
        if update_exists:
            print(f"\x1b[2K\rUpdate done.")
        else:
            print(f"\x1b[2K\rAll extensions are already up-to-date.")
    elif do_update_check:
        print(f"\x1b[2K\rUpdate check done.")


@server.PromptServer.instance.routes.get("/customnode/getmappings")
async def fetch_customnode_mappings(request):
    if request.rel_url.query["mode"] == "local":
        uri = local_db_extension_node_mappings
    else:
        uri = get_config()['channel_url'] + '/extension-node-map.json'

    json_obj = await get_data(uri)

    return web.json_response(json_obj, content_type='application/json')


@server.PromptServer.instance.routes.get("/customnode/fetch_updates")
async def fetch_updates(request):
    try:
        if request.rel_url.query["mode"] == "local":
            uri = local_db_custom_node_list
        else:
            uri = get_config()['channel_url'] + '/custom-node-list.json'

        json_obj = await get_data(uri)
        check_custom_nodes_installed(json_obj, True)

        update_exists = any('custom_nodes' in json_obj and 'installed' in node and node['installed'] == 'Update' for node in
                            json_obj['custom_nodes'])

        if update_exists:
            return web.Response(status=201)

        return web.Response(status=200)
    except:
        return web.Response(status=400)


@server.PromptServer.instance.routes.get("/customnode/update_all")
async def update_all(request):
    try:
        if request.rel_url.query["mode"] == "local":
            uri = local_db_custom_node_list
        else:
            uri = get_config()['channel_url'] + '/custom-node-list.json'

        json_obj = await get_data(uri)
        check_custom_nodes_installed(json_obj, do_update=True)

        update_exists = any(item['installed'] == 'Update' for item in json_obj['custom_nodes'])

        if update_exists:
            return web.Response(status=201)

        return web.Response(status=200)
    except:
        return web.Response(status=400)


@server.PromptServer.instance.routes.get("/customnode/getlist")
async def fetch_customnode_list(request):
    if "skip_update" in request.rel_url.query and request.rel_url.query["skip_update"] == "true":
        skip_update = True
    else:
        skip_update = False

    if request.rel_url.query["mode"] == "local":
        uri = local_db_custom_node_list
    else:
        uri = get_config()['channel_url'] + '/custom-node-list.json'

    json_obj = await get_data(uri)
    check_custom_nodes_installed(json_obj, False, not skip_update)

    return web.json_response(json_obj, content_type='application/json')


@server.PromptServer.instance.routes.get("/alternatives/getlist")
async def fetch_alternatives_list(request):
    if "skip_update" in request.rel_url.query and request.rel_url.query["skip_update"] == "true":
        skip_update = True
    else:
        skip_update = False

    if request.rel_url.query["mode"] == "local":
        uri1 = local_db_alter
        uri2 = local_db_custom_node_list
    else:
        uri1 = get_config()['channel_url'] + '/alter-list.json'
        uri2 = get_config()['channel_url'] + '/custom-node-list.json'

    alter_json = await get_data(uri1)
    custom_node_json = await get_data(uri2)

    fileurl_to_custom_node = {}
    for item in custom_node_json['custom_nodes']:
        for fileurl in item['files']:
            fileurl_to_custom_node[fileurl] = item

    for item in alter_json['items']:
        fileurl = item['id']
        if fileurl in fileurl_to_custom_node:
            custom_node = fileurl_to_custom_node[fileurl]
            check_a_custom_node_installed(custom_node, not skip_update)
            item['custom_node'] = custom_node

    return web.json_response(alter_json, content_type='application/json')


def check_model_installed(json_obj):
    for item in json_obj['models']:
        item['installed'] = 'None'

        model_path = get_model_path(item)

        if model_path is not None:
            if os.path.exists(model_path):
                item['installed'] = 'True'
            else:
                item['installed'] = 'False'


@server.PromptServer.instance.routes.get("/externalmodel/getlist")
async def fetch_externalmodel_list(request):
    if request.rel_url.query["mode"] == "local":
        uri = local_db_model
    else:
        uri = get_config()['channel_url'] + '/model-list.json'

    json_obj = await get_data(uri)
    check_model_installed(json_obj)

    return web.json_response(json_obj, content_type='application/json')


def unzip_install(files):
    temp_filename = 'manager-temp.zip'
    for url in files:
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'}

            req = urllib.request.Request(url, headers=headers)
            response = urllib.request.urlopen(req)
            data = response.read()

            with open(temp_filename, 'wb') as f:
                f.write(data)

            with zipfile.ZipFile(temp_filename, 'r') as zip_ref:
                zip_ref.extractall(custom_nodes_path)

            os.remove(temp_filename)
        except Exception as e:
            print(f"Install(unzip) error: {url} / {e}", file=sys.stderr)
            return False

    print("Installation was successful.")
    return True


def download_url_with_agent(url, save_path):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'}

        req = urllib.request.Request(url, headers=headers)
        response = urllib.request.urlopen(req)
        data = response.read()

        if not os.path.exists(os.path.dirname(save_path)):
            os.makedirs(os.path.dirname(save_path))

        with open(save_path, 'wb') as f:
            f.write(data)

    except Exception as e:
        print(f"Download error: {url} / {e}", file=sys.stderr)
        return False

    print("Installation was successful.")
    return True


def copy_install(files, js_path_name=None):
    for url in files:
        try:
            if url.endswith(".py"):
                download_url(url, custom_nodes_path)
            else:
                path = os.path.join(js_path, js_path_name) if js_path_name is not None else js_path
                if not os.path.exists(path):
                    os.makedirs(path)
                download_url(url, path)

        except Exception as e:
            print(f"Install(copy) error: {url} / {e}", file=sys.stderr)
            return False

    print("Installation was successful.")
    return True


def copy_uninstall(files, js_path_name='.'):
    for url in files:
        dir_name = os.path.basename(url)
        base_path = custom_nodes_path if url.endswith('.py') else os.path.join(js_path, js_path_name)
        file_path = os.path.join(base_path, dir_name)

        try:
            if os.path.exists(file_path):
                os.remove(file_path)
            elif os.path.exists(file_path + ".disabled"):
                os.remove(file_path + ".disabled")
        except Exception as e:
            print(f"Uninstall(copy) error: {url} / {e}", file=sys.stderr)
            return False

    print("Uninstallation was successful.")
    return True


def copy_set_active(files, is_disable, js_path_name='.'):
    if is_disable:
        action_name = "Disable"
    else:
        action_name = "Enable"

    for url in files:
        dir_name = os.path.basename(url)
        base_path = custom_nodes_path if url.endswith('.py') else os.path.join(js_path, js_path_name)
        file_path = os.path.join(base_path, dir_name)

        try:
            if is_disable:
                current_name = file_path
                new_name = file_path + ".disabled"
            else:
                current_name = file_path + ".disabled"
                new_name = file_path

            os.rename(current_name, new_name)

        except Exception as e:
            print(f"{action_name}(copy) error: {url} / {e}", file=sys.stderr)

            return False

    print(f"{action_name} was successful.")
    return True


def execute_install_script(url, repo_path):
    install_script_path = os.path.join(repo_path, "install.py")
    requirements_path = os.path.join(repo_path, "requirements.txt")

    if os.path.exists(requirements_path):
        print("Install: pip packages")
        with open(requirements_path, "r") as requirements_file:
            for line in requirements_file:
                package_name = line.strip()
                if package_name:
                    install_cmd = [sys.executable, "-m", "pip", "install", package_name]
                    if package_name.strip() != "":
                        try_install_script(url, repo_path, install_cmd)

    if os.path.exists(install_script_path):
        print(f"Install: install script")
        install_cmd = [sys.executable, "install.py"]
        try_install_script(url, repo_path, install_cmd)

    return True


def gitclone_install(files):
    print(f"install: {files}")
    for url in files:
        try:
            print(f"Download: git clone '{url}'")
            repo_name = os.path.splitext(os.path.basename(url))[0]
            repo_path = os.path.join(custom_nodes_path, repo_name)

            # Clone the repository from the remote URL
            if platform.system() == 'Windows':
                run_script([sys.executable, git_script_path, "--clone", custom_nodes_path, url])
            else:
                repo = git.Repo.clone_from(url, repo_path, recursive=True)
                repo.git.clear_cache()
                repo.close()

            if not execute_install_script(url, repo_path):
                return False

        except Exception as e:
            print(f"Install(git-clone) error: {url} / {e}", file=sys.stderr)
            return False

    print("Installation was successful.")
    return True


import platform
import subprocess
import time


def rmtree(path):
    retry_count = 3

    while True:
        try:
            retry_count -= 1

            if platform.system() == "Windows":
                run_script(['attrib', '-R', path + '\\*', '/S'])
            shutil.rmtree(path)

            return True

        except Exception as ex:
            print(f"ex: {ex}")
            time.sleep(3)

            if retry_count < 0:
                raise ex

            print(f"Uninstall retry({retry_count})")


def gitclone_uninstall(files):
    import shutil
    import os

    print(f"uninstall: {files}")
    for url in files:
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
                code = run_script(uninstall_cmd, cwd=dir_path)

                if code != 0:
                    print(f"An error occurred during the execution of the uninstall.py script. Only the '{dir_path}' will be deleted.")
            elif os.path.exists(disable_script_path):
                disable_script = [sys.executable, "disable.py"]
                code = run_script(disable_script, cwd=dir_path)
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
        try:
            dir_name = os.path.splitext(os.path.basename(url))[0].replace(".git", "")
            dir_path = os.path.join(custom_nodes_path, dir_name)

            # safey check
            if dir_path == '/' or dir_path[1:] == ":/" or dir_path == '':
                print(f"{action_name}(git-clone) error: invalid path '{dir_path}' for '{url}'")
                return False

            if is_disable:
                current_path = dir_path
                new_path = dir_path + ".disabled"
            else:
                current_path = dir_path + ".disabled"
                new_path = dir_path

            os.rename(current_path, new_path)

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


def gitclone_update(files):
    import os

    print(f"Update: {files}")
    for url in files:
        try:
            repo_name = os.path.splitext(os.path.basename(url))[0].replace(".git", "")
            repo_path = os.path.join(custom_nodes_path, repo_name)
            git_pull(repo_path)

            if not execute_install_script(url, repo_path):
                return False

        except Exception as e:
            print(f"Update(git-clone) error: {url} / {e}", file=sys.stderr)
            return False

    print("Update was successful.")
    return True


@server.PromptServer.instance.routes.post("/customnode/install")
async def install_custom_node(request):
    json_data = await request.json()

    install_type = json_data['install_type']

    print(f"Install custom node '{json_data['title']}'")

    res = False

    if len(json_data['files']) == 0:
        return web.Response(status=400)

    if install_type == "unzip":
        res = unzip_install(json_data['files'])

    if install_type == "copy":
        js_path_name = json_data['js_path'] if 'js_path' in json_data else '.'
        res = copy_install(json_data['files'], js_path_name)

    elif install_type == "git-clone":
        res = gitclone_install(json_data['files'])

    if 'pip' in json_data:
        for pname in json_data['pip']:
            install_cmd = [sys.executable, "-m", "pip", "install", pname]
            try_install_script(json_data['files'][0], ".", install_cmd)

    if res:
        print(f"After restarting ComfyUI, please refresh the browser.")
        return web.json_response({}, content_type='application/json')

    return web.Response(status=400)


@server.PromptServer.instance.routes.post("/customnode/uninstall")
async def install_custom_node(request):
    json_data = await request.json()

    install_type = json_data['install_type']

    print(f"Uninstall custom node '{json_data['title']}'")

    res = False

    if install_type == "copy":
        js_path_name = json_data['js_path'] if 'js_path' in json_data else '.'
        res = copy_uninstall(json_data['files'], js_path_name)

    elif install_type == "git-clone":
        res = gitclone_uninstall(json_data['files'])

    if res:
        print(f"After restarting ComfyUI, please refresh the browser.")
        return web.json_response({}, content_type='application/json')

    return web.Response(status=400)


@server.PromptServer.instance.routes.post("/customnode/update")
async def install_custom_node(request):
    json_data = await request.json()

    install_type = json_data['install_type']

    print(f"Update custom node '{json_data['title']}'")

    res = False

    if install_type == "git-clone":
        res = gitclone_update(json_data['files'])

    if res:
        print(f"After restarting ComfyUI, please refresh the browser.")
        return web.json_response({}, content_type='application/json')

    return web.Response(status=400)


@server.PromptServer.instance.routes.get("/comfyui_manager/update_comfyui")
async def install_custom_node(request):
    print(f"Update ComfyUI")

    try:
        repo_path = os.path.dirname(folder_paths.__file__)

        if not os.path.exists(os.path.join(repo_path, '.git')):
            print(f"ComfyUI update fail: The installed ComfyUI does not have a Git repository.")
            return web.Response(status=400)

        # version check
        repo = git.Repo(repo_path)

        current_branch = repo.active_branch
        branch_name = current_branch.name

        remote_name = 'origin'
        remote = repo.remote(name=remote_name)
        remote.fetch()

        commit_hash = repo.head.commit.hexsha
        remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

        if commit_hash != remote_commit_hash:
            git_pull(repo_path)
            execute_install_script("ComfyUI", repo_path)
            return web.Response(status=201)
        else:
            return web.Response(status=200)
    except Exception as e:
        print(f"ComfyUI update fail: {e}", file=sys.stderr)
        pass

    return web.Response(status=400)


@server.PromptServer.instance.routes.post("/customnode/toggle_active")
async def install_custom_node(request):
    json_data = await request.json()

    install_type = json_data['install_type']
    is_disabled = json_data['installed'] == "Disabled"

    print(f"Update custom node '{json_data['title']}'")

    res = False

    if install_type == "git-clone":
        res = gitclone_set_active(json_data['files'], not is_disabled)
    elif install_type == "copy":
        res = copy_set_active(json_data['files'], not is_disabled, json_data.get('js_path', None))

    if res:
        return web.json_response({}, content_type='application/json')

    return web.Response(status=400)


@server.PromptServer.instance.routes.post("/model/install")
async def install_model(request):
    json_data = await request.json()

    model_path = get_model_path(json_data)

    res = False

    try:
        if model_path is not None:
            print(f"Install model '{json_data['name']}' into '{model_path}'")

            if json_data['url'].startswith('https://github.com') or json_data['url'].startswith('https://huggingface.co'):
                model_dir = get_model_dir(json_data)
                download_url(json_data['url'], model_dir)
                return web.json_response({}, content_type='application/json')
            else:
                res = download_url_with_agent(json_data['url'], model_path)
        else:
            print(f"Model installation error: invalid model type - {json_data['type']}")

        if res:
            return web.json_response({}, content_type='application/json')
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        pass

    return web.Response(status=400)


@server.PromptServer.instance.routes.get("/manager/preview_method")
async def preview_method(request):
    if "value" in request.rel_url.query:
        set_preview_method(request.rel_url.query['value'])
        write_config()
    else:
        return web.Response(text=get_current_preview_method(), status=200)

    return web.Response(status=200)


@server.PromptServer.instance.routes.get("/manager/badge_mode")
async def badge_mode(request):
    if "value" in request.rel_url.query:
        set_badge_mode(request.rel_url.query['value'])
        write_config()
    else:
        return web.Response(text=get_config()['badge_mode'], status=200)

    return web.Response(status=200)


@server.PromptServer.instance.routes.get("/manager/channel_url_list")
async def channel_url_list(request):
    channels = default_channels+","+get_config()['channel_url_list']
    channels = channels.split(',')

    if "value" in request.rel_url.query:
        for item in channels:
            name_url = item.split("::")
            if len(name_url) == 2 and name_url[0] == request.rel_url.query['value']:
                get_config()['channel_url'] = name_url[1]
                write_config()
                break
    else:
        selected = 'custom'
        selected_url = get_config()['channel_url']
        for item in channels:
            item_info = item.split('::')
            if len(item_info) == 2 and item_info[1] == selected_url:
                selected = item_info[0]

        res = {'selected': selected,
               'list': channels}
        return web.json_response(res, status=200)

    return web.Response(status=200)

WEB_DIRECTORY = "js"
NODE_CLASS_MAPPINGS = {}
__all__ = ['NODE_CLASS_MAPPINGS']
