' ---------------------------------------------------------------
'  MAX Maskot - autostart entry for the kiosk panel.
'
'  Put a shortcut to THIS file into the Startup folder:
'      Win+R  ->  shell:startup
'
'  Why not a .bat: a batch file flashes a black console window on
'  every boot, and on a panel everybody sees it.
'
'  The variable grants camera access without the permission dialog.
'  The camera stays real - this is --use-fake-UI, not --use-fake-DEVICE.
' ---------------------------------------------------------------
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.Environment("PROCESS")("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS") = "--use-fake-ui-for-media-stream"

app = here & "\max-mascot-win_x64.exe"

' A shortcut to this file must go into Startup, not a copy of the file:
' the script looks for the .exe next to itself. Without this check a copy
' placed in Startup would simply do nothing, silently, on every boot.
If Not fso.FileExists(app) Then
  MsgBox "Not found:" & vbCrLf & app & vbCrLf & vbCrLf & _
         "Put a SHORTCUT to this script into Startup, not the script itself.", _
         vbCritical, "MAX Maskot"
  WScript.Quit 1
End If

' 1 = normal window, False = do not wait for the app to exit.
sh.Run """" & app & """", 1, False
