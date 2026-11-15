@echo off
setlocal
rem endowGPT deploy: commit -> push -> rebuild on the VPS (187.53.138.42).
rem
rem   deploy.bat                     commit everything, push, rebuild the server
rem   deploy.bat "fix: the thing"    same, with an explicit commit message
rem   deploy.bat --push              commit + push only, do not touch the server
rem   deploy.bat --server            update the server only (no commit, no push)
rem   deploy.bat --no-build          pull and restart without rebuilding images
rem   deploy.bat --save-pass         store the SSH password in scripts\deploy\.deploy.env
rem
rem The rebuild runs detached on the server, so closing this window does not
rem abort it. Re-run with --server (or --server --no-build) to watch it finish.
rem Avoid double quotes inside the commit message: batch cannot pass them through.

cd /d "%~dp0"

set "EH_HOST=187.53.138.42"
set "EH_USER=developer"
set "CFG=scripts\deploy\.deploy.env"
set "MODE=all"
set "ACTION=build"
set "MSG="
set "SAVEPASS="

:parse
if "%~1"=="" goto parsed
if /i "%~1"=="--server"    (set "MODE=server"    & shift & goto parse)
if /i "%~1"=="--push"      (set "MODE=push"      & shift & goto parse)
if /i "%~1"=="--no-build"  (set "ACTION=restart" & shift & goto parse)
if /i "%~1"=="--save-pass" (set "SAVEPASS=1"     & shift & goto parse)
if /i "%~1"=="--help"      goto usage
if /i "%~1"=="-h"          goto usage
if /i "%~1"=="/?"          goto usage
if defined MSG (set "MSG=%MSG% %~1") else (set "MSG=%~1")
shift
goto parse
:parsed

rem Saved values (optional) win over the defaults above.
if exist "%CFG%" (
    for /f "usebackq eol=# tokens=1,* delims==" %%a in ("%CFG%") do set "%%a=%%b"
)

if /i "%MODE%"=="server" goto remote

where git >nul 2>&1
if errorlevel 1 (
    echo [deploy] git is not in PATH.
    exit /b 1
)

echo [deploy] Staging changes...
git add -A
git diff --cached --quiet
if not errorlevel 1 (
    echo [deploy] Nothing new to commit.
    goto push
)

if not defined MSG set /p "MSG=Commit message: "
if not defined MSG (
    echo [deploy] Aborted: a commit message is required.
    exit /b 1
)

echo.
echo [deploy] Staged:
git diff --cached --stat
echo.

echo [deploy] Committing...
git commit -m "%MSG%"
if errorlevel 1 (
    echo [deploy] git commit failed.
    exit /b 1
)

:push
for /f "tokens=*" %%r in ('git rev-parse --short HEAD') do set "REV=%%r"
echo [deploy] Pushing %REV% to origin/main...
git push origin main
if errorlevel 1 (
    echo [deploy] Push refused; retrying through the gh credential helper...
    git -c credential.helper= -c credential.helper="!gh auth git-credential" push origin main
    if errorlevel 1 (
        echo [deploy] Push failed. Fix credentials with: gh auth setup-git
        exit /b 1
    )
)

:remote
if /i "%MODE%"=="push" goto done

if not defined EH_HOST (
    echo [deploy] EH_HOST is not set.
    exit /b 1
)
if not defined EH_USER (
    echo [deploy] EH_USER is not set.
    exit /b 1
)

python -c "import paramiko" >nul 2>&1
if errorlevel 1 (
    echo [deploy] paramiko is missing. Run: pip install paramiko
    exit /b 1
)

if not defined EH_PASS (
    echo.
    echo [deploy] SSH password for %EH_USER%@%EH_HOST%
    set "ASKPASS_PROMPT=  password: "
    for /f "usebackq delims=" %%p in (`python "scripts\deploy\askpass.py" "%ASKPASS_PROMPT%"`) do set "EH_PASS=%%p"
)
if not defined EH_PASS (
    echo [deploy] Aborted: no password given.
    exit /b 1
)

if defined SAVEPASS (
    echo [deploy] Saving credentials to %CFG% ^(plain text, git-ignored^).
    > "%CFG%" echo # endowGPT deploy credentials - never commit this file.
    >>"%CFG%" echo EH_HOST=%EH_HOST%
    >>"%CFG%" echo EH_USER=%EH_USER%
    >>"%CFG%" echo EH_PASS=%EH_PASS%
)

echo.
echo [deploy] Updating %EH_USER%@%EH_HOST%  ^(action: %ACTION%^)
echo [deploy] A rebuild takes roughly 10 minutes; output streams below.
echo.

python "scripts\deploy\sshx.py" --script "scripts\deploy\server-update.sh" --arg %ACTION% --timeout 2400
if errorlevel 1 (
    echo.
    echo [deploy] The remote update reported a failure. Inspect on the server:
    echo [deploy]   tail -n 60 /tmp/endowgpt-up.log
    exit /b 1
)

:done
echo.
echo [deploy] Done.
exit /b 0

:usage
echo endowGPT deploy
echo.
echo   deploy.bat                     commit, push, rebuild the server
echo   deploy.bat "message"           same, with an explicit commit message
echo   deploy.bat --push              commit and push only
echo   deploy.bat --server            update the server only
echo   deploy.bat --no-build          restart without rebuilding images
echo   deploy.bat --save-pass         remember the SSH password locally
echo.
echo Server: %EH_USER%@%EH_HOST%  repo: /var/www/endowhub.io
echo.
exit /b 0
