@echo off
cd /d %~dp0
start "taxi-driver-emulator-panel" /min cmd /c "npm run panel"
start "" http://127.0.0.1:3099/
