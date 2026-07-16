@echo off
cd /d "%~dp0"
echo Pushing to GitHub...
git push origin main
echo.
if %errorlevel%==0 (
    echo Done! Changes are on GitHub.
) else (
    echo Something went wrong. Error code: %errorlevel%
)
pause
