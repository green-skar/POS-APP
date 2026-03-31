; Dreamnet installer gate + post-install config.
; Keep in sync with apps/web/src-tauri/tauri.conf.json:
;   - bundle identifier -> ${BUNDLEID} (defined in nsis/installer.nsi after this include; expanded when macros run)
;   - productName / manufacturer affect NSIS template vars
!include "LogicLib.nsh"
!include "nsDialogs.nsh"

Var INSTALLER_DLG
Var INSTALLER_PASSWORD_INPUT
Var INSTALLER_MODE_SERVER
Var INSTALLER_MODE_CLIENT
Var INSTALLER_PASSWORD_VALUE
Var INSTALLER_MODE_VALUE
Var OPENAI_API_KEY_INPUT
Var OPENAI_API_KEY_VALUE

Function InstallerGatePage
  IfSilent installer_gate_silent installer_gate_show
installer_gate_silent:
  StrCpy $INSTALLER_MODE_VALUE "client"
  Abort
installer_gate_show:
  nsDialogs::Create 1018
  Pop $INSTALLER_DLG
  ${If} $INSTALLER_DLG == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 24u "Installation security check"
  ${NSD_CreateLabel} 0 18u 100% 32u "Enter the installer password and choose install mode."
  ${NSD_CreateLabel} 0 52u 100% 12u "Installer password"
  ${NSD_CreatePassword} 0 64u 100% 12u ""
  Pop $INSTALLER_PASSWORD_INPUT

  ${NSD_CreateRadioButton} 0 84u 100% 12u "Client workstation (lightweight install)"
  Pop $INSTALLER_MODE_CLIENT
  ${NSD_CreateRadioButton} 0 100u 100% 12u "Server workstation (requires ngrok setup)"
  Pop $INSTALLER_MODE_SERVER
  ${NSD_Check} $INSTALLER_MODE_CLIENT

  ${NSD_CreateLabel} 0 120u 100% 12u "OpenAI API key (optional)"
  ${NSD_CreateText} 0 132u 100% 12u ""
  Pop $OPENAI_API_KEY_INPUT

  nsDialogs::Show
FunctionEnd

Function InstallerGatePageLeave
  ${NSD_GetText} $INSTALLER_PASSWORD_INPUT $INSTALLER_PASSWORD_VALUE
  ${If} $INSTALLER_PASSWORD_VALUE != "LuckyMe@72"
    MessageBox MB_ICONSTOP|MB_OK "Invalid installer password."
    Abort
  ${EndIf}

  ${NSD_GetText} $OPENAI_API_KEY_INPUT $OPENAI_API_KEY_VALUE

  ${NSD_GetState} $INSTALLER_MODE_SERVER $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $INSTALLER_MODE_VALUE "server"
  ${Else}
    StrCpy $INSTALLER_MODE_VALUE "client"
  ${EndIf}
FunctionEnd

; Gate runs on custom Page before InstFiles (see nsis/installer.nsi). Do not show nsDialogs here.
!macro NSIS_HOOK_PREINSTALL
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Persist selected installer mode for first app run.
  FileOpen $0 "$INSTDIR\installer_mode.txt" w
  FileWrite $0 "$INSTALLER_MODE_VALUE"
  FileClose $0

  ; Installer-only metadata (optional reads from app). If you rename vendor branding, update this key.
  WriteRegStr HKCU "Software\DreamnetMediaTech" "InstallerMode" "$INSTALLER_MODE_VALUE"

  ; Writable per-user app data — must match Tauri identifier (see tauri.conf.json "identifier").
  ; Same folder as Rust app.path().app_data_dir() + "\data" (see server_launch.rs).
  StrCpy $1 "$APPDATA\${BUNDLEID}\data"
  CreateDirectory "$1"
  FileOpen $2 "$1\config.json" w
  FileWrite $2 "{$\r$\n"
  ; Use $\" to embed quotes inside NSIS strings.
  FileWrite $2 "  $\"OPENAI_API_KEY$\": $\"$OPENAI_API_KEY_VALUE$\"$\r$\n"
  FileWrite $2 "}$\r$\n"
  FileClose $2

  ${If} $INSTALLER_MODE_VALUE == "server"
    MessageBox MB_ICONINFORMATION|MB_OK "Server mode selected. On first launch, complete ngrok setup in Payment Settings or Network flow."
  ${EndIf}
!macroend
