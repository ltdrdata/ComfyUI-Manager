git clone https://github.com/comfyanonymous/ComfyUI
cd ComfyUI/custom_nodes
git clone https://github.com/ltdrdata/ComfyUI-Manager
cd ..
python -m venv venv
call venv/Scripts/activate
python -m pip install -r requirements.txt
python -m pip install -r custom_nodes/ComfyUI-Manager/requirements.txt
python -m pip install torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/cu118 xformers
cd ..
echo "cd ComfyUI" >> run_gpu.sh
echo "call venv/Scripts/activate" >> run_gpu.sh
echo "python main.py" >> run_gpu.sh
chmod +x run_gpu.sh

echo "#!/bin/bash" > run_cpu.sh
echo "cd ComfyUI" >> run_cpu.sh
echo "call venv/Scripts/activate" >> run_cpu.sh
echo "python main.py --cpu" >> run_cpu.sh
chmod +x run_cpu.sh
