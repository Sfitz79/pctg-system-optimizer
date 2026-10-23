; TEMPORARY payload test - identical [Files] source to installer.iss, but installs
; per-user (no elevation) so it can be run and inspected from a normal shell.
[Setup]
AppName=PCTG Optimizer Pro Install Test
AppVersion=1.4.1
AppPublisher=PcTechGuyOnline
DefaultDirName={localappdata}\PCTG-InstallTest
DefaultGroupName=PCTG Install Test
UninstallDisplayIcon={app}\PCTG Optimizer Pro.exe
Compression=lzma2
SolidCompression=yes
OutputDir=..\dist\public
OutputBaseFilename=PCTG-Optimizer-Setup-test
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\public\PCTG Optimizer Pro-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
