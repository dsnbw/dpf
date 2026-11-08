!macro customInstall
  DetailPrint "Configuring browser enterprise extension allowlist for DPF..."
  WriteRegStr HKLM "SOFTWARE\Policies\Google\Chrome\ExtensionInstallAllowlist" "1" "gpplglnoeigamjdeljfbgkkpikmmjjao"
  WriteRegStr HKLM "SOFTWARE\Policies\BraveSoftware\Brave\ExtensionInstallAllowlist" "1" "gpplglnoeigamjdeljfbgkkpikmmjjao"
  WriteRegStr HKLM "SOFTWARE\Policies\Microsoft\Edge\ExtensionInstallAllowlist" "1" "gpplglnoeigamjdeljfbgkkpikmmjjao"
!macroend
