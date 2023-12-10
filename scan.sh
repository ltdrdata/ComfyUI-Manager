#!/bin/bash
source ../../venv/bin/activate
rm ~/.tmp/*.py > /dev/null 2>&1
python scanner.py ~/.tmp
cp extension-node-map.json node_db/new/.
