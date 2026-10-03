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
.PARAMETER RefreshEnvironment
Register an explicitly verified existing Git in user PATH and request Windows
environment propagation. No download, extraction, Git configuration or reinstall.
.PARAMETER GitExecutable
Absolute git.exe path for RefreshEnvironment only.
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
    [switch]$RefreshEnvironment,
    [string]$GitExecutable,
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
function Confirm-WindowsOpenSsh {
    param([string]$Executable, [string]$LogPrefix)
    if (-not (Test-Path -LiteralPath $Executable -PathType Leaf) -or $Executable -match '\s') {
        throw 'Expected Windows OpenSSH at a standard, space-free SystemRoot path.'
    }
    # ssh -V normally writes its version to stderr, even when it exits 0.
    # Do not inherit either native stream: an outer PS 5.1 caller using
    # ErrorActionPreference=Stop and 2>&1 would turn it into NativeCommandError.
    # Keep both streams as evidence; never relax error or security policy.
    $stdout = "$LogPrefix.stdout.log"
    $stderr = "$LogPrefix.stderr.log"
    try {
        $process = Start-Process -FilePath $Executable -ArgumentList '-V' -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    } catch {
        throw "Windows OpenSSH failed to start; deployment stopped. Probe logs: $stdout; $stderr. $($_.Exception.Message)"
    }
    if ($null -eq $process -or $null -eq $process.ExitCode -or $process.ExitCode -ne 0) {
        throw "Windows OpenSSH probe failed or returned no exit code; deployment stopped. Exit: $($process.ExitCode). Probe logs: $stdout; $stderr"
    }
    $version = (Get-Content -LiteralPath $stderr, $stdout -ErrorAction Stop) -join ' '
    Write-Log "Windows OpenSSH probe passed (exit 0): $($version.Trim()). Probe logs: $stdout; $stderr"
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
function Read-UserGitPath {
    # Preserve the raw registry value and type, including %VARIABLES%.
    $key = Get-Item -LiteralPath 'HKCU:\Environment' -ErrorAction Stop
    if ($key.Property -notcontains 'Path') { return @{ Value = ''; Kind = 'REG_EXPAND_SZ'; Exists = $false } }
    $existing = Get-ItemProperty -LiteralPath 'HKCU:\Environment' -Name Path -ErrorAction Stop
    if ([string]$existing.Path -match '[\r\n]') { throw 'Multiline user PATH requires manual review; no changes made.' }
    $reg = Join-Path $env:SystemRoot 'System32\reg.exe'
    $values = & $reg query 'HKCU\Environment' /v Path 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Unable to read the existing raw user PATH. No PATH changes made.' }
    foreach ($line in $values) {
        # reg query uses exactly four separator spaces. Do not greedily consume
        # leading whitespace that belongs to the value itself.
        if ($line -match '^ {4}Path {4}(REG_EXPAND_SZ|REG_SZ) {4}(.*)$') {
            return @{ Value = $Matches[2]; Kind = $Matches[1]; Exists = $true }
        }
    }
    throw 'Could not parse the existing raw user PATH. No PATH changes made.'
}
function Write-UserGitPath {
    param([string]$Value, [string]$Kind)
    # NEVER send PATH to setx: it can truncate long values and expand references.
    # A typed registry-provider write avoids PS 5.1 native argument quoting
    # stripping embedded double quotes. No .NET interop or policy changes.
    if ($Kind -eq 'REG_SZ') { $propertyType = 'String' }
    elseif ($Kind -eq 'REG_EXPAND_SZ') { $propertyType = 'ExpandString' }
    else { throw 'Unsupported user PATH registry type; no changes made.' }
    New-ItemProperty -LiteralPath 'HKCU:\Environment' -Name Path -PropertyType $propertyType -Value $Value -Force -ErrorAction Stop | Out-Null
}
function Get-EnvironmentPublisher {
    $publisher = Join-Path $env:SystemRoot 'System32\setx.exe'
    if (-not (Test-Path -LiteralPath $publisher -PathType Leaf)) { throw 'Windows setx.exe is unavailable. Stop for review; no notification fallback or policy bypass.' }
    $key = Get-Item -LiteralPath 'HKCU:\Environment' -ErrorAction Stop
    if ($key.Property -contains 'SN_FLUENT_ENV_REFRESH') {
        $marker = Get-ItemProperty -LiteralPath 'HKCU:\Environment' -Name SN_FLUENT_ENV_REFRESH -ErrorAction Stop
        if ([string]$marker.SN_FLUENT_ENV_REFRESH -notmatch '^Git254Bootstrap:[0-9-]+$') {
            throw 'SN_FLUENT_ENV_REFRESH already has an unrecognized value; do not overwrite another application setting.'
        }
    }
    return $publisher
}
function Publish-EnvironmentChange {
    param([string]$Publisher)
    # Use the standard Windows environment updater, not Add-Type/PInvoke,
    # COM, an alternate interpreter or a compiled policy workaround. Only this
    # short, owned, non-secret notification marker goes through setx, NOT PATH.
    $stamp = 'Git254Bootstrap:' + $runId
    if ($stamp.Length -gt 100 -or $stamp -notmatch '^Git254Bootstrap:[0-9-]+$') { throw 'Invalid environment notification marker.' }
    $unused = & $Publisher SN_FLUENT_ENV_REFRESH $stamp 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'Windows environment update failed. PATH may be registered, but propagation is incomplete; stop for review.' }
    $saved = Get-ItemProperty -LiteralPath 'HKCU:\Environment' -Name SN_FLUENT_ENV_REFRESH -ErrorAction Stop
    if ($saved.SN_FLUENT_ENV_REFRESH -cne $stamp) { throw 'Windows environment notification marker verification failed.' }
    Write-Log 'Requested Windows environment propagation using the native updater and a short owned marker; PATH was not passed to setx.'
}
function Add-UserGitPath {
    param([string]$GitDirectory)
    $publisher = Get-EnvironmentPublisher
    $before = Read-UserGitPath
    $cmd = $GitDirectory.TrimEnd('\')
    $hasPath = $false
    $managedCmd = Join-Path $env:LOCALAPPDATA 'Programs\Git\cmd'
    foreach ($entry in ($before.Value -split ';')) {
        $entry = $entry.Trim().TrimEnd('\')
        if ($entry -ieq $cmd -or ($cmd -ieq $managedCmd -and $entry -ieq '%LOCALAPPDATA%\Programs\Git\cmd')) { $hasPath = $true }
    }
    $newPath = $before.Value
    if (-not $hasPath) {
        if ($newPath -and -not $newPath.EndsWith(';')) { $newPath += ';' }
        $newPath += $cmd
    }
    $backup = Join-Path $LogDirectory "environment-before-$runId.json"
    if (Test-Path -LiteralPath $backup) { throw 'Environment backup already exists; stop rather than overwrite it.' }
    $before | ConvertTo-Json | Set-Content -LiteralPath $backup -Encoding utf8
    Write-Log "Saved raw user PATH/type before environment update: $backup"
    $current = Read-UserGitPath
    if ($current.Value -cne $before.Value -or $current.Kind -cne $before.Kind -or $current.Exists -ne $before.Exists) { throw 'User PATH changed during preparation; stop rather than overwrite concurrent edits.' }
    if (-not $hasPath) { Write-UserGitPath $newPath $before.Kind }
    $registered = Read-UserGitPath
    if ($registered.Value -cne $newPath -or $registered.Kind -cne $before.Kind) { throw 'Raw user PATH/type readback failed.' }
    Publish-EnvironmentChange $publisher
    $after = Read-UserGitPath
    if ($after.Value -cne $newPath -or $after.Kind -cne $before.Kind) { throw 'PATH changed during environment notification; review before proceeding.' }
    Write-Log 'Verified shell-independent user PATH registration and native environment update. No machine PATH or shell startup file was changed.'
    Write-Log 'Already-running terminals/hosts may retain old environments. Restart affected applications from a refreshed launcher; do not reinstall Git. Live terminal acceptance remains required.'
}

try {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
    Write-Log "MinGit check: minimum $minimum; only downloadable build $pinned."
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') { throw 'Use 64-bit Windows PowerShell on Windows x64.' }
    if (($InstallIfMissing -and ($StageOnly -or $ValidateOnly -or $ReplaceFullGit)) -or ($StageOnly -and ($ValidateOnly -or $ReplaceFullGit)) -or ($ValidateOnly -and $ReplaceFullGit)) {
        throw 'InstallIfMissing, StageOnly, ValidateOnly and ReplaceFullGit are mutually exclusive.'
    }
    if ($RefreshEnvironment -and ($InstallIfMissing -or $StageOnly -or $ValidateOnly -or $ReplaceFullGit)) { throw 'RefreshEnvironment cannot be combined with installation/staging/migration modes.' }
    if ($GitExecutable -and -not $RefreshEnvironment) { throw 'GitExecutable is only supported with RefreshEnvironment.' }
    if ($RefreshEnvironment) {
        if (-not $GitExecutable -or $GitExecutable -notmatch '^[A-Za-z]:[\\/]' -or (Split-Path -Leaf $GitExecutable) -ine 'git.exe' -or $GitExecutable -match '[;\r\n%]') { throw 'RefreshEnvironment requires a safe absolute GitExecutable path to an existing git.exe.' }
        $git = Read-GitVersion $GitExecutable
        if ($git.Version -lt $minimum) { throw 'Existing Git is older than the required minimum. No upgrade or replacement is allowed.' }
        $groups = & "$env:SystemRoot\System32\whoami.exe" /groups /fo csv /nh 2>&1
        if ($LASTEXITCODE -ne 0 -or ($groups -join ' ') -match 'S-1-16-(12288|16384|20480)') { throw 'Use the intended non-elevated user context for environment updates.' }
        Add-UserGitPath (Split-Path -Parent $GitExecutable)
        Write-Log "ENVIRONMENT UPDATED for $($git.FullVersion): $GitExecutable. No Git installation/configuration changes; existing process environments are not certified."
        exit 0
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
    Confirm-WindowsOpenSsh $windowsSsh (Join-Path $LogDirectory "ssh-$runId")
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
    Add-UserGitPath (Join-Path $target 'cmd')
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
