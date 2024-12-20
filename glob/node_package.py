from __future__ import annotations

from dataclasses import dataclass
import os

import toml

from git_helper import is_git_repo


@dataclass
class InstalledNodePackage:
    """Information about an installed node package."""

    id: str
    fullpath: str
    disabled: bool
    version: str

    @property
    def is_unknown(self) -> bool:
        return self.version == "unknown"

    @property
    def is_nightly(self) -> bool:
        return self.version == "nightly"

    @property
    def is_from_cnr(self) -> bool:
        return not self.is_unknown and not self.is_nightly

    @property
    def is_enabled(self) -> bool:
        return not self.disabled

    @property
    def is_disabled(self) -> bool:
        return self.disabled

    @staticmethod
    def from_fullpath(fullpath: str) -> InstalledNodePackage:
        parent_folder_name = os.path.split(fullpath)[-2]
        module_name = os.path.basename(fullpath)
        pyproject_toml_path = os.path.join(fullpath, "pyproject.toml")

        if module_name.endswith(".disabled"):
            node_id = module_name[:-9]
            disabled = True
        elif parent_folder_name == ".disabled":
            # Nodes under custom_nodes/.disabled/* are disabled
            node_id = module_name
            disabled = True
        else:
            node_id = module_name
            disabled = False

        if is_git_repo(fullpath):
            version = "nightly"
        elif os.path.exists(pyproject_toml_path):
            # Read project.toml to get the version
            with open(pyproject_toml_path, "r", encoding="utf-8") as f:
                pyproject_toml = toml.load(f)
                # Fallback to 'unknown' if project.version doesn't exist
                version = pyproject_toml.get("project", {}).get("version", "unknown")
        else:
            version = "unknown"

        return InstalledNodePackage(
            id=node_id, fullpath=fullpath, disabled=disabled, version=version
        )
