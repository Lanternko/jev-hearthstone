# Line protocol worker: reads one JSON command per stdin line, writes one JSON line back.
# Spawned and owned by src/win.mjs. Never run this by hand against a live game.
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;using System.Runtime.InteropServices;
public class Hs {
 [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
 [DllImport("user32.dll",SetLastError=true)] public static extern uint SendInput(uint n,INPUT[] p,int cb);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
 [StructLayout(LayoutKind.Sequential)] public struct RECT{public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] public struct POINT{public int X,Y;}
 [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT{public int dx;public int dy;public uint mouseData;public uint dwFlags;public uint time;public IntPtr dwExtraInfo;}
 [StructLayout(LayoutKind.Sequential)] public struct INPUT{public uint type;public MOUSEINPUT mi;}
 const uint MOVE=0x0001,LDOWN=0x0002,LUP=0x0004,ABS=0x8000,VDESK=0x4000;
 static INPUT Mk(uint flags,int x,int y){INPUT i=new INPUT();i.type=0;i.mi.dwFlags=flags;i.mi.dx=x;i.mi.dy=y;return i;}
 // Screen pixels -> the 0..65535 absolute range. The divisor is vw, not vw-1: Windows maps the
 // value back with (dx * vw) >> 16, so dividing by vw-1 landed the pointer one pixel short of
 // every target -- measured, not assumed, by comparing GetCursorPos with the aim point.
 static void Norm(int sx,int sy,out int nx,out int ny){
  int vx=GetSystemMetrics(76),vy=GetSystemMetrics(77),vw=GetSystemMetrics(78),vh=GetSystemMetrics(79);
  nx=(int)Math.Round((sx-vx+0.5)*65536.0/vw);ny=(int)Math.Round((sy-vy+0.5)*65536.0/vh);
 }
 // Every sender returns what SendInput returned: 0 means the event was never injected at all
 // (UIPI, an elevated foreground window, a low-level hook eating it), which from the outside
 // looks exactly like a click on nothing, and GetLastWin32Error says which.
 public static uint Move(int sx,int sy){int nx,ny;Norm(sx,sy,out nx,out ny);
  return SendInput(1,new INPUT[]{Mk(MOVE|ABS|VDESK,nx,ny)},Marshal.SizeOf(typeof(INPUT)));}
 public static uint Down(){return SendInput(1,new INPUT[]{Mk(LDOWN,0,0)},Marshal.SizeOf(typeof(INPUT)));}
 public static uint Up(){return SendInput(1,new INPUT[]{Mk(LUP,0,0)},Marshal.SizeOf(typeof(INPUT)));}
 public static long WindowAtCursor(){POINT p;GetCursorPos(out p);return (long)WindowFromPoint(p);}
}
"@
[void][Hs]::SetProcessDPIAware()

$script:Geo = $null
$script:GeoAt = [datetime]::MinValue

function Read-Geo {
  $p = Get-Process -Name Hearthstone -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
  if (-not $p) { return @{ok=$false;error='hearthstone_not_running'} }
  $h = $p.MainWindowHandle
  $cr = New-Object Hs+RECT; [void][Hs]::GetClientRect($h,[ref]$cr)
  $o = New-Object Hs+POINT; $o.X = 0; $o.Y = 0; [void][Hs]::ClientToScreen($h,[ref]$o)
  @{ok=$true;handle=[int64]$h;width=$cr.R;height=$cr.B;originX=$o.X;originY=$o.Y;focused=([Hs]::GetForegroundWindow() -eq $h)}
}
# The user can drag a windowed client around, so re-read, but not on every click.
function Get-Geo([switch]$Force) {
  if ($Force -or $null -eq $script:Geo -or ((Get-Date) - $script:GeoAt).TotalMilliseconds -gt 2000) {
    $script:Geo = Read-Geo; $script:GeoAt = Get-Date
  }
  $script:Geo
}
function Reply($o) { Write-Output ($o | ConvertTo-Json -Compress -Depth 6) }

# --- Instrumentation -------------------------------------------------------
# Three live games lost the same 26% of gestures, and two fixes aimed at guesses (coordinates,
# then the pickup) moved that number not at all. So stop guessing: every gesture now records
# what Windows actually did, and the loop keeps the trace of the ones that died. A probe costs
# two syscalls and answers what a retry cannot: was the pointer where we aimed, was Hearthstone
# in front, did the window under the cursor belong to it, was the event injected at all.
$script:T0 = $null
function Probe($g,$tag,$wantX,$wantY) {
  $p = New-Object Hs+POINT; [void][Hs]::GetCursorPos([ref]$p)
  $r = [ordered]@{
    at   = [int]((Get-Date) - $script:T0).TotalMilliseconds
    tag  = $tag
    x    = $p.X - $g.originX
    y    = $p.Y - $g.originY
    fg   = ([Hs]::GetForegroundWindow() -eq [intptr]$g.handle)
    hwnd = [Hs]::WindowAtCursor()
  }
  # dx/dy is the whole point: a pointer that never arrived explains a click on nothing.
  if ($null -ne $wantX) { $r.dx = $r.x - ($wantX - $g.originX); $r.dy = $r.y - ($wantY - $g.originY) }
  [pscustomobject]$r
}

function Arm($g,$sx,$sy,$settle,$trace) {
  $refocused = $false
  if ([Hs]::GetForegroundWindow() -ne [intptr]$g.handle) {
    [void][Hs]::SetForegroundWindow([intptr]$g.handle); Start-Sleep -Milliseconds 220
    $refocused = $true
  }
  [void][Hs]::Move($sx,$sy); Start-Sleep -Milliseconds 40
  $rc = [Hs]::Move($sx,$sy); Start-Sleep -Milliseconds $settle
  [void]$trace.Add((Probe $g 'armed' $sx $sy))
  @{refocused=$refocused;moveRc=[int]$rc}
}

Reply @{ok=$true;ready=$true}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  if ($line.Trim() -eq '') { continue }
  try {
    $c = $line | ConvertFrom-Json
    $g = Get-Geo
    if ($c.op -ne 'geo' -and -not $g.ok) { Reply $g; continue }
    switch ($c.op) {
      'geo' { Reply (Get-Geo -Force) }
      'focus' {
        [void][Hs]::SetForegroundWindow([intptr]$g.handle); Start-Sleep -Milliseconds 150
        Reply (Get-Geo -Force)
      }
      'cursor' { $p = New-Object Hs+POINT; [void][Hs]::GetCursorPos([ref]$p); Reply @{ok=$true;x=($p.X - $g.originX);y=($p.Y - $g.originY);screenX=$p.X;screenY=$p.Y} }
      'move' { [void][Hs]::Move($g.originX + $c.x, $g.originY + $c.y); Reply @{ok=$true} }
      # A gesture after 10 seconds of a motionless pointer died 17 times out of 18; under 10
      # seconds, never, in 41 tries. Arm already moves twice and waits before pressing, so the
      # client wants the pointer to have been alive, not merely moved. So keep it alive: jitter
      # one pixel where it already sits, which hovers nothing new and costs nothing.
      'nudge' {
        $p = New-Object Hs+POINT; [void][Hs]::GetCursorPos([ref]$p)
        [void][Hs]::Move($p.X + 1, $p.Y); [void][Hs]::Move($p.X, $p.Y)
        Reply @{ok=$true}
      }
      'click' {
        $script:T0 = Get-Date
        $tr = New-Object System.Collections.ArrayList
        $sx = $g.originX + $c.x; $sy = $g.originY + $c.y
        [void]$tr.Add((Probe $g 'enter' $null $null))
        $arm = Arm $g $sx $sy $c.settle $tr
        $rcD = [Hs]::Down(); $errD = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [void]$tr.Add((Probe $g 'down' $sx $sy))
        Start-Sleep -Milliseconds $c.hold
        $rcU = [Hs]::Up(); $errU = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [void]$tr.Add((Probe $g 'up' $sx $sy))
        Reply @{ok=$true;trace=@{kind='click';target=@{x=$c.x;y=$c.y};handle=$g.handle;refocused=$arm.refocused;
          rc=@{arm=$arm.moveRc;down=[int]$rcD;up=[int]$rcU};err=@{down=[int]$errD;up=[int]$errU};probes=$tr.ToArray()}}
      }
      'drag' {
        $script:T0 = Get-Date
        $tr = New-Object System.Collections.ArrayList
        $ax = $g.originX + $c.x;  $ay = $g.originY + $c.y
        $bx = $g.originX + $c.x2; $by = $g.originY + $c.y2
        [void]$tr.Add((Probe $g 'enter' $null $null))
        $arm = Arm $g $ax $ay $c.settle $tr
        $rcD = [Hs]::Down(); $errD = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [void]$tr.Add((Probe $g 'down' $ax $ay))
        Start-Sleep -Milliseconds $c.hold
        # The pointer creeps a few pixels before it travels: the client only decides a card has
        # been grabbed once the pointer moves while still on it. (This did not fix anything on
        # its own; it stays because it is harmless and the trace can now say whether the grab is
        # the step that fails.)
        $badMoves = 0
        for ($i = 1; $i -le 3; $i++) {
          if ([Hs]::Move([int]($ax + ($bx-$ax)*$i/60), [int]($ay + ($by-$ay)*$i/60)) -eq 0) { $badMoves++ }
          Start-Sleep -Milliseconds 25
        }
        [void]$tr.Add((Probe $g 'crept' $null $null))
        # Unity drops the grab unless the pointer actually travels.
        for ($i = 1; $i -le 24; $i++) {
          if ([Hs]::Move([int]($ax + ($bx-$ax)*$i/24), [int]($ay + ($by-$ay)*$i/24)) -eq 0) { $badMoves++ }
          Start-Sleep -Milliseconds 10
        }
        [void]$tr.Add((Probe $g 'travelled' $bx $by))
        # The drop target is chosen from where the pointer rests, so let it rest.
        Start-Sleep -Milliseconds $c.hold; [void][Hs]::Move($bx,$by); Start-Sleep -Milliseconds $c.hold
        [void]$tr.Add((Probe $g 'rested' $bx $by))
        $rcU = [Hs]::Up(); $errU = [Runtime.InteropServices.Marshal]::GetLastWin32Error()
        [void]$tr.Add((Probe $g 'up' $bx $by))
        Reply @{ok=$true;trace=@{kind='drag';target=@{x=$c.x;y=$c.y;x2=$c.x2;y2=$c.y2};handle=$g.handle;refocused=$arm.refocused;
          badMoves=$badMoves;rc=@{arm=$arm.moveRc;down=[int]$rcD;up=[int]$rcU};err=@{down=[int]$errD;up=[int]$errU};probes=$tr.ToArray()}}
      }
      default { Reply @{ok=$false;error='unknown_op'} }
    }
  } catch { Reply @{ok=$false;error=$_.Exception.Message} }
}
