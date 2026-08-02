@echo off
title Votacao Online - LOCAL
cd /d "%~dp0"

rem Banco local proprio (SQLite). Limpa variaveis de outros projetos
rem que apontam para bancos externos e derrubam o servidor local.
set "DATABASE_URL="
set "POSTGRES_DB="
set "POSTGRES_USER="
set "POSTGRES_PASSWORD="

echo ==================================================
echo    VOTACAO ONLINE - AMBIENTE LOCAL (TESTE)
echo ==================================================
echo.

if not exist "backend\venv\Scripts\python.exe" (
  echo [ERRO] Ambiente Python nao encontrado em backend\venv
  echo.
  pause
  exit /b 1
)

echo [1/4] Preparando o banco de dados local...
pushd "%~dp0backend"
"venv\Scripts\python.exe" manage.py migrate --noinput
popd
echo.

echo [2/4] Ligando o servidor (janela BACKEND)...
start "Votacao BACKEND" /d "%~dp0backend" cmd /k venv\Scripts\python.exe manage.py runserver 8000

echo [3/4] Ligando o site (janela FRONTEND)...
start "Votacao FRONTEND" /d "%~dp0frontend" cmd /k npm run dev

echo [4/4] Aguardando o site subir (cerca de 30 segundos)...
timeout /t 30 /nobreak >nul
start "" http://localhost:3000

echo.
echo ==================================================
echo    PRONTO - site local em http://localhost:3000
echo    Admin/servidor em http://localhost:8000
echo.
echo    Para PARAR: feche as janelas pretas
echo    "Votacao BACKEND" e "Votacao FRONTEND".
echo ==================================================
echo.
pause
