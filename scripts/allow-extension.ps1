# Registry policy to allow DPF extension across all Chromium browsers
$extId = 'gpplglnoeigamjdeljfbgkkpikmmjjao'

$targets = @(
  'HKLM:\SOFTWARE\Policies\Google\Chrome\ExtensionInstallAllowlist',
  'HKLM:\SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallAllowlist',
  'HKLM:\SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallAllowlist'
)

foreach ($path in $targets) {
  if (!(Test-Path $path)) {
    New-Item -Path $path -Force | Out-Null
  }
  Set-ItemProperty -Path $path -Name '1' -Value $extId -Force | Out-Null
}

Write-Host "DPF Extension successfully allowlisted in Chrome, Brave, and Edge policies!"
