# convert_files.ps1
Get-ChildItem -Recurse -Include *.sh,*.py,*.yml,*.json,*.md | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $content = $content -replace "`r`n", "`n"
    Set-Content $_.FullName -Value $content -NoNewline
}
Write-Host "Files converted to Unix line endings!"