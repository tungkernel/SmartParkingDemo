@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
title Smart Parking PTIT

set "VENV_PY=%~dp0.venv\Scripts\python.exe"
if not exist "%VENV_PY%" (
    echo [LOI] Khong tim thay moi truong ao .venv tai "%VENV_PY%".
    echo Vui long cai dat truoc bang hai lenh sau:
    echo   python -m venv .venv
    echo   .\.venv\Scripts\pip.exe install -r requirements-dev.txt
    echo.
    pause
    exit /b 1
)

"%VENV_PY%" "%~dp0scripts\launch_app.py" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
    echo.
    echo [LOI] Khong the khoi dong Smart Parking PTIT - ma thoat %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)
exit /b 0
