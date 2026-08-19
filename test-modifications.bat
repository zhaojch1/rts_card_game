@echo off
chcp 65001 >nul
echo ========================================
echo Modifications Test Script
echo ========================================
echo.

echo 1. Checking development server status...
netstat -ano | findstr :5173 > nul
if %errorlevel% equ 0 (
    echo [OK] Development server is running
    echo    Access URL: http://localhost:5173
) else (
    echo [ERROR] Development server is not running
    echo    Starting development server...
    start /B npm run dev
    timeout /t 5 > nul
    echo [OK] Development server started
    echo    Access URL: http://localhost:5173
)

echo.
echo 2. Test Instructions:
echo    - Test unit spawning from left side
echo    - Test same faction (no auto-attack)
echo    - Test box selection (drag to select)
echo    - Test boundary limits (card bar area)
echo    - Test batch controls (V/A/K keys)
echo.
echo 3. Detailed test guide:
echo    - Refer to MODIFICATIONS_TEST.md
echo.
echo 4. To rebuild:
echo    npm run build
echo.
echo ========================================
echo After testing, please record any feedback
echo ========================================
pause