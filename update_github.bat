@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0"

echo ================================
echo   SurveySmart - Update GitHub
echo ================================
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo ERROR: git was not found in PATH. Install Git for Windows and try again.
    echo.
    pause
    exit /b 1
)

echo Current changes:
echo --------------------------------
git status --short
echo --------------------------------
echo.

set "COMMIT_MSG="
set /p COMMIT_MSG="Commit message (leave blank for auto message): "
if "%COMMIT_MSG%"=="" (
    set "COMMIT_MSG=Update SurveySmart - %date% %time%"
)

git add -A
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo (Nothing new to commit - continuing to push any earlier local commits.)
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"

echo.
echo Pushing branch "!BRANCH!" to origin...
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
