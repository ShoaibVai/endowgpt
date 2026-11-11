@echo off
setlocal
rem endowGPT launcher: docker compose up -d, then wait for /health.
rem Optional: start.bat --build   (rebuild the api/rag images first)
cd /d "%~dp0"

echo [endowGPT] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo [endowGPT] Docker is not running. Start Docker Desktop, then run this again.
    exit /b 1
)

if not exist ".env" (
    echo [endowGPT] No .env found. Copying .env.example to .env...
    copy /y ".env.example" ".env" >nul
    echo [endowGPT] Now edit .env: set OPENCODE_API_KEY and review the generated
    echo [endowGPT] secrets, then run start.bat again.
    exit /b 1
)

rem The model credential is required for chat; everything else is generated.
set "OPKEY="
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /B /C:"OPENCODE_API_KEY=" .env`) do set "OPKEY=%%b"
if defined OPKEY set "OPKEY=%OPKEY:"=%"
if not defined OPKEY set "OPKEY="
if "%OPKEY%"=="" (
    echo [endowGPT] WARNING: OPENCODE_API_KEY is empty in .env - the app will boot,
    echo [endowGPT] but chat needs the key. Edit .env, then run stop.bat and start.bat.
)

set "PORT=3080"
for /f "usebackq tokens=1,* delims==" %%a in (`findstr /B /C:"PORT=" .env`) do set "PORT=%%b"

echo [endowGPT] Starting the stack (this builds the images on first run)...
docker compose up -d %*
if errorlevel 1 (
    echo [endowGPT] docker compose failed. Run: docker compose logs
    exit /b 1
)

echo [endowGPT] Waiting for http://localhost:%PORT%/health ...
set /a TRIES=0
:wait
curl -fsS -o nul "http://localhost:%PORT%/health" >nul 2>&1
if not errorlevel 1 goto ready
set /a TRIES+=1
if %TRIES% GEQ 80 (
    echo [endowGPT] The API did not become healthy in ~4 minutes.
    echo [endowGPT] Check: docker compose ps  /  docker compose logs -f api
    exit /b 1
)
timeout /t 3 /nobreak >nul
goto wait

:ready
echo.
echo [endowGPT] Ready: http://localhost:%PORT%
echo [endowGPT] Services:
docker compose ps
exit /b 0
