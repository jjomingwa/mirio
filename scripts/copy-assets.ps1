$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent $PSScriptRoot
$robocopy = Get-Command robocopy.exe -ErrorAction Stop

$jobs = @(
    @{
        Source = 'downloads\exploration_files\exploration files'
        Destination = 'public\assets\audio\music'
        Pattern = 'exploration.ogg'
    },
    @{
        Source = 'downloads\going_up_files_0\Going up Files'
        Destination = 'public\assets\audio\music'
        Pattern = 'Going Up.ogg'
    },
    @{
        Source = 'downloads\sunny-land-files\Sunny-land-assets-files\code\sunny-land\assets\sound'
        Destination = 'public\assets\audio\music'
        Pattern = 'platformer_level03_loop.ogg'
    },
    @{
        Source = 'downloads\Sound Pack_Platformer\Sound Pack_Platformer'
        Destination = 'public\assets\audio\sfx'
        Pattern = '*.wav'
    },
    @{
        Source = 'downloads\sunny-land-files\Sunny-land-assets-files'
        Destination = 'public\assets\licenses\sunnyland'
        Pattern = 'public-license.txt'
    },
    @{
        Source = '.cache\assets\extracted\forest\Sunny-land-forest-files'
        Destination = 'public\assets\licenses\sunnyland-forest'
        Pattern = 'public-license.txt'
    },
    @{
        Source = 'downloads\going_up_files_0\Going up Files'
        Destination = 'public\assets\licenses\going-up'
        Pattern = 'public-license.txt'
    }
)

foreach ($job in $jobs) {
    $source = Join-Path $projectRoot $job.Source
    $destination = Join-Path $projectRoot $job.Destination

    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Missing source directory: $source"
    }

    New-Item -ItemType Directory -Path $destination -Force | Out-Null

    $arguments = @(
        $source,
        $destination,
        $job.Pattern,
        '/R:1',
        '/W:1',
        '/COPY:DAT',
        '/DCOPY:DAT',
        '/NP'
    )

    & $robocopy.Source @arguments
    $code = $LASTEXITCODE

    if ($code -ge 8) {
        throw "Robocopy failed with exit code ${code}: $source -> $destination [$($job.Pattern)]"
    }
}

$sourceSfx = @(
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'downloads\Sound Pack_Platformer\Sound Pack_Platformer') -File -Filter '*.wav'
)
$targetSfx = @(
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public\assets\audio\sfx') -File -Filter '*.wav'
)
$targetMusic = @(
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public\assets\audio\music') -File
)
$targetLicenses = @(
    Get-ChildItem -LiteralPath (Join-Path $projectRoot 'public\assets\licenses') -Recurse -File
)

if ($targetMusic.Count -ne 3) {
    throw "Expected 3 music files, found $($targetMusic.Count)."
}

if ($targetLicenses.Count -ne 3) {
    throw "Expected 3 license files, found $($targetLicenses.Count)."
}

$sourceManifest = $sourceSfx | ForEach-Object { "$($_.Name)|$($_.Length)" }
$targetManifest = $targetSfx | ForEach-Object { "$($_.Name)|$($_.Length)" }
$difference = Compare-Object $sourceManifest $targetManifest

if ($difference) {
    throw 'SFX names or sizes differ between source and destination.'
}

[PSCustomObject]@{
    MusicFiles = $targetMusic.Count
    SfxFiles = $targetSfx.Count
    LicenseFiles = $targetLicenses.Count
    MusicBytes = ($targetMusic | Measure-Object Length -Sum).Sum
    SfxBytes = ($targetSfx | Measure-Object Length -Sum).Sum
}
