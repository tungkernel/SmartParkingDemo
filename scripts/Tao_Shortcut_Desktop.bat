@echo off
setlocal
for %%I in ("%~dp0..") do set "PROJECT_DIR=%%~fI"
cd /d "%PROJECT_DIR%"
chcp 65001 >nul
title Tao Shortcut Smart Parking PTIT

if not exist "%PROJECT_DIR%\Mo_SmartParking.bat" (
    echo [LOI] Khong tim thay file Mo_SmartParking.bat trong thu muc du an "%PROJECT_DIR%".
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $desk = [Environment]::GetFolderPath('Desktop'); $lnkPath = Join-Path $desk 'Smart Parking PTIT.lnk'; $sc = $ws.CreateShortcut($lnkPath); $proj = $env:PROJECT_DIR; $sc.TargetPath = Join-Path $proj 'Mo_SmartParking.bat'; $sc.WorkingDirectory = $proj.TrimEnd('\'); $sc.IconLocation = ($env:SystemRoot + '\System32\SHELL32.dll,13'); $sc.Description = 'Mo ung dung web Smart Parking PTIT'; $sc.Save(); Write-Output ('Da tao shortcut tren Desktop: ' + $lnkPath)"
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [LOI] Tao shortcut that bai - ma thoat %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)

echo.
echo Ban co the click dup vao "Smart Parking PTIT" tren Desktop de mo ung dung web.
pause
exit /b 0
