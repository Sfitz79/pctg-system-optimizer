[Setup]
AppName=PCTG Optimizer Pro
AppVersion=1.5.0
AppPublisher=PcTechGuyOnline
AppPublisherURL=https://pctechguyonline.com
AppSupportURL=https://pctechguyonline.com
AppUpdatesURL=https://github.com/Sfitz79/pctg-system-optimizer/releases
DefaultDirName={commonpf}\PCTG Optimizer Pro
DefaultGroupName=PCTG Optimizer Pro
UninstallDisplayIcon={app}\PCTG Optimizer Pro.exe
Compression=lzma2
SolidCompression=yes
OutputDir=..\dist\public
OutputBaseFilename=PCTG-Optimizer-Setup
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Files]
Source: "..\dist\public\PCTG Optimizer Pro-win32-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\PCTG Optimizer Pro"; Filename: "{app}\PCTG Optimizer Pro.exe"
Name: "{group}\Uninstall PCTG Optimizer Pro"; Filename: "{uninstallexe}"
Name: "{commondesktop}\PCTG Optimizer Pro"; Filename: "{app}\PCTG Optimizer Pro.exe"

[Run]
Filename: "{app}\PCTG Optimizer Pro.exe"; Description: "Launch PCTG Optimizer Pro"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "{app}\PCTG Optimizer Pro.exe"; Parameters: "--uninstall"; RunOnceId: "PCTGUninstall"
