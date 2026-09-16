@echo off
echo ===================================================
echo   Pushing BMU Canteen to GitHub (aruthalarul-lab)
echo ===================================================
echo.
"%~dp0mingit\cmd\git.exe" push -u origin main --force
echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Everything has been pushed to GitHub successfully!
    echo Now go to Render and click "Clear build cache & deploy"!
) else (
    echo [NOTE] If prompted for password, use your GitHub Personal Access Token.
)
pause
