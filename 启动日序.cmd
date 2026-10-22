@echo off
chcp 65001 >nul
title 日序 Daymark
cd /d "%~dp0"
echo 正在启动日序，请稍候……
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新版本。
  echo 安装完成后，重新双击这个启动文件。
  pause
  exit /b 1
)
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-local.ps1"
if errorlevel 1 (
  echo.
  echo 启动失败，请查看本窗口的错误信息和项目中的 server-error.log。
  pause
  exit /b 1
)
echo 正在打开浏览器：http://127.0.0.1:4173
start "" "http://127.0.0.1:4173"
if errorlevel 1 (
  echo 浏览器未能自动打开，请手动打开上面的网址。
  pause
  exit /b 1
)
echo 日序已就绪。若网页没有出现，请手动在浏览器中输入上面的网址。
timeout /t 3 /nobreak >nul 2>nul
exit /b 0
