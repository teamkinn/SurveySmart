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

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
echo Branch: !BRANCH!
echo.

set "HAS_CHANGES="
for /f "delims=" %%s in ('git status --porcelain') do set "HAS_CHANGES=1"

if not defined HAS_CHANGES (
    echo No new changes to commit - will only push earlier local commits.
    goto push
)

echo Files that will be committed:
echo --------------------------------
git status --short
echo --------------------------------
echo.

set "OK="
set /p OK="Commit ALL files above and push? (Y/N): "
if /i not "!OK!"=="Y" (
    echo Cancelled. Nothing was committed or pushed.
    echo.
    pause
    exit /b 0
)

set "COMMIT_MSG="
set /p COMMIT_MSG="Commit message (leave blank for auto message): "
if not defined COMMIT_MSG set "COMMIT_MSG=Update SurveySmart %date% %time:~0,5%"

git add -A
git commit -m "!COMMIT_MSG!"
if errorlevel 1 (
    echo.
    echo ERROR: Commit failed. See the message above. Nothing was pushed.
    echo.
    pause
    exit /b 1
)

:push
echo.
echo Pushing branch "!BRANCH!" to origin...
git push origin "!BRANCH!"

if errorlevel 1 (
    echo.
    echo ERROR: Push failed. Check your internet connection and GitHub login/credentials.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================
echo   Done! Changes pushed to GitHub.
echo   - Vercel (frontend) rebuilds automatically in 1-2 min
echo   - Railway (backend) redeploys if backend/ changed
echo ================================
echo.
pause
