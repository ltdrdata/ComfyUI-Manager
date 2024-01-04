import sys
import os
import git
import configparser
import re
import json
from torchvision.datasets.utils import download_url
from tqdm.auto import tqdm
from git.remote import RemoteProgress

config_path = os.path.join(os.path.dirname(__file__), "config.ini")
nodelist_path = os.path.join(os.path.dirname(__file__), "custom-node-list.json")
working_directory = os.getcwd()


class GitProgress(RemoteProgress):
    def __init__(self):
        super().__init__()
        self.pbar = tqdm(ascii=True)

    def update(self, op_code, cur_count, max_count=None, message=''):
        self.pbar.total = max_count
        self.pbar.n = cur_count
        self.pbar.pos = 0
        self.pbar.refresh()


def gitclone(custom_nodes_path, url, target_hash=None):
    repo_name = os.path.splitext(os.path.basename(url))[0]
    repo_path = os.path.join(custom_nodes_path, repo_name)

    # Clone the repository from the remote URL
    repo = git.Repo.clone_from(url, repo_path, recursive=True, progress=GitProgress())

    if target_hash is not None:
        print(f"CHECKOUT: {repo_name} [{target_hash}]")
        repo.git.checkout(target_hash)
            
    repo.git.clear_cache()
    repo.close()


def gitcheck(path, do_fetch=False):
    try:
        # Fetch the latest commits from the remote repository
        repo = git.Repo(path)

        if repo.head.is_detached:
            print("CUSTOM NODE CHECK: True")
            return

        current_branch = repo.active_branch
        branch_name = current_branch.name

        remote_name = 'origin'
        remote = repo.remote(name=remote_name)

        if do_fetch:
            remote.fetch()

        # Get the current commit hash and the commit hash of the remote branch
        commit_hash = repo.head.commit.hexsha
        remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

        # Compare the commit hashes to determine if the local repository is behind the remote repository
        if commit_hash != remote_commit_hash:
            # Get the commit dates
            commit_date = repo.head.commit.committed_datetime
            remote_commit_date = repo.refs[f'{remote_name}/{branch_name}'].object.committed_datetime

            # Compare the commit dates to determine if the local repository is behind the remote repository
            if commit_date < remote_commit_date:
                print("CUSTOM NODE CHECK: True")
        else:
            print("CUSTOM NODE CHECK: False")
    except Exception as e:
        print(e)
        print("CUSTOM NODE CHECK: Error")


def switch_to_default_branch(repo):
    show_result = repo.git.remote("show", "origin")
    matches = re.search(r"\s*HEAD branch:\s*(.*)", show_result)
    if matches:
        default_branch = matches.group(1)
        repo.git.checkout(default_branch)


def gitpull(path):
    # Check if the path is a git repository
    if not os.path.exists(os.path.join(path, '.git')):
        raise ValueError('Not a git repository')

    # Pull the latest changes from the remote repository
    repo = git.Repo(path)
    if repo.is_dirty():
        repo.git.stash()

    commit_hash = repo.head.commit.hexsha
    try:
        if repo.head.is_detached:
            switch_to_default_branch(repo)

        current_branch = repo.active_branch
        branch_name = current_branch.name

        remote_name = 'origin'
        remote = repo.remote(name=remote_name)

        remote.fetch()
        remote_commit_hash = repo.refs[f'{remote_name}/{branch_name}'].object.hexsha

        if commit_hash == remote_commit_hash:
            print("CUSTOM NODE PULL: None")  # there is no update
            repo.close()
            return

        remote.pull()

        repo.git.submodule('update', '--init', '--recursive')
        new_commit_hash = repo.head.commit.hexsha

        if commit_hash != new_commit_hash:
            print("CUSTOM NODE PULL: Success")  # update success
        else:
            print("CUSTOM NODE PULL: Fail")  # update fail
    except Exception as e:
        print(e)
        print("CUSTOM NODE PULL: Fail")  # unknown git error

    repo.close()


def checkout_comfyui_hash(target_hash):
    repo_path = os.path.join(working_directory, '..')  # ComfyUI dir

    repo = git.Repo(repo_path)
    commit_hash = repo.head.commit.hexsha

    if commit_hash != target_hash:
        try:
            print(f"CHECKOUT: ComfyUI [{target_hash}]")
            repo.git.checkout(target_hash)
        except git.GitCommandError as e:
            print(f"Error checking out the ComfyUI: {str(e)}")


def checkout_custom_node_hash(git_custom_node_infos):
    repo_name_to_url = {}

    for url in git_custom_node_infos.keys():
        repo_name = url.split('/')[-1]

        if repo_name.endswith('.git'):
            repo_name = repo_name[:-4]

        repo_name_to_url[repo_name] = url

    for path in os.listdir(working_directory):
        if path.endswith("ComfyUI-Manager"):
            continue

        fullpath = os.path.join(working_directory, path)

        if os.path.isdir(fullpath):
            is_disabled = path.endswith(".disabled")

            try:
                git_dir = os.path.join(fullpath, '.git')
                if not os.path.exists(git_dir):
                    continue

                need_checkout = False
                repo_name = os.path.basename(fullpath)

                if repo_name.endswith('.disabled'):
                    repo_name = repo_name[:-9]

                item = git_custom_node_infos[repo_name_to_url[repo_name]]
                if item['disabled'] and is_disabled:
                    pass
                elif item['disabled'] and not is_disabled:
                    # disable
                    print(f"DISABLE: {repo_name}")
                    new_path = fullpath + ".disabled"
                    os.rename(fullpath, new_path)
                    pass
                elif not item['disabled'] and is_disabled:
                    # enable
                    print(f"ENABLE: {repo_name}")
                    new_path = fullpath[:-9]
                    os.rename(fullpath, new_path)
                    fullpath = new_path
                    need_checkout = True
                else:
                    need_checkout = True

                if need_checkout:
                    repo = git.Repo(fullpath)
                    commit_hash = repo.head.commit.hexsha

                    if commit_hash != item['hash']:
                        print(f"CHECKOUT: {repo_name} [{item['hash']}]")
                        repo.git.checkout(item['hash'])
            except Exception:
                print(f"Failed to restore snapshots for the custom node '{path}'")

    # clone missing
    for k, v in git_custom_node_infos.items():
        if not v['disabled']:
            repo_name = k.split('/')[-1]
            if repo_name.endswith('.git'):
                repo_name = repo_name[:-4]

            path = os.path.join(working_directory, repo_name)
            if not os.path.exists(path):
                print(f"CLONE: {path}")
                gitclone(working_directory, k, v['hash'])


def invalidate_custom_node_file(file_custom_node_infos):
    global nodelist_path

    enabled_set = set()
    for item in file_custom_node_infos:
        if not item['disabled']:
            enabled_set.add(item['filename'])

    for path in os.listdir(working_directory):
        fullpath = os.path.join(working_directory, path)

        if not os.path.isdir(fullpath) and fullpath.endswith('.py'):
            if path not in enabled_set:
                print(f"DISABLE: {path}")
                new_path = fullpath+'.disabled'
                os.rename(fullpath, new_path)

        elif not os.path.isdir(fullpath) and fullpath.endswith('.py.disabled'):
            path = path[:-9]
            if path in enabled_set:
                print(f"ENABLE: {path}")
                new_path = fullpath[:-9]
                os.rename(fullpath, new_path)

    # download missing: just support for 'copy' style
    py_to_url = {}

    with open(nodelist_path, 'r', encoding="UTF-8") as json_file:
        info = json.load(json_file)
        for item in info['custom_nodes']:
            if item['install_type'] == 'copy':
                for url in item['files']:
                    if url.endswith('.py'):
                        py = url.split('/')[-1]
                        py_to_url[py] = url

        for item in file_custom_node_infos:
            filename = item['filename']
            if not item['disabled']:
                target_path = os.path.join(working_directory, filename)

                if not os.path.exists(target_path) and filename in py_to_url:
                    url = py_to_url[filename]
                    print(f"DOWNLOAD: {filename}")
                    download_url(url, working_directory)


def apply_snapshot(target):
    try:
        path = os.path.join(os.path.dirname(__file__), 'snapshots', f"{target}")
        if os.path.exists(path):
            with open(path, 'r', encoding="UTF-8") as json_file:
                info = json.load(json_file)

                comfyui_hash = info['comfyui']
                git_custom_node_infos = info['git_custom_nodes']
                file_custom_node_infos = info['file_custom_nodes']

                checkout_comfyui_hash(comfyui_hash)
                checkout_custom_node_hash(git_custom_node_infos)
                invalidate_custom_node_file(file_custom_node_infos)

                print("APPLY SNAPSHOT: True")
                return

        print(f"Snapshot file not found: `{path}`")
        print("APPLY SNAPSHOT: False")
    except Exception as e:
        print(e)
        print("APPLY SNAPSHOT: False")


def setup_environment():
    config = configparser.ConfigParser()
    config.read(config_path)
    if 'default' in config and 'git_exe' in config['default'] and config['default']['git_exe'] != '':
        git.Git().update_environment(GIT_PYTHON_GIT_EXECUTABLE=config['default']['git_exe'])


setup_environment()


try:
    if sys.argv[1] == "--clone":
        gitclone(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "--check":
        gitcheck(sys.argv[2], False)
    elif sys.argv[1] == "--fetch":
        gitcheck(sys.argv[2], True)
    elif sys.argv[1] == "--pull":
        gitpull(sys.argv[2])
    elif sys.argv[1] == "--apply-snapshot":
        apply_snapshot(sys.argv[2])
    sys.exit(0)
except Exception as e:
    print(e)
    sys.exit(-1)
    
    
