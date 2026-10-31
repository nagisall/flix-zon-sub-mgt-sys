#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "========================================================"
echo "  Brightloop Software - Subscription Management Platform"
echo "========================================================"
echo ""

cd "$DIR/sub-manager/server"
if [ ! -d "node_modules" ]; then
    echo "[1/3] Installing backend dependencies..."
    npm install
fi

echo "[2/3] Starting backend server on port 5000..."
node server.js &
SERVER_PID=$!

cd "$DIR/sub-manager/client"
if [ ! -d "node_modules" ]; then
    echo "[3/3] Installing frontend dependencies..."
    npm install
fi

echo "Starting frontend dev server..."
echo "Open http://localhost:3002 in your browser"

trap "kill $SERVER_PID" EXIT
npm run dev
