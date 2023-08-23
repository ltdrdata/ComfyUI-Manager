#!/bin/bash
source ../../venv/bin/activate
rm .tmp/*.py > /dev/null
python scanner.py
cp extension-node-map.json node_db/new/.
