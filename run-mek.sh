#!/bin/bash
cd /home/z/my-project
while true; do
  PORT=3000 NODE_OPTIONS="--max-old-space-size=128" node .next/standalone/server.js >> /home/z/my-project/dev.log 2>&1
  echo "[$(date)] Server exited. Restarting in 1s..." >> /home/z/my-project/dev.log
  sleep 1
done
