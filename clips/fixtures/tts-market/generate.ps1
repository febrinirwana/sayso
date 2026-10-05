# Team-written speech text and fixture data dedicated to CC0-1.0.
# Requires Windows PowerShell and the built-in Microsoft David Desktop voice.
# From repository root:
# powershell -NoProfile -File clips/fixtures/tts-market/generate.ps1 -Out C:/studio-data/tts-market.wav
# Then run the CLI with this WAV and the adjacent manifest.json, using a private output directory.
# Media is never tracked. Same voice/version is required for the same media SHA256/clipId.
param([Parameter(Mandatory = $true)][string]$Out)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $speaker.SelectVoice("Microsoft David Desktop")
    $speaker.Rate = -1
    $speaker.Volume = 100
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
    $path = [System.IO.Path]::GetFullPath($Out)
    [System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($path)) | Out-Null
    $speaker.SetOutputToWaveFile($path, $format)
    $speaker.Speak([System.IO.File]::ReadAllText((Join-Path $PSScriptRoot "speech.txt")))
} finally {
    $speaker.Dispose()
}
