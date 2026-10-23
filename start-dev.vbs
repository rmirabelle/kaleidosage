' Starts the KaleidoSage dev app with no console window. Its output goes to
' dev.log in this folder. Run it from Explorer (a double-click), or have
' Claude open it through explorer.exe, so it does not stop when Claude quits.
' Stop the dev app with kill-dev.ps1.
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = files.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c npm run tauri dev -- --no-watch > dev.log 2>&1", 0, False
