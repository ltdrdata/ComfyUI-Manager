import git
from aiohttp import web
from server import PromptServer

manager_core_path = None
manager_core_url = "https://github.com/Comfy-Org/manager-core"

@PromptServer.instance.routes.get("/manager/install_manager_core")
def install_manager_core(request):
    if manager_core_path is not None:
        repo = git.Repo.clone_from(manager_core_url, manager_core_path)
        repo.git.clear_cache()
        repo.close()
    else:
        print(f"[ComfyUI Manager] Failed to install `manager-core`")

    return web.Response(status=200)
