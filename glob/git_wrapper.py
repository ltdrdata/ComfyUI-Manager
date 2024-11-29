import pygit2
import os
from tqdm import tqdm
import traceback

class GitProgress(pygit2.RemoteCallbacks):
    def __init__(self):
        super().__init__()
        self.pbar = None

    def transfer_progress(self, stats):
        if self.pbar is None:
            self.pbar = tqdm(total=stats.total_objects, unit="obj", desc="Fetching objects")
        self.pbar.n = stats.received_objects
        self.pbar.refresh()
        if stats.received_objects == stats.total_objects:
            self.pbar.close()
            self.pbar = None


class Remote:
    def __init__(self, repo, remote):
        self.repo = repo
        self.remote = remote

    def get_default_branch(self, remote_name='origin'):
        remote = self.repo.remotes[remote_name]
        remote.fetch()  # Fetch latest data from the remote

        # Look for the remote HEAD reference
        head_ref = f'refs/remotes/{remote_name}/HEAD'
        if head_ref in self.repo.references:
            # Resolve the symbolic reference to get the actual branch
            target_ref = self.repo.references[head_ref].resolve().name
            return target_ref.replace(f'refs/remotes/{remote_name}/', '')
        else:
            raise ValueError(f"Could not determine the default branch for remote '{remote_name}'")


    def pull(self, remote_name='origin'):
        try:
            # Detect if we are in detached HEAD state
            if self.repo.head_is_detached:
                # Find the default branch
                branch_name = self.get_default_branch(remote_name)
                
                # Checkout the branch if exists, or create it
                branch_ref = f"refs/heads/{branch_name}"
                if branch_ref in self.repo.references:
                    self.repo.checkout(branch_ref)
                else:
                    # Create and checkout the branch
                    target_commit = self.repo.lookup_reference(f"refs/remotes/{remote_name}/{branch_name}").target
                    self.repo.create_branch(branch_name, self.repo[target_commit])
                    self.repo.checkout(branch_ref)
            
            # Get the current branch
            current_branch = self.repo.head.shorthand
            
            # Fetch from the remote
            remote = self.repo.remotes[remote_name]
            remote.fetch()
            
            # Merge changes from the remote
            remote_branch_ref = f"refs/remotes/{remote_name}/{current_branch}"
            remote_branch = self.repo.lookup_reference(remote_branch_ref).target
            
            self.repo.merge(remote_branch)
            
            # Check for merge conflicts
            if self.repo.index.conflicts is not None:
                print("Merge conflicts detected!")
                for conflict in self.repo.index.conflicts:
                    print(f"Conflict: {conflict}")
                return
            
            # Commit the merge
            user = self.repo.default_signature
            merge_commit = self.repo.create_commit(
                'HEAD',
                user,
                user,
                f"Merge branch '{current_branch}' from {remote_name}",
                self.repo.index.write_tree(),
                [self.repo.head.target, remote_branch]
            )
        
        except Exception as e:
            traceback.print_exc()
            print(f"An error occurred: {e}")
            self.repo.state_cleanup()  # Clean up the merge state if necessary


class Repo:
    def __init__(self, repo_path):
        self.repo = pygit2.Repository(repo_path)

    def remote(self, name="origin"):
        return Remote(self.repo, self.repo.remotes[name])

    def update_recursive(self):
        update_submodules(self.repo)


def resolve_repository_state(repo):
    if repo.is_empty:
        raise ValueError("Repository is empty. Cannot proceed with submodule update.")

    try:
        state = repo.state()  # Call the state method
    except Exception as e:
        print(f"Error retrieving repository state: {e}")
        raise

    if state != pygit2.GIT_REPOSITORY_STATE_NONE:
        if state in (pygit2.GIT_REPOSITORY_STATE_MERGE, pygit2.GIT_REPOSITORY_STATE_REVERT):
            print(f"Conflict detected. Cleaning up repository state... {repo.path} / {state}")
            repo.state_cleanup()
            print("Repository state cleaned up.")
        else:
            raise RuntimeError(f"Unsupported repository state: {state}")


def update_submodules(repo):
    try:
        resolve_repository_state(repo)
    except Exception as e:
        print(f"Error resolving repository state: {e}")
        return

    gitmodules_path = os.path.join(repo.workdir, ".gitmodules")
    if not os.path.exists(gitmodules_path):
        return

    with open(gitmodules_path, "r") as f:
        lines = f.readlines()

    submodules = []
    submodule_path = None
    submodule_url = None

    for line in lines:
        if line.strip().startswith("[submodule"):
            if submodule_path and submodule_url:
                submodules.append((submodule_path, submodule_url))
            submodule_path = None
            submodule_url = None
        elif line.strip().startswith("path ="):
            submodule_path = line.strip().split("=", 1)[1].strip()
        elif line.strip().startswith("url ="):
            submodule_url = line.strip().split("=", 1)[1].strip()

    if submodule_path and submodule_url:
        submodules.append((submodule_path, submodule_url))

    for path, url in submodules:
        submodule_repo_path = os.path.join(repo.workdir, path)

        print(f"submodule_repo_path: {submodule_repo_path}")

        if not os.path.exists(submodule_repo_path):
            print(f"Cloning submodule {path}...")
            pygit2.clone_repository(url, submodule_repo_path, callbacks=GitProgress())
        else:
            print(f"Updating submodule {path}...")
            submodule_repo = Repo(submodule_repo_path)
            submodule_repo.remote("origin").pull()

        update_submodules(submodule_repo)


def clone_from(git_url, repo_dir, recursive=True):
    pygit2.clone_repository(git_url, repo_dir, callbacks=GitProgress())
    Repo(repo_dir).update_recursive()
