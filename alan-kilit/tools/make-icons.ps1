# Alan Kilit — PNG simgeleri üretir
# Kullanım: powershell -ExecutionPolicy Bypass -File tools\make-icons.ps1

Add-Type -AssemblyName System.Drawing

$OutDir = Split-Path $PSScriptRoot -Parent

function New-RoundRect([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

function New-Icon([int]$Size, [string]$Path, [bool]$FullBleed) {
  $scale = $Size / 512.0
  $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $bgColor = [System.Drawing.Color]::FromArgb(255, 7, 13, 21)
  if ($FullBleed) {
    $g.Clear($bgColor)
  } else {
    $bgPath = New-RoundRect 0 0 ([single]$Size) ([single]$Size) ([single](112 * $scale))
    $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)
    $g.FillPath($bgBrush, $bgPath)
    $bgPath.Dispose()
    $bgBrush.Dispose()
  }

  $cx = $Size / 2.0
  $cy = $Size / 2.0

  # yeşil ışıma
  $glowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
  $glowR = 206 * $scale
  $glowPath.AddEllipse($cx - $glowR, $cy - $glowR, 2 * $glowR, 2 * $glowR)
  $glow = New-Object System.Drawing.Drawing2D.PathGradientBrush($glowPath)
  $glow.CenterColor = [System.Drawing.Color]::FromArgb(72, 94, 234, 212)
  $glow.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 94, 234, 212))
  $g.FillPath($glow, $glowPath)
  $glow.Dispose()
  $glowPath.Dispose()

  # radar halkaları
  $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(48, 94, 234, 212), [single][Math]::Max(1.0, 2 * $scale))
  foreach ($r in 190, 140, 90) {
    $rr = $r * $scale
    $g.DrawEllipse($ringPen, $cx - $rr, $cy - $rr, 2 * $rr, 2 * $rr)
  }
  $ringPen.Dispose()

  # kilit kancası
  $lockPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 94, 234, 212), [single](15 * $scale))
  $lockPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $lockPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $g.DrawArc($lockPen, 214 * $scale, 176 * $scale, 84 * $scale, 84 * $scale, 180, 180)
  $g.DrawLine($lockPen, 214 * $scale, 218 * $scale, 214 * $scale, 240 * $scale)
  $g.DrawLine($lockPen, 298 * $scale, 218 * $scale, 298 * $scale, 240 * $scale)
  $lockPen.Dispose()

  # gövde
  $bodyPath = New-RoundRect ([single](182 * $scale)) ([single](232 * $scale)) ([single](148 * $scale)) ([single](118 * $scale)) ([single](30 * $scale))
  $bodyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 13, 39, 40))
  $g.FillPath($bodyBrush, $bodyPath)
  $bodyPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 94, 234, 212), [single](10 * $scale))
  $g.DrawPath($bodyPen, $bodyPath)
  $bodyBrush.Dispose()
  $bodyPen.Dispose()
  $bodyPath.Dispose()

  # anahtar deliği
  $keyBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 94, 234, 212))
  $g.FillEllipse($keyBrush, 243 * $scale, 268 * $scale, 26 * $scale, 26 * $scale)
  $stemPath = New-RoundRect ([single](249 * $scale)) ([single](288 * $scale)) ([single](14 * $scale)) ([single](32 * $scale)) ([single](7 * $scale))
  $g.FillPath($keyBrush, $stemPath)
  $stemPath.Dispose()
  $keyBrush.Dispose()

  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "  olusturuldu: $Path"
}

New-Icon 192 (Join-Path $OutDir 'icon-192.png') $false
New-Icon 512 (Join-Path $OutDir 'icon-512.png') $false
New-Icon 512 (Join-Path $OutDir 'icon-maskable-512.png') $true

Write-Host 'Simgeler hazir.'
