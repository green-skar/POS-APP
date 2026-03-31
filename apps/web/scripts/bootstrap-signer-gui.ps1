Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$bgPath = Join-Path $projectRoot "public\Texturelabs_Wood_280L.jpg"
$signerMjs = Join-Path $scriptDir "bootstrap-signer.mjs"
$signerJs = Join-Path $scriptDir "bootstrap-signer.js"
$signerPath = $null
if (Test-Path -LiteralPath $signerMjs) { $signerPath = $signerMjs }
elseif (Test-Path -LiteralPath $signerJs) { $signerPath = $signerJs }
$outputPath = Join-Path $scriptDir "bootstrap-response-token.txt"

function New-Label {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$W = 740,
    [int]$H = 22
  )
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Left = $X
  $label.Top = $Y
  $label.Width = $W
  $label.Height = $H
  $label.ForeColor = [System.Drawing.Color]::FromArgb(30, 20, 15)
  $label.BackColor = [System.Drawing.Color]::Transparent
  $label.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
  return $label
}

function New-Textbox {
  param(
    [int]$X,
    [int]$Y,
    [int]$W = 740,
    [int]$H = 28,
    [bool]$Multiline = $false
  )
  $tb = New-Object System.Windows.Forms.TextBox
  $tb.Left = $X
  $tb.Top = $Y
  $tb.Width = $W
  $tb.Height = $H
  $tb.Multiline = $Multiline
  $tb.ScrollBars = if ($Multiline) { "Vertical" } else { "None" }
  $tb.BackColor = [System.Drawing.Color]::FromArgb(252, 247, 238)
  $tb.ForeColor = [System.Drawing.Color]::FromArgb(34, 26, 20)
  $tb.BorderStyle = "FixedSingle"
  $tb.Font = New-Object System.Drawing.Font("Consolas", 9)
  return $tb
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Dreamnet Offline Bootstrap Signer"
$form.Width = 840
$form.Height = 760
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(242, 228, 205)
$form.Font = New-Object System.Drawing.Font("Segoe UI", 9)

if (Test-Path -LiteralPath $bgPath) {
  try {
    $bgImage = [System.Drawing.Image]::FromFile($bgPath)
    $form.BackgroundImage = $bgImage
    $form.BackgroundImageLayout = "Stretch"
  } catch {
    # ignore image load failure
  }
}

$overlay = New-Object System.Windows.Forms.Panel
$overlay.Left = 14
$overlay.Top = 14
$overlay.Width = 792
$overlay.Height = 694
$overlay.BackColor = [System.Drawing.Color]::FromArgb(225, 255, 255, 255)
$form.Controls.Add($overlay)

$title = New-Object System.Windows.Forms.Label
$title.Text = "Dreamnet Activation Token Signer"
$title.Left = 20
$title.Top = 14
$title.Width = 740
$title.Height = 32
$title.ForeColor = [System.Drawing.Color]::FromArgb(48, 32, 24)
$title.Font = New-Object System.Drawing.Font("Segoe UI Semibold", 14, [System.Drawing.FontStyle]::Bold)
$overlay.Controls.Add($title)

$subtitle = New-Object System.Windows.Forms.Label
$subtitle.Text = "Paste a customer request code, sign with your private key, then share the generated response token."
$subtitle.Left = 20
$subtitle.Top = 46
$subtitle.Width = 750
$subtitle.Height = 24
$subtitle.ForeColor = [System.Drawing.Color]::FromArgb(75, 55, 42)
$subtitle.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$overlay.Controls.Add($subtitle)

$overlay.Controls.Add((New-Label -Text "Request code (from customer machine)" -X 20 -Y 86))
$requestBox = New-Textbox -X 20 -Y 108 -W 750 -H 110 -Multiline $true
$overlay.Controls.Add($requestBox)

$overlay.Controls.Add((New-Label -Text "Private key PEM path (Ed25519)" -X 20 -Y 228))
$keyBox = New-Textbox -X 20 -Y 250 -W 750 -H 28
$overlay.Controls.Add($keyBox)

$browseBtn = New-Object System.Windows.Forms.Button
$browseBtn.Text = "Browse..."
$browseBtn.Left = 680
$browseBtn.Top = 280
$browseBtn.Width = 90
$browseBtn.Height = 30
$browseBtn.BackColor = [System.Drawing.Color]::FromArgb(96, 66, 43)
$browseBtn.ForeColor = [System.Drawing.Color]::White
$browseBtn.FlatStyle = "Flat"
$browseBtn.FlatAppearance.BorderSize = 0
$overlay.Controls.Add($browseBtn)

$overlay.Controls.Add((New-Label -Text "Expiry (hours, default 24)" -X 20 -Y 286 -W 220))
$expiryBox = New-Textbox -X 20 -Y 308 -W 200 -H 28
$expiryBox.Text = "24"
$overlay.Controls.Add($expiryBox)

$allowServer = New-Object System.Windows.Forms.CheckBox
$allowServer.Text = "Allow server mode"
$allowServer.Left = 240
$allowServer.Top = 312
$allowServer.Width = 160
$allowServer.Checked = $true
$allowServer.BackColor = [System.Drawing.Color]::Transparent
$overlay.Controls.Add($allowServer)

$allowClient = New-Object System.Windows.Forms.CheckBox
$allowClient.Text = "Allow client mode"
$allowClient.Left = 410
$allowClient.Top = 312
$allowClient.Width = 160
$allowClient.Checked = $true
$allowClient.BackColor = [System.Drawing.Color]::Transparent
$overlay.Controls.Add($allowClient)

$generateBtn = New-Object System.Windows.Forms.Button
$generateBtn.Text = "Generate response token"
$generateBtn.Left = 20
$generateBtn.Top = 350
$generateBtn.Width = 220
$generateBtn.Height = 36
$generateBtn.BackColor = [System.Drawing.Color]::FromArgb(53, 40, 30)
$generateBtn.ForeColor = [System.Drawing.Color]::White
$generateBtn.FlatStyle = "Flat"
$generateBtn.FlatAppearance.BorderSize = 0
$overlay.Controls.Add($generateBtn)

$copyBtn = New-Object System.Windows.Forms.Button
$copyBtn.Text = "Copy token"
$copyBtn.Left = 250
$copyBtn.Top = 350
$copyBtn.Width = 120
$copyBtn.Height = 36
$copyBtn.BackColor = [System.Drawing.Color]::FromArgb(96, 66, 43)
$copyBtn.ForeColor = [System.Drawing.Color]::White
$copyBtn.FlatStyle = "Flat"
$copyBtn.FlatAppearance.BorderSize = 0
$overlay.Controls.Add($copyBtn)

$saveBtn = New-Object System.Windows.Forms.Button
$saveBtn.Text = "Save token to file"
$saveBtn.Left = 380
$saveBtn.Top = 350
$saveBtn.Width = 150
$saveBtn.Height = 36
$saveBtn.BackColor = [System.Drawing.Color]::FromArgb(96, 66, 43)
$saveBtn.ForeColor = [System.Drawing.Color]::White
$saveBtn.FlatStyle = "Flat"
$saveBtn.FlatAppearance.BorderSize = 0
$overlay.Controls.Add($saveBtn)

$overlay.Controls.Add((New-Label -Text "Generated response token" -X 20 -Y 398))
$tokenBox = New-Textbox -X 20 -Y 420 -W 750 -H 170 -Multiline $true
$tokenBox.ReadOnly = $true
$overlay.Controls.Add($tokenBox)

$status = New-Object System.Windows.Forms.Label
$status.Text = "Ready."
$status.Left = 20
$status.Top = 602
$status.Width = 750
$status.Height = 46
$status.ForeColor = [System.Drawing.Color]::FromArgb(82, 58, 42)
$status.BackColor = [System.Drawing.Color]::Transparent
$status.Font = New-Object System.Drawing.Font("Segoe UI", 9)
$overlay.Controls.Add($status)

$openDialog = New-Object System.Windows.Forms.OpenFileDialog
$openDialog.Filter = "PEM files (*.pem)|*.pem|All files (*.*)|*.*"
$openDialog.Title = "Select private key PEM"

$browseBtn.Add_Click({
  if ($openDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    $keyBox.Text = $openDialog.FileName
  }
})

function Show-Status([string]$text, [bool]$isError = $false) {
  $status.Text = $text
  $status.ForeColor = if ($isError) {
    [System.Drawing.Color]::FromArgb(170, 20, 20)
  } else {
    [System.Drawing.Color]::FromArgb(82, 58, 42)
  }
}

$generateBtn.Add_Click({
  $request = $requestBox.Text.Trim()
  $keyPath = $keyBox.Text.Trim()
  $expiry = $expiryBox.Text.Trim()

  if ([string]::IsNullOrWhiteSpace($request)) {
    Show-Status "Request code is required." $true
    return
  }
  if ([string]::IsNullOrWhiteSpace($keyPath) -or -not (Test-Path -LiteralPath $keyPath)) {
    Show-Status "Valid private key path is required." $true
    return
  }
  if ([string]::IsNullOrWhiteSpace($expiry)) { $expiry = "24" }

  if (-not $signerPath -or -not (Test-Path -LiteralPath $signerPath)) {
    Show-Status "Cannot find bootstrap-signer.mjs in the same folder as this GUI ($scriptDir). Copy it from the repo apps/web/scripts/." $true
    return
  }

  try {
    Show-Status "Generating token..."
    $allowServerArg = if ($allowServer.Checked) { "true" } else { "false" }
    $allowClientArg = if ($allowClient.Checked) { "true" } else { "false" }
    $output = & node $signerPath '--request' $request '--private-key' $keyPath '--expires-hours' $expiry '--allow-server' $allowServerArg '--allow-client' $allowClientArg 2>&1
    if ($LASTEXITCODE -ne 0) {
      $msg = ($output | ForEach-Object { $_.ToString() }) -join "`n"
      throw "Signer failed: $msg"
    }
    $lines = @()
    foreach ($line in $output) { $lines += $line.ToString() }
    $tokenValue = ($lines | Where-Object { $_.Trim() } | Select-Object -Last 1).Trim()
    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
      throw "Signer produced empty output. Confirm request code and private key."
    }
    $tokenBox.Text = $tokenValue
    Show-Status "Token generated successfully."
  } catch {
    Show-Status $_.Exception.Message $true
  }
})

$copyBtn.Add_Click({
  if ([string]::IsNullOrWhiteSpace($tokenBox.Text)) {
    Show-Status "No token to copy." $true
    return
  }
  [System.Windows.Forms.Clipboard]::SetText($tokenBox.Text.Trim())
  Show-Status "Token copied to clipboard."
})

$saveBtn.Add_Click({
  if ([string]::IsNullOrWhiteSpace($tokenBox.Text)) {
    Show-Status "No token to save." $true
    return
  }
  try {
    [System.IO.File]::WriteAllText($outputPath, $tokenBox.Text.Trim())
    Show-Status "Token saved to $outputPath"
  } catch {
    Show-Status "Could not save token file." $true
  }
})

[void]$form.ShowDialog()
