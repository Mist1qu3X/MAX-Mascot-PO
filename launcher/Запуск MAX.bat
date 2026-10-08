@echo off
rem ---------------------------------------------------------------
rem  MAX Maskot - launcher for the kiosk panel.
rem
rem  Start the app THROUGH THIS FILE, not the .exe directly.
rem
rem  The variable below tells WebView2 to grant camera access
rem  without showing the permission dialog. The camera stays real:
rem  it is --use-fake-UI, not --use-fake-DEVICE.
rem ---------------------------------------------------------------
set WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--use-fake-ui-for-media-stream
start "" "%~dp0max-mascot-win_x64.exe"
