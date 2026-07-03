@echo off
rem Munkel Dev-Launcher — startet die aktuelle Development-Version (Vite + Electron).
rem Wird von der Start-Menue-Verknuepfung "Munkel" aufgerufen (Windows-App-Suche).
rem %~dp0 = dieser scripts-Ordner; ".." = apps\windows (Repo-relativ, portabel).
cd /d "%~dp0.."
where bun >nul 2>nul
if %errorlevel%==0 (
  bun run dev
) else (
  "%USERPROFILE%\.bun\bin\bun.exe" run dev
)
