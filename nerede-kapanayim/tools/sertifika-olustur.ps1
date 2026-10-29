# Telefonda otomatik konum için yerel HTTPS sertifikası üretir.
# Kullanım: powershell -ExecutionPolicy Bypass -File tools\sertifika-olustur.ps1
# Sonra sunucuyu yeniden başlat: node server.js

$ErrorActionPreference = 'Stop'

$Certs = Join-Path (Split-Path $PSScriptRoot -Parent) 'certs'
New-Item -ItemType Directory -Force -Path $Certs | Out-Null

$ips = @(
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress -Unique
)
$names = @('localhost', [System.Net.Dns]::GetHostName()) + $ips
$names = $names | Where-Object { $_ } | Select-Object -Unique

Write-Host 'Sertifika su adlar icin uretiliyor:' ($names -join ', ')

$cert = New-SelfSignedCertificate `
  -DnsName $names `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -NotAfter (Get-Date).AddYears(3) `
  -FriendlyName 'Nerede Kapansin Local'

$password = ConvertTo-SecureString -String 'nerede-kapansin' -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath (Join-Path $Certs 'server.pfx') -Password $password | Out-Null
Set-Content -Path (Join-Path $Certs 'passphrase.txt') -Value 'nerede-kapansin' -NoNewline

Write-Host ''
Write-Host 'Hazir: certs/server.pfx'
Write-Host 'Sunucuyu yeniden baslat ve telefonda https://<bilgisayar-ip>:8090 adresini ac.'
Write-Host 'Tarayici "guvenli degil" derse "Gelismis > Devam et" sec. Konum izni ver.'
