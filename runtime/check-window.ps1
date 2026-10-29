# Read-only: reports the Hearthstone window style, client rect and elevation. Changes nothing.
Add-Type @"
using System;using System.Runtime.InteropServices;
public class Cw{
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;}
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll",EntryPoint="GetWindowLongW")] public static extern int GetWindowLong(IntPtr h,int i);
 [DllImport("kernel32.dll")] public static extern IntPtr OpenProcess(uint a,bool i,int pid);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
 [DllImport("advapi32.dll",SetLastError=true)] public static extern bool OpenProcessToken(IntPtr p,uint a,out IntPtr t);
 [DllImport("advapi32.dll",SetLastError=true)] public static extern bool GetTokenInformation(IntPtr t,int c,out int v,int len,out int ret);
}
"@
[void][Cw]::SetProcessDPIAware()
function Elevated($pid_){
  $h=[Cw]::OpenProcess(0x1000,$false,$pid_); if($h -eq [IntPtr]::Zero){return 'unknown (OpenProcess denied: target is probably elevated)'}
  $t=[IntPtr]::Zero
  if(-not [Cw]::OpenProcessToken($h,0x8,[ref]$t)){[void][Cw]::CloseHandle($h);return 'unknown (OpenProcessToken denied: target is probably elevated)'}
  $v=0;$r=0;[void][Cw]::GetTokenInformation($t,20,[ref]$v,4,[ref]$r);[void][Cw]::CloseHandle($t);[void][Cw]::CloseHandle($h)
  if($v -ne 0){'yes'}else{'no'}
}
$me=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$p=Get-Process -Name Hearthstone -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
if(-not $p){@{ok=$false;error='hearthstone_not_running';botElevated=$me}|ConvertTo-Json -Compress;exit 1}
$h=$p.MainWindowHandle
$cr=New-Object Cw+RECT;[void][Cw]::GetClientRect($h,[ref]$cr)
$o=New-Object Cw+POINT;[void][Cw]::ClientToScreen($h,[ref]$o)
$style=[Cw]::GetWindowLong($h,-16)
$popup=(($style -band [int]::MinValue) -ne 0) -and (($style -band 0x00C00000) -eq 0)
@{ok=$true;width=$cr.R;height=$cr.B;originX=$o.X;originY=$o.Y;style=('0x{0:X8}' -f $style);wsPopup=$popup;hasCaption=(($style -band 0x00C00000) -ne 0);
  hearthstoneElevated=(Elevated $p.Id);botElevated=$me}|ConvertTo-Json -Compress
