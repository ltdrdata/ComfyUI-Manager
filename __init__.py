legacy_manager_core_path = None
manager_core_path = None


def is_manager_core_exists():
    global legacy_manager_core_path
    global manager_core_path
    import os
    import folder_paths

    comfy_path = os.path.dirname(folder_paths.__file__)
    legacy_manager_core_path = os.path.join(comfy_path, 'custom_nodes', 'manager-core')
    manager_core_path = legacy_manager_core_path

    manager_core_path_file = os.path.join(comfy_path, 'manager_core_path.txt')
    if os.path.exists(manager_core_path_file):
        with open(manager_core_path_file, 'r') as f:
            manager_core_path = os.path.join(f.read().strip(), 'manager-core')

    return os.path.exists(manager_core_path) or os.path.exists(legacy_manager_core_path)


if not is_manager_core_exists():
    from .modules import migration_server
    migration_server.manager_core_path = manager_core_path

    WEB_DIRECTORY = "migration_js"
    NODE_CLASS_MAPPINGS = {}
else:
    # Main code
    from .modules import manager_ext_server
    from .modules import share_3rdparty

    WEB_DIRECTORY = "js"

    NODE_CLASS_MAPPINGS = {}
    __all__ = ['NODE_CLASS_MAPPINGS']