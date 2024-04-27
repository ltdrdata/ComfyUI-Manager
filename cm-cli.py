
import os
import sys
import traceback
import json
import asyncio
import subprocess
import shutil

sys.path.append(os.path.dirname(__file__))
sys.path.append(os.path.join(os.path.dirname(__file__), "glob"))
import manager_core as core
import cm_global
import git


print(f"\n-= ComfyUI-Manager CLI ({core.version_str}) =-\n")


if not (len(sys.argv) == 2 and sys.argv[1] in ['save-snapshot', 'restore-dependencies', 'clear']) and len(sys.argv) < 3:
    print(f"\npython cm-cli.py [OPTIONS]\n\n"
          f"OPTIONS:\n"
          f"    [install|reinstall|uninstall|update|disable|enable|fix] node_name ... ?[--channel <channel name>] ?[--mode [remote|local|cache]]\n"
          f"    [update|disable|enable|fix] all ?[--channel <channel name>] ?[--mode [remote|local|cache]]\n"
          f"    [simple-show|show] [installed|enabled|not-installed|disabled|all|snapshot|snapshot-list] ?[--channel <channel name>] ?[--mode [remote|local|cache]]\n"
          f"    save-snapshot ?[--output <snapshot .json/.yaml>]\n"
          f"    restore-snapshot <snapshot .json/.yaml>\n"
          f"    cli-only-mode [enable|disable]\n"
          f"    restore-dependencies\n"
          f"    clear\n")
    exit(-1)


comfyui_manager_path = os.path.dirname(__file__)
comfy_path = os.environ.get('COMFYUI_PATH')

if comfy_path is None:
    print(f"WARN: The `COMFYUI_PATH` environment variable is not set. Assuming `custom_nodes/ComfyUI-Manager/../../` as the ComfyUI path.\n", file=sys.stderr)
    comfy_path = os.path.abspath(os.path.join(comfyui_manager_path, '..', '..'))

startup_script_path = os.path.join(comfyui_manager_path, "startup-scripts")
custom_nodes_path = os.path.join(comfy_path, 'custom_nodes')

script_path = os.path.join(startup_script_path, "install-scripts.txt")
restore_snapshot_path = os.path.join(startup_script_path, "restore-snapshot.json")
pip_overrides_path = os.path.join(comfyui_manager_path, "pip_overrides.json")
git_script_path = os.path.join(comfyui_manager_path, "git_helper.py")

cm_global.pip_downgrade_blacklist = ['torch', 'torchsde', 'torchvision', 'transformers', 'safetensors', 'kornia']
cm_global.pip_overrides = {}
if os.path.exists(pip_overrides_path):
    with open(pip_overrides_path, 'r', encoding="UTF-8", errors="ignore") as json_file:
        cm_global.pip_overrides = json.load(json_file)


processed_install = set()


def post_install(url):
    try:
        repository_name = url.split("/")[-1].strip()
        repo_path = os.path.join(custom_nodes_path, repository_name)
        repo_path = os.path.abspath(repo_path)

        requirements_path = os.path.join(repo_path, 'requirements.txt')
        install_script_path = os.path.join(repo_path, 'install.py')

        if os.path.exists(requirements_path):
            with (open(requirements_path, 'r', encoding="UTF-8", errors="ignore") as file):
                for line in file:
                    package_name = core.remap_pip_package(line.strip())
                    if package_name and not core.is_installed(package_name):
                        install_cmd = [sys.executable, "-m", "pip", "install", package_name]
                        output = subprocess.check_output(install_cmd, cwd=repo_path, text=True)
                        for msg_line in output.split('\n'):
                            if 'Requirement already satisfied:' in msg_line:
                                print('.', end='')
                            else:
                                print(msg_line)

        if os.path.exists(install_script_path) and f'{repo_path}/install.py' not in processed_install:
            processed_install.add(f'{repo_path}/install.py')
            install_cmd = [sys.executable, install_script_path]
            output = subprocess.check_output(install_cmd, cwd=repo_path, text=True)
            for msg_line in output.split('\n'):
                if 'Requirement already satisfied:' in msg_line:
                    print('.', end='')
                else:
                    print(msg_line)

    except Exception:
        print(f"ERROR: Restoring '{url}' is failed.")


def restore_dependencies():
    node_paths = [os.path.join(custom_nodes_path, name) for name in os.listdir(custom_nodes_path)
                  if os.path.isdir(os.path.join(custom_nodes_path, name)) and not name.endswith('.disabled')]

    total = len(node_paths)
    i = 1
    for x in node_paths:
        print(f"----------------------------------------------------------------------------------------------------")
        print(f"Restoring [{i}/{total}]: {x}")
        post_install(x)
        i += 1


def restore_snapshot(snapshot_name):
    global processed_install

    if os.path.exists(snapshot_name):
        snapshot_path = os.path.abspath(snapshot_name)
    else:
        snapshot_path = os.path.join(core.comfyui_manager_path, 'snapshots', snapshot_name)
        if not os.path.exists(snapshot_path):
            print(f"ERROR: `{snapshot_path}` is not exists.")
            exit(-1)

    try:
        cloned_repos = []
        checkout_repos = []
        skipped_repos = []
        enabled_repos = []
        disabled_repos = []
        is_failed = False

        def extract_infos(msg_lines):
            nonlocal is_failed

            for x in msg_lines:
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
        cmd_str = [sys.executable, git_script_path, '--apply-snapshot', snapshot_path]
        output = subprocess.check_output(cmd_str, cwd=custom_nodes_path, text=True)
        msg_lines = output.split('\n')
        extract_infos(msg_lines)

        for url in cloned_repos:
            post_install(url)

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
            print("ERROR: Failed to restore snapshot.")

    except Exception:
        print("ERROR: Failed to restore snapshot.")
        traceback.print_exc()
        exit(-1)


def check_comfyui_hash():
    repo = git.Repo(comfy_path)
    core.comfy_ui_revision = len(list(repo.iter_commits('HEAD')))

    comfy_ui_hash = repo.head.commit.hexsha
    cm_global.variables['comfyui.revision'] = core.comfy_ui_revision

    core.comfy_ui_commit_datetime = repo.head.commit.committed_datetime


check_comfyui_hash()


def read_downgrade_blacklist():
    try:
        import configparser
        config_path = os.path.join(os.path.dirname(__file__), "config.ini")
        config = configparser.ConfigParser()
        config.read(config_path)
        default_conf = config['default']

        if 'downgrade_blacklist' in default_conf:
            items = default_conf['downgrade_blacklist'].split(',')
            items = [x.strip() for x in items if x != '']
            cm_global.pip_downgrade_blacklist += items
            cm_global.pip_downgrade_blacklist = list(set(cm_global.pip_downgrade_blacklist))
    except:
        pass


read_downgrade_blacklist()

channel = 'default'
mode = 'remote'
nodes = set()


def load_custom_nodes():
    channel_dict = core.get_channel_dict()
    if channel not in channel_dict:
        print(f"ERROR: Invalid channel is specified `--channel {channel}`", file=sys.stderr)
        exit(-1)

    if mode not in ['remote', 'local', 'cache']:
        print(f"ERROR: Invalid mode is specified `--mode {mode}`", file=sys.stderr)
        exit(-1)

    channel_url = channel_dict[channel]

    res = {}
    json_obj = asyncio.run(core.get_data_by_mode(mode, 'custom-node-list.json', channel_url=channel_url))
    for x in json_obj['custom_nodes']:
        for y in x['files']:
            if 'github.com' in y and not (y.endswith('.py') or y.endswith('.js')):
                repo_name = y.split('/')[-1]
                res[repo_name] = x

    return res


def process_args():
    global channel
    global mode

    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == '--channel':
            if i+1 < len(sys.argv):
                channel = sys.argv[i+1]
                i += 1
        elif sys.argv[i] == '--mode':
            if i+1 < len(sys.argv):
                mode = sys.argv[i+1]
                i += 1
        else:
            nodes.add(sys.argv[i])

        i += 1


process_args()
custom_node_map = load_custom_nodes()


def lookup_node_path(node_name, robust=False):
    # Currently, the node_name is used directly as the node_path, but in the future, I plan to allow nicknames.

    if '..' in node_name:
        print(f"ERROR: invalid node name '{node_name}'")
        exit(-1)

    if node_name in custom_node_map:
        node_path = os.path.join(custom_nodes_path, node_name)
        return node_path, custom_node_map[node_name]
    elif robust:
        node_path = os.path.join(custom_nodes_path, node_name)
        return node_path, None

    print(f"ERROR: invalid node name '{node_name}'")
    exit(-1)


def install_node(node_name, is_all=False, cnt_msg=''):
    if '://' in node_name:
        # install via urls
        res = core.gitclone_install([node_name])
        if not res:
            print(f"ERROR: An error occurred while installing '{node_name}'.")
        else:
            print(f"{cnt_msg} [INSTALLED] {node_name:50}")
    else:
        node_path, node_item = lookup_node_path(node_name)

        if os.path.exists(node_path):
            if not is_all:
                print(f"{cnt_msg} [ SKIPPED ] {node_name:50} => Already installed")
        elif os.path.exists(node_path+'.disabled'):
            enable_node(node_name)
        else:
            res = core.gitclone_install(node_item['files'], instant_execution=True, msg_prefix=f"[{cnt_msg}] ")
            if not res:
                print(f"ERROR: An error occurred while installing '{node_name}'.")
            else:
                print(f"{cnt_msg} [INSTALLED] {node_name:50}")


def reinstall_node(node_name, is_all=False, cnt_msg=''):
    node_path, node_item = lookup_node_path(node_name)

    if os.path.exists(node_path):
        shutil.rmtree(node_path)
    if os.path.exists(node_path+'.disabled'):
        shutil.rmtree(node_path+'.disabled')

    install_node(node_name, is_all=is_all, cnt_msg=cnt_msg)


def fix_node(node_name, is_all=False, cnt_msg=''):
    node_path, node_item = lookup_node_path(node_name, robust=True)

    files = node_item['files'] if node_item is not None else [node_path]

    if os.path.exists(node_path):
        print(f"{cnt_msg} [   FIXING  ]: {node_name:50} => Disabled")
        res = core.gitclone_fix(files, instant_execution=True)
        if not res:
            print(f"ERROR: An error occurred while fixing '{node_name}'.")
    elif not is_all and os.path.exists(node_path+'.disabled'):
        print(f"{cnt_msg} [  SKIPPED  ]: {node_name:50} => Disabled")
    elif not is_all:
        print(f"{cnt_msg} [  SKIPPED  ]: {node_name:50} => Not installed")


def uninstall_node(node_name, is_all=False, cnt_msg=''):
    node_path, node_item = lookup_node_path(node_name, robust=True)

    files = node_item['files'] if node_item is not None else [node_path]

    if os.path.exists(node_path) or os.path.exists(node_path+'.disabled'):
        res = core.gitclone_uninstall(files)
        if not res:
            print(f"ERROR: An error occurred while uninstalling '{node_name}'.")
        else:
            print(f"{cnt_msg} [UNINSTALLED] {node_name:50}")
    else:
        print(f"{cnt_msg} [  SKIPPED  ]: {node_name:50} => Not installed")


def update_node(node_name, is_all=False, cnt_msg=''):
    node_path, node_item = lookup_node_path(node_name, robust=True)

    files = node_item['files'] if node_item is not None else [node_path]

    res = core.gitclone_update(files, skip_script=True, msg_prefix=f"[{cnt_msg}] ")
    post_install(node_path)
    if not res:
        print(f"ERROR: An error occurred while uninstalling '{node_name}'.")


def update_comfyui():
    res = core.update_path(comfy_path, instant_execution=True)
    if res == 'fail':
        print("Updating ComfyUI has failed.")
    elif res == 'updated':
        print("ComfyUI is updated.")
    else:
        print("ComfyUI is already up to date.")


def enable_node(node_name, is_all=False, cnt_msg=''):
    if node_name == 'ComfyUI-Manager':
        return

    node_path, node_item = lookup_node_path(node_name, robust=True)

    files = node_item['files'] if node_item is not None else [node_path]

    for x in files:
        if os.path.exists(x+'.disabled'):
            current_name = x+'.disabled'
            os.rename(current_name, x)
            print(f"{cnt_msg} [ENABLED] {node_name:50}")
        elif os.path.exists(x):
            print(f"{cnt_msg} [SKIPPED] {node_name:50} => Already enabled")
        elif not is_all:
            print(f"{cnt_msg} [SKIPPED] {node_name:50} => Not installed")


def disable_node(node_name, is_all=False, cnt_msg=''):
    if node_name == 'ComfyUI-Manager':
        return
    
    node_path, node_item = lookup_node_path(node_name, robust=True)

    files = node_item['files'] if node_item is not None else [node_path]

    for x in files:
        if os.path.exists(x):
            current_name = x
            new_name = x+'.disabled'
            os.rename(current_name, new_name)
            print(f"{cnt_msg} [DISABLED] {node_name:50}")
        elif os.path.exists(x+'.disabled'):
            print(f"{cnt_msg} [ SKIPPED] {node_name:50} => Already disabled")
        elif not is_all:
            print(f"{cnt_msg} [ SKIPPED] {node_name:50} => Not installed")


def show_list(kind, simple=False):
    for k, v in custom_node_map.items():
        node_path = os.path.join(custom_nodes_path, k)

        states = set()
        if os.path.exists(node_path):
            prefix = '[    ENABLED    ] '
            states.add('installed')
            states.add('enabled')
            states.add('all')
        elif os.path.exists(node_path+'.disabled'):
            prefix = '[    DISABLED   ] '
            states.add('installed')
            states.add('disabled')
            states.add('all')
        else:
            prefix = '[ NOT INSTALLED ] '
            states.add('not-installed')
            states.add('all')

        if kind in states:
            if simple:
                print(f"{k:50}")
            else:
                print(f"{prefix} {k:50}(author: {v['author']})")

    # unregistered nodes
    candidates = os.listdir(os.path.realpath(custom_nodes_path))

    for k in candidates:
        fullpath = os.path.join(custom_nodes_path, k)

        if os.path.isfile(fullpath):
            continue

        if k in ['__pycache__']:
            continue

        states = set()
        if k.endswith('.disabled'):
            prefix = '[    DISABLED   ] '
            states.add('installed')
            states.add('disabled')
            states.add('all')
            k = k[:-9]
        else:
            prefix = '[    ENABLED    ] '
            states.add('installed')
            states.add('enabled')
            states.add('all')

        if k not in custom_node_map:
            if kind in states:
                if simple:
                    print(f"{k:50}")
                else:
                    print(f"{prefix} {k:50}(author: N/A)")


def show_snapshot(simple_mode=False):
    json_obj = core.get_current_snapshot()

    if simple_mode:
        print(f"[{json_obj['comfyui']}] comfyui")
        for k, v in json_obj['git_custom_nodes'].items():
            print(f"[{v['hash']}] {k}")
        for v in json_obj['file_custom_nodes']:
            print(f"[                   N/A                  ] {v['filename']}")

    else:
        formatted_json = json.dumps(json_obj, ensure_ascii=False, indent=4)
        print(formatted_json)


def show_snapshot_list(simple_mode=False):
    snapshot_path = os.path.join(comfyui_manager_path, 'snapshots')

    files = os.listdir(snapshot_path)
    json_files = [x for x in files if x.endswith('.json')]
    for x in sorted(json_files):
        print(x)


def cancel():
    if os.path.exists(script_path):
        os.remove(script_path)

    if os.path.exists(restore_snapshot_path):
        os.remove(restore_snapshot_path)


def save_snapshot():
    output_path = None
    for i in range(len(sys.argv)):
        if sys.argv[i] == '--output':
            if len(sys.argv) >= i:
                output_path = sys.argv[i+1]

    return core.save_snapshot_with_postfix('snapshot', output_path)

def for_each_nodes(act, allow_all=True):
    global nodes

    is_all = False
    if allow_all and 'all' in nodes:
        is_all = True
        nodes = [x for x in custom_node_map.keys() if os.path.exists(os.path.join(custom_nodes_path, x)) or os.path.exists(os.path.join(custom_nodes_path, x) + '.disabled')]

    nodes = [x for x in nodes if x.lower() not in ['comfy', 'comfyui', 'all']]

    total = len(nodes)
    i = 1
    for x in nodes:
        try:
            act(x, is_all=is_all, cnt_msg=f'{i}/{total}')
        except Exception as e:
            print(f"ERROR: {e}")
            traceback.print_exc()
        i += 1


op = sys.argv[1]


if op == 'install':
    for_each_nodes(install_node)

elif op == 'reinstall':
    for_each_nodes(reinstall_node)

elif op == 'uninstall':
    for_each_nodes(uninstall_node)

elif op == 'update':
    for x in nodes:
        if x.lower() in ['comfyui', 'comfy', 'all']:
            update_comfyui()
            break

    for_each_nodes(update_node, allow_all=True)

elif op == 'disable':
    for_each_nodes(disable_node, allow_all=True)

elif op == 'enable':
    for_each_nodes(enable_node, allow_all=True)

elif op == 'fix':
    for_each_nodes(fix_node, allow_all=True)

elif op == 'show':
    if sys.argv[2] == 'snapshot':
        show_snapshot()
    elif sys.argv[2] == 'snapshot-list':
        show_snapshot_list()
    else:
        show_list(sys.argv[2])

elif op == 'simple-show':
    if sys.argv[2] == 'snapshot':
        show_snapshot(True)
    elif sys.argv[2] == 'snapshot-list':
        show_snapshot_list(True)
    else:
        show_list(sys.argv[2], True)

elif op == 'cli-only-mode':
    cli_mode_flag = os.path.join(os.path.dirname(__file__), '.enable-cli-only-mode')
    if sys.argv[2] == 'enable':
        with open(cli_mode_flag, 'w') as file:
            pass
        print(f"\ncli-only-mode: enabled\n")
    elif sys.argv[2] == 'disable':
        if os.path.exists(cli_mode_flag):
            os.remove(cli_mode_flag)
        print(f"\ncli-only-mode: disabled\n")
    else:
        print(f"\ninvalid value for cli-only-mode: {sys.argv[2]}\n")

elif op == 'save-snapshot':
    path = save_snapshot()
    print(f"Current snapshot is saved as `{path}`")

elif op == 'restore-snapshot':
    restore_snapshot(sys.argv[2])

elif op == 'restore-dependencies':
    restore_dependencies()

elif op == 'clear':
    cancel()

else:
    print(f"\nInvalid command `{op}`")

print(f"")
