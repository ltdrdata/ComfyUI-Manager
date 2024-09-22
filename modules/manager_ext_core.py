import os
import sys
import configparser
import manager_core as core
import cm_global
from manager_util import *


version_code = [3, 0]
version_str = f"V{version_code[0]}.{version_code[1]}" + (f'.{version_code[2]}' if len(version_code) > 2 else '')

DEFAULT_CHANNEL = "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main"

config_path = os.path.join(comfyui_manager_path, "config.ini")
cached_config = None

def write_config():
    config = configparser.ConfigParser()
    config['default'] = {
        'share_option': get_config()['share_option'],
        "file_logging": get_config()['file_logging'],
        'default_ui': get_config()['default_ui'],
        'component_policy': get_config()['component_policy'],
        'double_click_policy': get_config()['double_click_policy'],
        'model_download_by_agent': get_config()['model_download_by_agent'],
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
        security_level = default_conf['security_level'] if 'security_level' in default_conf else 'normal'

        return {
                    'share_option': default_conf['share_option'] if 'share_option' in default_conf else 'all',
                    'default_ui': default_conf['default_ui'] if 'default_ui' in default_conf else 'none',
                    'component_policy': default_conf['component_policy'] if 'component_policy' in default_conf else 'workflow',
                    'double_click_policy': default_conf['double_click_policy'] if 'double_click_policy' in default_conf else 'copy-all',
                    'model_download_by_agent': default_conf['model_download_by_agent'].lower() == 'true' if 'model_download_by_agent' in default_conf else False,
                    'security_level': security_level
               }

    except Exception:
        return {
            'share_option': 'all',
            'default_ui': 'none',
            'component_policy': 'workflow',
            'double_click_policy': 'copy-all',
            'model_download_by_agent': False,
            'security_level': 'normal',
        }


def get_config():
    global cached_config

    if cached_config is None:
        cached_config = read_config()

    return cached_config


def pip_install(packages):
    install_cmd = ['#FORCE', sys.executable, "-m", "pip", "install", '-U'] + packages
    core.try_install_script('pip install via manager', '..', install_cmd)
