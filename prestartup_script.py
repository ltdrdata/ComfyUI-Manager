import os
import subprocess

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
                print(f"\n## Execute install/(de)activation script for '{script[0]}'")
                code = subprocess.run(script[1:], cwd=script[0])

                if code.returncode != 0:
                    print(f"install/(de)activation script failed: {script[0]}")
            except Exception as e:
                print(f"[ERROR] Failed to execute install/(de)activation script: {line} / {e}")

    # Remove the script_list_path file
    if os.path.exists(script_list_path):
        os.remove(script_list_path)
        
    print("\n[ComfyUI-Manager] Startup script completed.")
    print("#######################################################################\n")

