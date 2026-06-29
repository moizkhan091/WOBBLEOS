# WOBBLE OS - one-step push.
#
# Stages everything, commits, and pushes in one go, so triggering CI is a
# single action instead of three git commands.
#
# Usage (from anywhere):
#   powershell -ExecutionPolicy Bypass -File "C:\Wobble OS\scripts\push.ps1"
#   powershell -ExecutionPolicy Bypass -File "C:\Wobble OS\scripts\push.ps1" -Message "your message"
#
# If you don't pass -Message it will ask for one (or use a timestamp).

param(
  [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# Always operate on the project root (parent of this scripts/ folder).
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path ".git")) {
  Write-Error "This folder isn't a git repo yet. Run scripts\setup-github.ps1 first."
  exit 1
}

# Anything to commit?
$changes = git status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
  Write-Host "Nothing to commit. Pushing any unpushed commits..."
  git push
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Message)) {
  $Message = Read-Host "Commit message (blank = timestamp)"
  if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "WOBBLE OS update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
  }
}

git add -A
git commit -m $Message
git push

Write-Host ""
Write-Host "Pushed. CI is running: https://github.com/moizkhan091/WOBBLEOS/actions"
