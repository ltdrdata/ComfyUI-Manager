#!/bin/bash
source ../../venv/bin/activate
rm ~/.tmp/default/*.py > /dev/null 2>&1
python scanner.py ~/.tmp/default
cp extension-node-map.json node_db/new/.
