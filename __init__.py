import shutil
import folder_paths
import os, sys
import subprocess


sys.path.append('../..')

from torchvision.datasets.utils import download_url

# ensure .js
print("### Loading: ComfyUI-Manager")

comfy_path = os.path.dirname(folder_paths.__file__)
custom_nodes_path = os.path.join(comfy_path, 'custom_nodes')

def setup_js():
    impact_path = os.path.dirname(__file__)
    js_dest_path = os.path.join(comfy_path, "web", "extensions", "core")
    js_src_path = os.path.join(impact_path, "js", "comfyui-manager.js")
    shutil.copy(js_src_path, js_dest_path)
    
setup_js()


# Expand Server api

import server
from aiohttp import web
import aiohttp
import json
import zipfile
import urllib.request


def get_model_path(data):
    if data['save_path'] != 'default':
        base_model = os.path.join(folder_paths.models_dir, data['save_path'])
    else:
        model_type = data['type']
        if model_type == "checkpoints":
            base_model = folder_paths.folder_names_and_paths["checkpoints"][0][0]
        elif model_type == "unclip":
            base_model = folder_paths.folder_names_and_paths["checkpoints"][0][0]
        elif model_type == "VAE":
            base_model = folder_paths.folder_names_and_paths["vae"][0][0]
        elif model_type == "lora":
            base_model = folder_paths.folder_names_and_paths["loras"][0][0]
        elif model_type == "T2I-Adapter":
            base_model = folder_paths.folder_names_and_paths["controlnet"][0][0]
        elif model_type == "T2I-Style":
            base_model = folder_paths.folder_names_and_paths["controlnet"][0][0]
        elif model_type == "controlnet":
            base_model = folder_paths.folder_names_and_paths["controlnet"][0][0]
        elif model_type == "clip_vision":
            base_model = folder_paths.folder_names_and_paths["clip_vision"][0][0]
        elif model_type == "gligen":
            base_model = folder_paths.folder_names_and_paths["gligen"][0][0]
        elif model_type == "upscale":
            base_model = folder_paths.folder_names_and_paths["upscale_models"][0][0]
        else:
            base_model = None

    return os.path.join(base_model, data['filename'])


def check_custom_node_installed(json_obj):
    for item in json_obj['custom_nodes']:
        item['installed'] = 'None'

        if item['install_type'] == 'git-clone' and len(item['files']) == 1:
            dir_name = os.path.splitext(os.path.basename(item['files'][0]))[0].replace(".git", "")
            dir_path = os.path.join(custom_nodes_path, dir_name)
            if os.path.exists(dir_path):
                item['installed'] = 'True'
            else:
                item['installed'] = 'False'

        elif item['install_type'] == 'copy' and len(item['files']) == 1:
            dir_name = os.path.basename(item['files'][0])
            dir_path = os.path.join(custom_nodes_path, dir_name)
            if os.path.exists(dir_path):
                item['installed'] = 'True'
            else:
                item['installed'] = 'False'


@server.PromptServer.instance.routes.post("/customnode/getlist")
async def fetch_customnode_list(request):
    url = 'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/custom-node-list.json'
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            json_text = await resp.text()
            json_obj = json.loads(json_text)

            check_custom_node_installed(json_obj)

            return web.json_response(json_obj, content_type='application/json')


def check_model_installed(json_obj):
    for item in json_obj['models']:
        item['installed'] = 'None'

        model_path = get_model_path(item)

        if model_path is not None:
            if os.path.exists(model_path):
                item['installed'] = 'True'
            else:
                item['installed'] = 'False'


@server.PromptServer.instance.routes.post("/externalmodel/getlist")
async def fetch_externalmodel_list(request):
    url = 'https://raw.githubusercontent.com/ltdrdata/ComfyUI-Manager/main/model-list.json'
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            json_text = await resp.text()
            json_obj = json.loads(json_text)

            check_model_installed(json_obj)

            return web.json_response(json_obj, content_type='application/json')


def unzip_install(files):
    temp_filename = 'manager-temp.zip'
    for url in files:
        try:
            headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'}
            
            req = urllib.request.Request(url, headers=headers)
            response = urllib.request.urlopen(req)
            data = response.read()

            with open(temp_filename, 'wb') as f:
                f.write(data)

            with zipfile.ZipFile(temp_filename, 'r') as zip_ref:
                zip_ref.extractall(custom_nodes_path)

            os.remove(temp_filename)
        except Exception as e:
            print(f"Install(unzip) error: {url} / {e}")
            return False
    
    print("Installation successful.")
    return True


def download_url_with_agent(url, save_path):
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3'}

        req = urllib.request.Request(url, headers=headers)
        response = urllib.request.urlopen(req)
        data = response.read()

        with open(save_path, 'wb') as f:
            f.write(data)

    except Exception as e:
        print(f"Download error: {url} / {e}")
        return False

    print("Installation successful.")
    return True


def copy_install(files):
    for url in files:
        try:
            download_url(url, custom_nodes_path)
        except Exception as e:
            print(f"Install(copy) error: {url} / {e}")
            return False
    
    print("Installation successful.")
    return True


def gitclone_install(files):
    print(f"install: {files}")
    for url in files:
        try:
            print(f"Download: git clone '{url}'")
            clone_cmd = ["git", "clone", url]
            code = subprocess.run(clone_cmd, cwd=custom_nodes_path)
            
            if code.returncode != 0:
                print(f"git-clone failed: {url}")
                return False
                
            repo_name = os.path.splitext(os.path.basename(url))[0]
            repo_path = os.path.join(custom_nodes_path, repo_name)

            install_script_path = os.path.join(repo_path, "install.py")
            requirements_path = os.path.join(repo_path, "requirements.txt")

            if os.path.exists(requirements_path):
                print(f"Install: pip packages")
                install_cmd = ["python", "-m", "pip", "install", "-r", "requirements.txt"]
                code = subprocess.run(install_cmd, cwd=repo_path)
                
                if code.returncode != 0:
                    print(f"install script failed: {url}")
                    return False
                
            if os.path.exists(install_script_path):
                print(f"Install: install script")
                install_cmd = ["python", "install.py"]
                code = subprocess.run(install_cmd, cwd=repo_path)
                
                if code.returncode != 0:
                    print(f"install script failed: {url}")
                    return False
            
        except Exception as e:
            print(f"Install(git-clone) error: {url} / {e}")
            return False
        
    print("Installation successful.")
    return True


@server.PromptServer.instance.routes.post("/customnode/install")
async def install_custom_node(request):
    json_data = await request.json()
    
    install_type = json_data['install_type']
    
    print(f"Install custom node '{json_data['title']}'")

    res = False

    if install_type == "unzip":
        res = unzip_install(json_data['files'])

    if install_type == "copy":
        res = copy_install(json_data['files'])
        
    elif install_type == "git-clone":
        res = gitclone_install(json_data['files'])
    
    if res:
        return web.json_response({}, content_type='application/json')
    
    return web.Response(status=400)


@server.PromptServer.instance.routes.post("/model/install")
async def install_model(request):
    json_data = await request.json()

    model_path = get_model_path(json_data)

    res = False

    if model_path is not None:
        print(f"Install model '{json_data['name']}' into '{model_path}'")
        res = download_url_with_agent(json_data['url'], model_path)
    else:
        print(f"Model installation error: invalid model type - {json_data['type']}")

    if res:
        return web.json_response({}, content_type='application/json')

    return web.Response(status=400)
