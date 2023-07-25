import git

repo_path = "."
if repo.is_dirty():
    repo.git.stash()

repo = git.Repo(repo_path)
repo.git.pull(rebase=True)
