#!/bin/sh
cd /root/Pactra/backend
set -a
. ./.env.local
set +a
exec ./pactra-server
