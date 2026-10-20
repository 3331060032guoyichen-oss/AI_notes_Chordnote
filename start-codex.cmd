@echo off
setlocal

cd /d "%~dp0"

if not exist "logs" mkdir "logs"

echo Codex started at %date% %time% > "logs\scheduled-codex.log"

call "%APPDATA%\npm\codex.cmd" exec --full-auto "Read AGENTS.md and CLAUDE.md. Continue Chordnote development. Inspect current work before editing. Do not overwrite concurrent changes. Run relevant checks and summarize results." >> "logs\scheduled-codex.log" 2>&1

set "code=%errorlevel%"
echo Codex exit code: %code% >> "logs\scheduled-codex.log"

exit /b %code%