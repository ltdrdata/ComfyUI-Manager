import sys
import subprocess
import os


def security_check():
    print("[START] Security scan")

    custom_nodes_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))

    guide = {"ComfyUI_LLMVISION": """
1.Remove pip packages: openai-1.16.3.dist-info, anthropic-0.21.4.dist-info, openai-1.30.2.dist-info, anthropic-0.26.1.dist-info, %LocalAppData%\\rundll64.exe
2.Remove these files in your system: lib/browser/admin.py, Cadmino.py, Fadmino.py, VISION-D.exe
3.Check your Windows registry for the key listed above and remove it.
4.Change all of your passwords, everywhere.
    """}

    node_blacklist = {"ComfyUI_LLMVISION": "ComfyUI_LLMVISION"}

    pip_blacklist = {"AppleBotzz": "ComfyUI_LLMVISION"}

    installed_pips = subprocess.check_output([sys.executable, '-m', "pip", "freeze"], text=True)

    detected = set()
    for k, v in node_blacklist.items():
        if os.path.exists(os.path.join(custom_nodes_path, k)):
            print(f"[SECURITY ALERT] custom node '{k}' is dangerous.")
            detected.add(v)

    for k, v in pip_blacklist.items():
        if k in installed_pips:
            detected.add(v)
            break

    if len(detected) > 0:
        for line in installed_pips.split('\n'):
            for k, v in pip_blacklist.items():
                if k in line:
                    print(f"[SECURITY ALERT] '{line}' is dangerous.")

        print("\n########################################################################")
        print("   Malware has been detected, forcibly terminating ComfyUI execution.")
        print("########################################################################\n")

        for x in detected:
            print(f"\n======== TARGET: {x} =========")
            print(f"\nTODO:")
            print(guide[x])

        exit(-1)

    print("[DONE] Security scan")
