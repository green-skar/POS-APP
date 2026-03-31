@echo off
setlocal ENABLEDELAYEDEXPANSION
title Dreamnet Bootstrap Signer

echo ============================================
echo   Dreamnet Offline Bootstrap Signer (GUI)
echo ============================================
echo.

set /p REQUEST_CODE=Paste REQUEST CODE from customer machine: 
if "%REQUEST_CODE%"=="" (
  echo.
  echo Request code is required.
  pause
  exit /b 1
)

echo.
set /p PRIVATE_KEY_PATH=Enter FULL path to Ed25519 private key PEM: 
if "%PRIVATE_KEY_PATH%"=="" (
  echo.
  echo Private key path is required.
  pause
  exit /b 1
)

echo.
set /p EXPIRES_HOURS=Token expiry in hours [default 24]: 
if "%EXPIRES_HOURS%"=="" set EXPIRES_HOURS=24

echo.
set /p ALLOW_SERVER=Allow server mode? (true/false) [default true]: 
if "%ALLOW_SERVER%"=="" set ALLOW_SERVER=true

echo.
set /p ALLOW_CLIENT=Allow client mode? (true/false) [default true]: 
if "%ALLOW_CLIENT%"=="" set ALLOW_CLIENT=true

echo.
echo Generating signed response token...
for /f "delims=" %%A in ('node "%~dp0bootstrap-signer.mjs" --request "%REQUEST_CODE%" --private-key "%PRIVATE_KEY_PATH%" --expires-hours "%EXPIRES_HOURS%" --allow-server "%ALLOW_SERVER%" --allow-client "%ALLOW_CLIENT%"') do (
  set TOKEN=%%A
)

if not defined TOKEN (
  echo.
  echo Failed to generate token. Check request code/private key and try again.
  pause
  exit /b 1
)

echo.
echo ============================================
echo RESPONSE TOKEN (paste this on customer setup)
echo ============================================
echo !TOKEN!
echo.

set OUTPUT_FILE=%~dp0bootstrap-response-token.txt
> "%OUTPUT_FILE%" echo !TOKEN!
echo Token also saved to:
echo %OUTPUT_FILE%
echo.

echo !TOKEN! | clip
echo Token copied to clipboard.
echo.
pause
exit /b 0
