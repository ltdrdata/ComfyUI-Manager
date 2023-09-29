import datetime
import os
import subprocess
import sys
import atexit
import threading
import re

try:
    # Logger setup
    if os.path.exists("comfyui.log"):
        if os.path.exists("comfyui.prev.log"):
            if os.path.exists("comfyui.prev2.log"):
                os.remove("comfyui.prev2.log")
            os.rename("comfyui.prev.log", "comfyui.prev2.log")
        os.rename("comfyui.log", "comfyui.prev.log")

    original_stdout = sys.stdout
    original_stderr = sys.stderr

    tqdm = r'\d+%.*\[(.*?)\]'

    log_file = open("comfyui.log", "w", encoding="utf-8")
    log_lock = threading.Lock()

    class Logger:
        def __init__(self, is_stdout):
            self.is_stdout = is_stdout

        def write(self, message):
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


    def handle_stream(stream, prefix):
        for line in stream:
            print(prefix, line, end="")


    def close_log():
        log_file.close()


    sys.stdout = Logger(True)
    sys.stderr = Logger(False)

    atexit.register(close_log)
except Exception as e:
    print(f"[ComfyUI-Manager] Logging failed: {e}")


print("** ComfyUI start up time:", datetime.datetime.now())


# Perform install
script_list_path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "startup-scripts", "install-scripts.txt")

# Check if script_list_path exists
if os.path.exists(script_list_path):
    print("\n#######################################################################")
    print("[ComfyUI-Manager] Starting dependency installation/(de)activation for the extension\n")

    executed = set()
    # Read each line from the file and convert it to a list using eval
    with open(script_list_path, 'r') as file:
        for line in file:
            if line in executed:
                continue

            executed.add(line)

            try:
                script = eval(line)
                print(f"\n## ComfyUI-Manager: EXECUTE => {script[1:]}")

                print(f"\n## Execute install/(de)activation script for '{script[0]}'")
                process = subprocess.Popen(script[1:], cwd=script[0], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1)

                stdout_thread = threading.Thread(target=handle_stream, args=(process.stdout, ""))
                stderr_thread = threading.Thread(target=handle_stream, args=(process.stderr, "[!]"))

                stdout_thread.start()
                stderr_thread.start()

                stdout_thread.join()
                stderr_thread.join()

                exit_code = process.wait()

                if exit_code != 0:
                    print(f"install/(de)activation script failed: {script[0]}")
            except Exception as e:
                print(f"[ERROR] Failed to execute install/(de)activation script: {line} / {e}")

    # Remove the script_list_path file
    if os.path.exists(script_list_path):
        os.remove(script_list_path)
        
    print("\n[ComfyUI-Manager] Startup script completed.")
    print("#######################################################################\n")

