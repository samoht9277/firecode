<#
.SYNOPSIS
  firecode uninstaller for Windows — removes the PATH shim and the Claude Code skill.
  Does not delete the repo or node_modules.
#>
$ErrorActionPreference = "SilentlyContinue"
$BinDir   = if ($env:FIRECODE_BIN_DIR) { $env:FIRECODE_BIN_DIR } else { Join-Path $env:USERPROFILE ".firecode\bin" }
$SkillDir = Join-Path $env:USERPROFILE ".claude\skills\firecode"

function Info($m) { Write-Host "==> $m" -ForegroundColor Blue }

# Stop any running server first.
if (Get-Command firecode -ErrorAction SilentlyContinue) {
  firecode stop 2>$null | Out-Null
}

$Shim = Join-Path $BinDir "firecode.cmd"
if (Test-Path $Shim) {
  Remove-Item -Force $Shim
  Info "Removed $Shim"
}

if (Test-Path $SkillDir) {
  Remove-Item -Recurse -Force $SkillDir
  Info "Removed $SkillDir"
}

# Remove BinDir from user PATH.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -like "*$BinDir*") {
  $newPath = ($userPath -split ';' | Where-Object { $_ -ne $BinDir }) -join ';'
  [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
  Info "Removed $BinDir from user PATH (restart your terminal)."
}

# Clean up leftover server state files.
Remove-Item -Force (Join-Path $env:USERPROFILE ".firecode\server*.json") 2>$null

Info "firecode uninstalled. Delete the repo folder to remove the rest."
