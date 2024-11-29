#!/bin/bash
rm ~/.tmp/default/*.py > /dev/null 2>&1
python -m scanner ~/.tmp/default $*
cp extension-node-map.json node_db/new/.

echo "Integrity check"
if [ -f "check2.sh" ]; then
    ./check2.sh
else
    ./check.sh
fi