' Runs the template server with no visible console window. Does not wait for
' exit since this process is meant to keep running indefinitely.
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
repoDir = fso.GetParentFolderName(scriptDir)

Set objShell = CreateObject("WScript.Shell")
objShell.CurrentDirectory = repoDir
objShell.Run "node dist\src\serve.js", 0, False
