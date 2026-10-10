Add-Type 'using System;using System.Runtime.InteropServices;public class WP{[DllImport("user32.dll")]public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int cx,int cy,uint f);}'
$h=(Get-Process Hearthstone).MainWindowHandle; [WP]::SetWindowPos($h,[IntPtr](-1),0,0,0,0,3) | Out-Null
