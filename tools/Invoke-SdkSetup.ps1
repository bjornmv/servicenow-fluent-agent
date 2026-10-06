# Run only in a child powershell.exe -File process, never paste into a shared terminal.
# Without -Install this is a read-only recovery check for the EXACT recorded run.
param(
    [Parameter(Mandatory = $true)][string]$RunDirectory,
    [switch]$Install,
    [ValidateRange(0, 600)][int]$WaitSeconds = 0
)
$ErrorActionPreference = 'Stop'
$WorkerVersion = '0.3.9'
Write-Output "SDK_WORKER_VERSION=$WorkerVersion"
if ($Install -and $WaitSeconds -ne 0) { throw 'WaitSeconds is for read-only recovery, not installation.' }

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
    # Fail closed before installation: metadata below is verified only at APPDATA/npm.
    # String-only normalization is safe in ConstrainedLanguage; do not resolve a
    # filesystem alias or accept relative/dot-segment paths as prefix evidence.
    function Normalize-SdkPrefix([string]$Value) {
        $Normalized = $Value.Replace('/', '\').TrimEnd('\')
        if ($Normalized -notmatch '^[a-zA-Z]:\\[^\\]' -or
            $Normalized.Substring(2) -match '[<>:"|?*\x00-\x1f]' -or
            $Normalized -match '\\\\|\\\.{1,2}(\\|$)|[. ](\\|$)') {
            throw 'Malformed npm global prefix; require an absolute local path and stop for configuration review.'
        }
        return $Normalized
    }
    $ExpectedPrefix = Normalize-SdkPrefix (Join-Path $env:APPDATA 'npm')
    $PrefixStdout = Join-Path $SdkLogDir 'npm-prefix.stdout.log'
    $PrefixStderr = Join-Path $SdkLogDir 'npm-prefix.stderr.log'
    $PrefixProcess = Start-Process -FilePath $NodeExe -ArgumentList @("`"$NpmCli`"", 'prefix', '--global') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $PrefixStdout -RedirectStandardError $PrefixStderr -ErrorAction Stop
    if ($null -eq $PrefixProcess -or $null -eq $PrefixProcess.ExitCode) { throw 'npm prefix completion is unknown; preserve this run for review. No SDK installation was started.' }
    Write-Output "SDK_NPM_PREFIX_EXIT=$($PrefixProcess.ExitCode)"
    if ($PrefixProcess.ExitCode -ne 0) { throw 'npm prefix failed; preserve prefix logs and stop. No SDK installation was started.' }
    $PrefixLines = @(Get-Content -LiteralPath $PrefixStdout -ErrorAction Stop)
    if ($PrefixLines.Count -ne 1 -or [string]::IsNullOrWhiteSpace($PrefixLines[0])) { throw 'npm prefix output is empty or multiple lines; stop for configuration review.' }
    $EffectivePrefix = Normalize-SdkPrefix $PrefixLines[0]
    if ($EffectivePrefix -ine $ExpectedPrefix) { throw 'npm global prefix differs from expected APPDATA/npm; stop for configuration review. No SDK installation was started.' }
    # Pin the verified prefix so later npm configuration changes cannot redirect installation.
    $NpmProcess = Start-Process -FilePath $NodeExe -ArgumentList @("`"$NpmCli`"", 'install', '--global', '--prefix', "`"$ExpectedPrefix`"", '@servicenow/sdk@latest', '--no-progress') -NoNewWindow -Wait -PassThru -RedirectStandardOutput $SdkStdout -RedirectStandardError $SdkStderr -ErrorAction Stop
    if ($null -eq $NpmProcess -or $null -eq $NpmProcess.ExitCode) { throw 'SDK install completion is unknown; inspect existing logs/process state, do not repeat it.' }
    $SdkExit = $NpmProcess.ExitCode
    $ExitPending = Join-Path $SdkLogDir 'npm.exit-code.pending'
    Set-Content -LiteralPath $ExitPending -Value $SdkExit -Encoding ascii
    Move-Item -LiteralPath $ExitPending -Destination $ExitFile -ErrorAction Stop
}

# Also supports recovery of 0.3.4 runs, which have logs/exit status but no result JSON.
# Missing, unreadable, malformed or nonzero evidence never means success.
$Deadline = (Get-Date).AddSeconds($WaitSeconds)
if (-not (Test-Path -LiteralPath $ExitFile -PathType Leaf) -and $WaitSeconds -gt 0) {
    Write-Output "SDK_STATUS=waiting-for-original-run; budget=$WaitSeconds seconds; no installation will be started."
}
while (-not (Test-Path -LiteralPath $ExitFile -PathType Leaf)) {
    if ((Get-Date) -ge $Deadline) { throw 'SDK install completion is unknown: no recorded exit status within the wait budget. Check the original operation, do not reinstall or claim failure.' }
    Start-Sleep -Seconds 1
}
$ExitText = (Get-Content -LiteralPath $ExitFile -Raw -ErrorAction Stop).Trim()
if ($ExitText -notmatch '^-?[0-9]+$') { throw 'Invalid recorded npm exit status; stop for review.' }
Write-Output "SDK_NPM_EXIT=$ExitText"
if ($ExitText -ne '0') { throw 'SDK installation failed; preserve both logs and stop setup.' }
if (-not (Test-Path -LiteralPath $SdkStdout -PathType Leaf) -or -not (Test-Path -LiteralPath $SdkStderr -PathType Leaf)) { throw 'SDK output logs are missing; stop for review.' }
Write-Output 'SDK_STDOUT_TAIL:'
Get-Content -LiteralPath $SdkStdout -Tail 12 -ErrorAction Stop
Write-Output 'SDK_STDERR_TAIL:'
Get-Content -LiteralPath $SdkStderr -Tail 12 -ErrorAction Stop
# Inspect the complete saved stderr, not just the diagnostic tail, in both modes.
if (Select-String -LiteralPath $SdkStderr -Pattern 'EBADENGINE' -SimpleMatch -Quiet -ErrorAction Stop) {
    Write-Output 'SDK_ENGINE_WARNING=true'
    throw 'npm exited 0 but reported EBADENGINE; stop setup for compatibility review. Preserve both logs and the recorded exit status; do not reinstall.'
}
if (-not (Test-Path -LiteralPath $SdkPackage -PathType Leaf)) { throw 'SDK metadata is missing at the profile global path; review npm prefix configuration, do not reinstall blindly.' }
$SdkMetadata = Get-Content -LiteralPath $SdkPackage -Raw | ConvertFrom-Json
if ($SdkMetadata.name -ne '@servicenow/sdk' -or -not $SdkMetadata.version) { throw 'Unexpected SDK package metadata.' }
if (-not (Test-Path -LiteralPath $SdkEntry -PathType Leaf)) { throw 'SDK entry point is missing; package installation is incomplete.' }
$Result = @{
    schemaVersion = 1
    workerVersion = $WorkerVersion
    state = 'package-verified'
    npmExitCode = 0
    packageVersion = $SdkMetadata.version
    packagePath = $SdkPackage
    runDirectory = (Resolve-Path -LiteralPath $SdkLogDir).Path
    cliVerified = $false
}
if ($Install) {
    $ResultPending = Join-Path $SdkLogDir 'sdk.result.pending'
    $Result | ConvertTo-Json | Set-Content -LiteralPath $ResultPending -Encoding utf8 -ErrorAction Stop
    Move-Item -LiteralPath $ResultPending -Destination (Join-Path $SdkLogDir 'sdk.result.json') -ErrorAction Stop
}
Write-Output "SDK_PACKAGE_VERSION=$($SdkMetadata.version)"
Write-Output 'SDK_PACKAGE_VERIFIED=true'
Write-Output 'SDK_NEXT_STEP=3; do not rerun npm. CLI acceptance remains a separate new-profile-terminal check.'
