' Runs the alert-check script with no visible console window.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoDir = fso.GetParentFolderName(scriptDir)

Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = repoDir
objShell.Run "node dist\src\index.js", 0, True
