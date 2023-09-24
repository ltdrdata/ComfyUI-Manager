import sys
import os
import git
import configparser

config_path = os.path.join(os.path.dirname(__file__), "config.ini")

def gitclone(custom_nodes_path, url):
    repo_name = os.path.splitext(os.path.basename(url))[0]
    repo_path = os.path.join(custom_nodes_path, repo_name)

    # Clone the repository from the remote URL
    repo = git.Repo.clone_from(url, repo_path, recursive=True)
    repo.git.clear_cache()
    repo.close()

def gitcheck(path, do_fetch=False):
    try:
        # Fetch the latest commits from the remote repository
        repo = git.Repo(path)

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
        origin = repo.remote(name='origin')
        origin.pull(rebase=True)
        repo.git.submodule('update', '--init', '--recursive')
        new_commit_hash = repo.head.commit.hexsha

        if commit_hash != new_commit_hash:
            print("CUSTOM NODE PULL: True")
        else:
            print("CUSTOM NODE PULL: None")
    except Exception as e:
        print(e)
        print("CUSTOM NODE PULL: False")

    repo.close()


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
    sys.exit(0)
except:
    sys.exit(-1)
    
    
