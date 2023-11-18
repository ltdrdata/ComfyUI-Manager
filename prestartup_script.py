import datetime
import os
import subprocess
import sys
import atexit
import threading
import re
import locale


message_collapses = []


def register_message_collapse(f):
    global message_collapses
    message_collapses.append(f)


sys.__comfyui_manager_register_message_collapse = register_message_collapse

comfyui_manager_path = os.path.dirname(__file__)
custom_nodes_path = os.path.join(comfyui_manager_path, "..")
startup_script_path = os.path.join(comfyui_manager_path, "startup-scripts")
restore_snapshot_path = os.path.join(startup_script_path, "restore-snapshot.json")
git_script_path = os.path.join(comfyui_manager_path, "git_helper.py")


def handle_stream(stream, prefix):
    stream.reconfigure(encoding=locale.getpreferredencoding(), errors='replace')
    for msg in stream:
        if prefix == '[!]' and ('it/s]' in msg or 's/it]' in msg) and ('%|' in msg or 'it [' in msg):
            if msg.startswith('100%'):
                print('\r' + msg, end="", file=sys.stderr),
            else:
                print('\r' + msg[:-1], end="", file=sys.stderr),
        else:
            if prefix == '[!]':
                print(prefix, msg, end="", file=sys.stderr)
            else:
                print(prefix, msg, end="")


def process_wrap(cmd_str, cwd_path, handler=None):
    process = subprocess.Popen(cmd_str, cwd=cwd_path, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

    if handler is None:
        handler = handle_stream

    stdout_thread = threading.Thread(target=handler, args=(process.stdout, ""))
    stderr_thread = threading.Thread(target=handler, args=(process.stderr, "[!]"))

    stdout_thread.start()
    stderr_thread.start()

    stdout_thread.join()
    stderr_thread.join()

    return process.wait()


try:
    if '--port' in sys.argv:
        port_index = sys.argv.index('--port')
        if port_index + 1 < len(sys.argv):
            port = int(sys.argv[port_index + 1])
            postfix = f"_{port}"
    else:
        postfix = ""

    # Logger setup
    if os.path.exists(f"comfyui{postfix}.log"):
        if os.path.exists(f"comfyui{postfix}.prev.log"):
            if os.path.exists(f"comfyui{postfix}.prev2.log"):
                os.remove(f"comfyui{postfix}.prev2.log")
            os.rename(f"comfyui{postfix}.prev.log", f"comfyui{postfix}.prev2.log")
        os.rename(f"comfyui{postfix}.log", f"comfyui{postfix}.prev.log")

    original_stdout = sys.stdout
    original_stderr = sys.stderr

    tqdm = r'\d+%.*\[(.*?)\]'

    log_file = open(f"comfyui{postfix}.log", "w", encoding="utf-8")
    log_lock = threading.Lock()

    class Logger:
        def __init__(self, is_stdout):
            self.is_stdout = is_stdout

        def fileno(self):
            try:
                if self.is_stdout:
                    return original_stdout.fileno()
                else:
                    return original_stderr.fileno()
            except AttributeError:
                # Handle error
                raise ValueError("The object does not have a fileno method")

        def write(self, message):
            if any(f(message) for f in message_collapses):
                return

            if not self.is_stdout:
                match = re.search(tqdm, message)
                if match:
                    message = re.sub(r'([#|])\d', r'\1▌', message)
                    message = re.sub('#', '█', message)
                    if '100%' in message:
                        self.sync_write(message)
                    else:
                        original_stderr.write(message)
                        original_stderr.flush()
                else:
                    self.sync_write(message)
            else:
                self.sync_write(message)

        def sync_write(self, message):
            with log_lock:
                log_file.write(message)
                log_file.flush()

            if self.is_stdout:
                original_stdout.write(message)
                original_stdout.flush()
            else:
                original_stderr.write(message)
                original_stderr.flush()

        def flush(self):
            log_file.flush()
            if self.is_stdout:
                original_stdout.flush()
            else:
                original_stderr.flush()

        def reconfigure(self, *args, **kwargs):
            pass


    def close_log():
        log_file.close()


    sys.stdout = Logger(True)
    sys.stderr = Logger(False)

    atexit.register(close_log)
except Exception as e:
    print(f"[ComfyUI-Manager] Logging failed: {e}")


print("** ComfyUI start up time:", datetime.datetime.now())


def check_bypass_ssl():
    try:
        import configparser
        import ssl
        config_path = os.path.join(os.path.dirname(__file__), "config.ini")
        config = configparser.ConfigParser()
        config.read(config_path)
        default_conf = config['default']

        if 'bypass_ssl' in default_conf and default_conf['bypass_ssl'].lower() == 'true':
            print(f"[ComfyUI-Manager] WARN: Unsafe - SSL verification option is Enabled. (see ComfyUI-Manager/config.ini)")
            ssl._create_default_https_context = ssl._create_unverified_context  # SSL certificate error fix.
    except Exception:
        pass


check_bypass_ssl()


if os.path.exists(restore_snapshot_path):
    try:
        import json

        cloned_repos = []

        def msg_capture(stream, prefix):
            stream.reconfigure(encoding=locale.getpreferredencoding(), errors='replace')
            for msg in stream:
                if msg.startswith("CLONE: "):
                    cloned_repos.append(msg[7:])
                    if prefix == '[!]':
                        print(prefix, msg, end="", file=sys.stderr)
                    else:
                        print(prefix, msg, end="")

                elif prefix == '[!]' and ('it/s]' in msg or 's/it]' in msg) and ('%|' in msg or 'it [' in msg):
                    if msg.startswith('100%'):
                        print('\r' + msg, end="", file=sys.stderr),
                    else:
                        print('\r'+msg[:-1], end="", file=sys.stderr),
                else:
                    if prefix == '[!]':
                        print(prefix, msg, end="", file=sys.stderr)
                    else:
                        print(prefix, msg, end="")

        print(f"[ComfyUI-Manager] Restore snapshot.")
        cmd_str = [sys.executable, git_script_path, '--apply-snapshot', restore_snapshot_path]
        exit_code = process_wrap(cmd_str, custom_nodes_path, handler=msg_capture)

        with open(restore_snapshot_path, 'r', encoding="UTF-8") as json_file:
            info = json.load(json_file)
            for url in cloned_repos:
                try:
                    repository_name = url.split("/")[-1].strip()
                    repo_path = os.path.join(custom_nodes_path, repository_name)
                    repo_path = os.path.abspath(repo_path)

                    requirements_path = os.path.join(repo_path, 'requirements.txt')
                    install_script_path = os.path.join(repo_path, 'install.py')

                    this_exit_code = 0

                    if os.path.exists(requirements_path):
                        with open(requirements_path, 'r', encoding="UTF-8") as file:
                            for line in file:
                                package_name = line.strip()
                                if package_name:
                                    install_cmd = [sys.executable, "-m", "pip", "install", package_name]
                                    this_exit_code += process_wrap(install_cmd, repo_path)

                    if os.path.exists(install_script_path):
                        install_cmd = [sys.executable, install_script_path]
                        print(f">>> {install_cmd} / {repo_path}")
                        this_exit_code += process_wrap(install_cmd, repo_path)

                    if this_exit_code != 0:
                        print(f"[ComfyUI-Manager] Restoring '{repository_name}' is failed.")

                except Exception as e:
                    print(e)
                    print(f"[ComfyUI-Manager] Restoring '{repository_name}' is failed.")

        if exit_code != 0:
            print(f"[ComfyUI-Manager] Restore snapshot failed.")
        else:
            print(f"[ComfyUI-Manager] Restore snapshot done.")

    except Exception as e:
        print(e)
        print(f"[ComfyUI-Manager] Restore snapshot failed.")

    os.remove(restore_snapshot_path)


# Perform install
script_list_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "startup-scripts", "install-scripts.txt")

# Check if script_list_path exists
if os.path.exists(script_list_path):
    print("\n#######################################################################")
    print("[ComfyUI-Manager] Starting dependency installation/(de)activation for the extension\n")

    executed = set()
    # Read each line from the file and convert it to a list using eval
    with open(script_list_path, 'r', encoding="UTF-8") as file:
        for line in file:
            if line in executed:
                continue

            executed.add(line)

            try:
                script = eval(line)
                if os.path.exists(script[0]):
                    print(f"\n## ComfyUI-Manager: EXECUTE => {script[1:]}")

                    print(f"\n## Execute install/(de)activation script for '{script[0]}'")
                    exit_code = process_wrap(script[1:], script[0])

                    if exit_code != 0:
                        print(f"install/(de)activation script failed: {script[0]}")
                else:
                    print(f"\n## ComfyUI-Manager: CANCELED => {script[1:]}")

            except Exception as e:
                print(f"[ERROR] Failed to execute install/(de)activation script: {line} / {e}")

    # Remove the script_list_path file
    if os.path.exists(script_list_path):
        os.remove(script_list_path)
        
    print("\n[ComfyUI-Manager] Startup script completed.")
    print("#######################################################################\n")

