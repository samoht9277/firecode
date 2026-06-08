<#
.SYNOPSIS
  firecode installer for Windows.
    - builds the CLI
    - downloads the Playwright Firefox browser
    - puts `firecode` on your PATH (via a .cmd shim)
    - installs the Claude Code skill (optional)

.EXAMPLE
  ./install.ps1
  ./install.ps1 -NoSkill
#>
param(
  [switch]$NoSkill
)

$ErrorActionPreference = "Stop"
$RepoDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BinDir    = if ($env:FIRECODE_BIN_DIR) { $env:FIRECODE_BIN_DIR } else { Join-Path $env:USERPROFILE ".firecode\bin" }
$SkillDir  = Join-Path $env:USERPROFILE ".claude\skills\firecode"

function Info($m) { Write-Host "==> $m" -ForegroundColor Blue }
function Warn($m) { Write-Host "warning: $m" -ForegroundColor Yellow }
function Die($m)  { Write-Host "error: $m" -ForegroundColor Red; exit 1 }

# --- prerequisites ---------------------------------------------------------
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Die "Node.js not found. Install Node 20+ (https://nodejs.org)."
}
$nodeMajor = [int](node -p "process.versions.node.split('.')[0]")
if ($nodeMajor -lt 20) { Die "Node 20+ required (found $(node --version))." }

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Die "pnpm not found. Install it with: npm install -g pnpm  (or https://pnpm.io/installation)"
}

# --- build -----------------------------------------------------------------
Info "Installing dependencies..."
Push-Location $RepoDir
try {
  pnpm install
  Info "Building firecode..."
  pnpm build
  Info "Downloading the Playwright Firefox browser (this can take a minute)..."
  pnpm --filter "@firecode/server" exec playwright install firefox
} finally {
  Pop-Location
}

# --- create the shim -------------------------------------------------------
$CliEntry = Join-Path $RepoDir "packages\cli\dist\index.js"
if (-not (Test-Path $CliEntry)) { Die "Build did not produce $CliEntry" }

New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$Shim = Join-Path $BinDir "firecode.cmd"
"@echo off`r`nnode `"$CliEntry`" %*" | Set-Content -Path $Shim -Encoding ASCII
Info "Created shim: $Shim"

# Add BinDir to the user PATH if missing.
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$userPath;$BinDir", "User")
  Warn "Added $BinDir to your user PATH. Open a NEW terminal for `firecode` to be found."
}

# --- install the Claude Code skill ----------------------------------------
if (-not $NoSkill) {
  $srcSkill = Join-Path $RepoDir "skills\firecode"
  if (Test-Path $srcSkill) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SkillDir) | Out-Null
    if (Test-Path $SkillDir) { Remove-Item -Recurse -Force $SkillDir }
    # Junction works without admin/developer mode for directories.
    New-Item -ItemType Junction -Path $SkillDir -Target $srcSkill | Out-Null
    Info "Installed Claude Code skill: $SkillDir (junction, updates with git pull)"
  } else {
    Warn "skills\firecode not found, skipping skill install."
  }
}

# --- done ------------------------------------------------------------------
Info "Done. Open a new terminal, then try:"
Write-Host ""
Write-Host '    firecode browse main navigate "https://example.com"'
Write-Host "    firecode snapshot main"
Write-Host "    firecode stop"
Write-Host ""
