import os
import sys
import configparser
import manager_core as core
import cm_global
from manager_util import *
import shutil

import folder_paths
from comfy.cli_args import args
import latent_preview


version_code = [3, 0]
version_str = f"V{version_code[0]}.{version_code[1]}" + (f'.{version_code[2]}' if len(version_code) > 2 else '')

DEFAULT_CHANNEL = "https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main"

manager_ext_config_path = os.path.abspath(os.path.join(folder_paths.get_user_directory(), 'default', 'manager-ext.ini'))
cached_config = None

manager_ext_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
channel_list_path = os.path.join(manager_ext_path, 'channels.list')


def update_channel_dict():
    if not os.path.exists(channel_list_path):
        shutil.copy(channel_list_path+'.template', channel_list_path)

    core.get_channel_dict() # for the loading

    with open(os.path.join(manager_ext_path, 'channels.list'), 'r') as file:
        channels = file.read()
        for x in channels.split('\n'):
            channel_info = x.split("::")
            if len(channel_info) == 2:
                core.channel_dict[channel_info[0]] = channel_info[1]


update_channel_dict()


def get_current_preview_method():
    if args.preview_method == latent_preview.LatentPreviewMethod.Auto:
        return "auto"
    elif args.preview_method == latent_preview.LatentPreviewMethod.Latent2RGB:
        return "latent2rgb"
    elif args.preview_method == latent_preview.LatentPreviewMethod.TAESD:
        return "taesd"
    else:
        return "none"


def write_config():
    config = configparser.ConfigParser()
    config['default'] = {
        'preview_method': get_current_preview_method(),
        'share_option': get_config()['share_option'],
        'default_ui': get_config()['default_ui'],
        'component_policy': get_config()['component_policy'],
        'double_click_policy': get_config()['double_click_policy'],
        'security_level': get_config()['security_level'],
    }

    directory = os.path.dirname(manager_ext_config_path)
    if not os.path.exists(directory):
        os.makedirs(directory)

    with open(manager_ext_config_path, 'w') as configfile:
        config.write(configfile)


def read_config():
    try:
        config = configparser.ConfigParser()
        config.read(manager_ext_config_path)
        default_conf = config['default']

        # policy migration: disable_unsecure_features -> security_level
        security_level = default_conf['security_level'] if 'security_level' in default_conf else 'normal'

        return {
                    'preview_method': default_conf['preview_method'] if 'preview_method' in default_conf else get_current_preview_method(),
                    'share_option': default_conf['share_option'] if 'share_option' in default_conf else 'all',
                    'default_ui': default_conf['default_ui'] if 'default_ui' in default_conf else 'none',
                    'component_policy': default_conf['component_policy'] if 'component_policy' in default_conf else 'workflow',
                    'double_click_policy': default_conf['double_click_policy'] if 'double_click_policy' in default_conf else 'copy-all',
                    'security_level': security_level
               }

    except Exception:
        return {
            'preview_method': get_current_preview_method(),
            'share_option': 'all',
            'default_ui': 'none',
            'component_policy': 'workflow',
            'double_click_policy': 'copy-all',
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
