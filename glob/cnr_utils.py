from manager_util import *
import zipfile
import requests
from dataclasses import dataclass
from typing import List

base_url = "https://api.comfy.org"


async def get_cnr_data(page=1, limit=1000, cache_mode=True):
    try:
        uri = f'{base_url}/nodes?page={page}&limit={limit}'
        json_obj = await get_data_with_cache(uri, cache_mode=cache_mode)

        for v in json_obj['nodes']:
            if 'latest_version' not in v:
                v['latest_version'] = dict(version='nightly')

        return json_obj['nodes']
    except:
        res = {}
        print(f"Cannot connect to comfyregistry.")

    return res


@dataclass
class NodeVersion:
    changelog: str
    dependencies: List[str]
    deprecated: bool
    id: str
    version: str
    download_url: str


def map_node_version(api_node_version):
    """
    Maps node version data from API response to NodeVersion dataclass.

    Args:
        api_data (dict): The 'node_version' part of the API response.

    Returns:
        NodeVersion: An instance of NodeVersion dataclass populated with data from the API.
    """
    return NodeVersion(
        changelog=api_node_version.get(
            "changelog", ""
        ),  # Provide a default value if 'changelog' is missing
        dependencies=api_node_version.get(
            "dependencies", []
        ),  # Provide a default empty list if 'dependencies' is missing
        deprecated=api_node_version.get(
            "deprecated", False
        ),  # Assume False if 'deprecated' is not specified
        id=api_node_version[
            "id"
        ],  # 'id' should be mandatory; raise KeyError if missing
        version=api_node_version[
            "version"
        ],  # 'version' should be mandatory; raise KeyError if missing
        download_url=api_node_version.get(
            "downloadUrl", ""
        ),  # Provide a default value if 'downloadUrl' is missing
    )


def install_node(node_id, version=None):
    """
    Retrieves the node version for installation.

    Args:
      node_id (str): The unique identifier of the node.
      version (str, optional): Specific version of the node to retrieve. If omitted, the latest version is returned.

    Returns:
      NodeVersion: Node version data or error message.
    """
    if version is None:
        url = f"{base_url}/nodes/{node_id}/install"
    else:
        url = f"{base_url}/nodes/{node_id}/install?version={version}"

    response = requests.get(url)
    if response.status_code == 200:
        # Convert the API response to a NodeVersion object
        return map_node_version(response.json())
    else:
        return None


def all_versions_of_node(node_id):
    url = f"https://api.comfy.org/nodes/{node_id}/versions"

    response = requests.get(url)
    if response.status_code == 200:
        return response.json()
    else:
        return None


def extract_package_as_zip(file_path, extract_path):
    try:
        with zipfile.ZipFile(file_path, "r") as zip_ref:
            zip_ref.extractall(extract_path)
            extracted_files = zip_ref.namelist()
        print(f"Extracted zip file to {extract_path}")
        return extracted_files
    except zipfile.BadZipFile:
        print(f"File '{file_path}' is not a zip or is corrupted.")
        return None
