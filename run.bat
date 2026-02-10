@echo off
REM Narrator - Quick Start Script for Windows

echo 🎙️  Starting Narrator...

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -q -r requirements.txt

REM Check if .env exists
if not exist ".env" (
    echo ⚠️  Warning: .env file not found!
    echo Please copy .env.example to .env and add your API keys
    pause
    exit /b 1
)

REM Start the server
echo 🚀 Starting FastAPI server...
echo Open http://localhost:8000 in your browser
python backend\main.py
