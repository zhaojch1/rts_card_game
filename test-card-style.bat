@echo off
chcp 65001 >nul
echo ========================================
echo Card Style Polish Test Script
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
echo    - Observe card visual effects
echo    - Test hover glow effects
echo    - Verify click interactions
echo    - Check cooldown system
echo.
echo 3. Detailed test guides:
echo    - Refer to FINAL_TEST_INSTRUCTIONS.md
echo    - Refer to CARD_TEST_GUIDE.md
echo.
echo 4. To rebuild:
echo    npm run build
echo.
echo ========================================
echo After testing, please record any feedback
echo ========================================
pause