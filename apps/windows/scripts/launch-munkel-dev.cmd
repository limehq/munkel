@echo off
rem Munkel Dev-Launcher — startet die aktuelle Development-Version (Vite + Electron).
rem Wird von der Start-Menue-Verknuepfung "Munkel" aufgerufen (Windows-App-Suche).
rem %~dp0 = dieser scripts-Ordner; ".." = apps\windows (Repo-relativ, portabel).
rem ELECTRON_RUN_AS_NODE darf NIE durchgereicht werden: erbt dieser GUI-Launcher
rem das Flag aus einer Eltern-Shell (z.B. VS Code/Claude-Code-Terminal), startet
rem die echte Electron-Binary im reinen Node-Modus (app.setName() wirft sofort,
rem kein Fenster) — siehe docs/bugs/windows-ui-invisible-2026-07-10.md.
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0.."
where bun >nul 2>nul
if %errorlevel%==0 (
  bun run dev
) else (
  "%USERPROFILE%\.bun\bin\bun.exe" run dev
)
