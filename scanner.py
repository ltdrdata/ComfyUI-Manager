import ast
import re
import os
import json
from git import Repo
from torchvision.datasets.utils import download_url
import concurrent

builtin_nodes = set()

import sys


# prepare temp dir
if len(sys.argv) > 1:
    temp_dir = sys.argv[1]
else:
    temp_dir = os.path.join(os.getcwd(), ".tmp")

if not os.path.exists(temp_dir):
    os.makedirs(temp_dir)

print(f"TEMP DIR: {temp_dir}")


def extract_nodes(code_text):
    try:
        parsed_code = ast.parse(code_text)

        assignments = (node for node in parsed_code.body if isinstance(node, ast.Assign))

        for assignment in assignments:
            if isinstance(assignment.targets[0], ast.Name) and assignment.targets[0].id == 'NODE_CLASS_MAPPINGS':
                node_class_mappings = assignment.value
                break
        else:
            node_class_mappings = None

        if node_class_mappings:
            s = set([key.s.strip() for key in node_class_mappings.keys if key is not None])
            return s
        else:
            return set()
    except:
        return set()


# scan
def scan_in_file(filename, is_builtin=False):
    global builtin_nodes

    try:
        with open(filename, encoding='utf-8') as file:
            code = file.read()
    except UnicodeDecodeError:
        with open(filename, encoding='cp949') as file:
            code = file.read()

    pattern = r"_CLASS_MAPPINGS\s*=\s*{([^}]*)}"
    regex = re.compile(pattern, re.MULTILINE | re.DOTALL)

    nodes = set()
    class_dict = {}

    nodes |= extract_nodes(code)

    pattern2 = r'^[^=]*_CLASS_MAPPINGS\["(.*?)"\]'
    keys = re.findall(pattern2, code)
    for key in keys:
        nodes.add(key.strip())

    pattern3 = r'^[^=]*_CLASS_MAPPINGS\[\'(.*?)\'\]'
    keys = re.findall(pattern3, code)
    for key in keys:
        nodes.add(key.strip())

    matches = regex.findall(code)
    for match in matches:
        dict_text = match

        key_value_pairs = re.findall(r"\"([^\"]*)\"\s*:\s*([^,\n]*)", dict_text)
        for key, value in key_value_pairs:
            class_dict[key.strip()] = value.strip()

        key_value_pairs = re.findall(r"'([^']*)'\s*:\s*([^,\n]*)", dict_text)
        for key, value in key_value_pairs:
            class_dict[key.strip()] = value.strip()

        for key, value in class_dict.items():
            nodes.add(key.strip())

        update_pattern = r"_CLASS_MAPPINGS.update\s*\({([^}]*)}\)"
        update_match = re.search(update_pattern, code)
        if update_match:
            update_dict_text = update_match.group(1)
            update_key_value_pairs = re.findall(r"\"([^\"]*)\"\s*:\s*([^,\n]*)", update_dict_text)
            for key, value in update_key_value_pairs:
                class_dict[key.strip()] = value.strip()
                nodes.add(key.strip())

    metadata = {}
    lines = code.strip().split('\n')
    for line in lines:
        if line.startswith('@'):
            if line.startswith("@author:") or line.startswith("@title:") or line.startswith("@nickname:") or line.startswith("@description:"):
                key, value = line[1:].strip().split(':', 1)
                metadata[key.strip()] = value.strip()

    if is_builtin:
        builtin_nodes += set(nodes)
    else:
        for x in builtin_nodes:
            if x in nodes:
                nodes.remove(x)

    return nodes, metadata


def get_py_file_paths(dirname):
    file_paths = []
    
    for root, dirs, files in os.walk(dirname):
        if ".git" in root or "__pycache__" in root:
            continue

        for file in files:
            if file.endswith(".py"):
                file_path = os.path.join(root, file)
                file_paths.append(file_path)
    
    return file_paths


def get_nodes(target_dir):
    py_files = []
    directories = []
    
    for item in os.listdir(target_dir):
        if ".git" in item or "__pycache__" in item:
            continue

        path = os.path.abspath(os.path.join(target_dir, item))
        
        if os.path.isfile(path) and item.endswith(".py"):
            py_files.append(path)
        elif os.path.isdir(path):
            directories.append(path)
    
    return py_files, directories


def get_git_urls_from_json(json_file):
    with open(json_file, encoding='utf-8') as file:
        data = json.load(file)

        custom_nodes = data.get('custom_nodes', [])
        git_clone_files = []
        for node in custom_nodes:
            if node.get('install_type') == 'git-clone':
                files = node.get('files', [])
                if files:
                    git_clone_files.append((files[0], node.get('title'), node.get('nodename_pattern')))

    git_clone_files.append(("https://github.com/comfyanonymous/ComfyUI", "ComfyUI", None))

    return git_clone_files


def get_py_urls_from_json(json_file):
    with open(json_file, encoding='utf-8') as file:
        data = json.load(file)

        custom_nodes = data.get('custom_nodes', [])
        py_files = []
        for node in custom_nodes:
            if node.get('install_type') == 'copy':
                files = node.get('files', [])
                if files:
                    py_files.append((files[0], node.get('title'), node.get('nodename_pattern')))

    return py_files


def clone_or_pull_git_repository(git_url):
    repo_name = git_url.split("/")[-1].split(".")[0]
    repo_dir = os.path.join(temp_dir, repo_name)

    if os.path.exists(repo_dir):
        try:
            repo = Repo(repo_dir)
            origin = repo.remote(name="origin")
            origin.pull(rebase=True)
            repo.git.submodule('update', '--init', '--recursive')
            print(f"Pulling {repo_name}...")
        except Exception as e:
            print(f"Pulling {repo_name} failed: {e}")
    else:
        try:
            Repo.clone_from(git_url, repo_dir, recursive=True)
            print(f"Cloning {repo_name}...")
        except Exception as e:
            print(f"Cloning {repo_name} failed: {e}")


def update_custom_nodes():
    if not os.path.exists(temp_dir):
        os.makedirs(temp_dir)

    node_info = {}

    git_url_titles = get_git_urls_from_json('custom-node-list.json')

    def process_git_url_title(url, title, node_pattern):
        name = os.path.basename(url)
        if name.endswith(".git"):
            name = name[:-4]
        
        node_info[name] = (url, title, node_pattern)
        clone_or_pull_git_repository(url)

    with concurrent.futures.ThreadPoolExecutor(10) as executor:
        for url, title, node_pattern in git_url_titles:
            executor.submit(process_git_url_title, url, title, node_pattern)

    py_url_titles_and_pattern = get_py_urls_from_json('custom-node-list.json')

    def download_and_store_info(url_title_and_pattern):
        url, title, node_pattern = url_title_and_pattern
        name = os.path.basename(url)
        if name.endswith(".py"):
            node_info[name] = (url, title, node_pattern)

        try:
            download_url(url, temp_dir)
        except:
            print(f"[ERROR] Cannot download '{url}'")

    with concurrent.futures.ThreadPoolExecutor(10) as executor:
        executor.map(download_and_store_info, py_url_titles_and_pattern)

    return node_info


def gen_json(node_info):
    # scan from .py file
    node_files, node_dirs = get_nodes(temp_dir)

    comfyui_path = os.path.abspath(os.path.join(temp_dir, "ComfyUI"))
    node_dirs.remove(comfyui_path)
    node_dirs = [comfyui_path] + node_dirs

    data = {}
    for dirname in node_dirs:
        py_files = get_py_file_paths(dirname)
        metadata = {}
        
        nodes = set()
        for py in py_files:
            nodes_in_file, metadata_in_file = scan_in_file(py, dirname == "ComfyUI")
            nodes.update(nodes_in_file)
            metadata.update(metadata_in_file)
        
        dirname = os.path.basename(dirname)

        if len(nodes) > 0 or (dirname in node_info and node_info[dirname][2] is not None):
            nodes = list(nodes)
            nodes.sort()

            if dirname in node_info:
                git_url, title, node_pattern = node_info[dirname]
                metadata['title_aux'] = title
                if node_pattern is not None:
                    metadata['nodename_pattern'] = node_pattern
                data[git_url] = (nodes, metadata)
            else:
                print(f"WARN: {dirname} is removed from custom-node-list.json")

    for file in node_files:
        nodes, metadata = scan_in_file(file)

        if len(nodes) > 0 or (dirname in node_info and node_info[dirname][2] is not None):
            nodes = list(nodes)
            nodes.sort()

            file = os.path.basename(file)

            if file in node_info:
                url, title, node_pattern = node_info[file]
                metadata['title_aux'] = title
                if node_pattern is not None:
                    metadata['nodename_pattern'] = node_pattern
                data[url] = (nodes, metadata)
            else:
                print(f"Missing info: {file}")

    # scan from node_list.json file
    extensions = [name for name in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, name))]

    for extension in extensions:
        node_list_json_path = os.path.join(temp_dir, extension, 'node_list.json')
        if os.path.exists(node_list_json_path):
            git_url, title, node_pattern = node_info[extension]

            with open(node_list_json_path, 'r', encoding='utf-8') as f:
                node_list_json = json.load(f)

            metadata_in_url = {}
            if git_url not in data:
                nodes = set()
            else:
                nodes_in_url, metadata_in_url = data[git_url]
                nodes = set(nodes_in_url)

            for x, desc in node_list_json.items():
                nodes.add(x.strip())

            metadata_in_url['title_aux'] = title
            if node_pattern is not None:
                metadata_in_url['nodename_pattern'] = node_pattern
            nodes = list(nodes)
            nodes.sort()
            data[git_url] = (nodes, metadata_in_url)

    json_path = f"extension-node-map.json"
    with open(json_path, "w", encoding='utf-8') as file:
        json.dump(data, file, indent=4, sort_keys=True)


print("### ComfyUI Manager Node Scanner ###")

print("\n# Updating extensions\n")
updated_node_info = update_custom_nodes()

print("\n# 'extension-node-map.json' file is generated.\n")
gen_json(updated_node_info)

