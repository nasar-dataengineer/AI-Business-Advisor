@echo off
setlocal

set "ROOT=%~dp0"

if exist "%ROOT%.venv\Scripts\python.exe" (
	set "PYTHON=%ROOT%.venv\Scripts\python.exe"
) else if exist "%ROOT%..\.venv\Scripts\python.exe" (
	set "PYTHON=%ROOT%..\.venv\Scripts\python.exe"
) else (
	set "PYTHON=python"
)

start "AI Business Advisor API" /D "%ROOT%backend" "%PYTHON%" -m uvicorn app:app --reload --host 127.0.0.1 --port 8000
start "AI Business Advisor Frontend" /D "%ROOT%frontend" "%ComSpec%" /k "npm run dev -- --host 127.0.0.1 --port 5173"

endlocal
