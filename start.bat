@echo off
title Driver Schedule System
cd /d "%~dp0"
echo ============================================
echo  Driver Schedule System
echo ============================================
echo.
echo  URL : http://localhost:8000/login.html
echo.
echo  Default Admin Login:
echo    Email   : admin@system.com
echo    Password: admin123
echo.
echo  Press Ctrl+C to stop the server.
echo ============================================
echo.
start "" http://localhost:8000/login.html
php -S localhost:8000
