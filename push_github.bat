@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ================================
echo   SurveySmart - Push to GitHub
echo ================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo ERROR: git was not found in PATH. Install Git for Windows and try again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"

echo Commits waiting to be pushed:
echo --------------------------------
git log origin/!BRANCH!..HEAD --oneline
echo --------------------------------
echo.

echo Pushing branch "!BRANCH!" to origin...
echo (This only pushes existing commits. It does NOT run "git add" or create a new commit.)
echo.
git push origin "!BRANCH!"

if errorlevel 1 (
    echo.
    echo ERROR: Push failed. Check your internet connection and GitHub login/credentials.
) else (
    echo.
    echo Done! Changes pushed to GitHub.
)

echo.
pause
