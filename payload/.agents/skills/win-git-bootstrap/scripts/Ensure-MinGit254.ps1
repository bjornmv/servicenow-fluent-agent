#requires -Version 5.1
<#
.SYNOPSIS
Skip a working Git >=2.54.0; otherwise deploy only official MinGit 2.54.0.windows.1.
.DESCRIPTION
Windows x64, current user, non-elevated. No installer, post-install scripts,
policy changes, update checker or execution of bundled SSH/Bash/curl.
.PARAMETER InstallIfMissing
Agent-setup mode: install only if Git is genuinely absent. Never update,
repair, replace or migrate an existing installation automatically.
.PARAMETER ReplaceFullGit
Explicit one-time migration of the registered per-user full Git at the managed
path. Stage/configure/test MinGit before invoking its signed uninstaller.
.PARAMETER StageOnly
Download and verify the fixed ZIP without changing the installed Git.
.PARAMETER ValidateOnly
Selectively extract, configure and test a separate staging directory; never
uninstall, promote the directory or change the user PATH.
#>
[CmdletBinding()]
param(
    [switch]$InstallIfMissing,
    [switch]$StageOnly,
    [switch]$ValidateOnly,
    [switch]$ReplaceFullGit,
    [string]$CacheDirectory = (Join-Path $env:LOCALAPPDATA 'Git254Bootstrap\cache'),
    [string]$LogDirectory = (Join-Path $env:LOCALAPPDATA 'Git254Bootstrap\logs')
)
$ErrorActionPreference = 'Stop'
$minimum = [version]'2.54.0'
$pinned = '2.54.0.windows.1'
$url = 'https://github.com/git-for-windows/git/releases/download/v2.54.0.windows.1/MinGit-2.54.0-64-bit.zip'
$expectedHash = '04F937E1F0918B17B9BE6F2294CB2BB66E96E1D9832D1C298E2DE088A1D0E668'
$archive = Join-Path $CacheDirectory 'MinGit-2.54.0-64-bit.zip'
$target = Join-Path $env:LOCALAPPDATA 'Programs\Git'
$targetGit = Join-Path $target 'cmd\git.exe'
$markerName = '.mingit254-bootstrap.json'
$fullGitKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1'
$runId = '{0}-{1}' -f (Get-Date -Format 'yyyyMMdd-HHmmss-fff'), $PID
$log = Join-Path $LogDirectory "mingit-$runId.log"
$stage = Join-Path $env:LOCALAPPDATA "Git254Bootstrap\staging\mingit-$runId"
$windowsSsh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
# Deliberately omit these optional Unix utilities BEFORE extraction. Never
# rename or execute a blocked binary, or extract it and then delete it.
$excludedFiles = @('usr/bin/find.exe', 'usr/bin/sort.exe')
$lockAcquired = $false
$lock = Join-Path $env:LOCALAPPDATA 'Git254Bootstrap\deployment.lock'

function Write-Log {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    $line | Out-File -LiteralPath $log -Encoding utf8 -Append
    Write-Host $line
}
function Invoke-Git {
    param([string]$Executable, [string[]]$GitArguments)
    # Native Git can write successful progress messages to stderr in PS 5.1.
    # Preserve that output, but judge success by an explicitly reset exit code.
    $saved = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $global:LASTEXITCODE = $null
    try { $output = & $Executable @GitArguments 2>&1; $result = $global:LASTEXITCODE }
    finally { $ErrorActionPreference = $saved }
    if ($null -eq $result -or $result -ne 0) {
        throw "Git command could not run or failed (exit $result): $($output -join ' ')"
    }
    return ($output -join ' ').Trim()
}
function Read-GitVersion {
    param([string]$Executable)
    $text = Invoke-Git $Executable @('--version')
    if ($text -notmatch '^git version (\d+\.\d+\.\d+)(\.windows\.\d+)?$') {
        throw "Unrecognized stable Git version at '$Executable': $text"
    }
    return @{ Path = $Executable; Version = [version]$Matches[1]; FullVersion = $Matches[1] + $Matches[2] }
}
function Get-Inventory {
    $paths = @()
    $command = Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { $paths += $command.Source }
    $paths += $targetGit
    foreach ($key in @($fullGitKey, 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1')) {
        if (Test-Path -LiteralPath $key) {
            $record = Get-ItemProperty -LiteralPath $key
            if ($record.InstallLocation) { $paths += Join-Path $record.InstallLocation 'cmd\git.exe' }
        }
    }
    foreach ($base in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($base) { $paths += Join-Path $base 'Git\cmd\git.exe' }
    }
    $seen = @()
    foreach ($path in $paths) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        $resolved = (Resolve-Path -LiteralPath $path).Path
        if ($seen -contains $resolved) { continue }
        $seen += $resolved
        # Blocked/unverifiable executable is an error, never "Git is absent".
        Read-GitVersion $resolved
    }
}
function Confirm-Archive {
    param([string]$Path)
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'MinGit ZIP SHA-256 mismatch. Refusing to extract or execute it.'
    }
    Write-Log 'Verified exact official MinGit ZIP SHA-256.'
}
function Get-Archive {
    New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $archive -PathType Leaf) { Confirm-Archive $archive; return }
    $partial = Join-Path $CacheDirectory "MinGit-$runId.partial.zip"
    try {
        Write-Log "Downloading ONLY $url"
        $savedProgress = $ProgressPreference
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $url -OutFile $partial -UseBasicParsing -TimeoutSec 600
        } finally { $ProgressPreference = $savedProgress }
        Confirm-Archive $partial
        Move-Item -LiteralPath $partial -Destination $archive
    } finally {
        if (Test-Path -LiteralPath $partial) { Remove-Item -LiteralPath $partial -Force }
    }
}
function Confirm-NoBusyGit {
    if (@(Get-Process -Name git,ssh,git-bash,git-cmd -ErrorAction SilentlyContinue).Count -gt 0) {
        throw 'Git/SSH processes are running. Close them first; this procedure never kills applications.'
    }
}
function Confirm-NoDeploymentBlocks {
    param([datetime]$Since)
    $checks = @(
        @{ Name = 'Microsoft-Windows-Windows Defender/Operational'; Id = @(1121) },
        @{ Name = 'Microsoft-Windows-AppLocker/EXE and DLL'; Id = @(8004) },
        @{ Name = 'Microsoft-Windows-AppLocker/MSI and Script'; Id = @(8007, 8029) },
        @{ Name = 'Microsoft-Windows-CodeIntegrity/Operational'; Id = @(3033, 3077) }
    )
    foreach ($check in $checks) {
        try {
            $events = @(Get-WinEvent -FilterHashtable @{ LogName = $check.Name; Id = $check.Id; StartTime = $Since } -ErrorAction Stop)
        } catch {
            if ($_.FullyQualifiedErrorId -like 'NoMatchingEventsFound*') { continue }
            throw "Cannot inspect security log '$($check.Name)'. Stop for an administrator review rather than claiming a clean deployment."
        }
        foreach ($event in $events) {
            $message = ([string]$event.Message).ToLowerInvariant()
            # Match path suffixes too: AppLocker uses %OSDRIVE%, and Code
            # Integrity can use device-volume paths instead of drive letters.
            if ($message.Contains($stage.Substring(2).ToLowerInvariant()) -or $message.Contains($target.Substring(2).ToLowerInvariant())) {
                throw "Security block recorded during this deployment: $($check.Name), event $($event.Id), record $($event.RecordId). Do not retry via another executable or weaken policy."
            }
        }
    }
    Write-Log 'No deployment-path block found in the checked Defender/AppLocker/Code Integrity events so far (not a policy approval).'
}
function Add-UserGitPath {
    # reg.exe preserves the raw REG_EXPAND_SZ value (including %VARIABLES%).
    # Never use setx, which can truncate PATH. No system PATH changes.
    $reg = Join-Path $env:SystemRoot 'System32\reg.exe'
    $values = & $reg query 'HKCU\Environment' /v Path 2>$null
    $queryExit = $LASTEXITCODE
    $oldPath = ''
    $kind = 'REG_EXPAND_SZ'
    if ($queryExit -eq 0) {
        $matched = $false
        foreach ($line in $values) {
            if ($line -match '^\s*Path\s+(REG_EXPAND_SZ|REG_SZ)\s+(.*)$') {
                $kind = $Matches[1]; $oldPath = $Matches[2]; $matched = $true
            }
        }
        if (-not $matched) { throw 'Could not parse the existing raw user PATH. No PATH changes made.' }
    } elseif (Test-Path -LiteralPath 'HKCU:\Environment') {
        $existing = Get-ItemProperty -LiteralPath 'HKCU:\Environment'
        if ($null -ne $existing.Path) { throw 'Unable to read the existing user PATH. No PATH changes made.' }
    } else { throw 'Unable to read HKCU environment.' }
    $cmd = Join-Path $target 'cmd'
    $hasPath = $false
    foreach ($entry in ($oldPath -split ';')) {
        if ($entry.Trim().TrimEnd('\') -in @($cmd, '%LOCALAPPDATA%\Programs\Git\cmd')) { $hasPath = $true }
    }
    if (-not $hasPath) {
        $newPath = $cmd
        if ($oldPath) { $newPath = $oldPath.TrimEnd(';') + ';' + $cmd }
        $unused = & $reg add 'HKCU\Environment' /v Path /t $kind /d $newPath /f 2>&1
        if ($LASTEXITCODE -ne 0) { throw 'Unable to register MinGit in the user PATH.' }
        Write-Log 'Added only the Git cmd directory to the user PATH.'
    }
    Write-Log 'PATH changes do not refresh already-running parent processes. Use the explicit Git path now, or sign out/in for a guaranteed refresh.'
}

try {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    Write-Log "MinGit check: minimum $minimum; only downloadable build $pinned."
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Use 64-bit Windows PowerShell on Windows x64.' }
    if (($InstallIfMissing -and ($StageOnly -or $ValidateOnly -or $ReplaceFullGit)) -or ($StageOnly -and ($ValidateOnly -or $ReplaceFullGit)) -or ($ValidateOnly -and $ReplaceFullGit)) {
        throw 'InstallIfMissing, StageOnly, ValidateOnly and ReplaceFullGit are mutually exclusive.'
    }
    if ($StageOnly) { Get-Archive; Write-Log 'STAGED: ZIP verified; installed Git unchanged.'; exit 0 }
    $inventory = @(Get-Inventory)
    foreach ($git in $inventory) { Write-Log "Found $($git.FullVersion): $($git.Path)" }
    if (-not $ReplaceFullGit -and -not $ValidateOnly -and $inventory.Count -gt 0 -and $inventory[0].Version -ge $minimum) {
        if ($inventory[0].FullVersion -ne $pinned) { Write-Log 'WARNING: Existing version satisfies threshold but is not the pinned build; no application-control approval is implied.' }
        Write-Log 'SKIP: Working Git >=2.54.0 found. No download, install, uninstall or configuration changes.'
        exit 0
    }
    if ($InstallIfMissing) {
        if ($inventory.Count -gt 0) { throw 'An older Git is already installed. Absent-only agent setup will not upgrade or replace it; ask the user.' }
        foreach ($key in @($fullGitKey, 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1')) {
            if (Test-Path -LiteralPath $key) { throw 'Git registration exists but no executable was verified. Treat this as a repair/policy issue, not absence; stop and ask.' }
        }
        if (Test-Path -LiteralPath $target) { throw 'The Git installation directory already exists. Absent-only agent setup will not overwrite or repair it; stop and ask.' }
        Write-Log 'ABSENT-ONLY SETUP: no Git executable, standard Git registration or managed installation directory found.'
    }
    if ($inventory.Count -gt 1 -or ($inventory.Count -eq 1 -and $inventory[0].Path -ne $targetGit)) {
        throw 'Conflicting or non-managed Git installation. Resolve its installation scope/PATH manually.'
    }
    if ($env:GIT_SSH -or $env:GIT_SSH_COMMAND -or $env:GIT_CONFIG_SYSTEM -or $env:GIT_CONFIG_NOSYSTEM -or $env:GIT_CONFIG_COUNT -or $env:GIT_SSL_NO_VERIFY) {
        throw 'Git environment overrides are present. Review them before deployment; values were not logged.'
    }
    $groups = & "$env:SystemRoot\System32\whoami.exe" /groups /fo csv /nh 2>&1
    if ($LASTEXITCODE -ne 0 -or ($groups -join ' ') -match 'S-1-16-(12288|16384|20480)') {
        throw 'Cannot verify a non-elevated user context. Do not run as Administrator or SYSTEM.'
    }
    if (-not (Test-Path -LiteralPath $windowsSsh -PathType Leaf) -or $windowsSsh -match '\s') {
        throw 'Expected Windows OpenSSH at a standard, space-free SystemRoot path.'
    }
    $sshCheck = Start-Process -FilePath $windowsSsh -ArgumentList '-V' -NoNewWindow -Wait -PassThru
    if ($sshCheck.ExitCode -ne 0) { throw 'Windows OpenSSH failed to start; deployment stopped.' }
    Confirm-NoBusyGit

    $uninstaller = $null
    if ($ReplaceFullGit) {
        if (-not (Test-Path -LiteralPath $fullGitKey)) { throw 'No registered per-user full Git found to migrate.' }
        $record = Get-ItemProperty -LiteralPath $fullGitKey
        if ($record.InstallLocation.TrimEnd('\') -ne $target) { throw 'Registered full Git is outside the managed path.' }
        if ($record.UninstallString -notmatch '^"([^"\r\n]+\\unins\d+\.exe)"$') { throw 'Unexpected uninstaller command; refusing to interpret it.' }
        $uninstaller = $Matches[1]
        if ((Split-Path -Parent $uninstaller) -ne $target) { throw 'Uninstaller is outside the managed installation.' }
        $signature = Get-AuthenticodeSignature -LiteralPath $uninstaller
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -ne 'CN=Johannes Schindelin, O=Johannes Schindelin, S=Nordrhein-Westfalen, C=DE') {
            throw 'Registered uninstaller signature/publisher verification failed.'
        }
    } elseif (-not $ValidateOnly -and (Test-Path -LiteralPath $target)) {
        $marker = Join-Path $target $markerName
        if (-not (Test-Path -LiteralPath $marker)) { throw 'Target already exists and is not managed MinGit. Full Git migration requires explicit -ReplaceFullGit.' }
        $ownership = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
        if ($ownership.Distribution -ne 'MinGit' -or $ownership.ManagedBy -ne 'Ensure-MinGit254.ps1') { throw 'Unrecognized target ownership marker.' }
    }
    # Directory creation without -Force is an atomic single-worker lock.
    New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null
    $lockAcquired = $true
    Get-Archive
    $auditStart = Get-Date
    if (-not (Test-Path -LiteralPath $tar -PathType Leaf)) { throw 'Windows tar.exe is required for pre-extraction exclusions. No unfiltered-extraction fallback.' }
    $excludeArguments = @()
    foreach ($file in $excludedFiles) { $excludeArguments += '--exclude=' + $file }
    # Listing touches no destination files. Check that this tar actually honors
    # the exclusions before letting it write anything to the new staging path.
    $filteredList = @(& $tar @excludeArguments -tf $archive)
    if ($LASTEXITCODE -ne 0 -or $filteredList.Count -eq 0) { throw 'Could not obtain a filtered ZIP file list.' }
    foreach ($file in $excludedFiles) {
        if ($filteredList -contains $file) { throw "Archive tool did not honor exclusion: $file" }
    }
    if ($filteredList -notcontains 'cmd/git.exe') { throw 'Filtered archive is missing the Git entry point.' }
    Write-Log ('Pre-extraction exclusions verified: ' + ($excludedFiles -join ', '))
    New-Item -ItemType Directory -Path $stage -ErrorAction Stop | Out-Null
    Write-Log "Selectively extracting verified ZIP to staging: $stage"
    & $tar @excludeArguments -xf $archive -C $stage
    if ($LASTEXITCODE -ne 0) { throw 'Selective ZIP extraction failed; installed Git is unchanged.' }
    foreach ($file in $excludedFiles) {
        if (Test-Path -LiteralPath (Join-Path $stage $file)) { throw "Excluded file unexpectedly exists: $file" }
    }
    foreach ($unexpected in @('post-install.bat', 'mingw64\bin\curl.exe', 'usr\bin\bash.exe', 'mingw64\bin\git-lfs.exe')) {
        if (Test-Path -LiteralPath (Join-Path $stage $unexpected)) { throw "Unexpected full-distribution component in archive: $unexpected" }
    }
    $stageGit = Join-Path $stage 'cmd\git.exe'
    if ((Read-GitVersion $stageGit).FullVersion -ne $pinned) { throw 'Staged Git is not the exact pinned build.' }
    $config = Join-Path $stage 'etc\gitconfig'
    $settings = @{
        'http.sslBackend' = 'schannel'; 'http.sslVerify' = 'true';
        'core.sshCommand' = $windowsSsh.Replace('\', '/'); 'ssh.variant' = 'ssh';
        'credential.helper' = 'manager'; 'core.autocrlf' = 'true';
        'core.fscache' = 'true'; 'core.symlinks' = 'false';
        'init.defaultBranch' = 'master'; 'pull.rebase' = 'false';
        'core.editor' = 'notepad.exe'; 'core.pager' = 'cat'
    }
    foreach ($key in $settings.Keys) { $null = Invoke-Git $stageGit @('config', '--file', $config, '--replace-all', $key, $settings[$key]) }
    # Small offline base-Git test before disturbing the existing installation.
    $testRepo = Join-Path $stage '.bootstrap-probe'
    $null = Invoke-Git $stageGit @('init', '--quiet', $testRepo)
    $null = Invoke-Git $stageGit @('-C', $testRepo, 'status', '--porcelain')
    Remove-Item -LiteralPath $testRepo -Recurse -Force
    @{ Distribution = 'MinGit'; Version = $pinned; ArchiveSHA256 = $expectedHash; OmittedFiles = $excludedFiles; ManagedBy = 'Ensure-MinGit254.ps1' } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage $markerName) -Encoding utf8
    Write-Log 'Staged native Git version/init/status passed; Windows OpenSSH and Schannel configured. No bundled scripts executed.'
    Confirm-NoDeploymentBlocks $auditStart
    if ($ValidateOnly) {
        Write-Log "VALIDATED STAGING ONLY: $stage"
        Write-Log 'Installed Git, registry and PATH unchanged. Shell scripts/hooks requiring omitted Unix find/sort are outside the validated feature set.'
        exit 0
    }
    Confirm-NoBusyGit
    if ($uninstaller) {
        Write-Log 'Explicit migration: removing the registered full Git only after successful MinGit staging.'
        $uninstallLog = Join-Path $LogDirectory "mingit-migration-uninstall-$runId.log"
        $process = Start-Process -FilePath $uninstaller -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', ('/LOG="{0}"' -f $uninstallLog)) -Wait -PassThru
        if ($process.ExitCode -ne 0 -or (Test-Path -LiteralPath $fullGitKey) -or (Test-Path -LiteralPath $targetGit)) {
            throw "Full Git removal is incomplete (exit $($process.ExitCode)). Verified stage retained at $stage. Do not force removal."
        }
    }
    if (Test-Path -LiteralPath $target) {
        $backup = "$target.before-mingit-$runId"
        Move-Item -LiteralPath $target -Destination $backup
        Write-Log "Retained previous directory/residual files at $backup"
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    Move-Item -LiteralPath $stage -Destination $target
    if ((Read-GitVersion $targetGit).FullVersion -ne $pinned) { throw 'Final-path Git verification failed. Inspect logs; no automatic fallback or policy bypass.' }
    foreach ($key in @('http.sslBackend', 'core.sshCommand')) {
        if ((Invoke-Git $targetGit @('config', '--system', '--get', $key)) -ne $settings[$key]) { throw "Installed system setting mismatch: $key" }
    }
    Add-UserGitPath
    Confirm-NoDeploymentBlocks $auditStart
    Write-Log "SUCCESS: Official MinGit $pinned deployed at $target. Only native Git was exercised; private authentication is untested."
    Write-Log 'Check security events for this deployment interval before calling it warning-free. No automatic update or reboot.'
    exit 0
} catch {
    $message = "FAILED: $($_.Exception.Message)"
    try { Write-Log $message } catch { Write-Host $message }
    exit 1
} finally {
    if ($lockAcquired) { Remove-Item -LiteralPath $lock -ErrorAction SilentlyContinue }
}
