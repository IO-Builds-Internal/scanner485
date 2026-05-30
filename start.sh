#!/bin/bash

# Exit immediately if any command fails
set -e

# Clear screen for a clean terminal experience
clear

echo "================================================================="
echo "  IO Builds — scanner485 RS-485 / Modbus RTU Reader"
echo "================================================================="
echo ""
echo "   ___  ___ __ _ _ __  _ __   ___ _ __  _  _   ___  ___ "
echo "  / __|/ __/ _\` | '_ \| '_ \ / _ \ '__|| || | / __|/ __|"
echo "  \__ \ (_| (_| | | | | | | |  __/ |   | || | \__ \__ \\"
echo "  |___/\___\__,_|_| |_|_| |_|\___|_|    \_, _| |___/___/"
echo "                                        |__/            "
echo ""
echo "================================================================="

# Helper function to dynamically find an available port
find_free_port() {
  local port=$1
  while lsof -i :$port -t >/dev/null 2>&1 ; do
    port=$((port + 1))
  done
  echo $port
}

# 1. Verify Node.js is installed
if ! command -v node &> /dev/null; then
    echo "✕ Error: Node.js is not installed on this system."
    echo "  Please install Node.js (v18+) and try again."
    exit 1
fi

# 2. Find dynamic free ports to avoid port conflicts
echo "🔍 Searching for available ports..."
BACKEND_PORT=$(find_free_port 3001)
FRONTEND_PORT=$(find_free_port 5173)
echo "✓ Dynamic ports allocated: API on $BACKEND_PORT, UI on $FRONTEND_PORT"

# 3. Check if .env configuration file exists; create from example if missing
if [ ! -f "server/.env" ]; then
    echo "ℹ No server environment configuration found. Creating server/.env from example..."
    if [ -f ".env.example" ]; then
        cp .env.example server/.env
        echo "✓ server/.env created successfully. (Default Admin PIN: admin)"
    else
        echo "PORT=$BACKEND_PORT" > server/.env
        echo "ADMIN_PIN=admin" >> server/.env
        echo "✓ server/.env created with dynamic backend port."
    fi
fi

# 4. Check for dependencies (node_modules) and install if missing
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "ℹ Dependencies are missing. Running a clean installation of all workspaces..."
    npm run install:all
    echo "✓ Installation complete!"
fi

# 5. Print running diagnostic details
echo ""
echo "🚀 Starting scanner485 developer environment..."
echo "-----------------------------------------------------------------"
echo "  • Client UI     : http://localhost:$FRONTEND_PORT"
echo "  • API Server    : http://localhost:$BACKEND_PORT"
echo "  • Modbus Device : Conzerv EM6400NG (Baud 19200, Even Parity)"
echo "  • Admin Area    : http://localhost:$FRONTEND_PORT/#admin (PIN: admin)"
echo "-----------------------------------------------------------------"
echo "Press Ctrl+C at any time to stop both servers."
echo ""

# 6. Start development workspaces concurrently with dynamic port overrides
npx concurrently -n server,client -c cyan,magenta \
  "PORT=$BACKEND_PORT npm run dev --workspace=server" \
  "PORT=$FRONTEND_PORT VITE_BACKEND_PORT=$BACKEND_PORT npm run dev --workspace=client"
