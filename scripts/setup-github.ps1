# WOBBLE OS - one-time GitHub setup (run on Windows, where git works natively).
#
# This turns on automatic testing (CI). After this runs once, every push is
# checked automatically by GitHub Actions and you never run tests by hand.
#
# HOW TO USE:
#   1. Create an EMPTY repo on github.com (no README, no .gitignore, no license).
#      Copy its URL, e.g. https://github.com/yourname/wobble-os.git
#   2. In PowerShell, from C:\Wobble OS, run:
#         powershell -ExecutionPolicy Bypass -File scripts\setup-github.ps1
#      (It will ask for the repo URL, or pass it: ... setup-github.ps1 -RepoUrl <url>)
#
# It will: init git, make the first commit, connect the GitHub repo, and push.
# The first push may open a browser to sign in to GitHub - that is normal.

param(
  [string]$RepoUrl = ""
)

$ErrorActionPreference = "Stop"

# Move to the project root (parent of this scripts/ folder).
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Write-Host "==> Project: $root"

# Check git is installed.
try { git --version | Out-Null } catch {
  Write-Error "git is not installed. Install Git for Windows from https://git-scm.com/download/win and re-run."
  exit 1
}

# Ask for the repo URL if not provided.
if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
  $RepoUrl = Read-Host "Paste your empty GitHub repo URL (e.g. https://github.com/you/wobble-os.git)"
}
if ([string]::IsNullOrWhiteSpace($RepoUrl)) {
  Write-Error "No repo URL given. Create an empty GitHub repo first, then re-run."
  exit 1
}

# Init (safe to re-run).
if (-not (Test-Path ".git")) {
  git init | Out-Null
  Write-Host "==> git initialized"
} else {
  Write-Host "==> git already initialized"
}
git branch -M main

# Identity (only sets if missing, so it won't override your global config).
if (-not (git config user.email)) { git config user.email "moizkhan091@gmail.com" }
if (-not (git config user.name))  { git config user.name  "Moiz" }

# First commit.
git add -A
git commit -m "WOBBLE OS: spine (DB client, Chunk 03 audit, Chunk 04 approvals) + CI/deploy gate" 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "==> nothing new to commit (already committed)" }

# Connect remote and push.
$hasOrigin = (git remote) -contains "origin"
if ($hasOrigin) { git remote set-url origin $RepoUrl } else { git remote add origin $RepoUrl }
Write-Host "==> pushing to $RepoUrl"
git push -u origin main

Write-Host ""
Write-Host "DONE. Open your repo on GitHub and click the 'Actions' tab."
Write-Host "Every push from now on runs typecheck + test + build automatically (green/red)."
