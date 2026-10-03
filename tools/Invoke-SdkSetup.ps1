# Run only in a child powershell.exe -File process, never paste into a shared terminal.
# Without -Install this is a read-only recovery check for the EXACT recorded run.
param(
    [Parameter(Mandatory = $true)][string]$RunDirectory,
    [switch]$Install
)
$ErrorActionPreference = 'Stop'

if ($RunDirectory -notmatch '^[a-zA-Z]:[\\/]') { throw 'Use an absolute local run directory.' }
$SdkLogDir = $RunDirectory
$SdkStdout = Join-Path $SdkLogDir 'npm.stdout.log'
$SdkStderr = Join-Path $SdkLogDir 'npm.stderr.log'
$ExitFile = Join-Path $SdkLogDir 'npm.exit-code.txt'
$SdkPackage = Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\package.json'
$SdkEntry = Join-Path $env:APPDATA 'npm\node_modules\@servicenow\sdk\bin\index.js'
Write-Output "SDK_LOG_DIR=$SdkLogDir"

if ($Install) {
    # Refuse to reuse a run, even if the previous caller lost its terminal result.
    if (Test-Path -LiteralPath $SdkLogDir) { throw 'SDK run directory already exists. Use read-only recovery without -Install; do not repeat installation.' }
    $NodeExe = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
    $NpmCli = Join-Path (Split-Path -Parent $NodeExe) 'node_modules\npm\bin\npm-cli.js'
    if (-not (Test-Path -LiteralPath $NpmCli -PathType Leaf)) { throw 'Locate the approved npm JavaScript entry point before continuing.' }
    New-Item -ItemType Directory -Path $SdkLogDir -ErrorAction Stop | Out-Null
    Set-Content -LiteralPath (Join-Path $SdkLogDir 'runner.pid.txt') -Value $PID -Encoding ascii
    $NpmProcess = Start-Process -FilePath $NodeExe -ArgumentList @("`"$NpmCli`"", 'install', '--global', '@servicenow/sdk@latest', '--no-progress') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $SdkStdout -RedirectStandardError $SdkStderr -ErrorAction Stop
    if ($null -eq $NpmProcess -or $null -eq $NpmProcess.ExitCode) { throw 'SDK install completion is unknown; inspect existing logs/process state, do not repeat it.' }
    $SdkExit = $NpmProcess.ExitCode
    Set-Content -LiteralPath $ExitFile -Value $SdkExit -Encoding ascii
}

# Also supports recovery of 0.3.4 runs, which have logs/exit status but no result JSON.
# Missing, unreadable, malformed or nonzero evidence never means success.
if (-not (Test-Path -LiteralPath $ExitFile -PathType Leaf)) { throw 'SDK install completion is unknown: no recorded exit status. Wait/check the original operation, do not reinstall.' }
$ExitText = (Get-Content -LiteralPath $ExitFile -Raw -ErrorAction Stop).Trim()
if ($ExitText -notmatch '^-?[0-9]+$') { throw 'Invalid recorded npm exit status; stop for review.' }
Write-Output "SDK_NPM_EXIT=$ExitText"
if ($ExitText -ne '0') { throw 'SDK installation failed; preserve both logs and stop setup.' }
if (-not (Test-Path -LiteralPath $SdkStdout -PathType Leaf) -or -not (Test-Path -LiteralPath $SdkStderr -PathType Leaf)) { throw 'SDK output logs are missing; stop for review.' }
Write-Output 'SDK_STDOUT_TAIL:'
Get-Content -LiteralPath $SdkStdout -Tail 12 -ErrorAction Stop
Write-Output 'SDK_STDERR_TAIL:'
Get-Content -LiteralPath $SdkStderr -Tail 12 -ErrorAction Stop
if (-not (Test-Path -LiteralPath $SdkPackage -PathType Leaf)) { throw 'SDK metadata is missing at the profile global path; review npm prefix configuration, do not reinstall blindly.' }
$SdkMetadata = Get-Content -LiteralPath $SdkPackage -Raw | ConvertFrom-Json
if ($SdkMetadata.name -ne '@servicenow/sdk' -or -not $SdkMetadata.version) { throw 'Unexpected SDK package metadata.' }
if (-not (Test-Path -LiteralPath $SdkEntry -PathType Leaf)) { throw 'SDK entry point is missing; package installation is incomplete.' }
$Result = @{
    schemaVersion = 1
    state = 'package-verified'
    npmExitCode = 0
    packageVersion = $SdkMetadata.version
    packagePath = $SdkPackage
    runDirectory = (Resolve-Path -LiteralPath $SdkLogDir).Path
    cliVerified = $false
}
if ($Install) {
    $Result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $SdkLogDir 'sdk.result.json') -Encoding utf8 -ErrorAction Stop
}
Write-Output "SDK_PACKAGE_VERSION=$($SdkMetadata.version)"
Write-Output 'SDK_PACKAGE_VERIFIED=true'
Write-Output 'SDK_NEXT_STEP=3; do not rerun npm. CLI acceptance remains a separate new-profile-terminal check.'
