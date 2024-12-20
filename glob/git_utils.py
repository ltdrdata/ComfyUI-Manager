import os

import git


def is_git_repo(path: str) -> bool:
    """ Check if the path is a git repository. """
    try:
        # Try to create a Repo object from the path
        _ = git.Repo(path).git_dir
        return True
    except git.exc.InvalidGitRepositoryError:
        return False


def get_commit_hash(fullpath):
    git_head = os.path.join(fullpath, '.git', 'HEAD')
    if os.path.exists(git_head):
        with open(git_head) as f:
            line = f.readline()

            if line.startswith("ref: "):
                ref = os.path.join(fullpath, '.git', line[5:].strip())
                if os.path.exists(ref):
                    with open(ref) as f2:
                        return f2.readline().strip()
                else:
                    return "unknown"
            else:
                return line

    return "unknown"
