param(
  [Parameter(Mandatory = $true)]
  [string]$SourceImage,

  [Parameter(Mandatory = $true)]
  [string]$OutputDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-ResizedBitmap {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size
  )

  $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.DrawImage($Image, 0, 0, $Size, $Size)
    return $bitmap
  } finally {
    $graphics.Dispose()
  }
}

function Save-Png {
  param(
    [System.Drawing.Bitmap]$Bitmap,
    [string]$Path
  )

  $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Write-IcoFile {
  param(
    [System.Drawing.Image]$Image,
    [string]$Path,
    [int[]]$Sizes
  )

  $streams = New-Object System.Collections.Generic.List[System.IO.MemoryStream]
  $writer = $null
  try {
    foreach ($size in $Sizes) {
      $bitmap = New-ResizedBitmap -Image $Image -Size $size
      try {
        $memory = New-Object System.IO.MemoryStream
        $bitmap.Save($memory, [System.Drawing.Imaging.ImageFormat]::Png)
        $null = $memory.Seek(0, [System.IO.SeekOrigin]::Begin)
        $streams.Add($memory)
      } finally {
        $bitmap.Dispose()
      }
    }

    $fileStream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
    try {
      $writer = New-Object System.IO.BinaryWriter($fileStream)
      $writer.Write([UInt16]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]$streams.Count)

      $offset = 6 + (16 * $streams.Count)
      for ($i = 0; $i -lt $streams.Count; $i += 1) {
        $size = $Sizes[$i]
        $stream = $streams[$i]
        $dimension = if ($size -ge 256) { 0 } else { $size }
        $writer.Write([Byte]$dimension)
        $writer.Write([Byte]$dimension)
        $writer.Write([Byte]0)
        $writer.Write([Byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$stream.Length)
        $writer.Write([UInt32]$offset)
        $offset += [int]$stream.Length
      }

      foreach ($stream in $streams) {
        $bytes = $stream.ToArray()
        $writer.Write($bytes)
      }
    } finally {
      if ($writer) { $writer.Dispose() }
      else { $fileStream.Dispose() }
    }
  } finally {
    foreach ($stream in $streams) {
      $stream.Dispose()
    }
  }
}

$resolvedSource = (Resolve-Path -LiteralPath $SourceImage).Path
if (!(Test-Path -LiteralPath $resolvedSource)) {
  throw "Source image not found: $SourceImage"
}

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDir).Path

$image = [System.Drawing.Image]::FromFile($resolvedSource)
try {
  foreach ($size in @(1024, 512, 256, 128, 64, 48, 32, 16)) {
    $bitmap = New-ResizedBitmap -Image $image -Size $size
    try {
      Save-Png -Bitmap $bitmap -Path (Join-Path $resolvedOutput "icon-$size.png")
    } finally {
      $bitmap.Dispose()
    }
  }

  Copy-Item -LiteralPath (Join-Path $resolvedOutput 'icon-256.png') -Destination (Join-Path $resolvedOutput 'icon.png') -Force
  Write-IcoFile -Image $image -Path (Join-Path $resolvedOutput 'icon.ico') -Sizes @(256, 128, 64, 48, 32, 16)
} finally {
  $image.Dispose()
}
