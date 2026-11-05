@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS once from https://nodejs.org/en/download
  start "" "https://nodejs.org/en/download"
  pause
  exit /b 1
)
where git >nul 2>nul
if errorlevel 1 (
  echo Install Git for Windows once from https://git-scm.com/download/win
  start "" "https://git-scm.com/download/win"
  pause
  exit /b 1
)
set "ATHAR_PREVIEW_DIR=%LOCALAPPDATA%\AtharQuranPreview\App"
if not exist "%ATHAR_PREVIEW_DIR%\.git" (
  git clone --depth 1 --branch preview --single-branch https://github.com/osa0mah/App.git "%ATHAR_PREVIEW_DIR%"
  if errorlevel 1 (
    echo Could not download the project. Check your connection or GitHub sign-in.
    pause
    exit /b 1
  )
)
cd /d "%ATHAR_PREVIEW_DIR%"
call npm run preview:follow -- --open
pause
