@echo off
:: Собирает vsix пакет с текущим номером версии.

:: Чтобы собрать пакет с другим номером версии, нужно запустить package.bat и указать номер, например "package.bat 0.0.2". 
:: Внимание! Скрипт не создаёт коммит и не ставит тег. Изменения package.json и package-lock.json нужно закоммитить вручную. 

call npm ci
call npx @vscode/vsce package --out development-studio-vscode-extension.vsix %1