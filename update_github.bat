@echo off
cd /d "%~dp0"

REM Clean up any stale git lock files left over from interrupted operations
if exist ".git\index.lock" del /f /q ".git\index.lock"
if exist ".git\HEAD.lock" del /f /q ".git\HEAD.lock"

echo Adding changes...
git add -A

echo.
set /p msg="Commit message (leave blank for default): "
if "%msg%"=="" set msg=Update SurveySmart

git commit -m "%msg%"
echo.

echo Pushing to GitHub...
git push origin main
echo.

if %errorlevel%==0 (
    echo Done! Changes are on GitHub.
) else (
    echo Something went wrong. Error code: %errorlevel%
)
pause
