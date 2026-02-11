@echo off
:: Собирает vsix пакет с текущим номером версии.

:: Чтобы собрать пакет с другим номером версии, нужно запустить package.bat и указать номер, например "package.bat 0.0.2". 
:: Внимание! При передаче номера версии в параметрах, в git создается новый коммит с проставленной версией в файлах package.json и package-lock.json. 
:: На этот же коммит добавляется тег с номером версии и префиксом v. Например для 0.0.2 тег будет v0.0.2. 

call npm ci
call npx @vscode/vsce package --allow-missing-repository --skip-license --out development-studio-vscode-extension.vsix %1