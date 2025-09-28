#!/bin/bash
# Startup script for Modular Math Language Web Interface

echo "Starting Modular Math Language Web Interface..."
echo "Make sure you have Python 3 installed and the modular_math modules available."
echo ""

# Check if we're in the right directory
if [ ! -f "server.py" ]; then
    echo "Error: server.py not found. Please run this script from the web_interface directory."
    exit 1
fi

# Check if modular_math directory exists in parent
if [ ! -d "../modular_math" ]; then
    echo "Error: modular_math directory not found in parent directory."
    echo "Please ensure this script is run from /path/to/project/web_interface/"
    exit 1
fi

# Start the server
PORT=${1:-8080}
echo "Starting server on port $PORT..."
echo "Open your browser to: http://localhost:$PORT"
echo "Press Ctrl+C to stop the server"
echo ""

python server.py --port $PORT