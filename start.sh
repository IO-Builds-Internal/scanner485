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

# 1. Verify Node.js is installed
if ! command -v node &> /dev/null; then
    echo "✕ Error: Node.js is not installed on this system."
    echo "  Please install Node.js (v18+) and try again."
    exit 1
fi

# 2. Check if .env configuration file exists; create from example if missing
if [ ! -f "server/.env" ]; then
    echo "ℹ No server environment configuration found. Creating server/.env from example..."
    if [ -f ".env.example" ]; then
        cp .env.example server/.env
        echo "✓ server/.env created successfully. (Default Admin PIN: admin)"
    else
        echo "PORT=3001" > server/.env
        echo "ADMIN_PIN=admin" >> server/.env
        echo "✓ server/.env created with default settings."
    fi
fi

# 3. Check for dependencies (node_modules) and install if missing
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "ℹ Dependencies are missing. Running a clean installation of all workspaces..."
    npm run install:all
    echo "✓ Installation complete!"
fi

# 4. Print running diagnostic details
echo ""
echo "🚀 Starting scanner485 developer environment..."
echo "-----------------------------------------------------------------"
echo "  • Client UI     : http://localhost:5173"
echo "  • API Server    : http://localhost:3001"
echo "  • Modbus Device : Conzerv EM6400NG (Baud 19200, Even Parity)"
echo "  • Admin Area    : http://localhost:5173/#admin (PIN: admin)"
echo "-----------------------------------------------------------------"
echo "Press Ctrl+C at any time to stop both servers."
echo ""

# 5. Start development workspaces concurrently
npm run dev
