@echo off
setlocal enabledelayedexpansion
rem endowGPT: stop the stack. Data (Mongo, Meili, pgvector, Ollama, uploads)
rem is kept in named volumes.
rem Optional: stop.bat --wipe   (also delete all data volumes - destructive)
cd /d "%~dp0"
rem Keep the websearch overlay so SearXNG and the scraper stop with the app.
set "COMPOSE=docker compose -f docker-compose.yml -f docker-compose.websearch.yml"

docker info >nul 2>&1
if errorlevel 1 (
    echo [endowGPT] Docker is not running; nothing to stop.
    exit /b 1
)

if /i "%~1"=="--wipe" (
    echo [endowGPT] This stops the stack AND deletes every volume:
    echo [endowGPT] documents, chats, uploaded files, embeddings, models.
    choice /M "Delete all endowGPT data"
    if errorlevel 2 (
        echo [endowGPT] Aborted - data kept.
        exit /b 1
    )
    %COMPOSE% down -v
    exit /b !errorlevel!
)

echo [endowGPT] Stopping the stack (volumes are kept; use stop.bat --wipe to delete data^)...
%COMPOSE% down
exit /b !errorlevel!
