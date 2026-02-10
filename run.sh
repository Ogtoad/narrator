#!/bin/bash

# Narrator - Quick Start Script

echo "🎙️  Starting Narrator..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

# Install dependencies
echo "Installing dependencies..."
pip install -q -r requirements.txt

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "Please copy .env.example to .env and add your API keys"
    exit 1
fi

# Start the server
echo "🚀 Starting FastAPI server..."
echo "Open http://localhost:8000 in your browser"
python backend/main.py
