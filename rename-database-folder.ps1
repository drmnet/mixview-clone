# Location: mixview/rename-database-folder.ps1
# Description: Script to rename /backend/database/ to /backend/db_package/ and update all references

param(
    [switch]$WhatIf = $false,
    [switch]$CreateBackup = $true
)

# Set error action preference
$ErrorActionPreference = "Stop"

# Get the script directory (should be mixview root)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptDir

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host " MixView Database Folder Rename Script" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Yellow
Write-Host "WhatIf Mode: $WhatIf" -ForegroundColor Yellow
Write-Host "Create Backup: $CreateBackup" -ForegroundColor Yellow
Write-Host ""

# Define paths
$OldFolderPath = Join-Path $ProjectRoot "backend\database"
$NewFolderPath = Join-Path $ProjectRoot "backend\db_package"
$BackupPath = Join-Path $ProjectRoot "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

# Check if old folder exists
if (-not (Test-Path $OldFolderPath)) {
    Write-Error "Source folder not found: $OldFolderPath"
    exit 1
}

# Check if new folder already exists
if (Test-Path $NewFolderPath) {
    Write-Error "Destination folder already exists: $NewFolderPath"
    exit 1
}

# Files that need to be updated with new import paths
$FilesToUpdate = @(
    "backend\main.py",
    "backend\database.py",
    "backend\aggregator.py",
    "backend\config.py",
    "backend\user_services.py",
    "backend\routes\auth.py",
    "backend\routes\aggregator.py",
    "backend\routes\search.py",
    "backend\routes\oauth.py",
    "run_migrations.py"
)

# Define the patterns to replace
$ReplacePatterns = @(
    @{
        Pattern = "from backend\.database\.database import"
        Replacement = "from backend.db_package.database import"
        Description = "Update database imports"
    },
    @{
        Pattern = "from backend\.database import"
        Replacement = "from backend.db_package import"
        Description = "Update package imports"
    },
    @{
        Pattern = "from \.database import"
        Replacement = "from .db_package import"
        Description = "Update relative imports"
    },
    @{
        Pattern = "from database import"
        Replacement = "from db_package import"
        Description = "Update direct imports"
    },
    @{
        Pattern = "import backend\.database"
        Replacement = "import backend.db_package"
        Description = "Update module imports"
    },
    @{
        Pattern = "backend\.database\."
        Replacement = "backend.db_package."
        Description = "Update module references"
    }
)

function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Create-Backup {
    if (-not $CreateBackup) {
        return
    }
    
    Write-ColorOutput "Creating backup..." "Yellow"
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would create backup at: $BackupPath" "Cyan"
        return
    }
    
    try {
        New-Item -Path $BackupPath -ItemType Directory -Force | Out-Null
        
        # Copy all files to backup
        foreach ($File in $FilesToUpdate) {
            $SourceFile = Join-Path $ProjectRoot $File
            if (Test-Path $SourceFile) {
                $RelativeDir = Split-Path $File -Parent
                $BackupDir = Join-Path $BackupPath $RelativeDir
                
                if ($RelativeDir -and -not (Test-Path $BackupDir)) {
                    New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null
                }
                
                Copy-Item $SourceFile $BackupPath\$File -Force
                Write-ColorOutput "  Backed up: $File" "Green"
            }
        }
        
        # Copy the entire database folder
        $DatabaseBackupPath = Join-Path $BackupPath "backend\database"
        Copy-Item $OldFolderPath $DatabaseBackupPath -Recurse -Force
        Write-ColorOutput "  Backed up: backend\database folder" "Green"
        
        Write-ColorOutput "Backup created successfully at: $BackupPath" "Green"
    }
    catch {
        Write-Error "Failed to create backup: $_"
        exit 1
    }
}

function Rename-DatabaseFolder {
    Write-ColorOutput "Renaming database folder..." "Yellow"
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would rename: $OldFolderPath -> $NewFolderPath" "Cyan"
        return
    }
    
    try {
        Rename-Item $OldFolderPath $NewFolderPath
        Write-ColorOutput "Folder renamed successfully!" "Green"
    }
    catch {
        Write-Error "Failed to rename folder: $_"
        exit 1
    }
}

function Update-FileContent {
    param(
        [string]$FilePath,
        [array]$Patterns
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-ColorOutput "  File not found: $FilePath" "Yellow"
        return $false
    }
    
    $Content = Get-Content $FilePath -Raw -Encoding UTF8
    $OriginalContent = $Content
    $ChangesCount = 0
    
    foreach ($Pattern in $Patterns) {
        $NewContent = $Content -replace $Pattern.Pattern, $Pattern.Replacement
        if ($NewContent -ne $Content) {
            $Matches = [regex]::Matches($Content, $Pattern.Pattern)
            $ChangesCount += $Matches.Count
            Write-ColorOutput "    Found $($Matches.Count) matches for: $($Pattern.Description)" "Magenta"
            $Content = $NewContent
        }
    }
    
    if ($Content -ne $OriginalContent) {
        if ($WhatIf) {
            Write-ColorOutput "  [WHATIF] Would update $ChangesCount references in: $FilePath" "Cyan"
        } else {
            Set-Content -Path $FilePath -Value $Content -Encoding UTF8 -NoNewline
            Write-ColorOutput "  Updated $ChangesCount references in: $FilePath" "Green"
        }
        return $true
    }
    
    return $false
}

function Update-AllFiles {
    Write-ColorOutput "Updating file references..." "Yellow"
    $UpdatedFiles = 0
    
    foreach ($File in $FilesToUpdate) {
        $FullPath = Join-Path $ProjectRoot $File
        Write-ColorOutput "Checking: $File" "White"
        
        if (Update-FileContent -FilePath $FullPath -Patterns $ReplacePatterns) {
            $UpdatedFiles++
        }
    }
    
    Write-ColorOutput "File update summary:" "Yellow"
    Write-ColorOutput "  Files checked: $($FilesToUpdate.Count)" "White"
    Write-ColorOutput "  Files updated: $UpdatedFiles" "Green"
}

function Verify-Changes {
    Write-ColorOutput "Verifying changes..." "Yellow"
    
    # Check if new folder exists
    if (Test-Path $NewFolderPath) {
        Write-ColorOutput "[OK] New folder exists: backend\db_package" "Green"
    } else {
        Write-ColorOutput "[ERROR] New folder missing: backend\db_package" "Red"
    }
    
    # Check if old folder is gone
    if (-not (Test-Path $OldFolderPath)) {
        Write-ColorOutput "[OK] Old folder removed: backend\database" "Green"
    } else {
        Write-ColorOutput "[ERROR] Old folder still exists: backend\database" "Red"
    }
    
    # Check for any remaining references to the old path
    Write-ColorOutput "Checking for remaining old references..." "Yellow"
    $RemainingRefs = 0
    
    foreach ($File in $FilesToUpdate) {
        $FullPath = Join-Path $ProjectRoot $File
        if (Test-Path $FullPath) {
            $Content = Get-Content $FullPath -Raw
            
            # Check for old patterns
            if ($Content -match "backend\.database" -or $Content -match "from database import" -or $Content -match "\.database import") {
                $RemainingRefs++
                Write-ColorOutput "  [WARNING] Potential old reference in: $File" "Yellow"
                
                # Show the lines with old references
                $Lines = $Content -split "`n"
                for ($i = 0; $i -lt $Lines.Length; $i++) {
                    if ($Lines[$i] -match "backend\.database|from database import|\.database import") {
                        Write-ColorOutput "    Line $($i + 1): $($Lines[$i].Trim())" "Red"
                    }
                }
            }
        }
    }
    
    if ($RemainingRefs -eq 0) {
        Write-ColorOutput "[OK] No old references found" "Green"
    } else {
        Write-ColorOutput "[WARNING] Found $RemainingRefs files with potential old references" "Yellow"
    }
}

function Show-Summary {
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host " Operation Summary" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    
    if ($WhatIf) {
        Write-ColorOutput "This was a PREVIEW run. No changes were made." "Yellow"
        Write-ColorOutput "Run without -WhatIf to perform actual changes." "Yellow"
    } else {
        Write-ColorOutput "Database folder rename operation completed!" "Green"
        Write-ColorOutput "- Folder renamed: backend/database -> backend/db_package" "Green"
        Write-ColorOutput "- Updated import references in Python files" "Green"
        
        if ($CreateBackup) {
            Write-ColorOutput "- Backup created at: $BackupPath" "Green"
        }
    }
    
    Write-Host ""
    Write-ColorOutput "Next steps:" "Yellow"
    Write-ColorOutput "1. Test the application to ensure everything works" "White"
    Write-ColorOutput "2. Run your deployment script" "White"
    Write-ColorOutput "3. Check for any missed references" "White"
    
    if ($CreateBackup -and -not $WhatIf) {
        Write-ColorOutput "4. Remove backup folder when satisfied: $BackupPath" "White"
    }
}

# Main execution
try {
    Write-ColorOutput "Starting database folder rename operation..." "Green"
    Write-Host ""
    
    # Create backup if requested
    Create-Backup
    
    # Rename the folder
    Rename-DatabaseFolder
    
    # Update all file references
    Update-AllFiles
    
    # Verify the changes (only if not WhatIf)
    if (-not $WhatIf) {
        Verify-Changes
    }
    
    # Show summary
    Show-Summary
    
} catch {
    Write-Error "Operation failed: $_"
    
    if ($CreateBackup -and (Test-Path $BackupPath) -and -not $WhatIf) {
        Write-ColorOutput "" "Yellow"
        Write-ColorOutput "A backup was created at: $BackupPath" "Yellow"
        Write-ColorOutput "You can restore from this backup if needed." "Yellow"
    }
    
    exit 1
}

Write-Host ""
Write-ColorOutput "Script completed successfully!" "Green"