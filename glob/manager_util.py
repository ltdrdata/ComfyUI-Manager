import subprocess
import sys

# DON'T USE StrictVersion - cannot handle pre_release version
# try:
#     from distutils.version import StrictVersion
# except:
#     print(f"[ComfyUI-Manager]  'distutils' package not found. Activating fallback mode for compatibility.")
class StrictVersion:
    def __init__(self, version_string):
        self.version_string = version_string
        self.major = 0
        self.minor = 0
        self.patch = 0
        self.pre_release = None
        self.parse_version_string()

    def parse_version_string(self):
        parts = self.version_string.split('.')
        if not parts:
            raise ValueError("Version string must not be empty")

        self.major = int(parts[0])
        self.minor = int(parts[1]) if len(parts) > 1 else 0
        self.patch = int(parts[2]) if len(parts) > 2 else 0

        # Handling pre-release versions if present
        if len(parts) > 3:
            self.pre_release = parts[3]

    def __str__(self):
        version = f"{self.major}.{self.minor}.{self.patch}"
        if self.pre_release:
            version += f"-{self.pre_release}"
        return version

    def __eq__(self, other):
        return (self.major, self.minor, self.patch, self.pre_release) == \
            (other.major, other.minor, other.patch, other.pre_release)

    def __lt__(self, other):
        if (self.major, self.minor, self.patch) == (other.major, other.minor, other.patch):
            return self.pre_release_compare(self.pre_release, other.pre_release) < 0
        return (self.major, self.minor, self.patch) < (other.major, other.minor, other.patch)

    @staticmethod
    def pre_release_compare(pre1, pre2):
        if pre1 == pre2:
            return 0
        if pre1 is None:
            return 1
        if pre2 is None:
            return -1
        return -1 if pre1 < pre2 else 1

    def __le__(self, other):
        return self == other or self < other

    def __gt__(self, other):
        return not self <= other

    def __ge__(self, other):
        return not self < other

    def __ne__(self, other):
        return not self == other


pip_map = None

def get_installed_packages(renew=False):
    global pip_map

    if renew or pip_map is None:
        try:
            result = subprocess.check_output([sys.executable, '-m', 'pip', 'list'], universal_newlines=True)

            pip_map = {}
            for line in result.split('\n'):
                x = line.strip()
                if x:
                    y = line.split()
                    if y[0] == 'Package' or y[0].startswith('-'):
                        continue

                    pip_map[y[0]] = y[1]
        except subprocess.CalledProcessError as e:
            print(f"[ComfyUI-Manager] Failed to retrieve the information of installed pip packages.")
            return set()

    return pip_map


def clear_pip_cache():
    global pip_map
    pip_map = None


torch_torchvision_version_map = {
    '2.5.1': '0.20.1',
    '2.5.0': '0.20.0',
    '2.4.1': '0.19.1',
    '2.4.0': '0.19.0',
    '2.3.1': '0.18.1',
    '2.3.0': '0.18.0',
    '2.2.2': '0.17.2',
    '2.2.1': '0.17.1',
    '2.2.0': '0.17.0',
    '2.1.2': '0.16.2',
    '2.1.1': '0.16.1',
    '2.1.0': '0.16.0',
    '2.0.1': '0.15.2',
    '2.0.0': '0.15.1',
}


class PIPFixer:
    def __init__(self, prev_pip_versions):
        self.prev_pip_versions = { **prev_pip_versions }

    def torch_rollback(self):
        spec = self.prev_pip_versions['torch'].split('+')
        if len(spec) > 0:
            platform = spec[1]
        else:
            cmd = [sys.executable, '-m', 'pip', 'install', '--force', 'torch', 'torchvision', 'torchaudio']
            subprocess.check_output(cmd, universal_newlines=True)
            print(cmd)
            return

        torch_ver = StrictVersion(spec[0])
        torch_ver = f"{torch_ver.major}.{torch_ver.minor}.{torch_ver.patch}"
        torchvision_ver = torch_torchvision_version_map.get(torch_ver)

        if torchvision_ver is None:
            cmd = [sys.executable, '-m', 'pip', 'install', '--pre',
                   'torch', 'torchvision', 'torchaudio',
                   '--index-url', f"https://download.pytorch.org/whl/nightly/{platform}"]
            print("[manager-core] restore PyTorch to nightly version")
        else:
            cmd = [sys.executable, '-m', 'pip', 'install',
                   f'torch=={torch_ver}', f'torchvision=={torchvision_ver}', f"torchaudio=={torch_ver}",
                   '--index-url', f"https://download.pytorch.org/whl/{platform}"]
            print(f"[manager-core] restore PyTorch to {torch_ver}+{platform}")

        subprocess.check_output(cmd, universal_newlines=True)

    def fix_broken(self):
        new_pip_versions = get_installed_packages(True)

        # remove `comfy` python package
        try:
            if 'comfy' in new_pip_versions:
                cmd = [sys.executable, '-m', 'pip', 'uninstall', 'comfy']
                subprocess.check_output(cmd, universal_newlines=True)

                print(f"[manager-core] 'comfy' python package is uninstalled.\nWARN: The 'comfy' package is completely unrelated to ComfyUI and should never be installed as it causes conflicts with ComfyUI.")
        except Exception as e:
            print(f"[manager-core] Failed to uninstall `comfy` python package")
            print(e)

        # fix torch - reinstall torch packages if version is changed
        try:
            if self.prev_pip_versions['torch'] != new_pip_versions['torch'] \
                or self.prev_pip_versions['torchvision'] != new_pip_versions['torchvision'] \
                or self.prev_pip_versions['torchaudio'] != new_pip_versions['torchaudio']:
                    self.torch_rollback()
        except Exception as e:
            print(f"[manager-core] Failed to restore PyTorch")
            print(e)

        # fix opencv
        try:
            ocp = new_pip_versions.get('opencv-contrib-python')
            ocph = new_pip_versions.get('opencv-contrib-python-headless')
            op = new_pip_versions.get('opencv-python')
            oph = new_pip_versions.get('opencv-python-headless')

            versions = [ocp, ocph, op, oph]
            versions = [StrictVersion(x) for x in versions if x is not None]
            versions.sort(reverse=True)

            if len(versions) > 0:
                # upgrade to maximum version
                targets = []
                cur = versions[0]
                if ocp is not None and StrictVersion(ocp) != cur:
                    targets.append('opencv-contrib-python')
                if ocph is not None and StrictVersion(ocph) != cur:
                    targets.append('opencv-contrib-python-headless')
                if op is not None and StrictVersion(op) != cur:
                    targets.append('opencv-python')
                if oph is not None and StrictVersion(oph) != cur:
                    targets.append('opencv-python-headless')

                if len(targets) > 0:
                    for x in targets:
                        cmd = [sys.executable, '-m', 'pip', 'install', f"{x}=={versions[0].version_string}"]
                        subprocess.check_output(cmd, universal_newlines=True)

                    print(f"[manager-core] 'opencv' dependencies were fixed: {targets}")
        except Exception as e:
            print(f"[manager-core] Failed to restore opencv")
            print(e)

        # fix numpy
        try:
            np = new_pip_versions.get('numpy')
            if np is not None:
                if StrictVersion(np) >= StrictVersion('2'):
                    subprocess.check_output([sys.executable, '-m', 'pip', 'install', f"numpy<2"], universal_newlines=True)
        except Exception as e:
            print(f"[manager-core] Failed to restore numpy")
            print(e)
