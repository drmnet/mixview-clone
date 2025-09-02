# fix-mixview-files.ps1
# Description: Fix MixView configuration files for Windows dev environment
# This script only modifies files - no Docker operations
# Perfect for: Windows dev -> GitHub -> Debian server workflow

param(
    [switch]$WhatIf = $false,
    [switch]$Backup = $true,
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptDir
$BackupDir = Join-Path $ProjectRoot "backup_$(Get-Date -Format 'yyyyMMdd_HHmmss')"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " MixView File Fix Script (Dev Mode)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project Root: $ProjectRoot" -ForegroundColor Yellow
Write-Host "Mode: File fixes only (no Docker operations)" -ForegroundColor Yellow
Write-Host "WhatIf Mode: $WhatIf" -ForegroundColor Yellow
Write-Host "Create Backup: $Backup" -ForegroundColor Yellow
Write-Host ""

function Write-ColorOutput {
    param([string]$Message, [string]$Color = "White")
    Write-Host $Message -ForegroundColor $Color
}

function Create-Backup {
    if (-not $Backup) {
        Write-ColorOutput "Skipping backup as requested" "Yellow"
        return
    }
    
    Write-ColorOutput "Creating backup..." "Yellow"
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would create backup at: $BackupDir" "Cyan"
        return
    }
    
    try {
        New-Item -Path $BackupDir -ItemType Directory -Force | Out-Null
        
        # Files to backup
        $FilesToBackup = @(
            "backend\Dockerfile",
            "docker-compose.yml", 
            "backend\main.py",
            "frontend\src\App.jsx",
            ".env"
        )
        
        foreach ($File in $FilesToBackup) {
            $SourcePath = Join-Path $ProjectRoot $File
            if (Test-Path $SourcePath) {
                $BackupPath = Join-Path $BackupDir $File
                $BackupDirPath = Split-Path $BackupPath -Parent
                
                if (-not (Test-Path $BackupDirPath)) {
                    New-Item -Path $BackupDirPath -ItemType Directory -Force | Out-Null
                }
                
                Copy-Item $SourcePath $BackupPath -Force
                Write-ColorOutput "  [OK] Backed up: $File" "Green"
            } else {
                Write-ColorOutput "  [WARN] File not found: $File" "Yellow"
            }
        }
        
        Write-ColorOutput "[SUCCESS] Backup created at: $BackupDir" "Green"
    }
    catch {
        Write-ColorOutput "[ERROR] Backup failed: $_" "Red"
        throw
    }
}

function Fix-BackendDockerfile {
    Write-ColorOutput "Fixing backend/Dockerfile..." "Yellow"
    
    $FilePath = Join-Path $ProjectRoot "backend\Dockerfile"
    
    if (-not (Test-Path $FilePath)) {
        Write-ColorOutput "[ERROR] Backend Dockerfile not found: $FilePath" "Red"
        return $false
    }
    
    $NewContent = @'
# Location: mixview/backend/Dockerfile
# Description: Fixed Docker configuration for the FastAPI backend service with proper host binding

FROM python:3.11-slim

# Set the working directory inside the container.
WORKDIR /app

# Set the PYTHONPATH to include the app directory for correct module imports
ENV PYTHONPATH=/app

# Install system dependencies needed for Python packages like psycopg2.
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy the Python requirements file first for better Docker caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all files from the current build context into the container.
COPY . .

# Create a log directory inside the container for the application to use.
RUN mkdir -p /app/logs

# CRITICAL FIX: Bind to 0.0.0.0 instead of 127.0.0.1 to accept external connections
# Use port 8000 inside container (Docker will map 8001:8000)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
'@
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would update backend/Dockerfile" "Cyan"
        Write-ColorOutput "  - Change host binding from 127.0.0.1 to 0.0.0.0" "Cyan"
        Write-ColorOutput "  - Change internal port from 8001 to 8000" "Cyan"
        Write-ColorOutput "  - Add curl for health checks" "Cyan"
    } else {
        Set-Content -Path $FilePath -Value $NewContent -Encoding UTF8
        Write-ColorOutput "[SUCCESS] backend/Dockerfile updated" "Green"
    }
    
    return $true
}

function Fix-DockerCompose {
    Write-ColorOutput "Fixing docker-compose.yml..." "Yellow"
    
    $FilePath = Join-Path $ProjectRoot "docker-compose.yml"
    
    if (-not (Test-Path $FilePath)) {
        Write-ColorOutput "[ERROR] docker-compose.yml not found: $FilePath" "Red"
        return $false
    }
    
    $NewContent = @'
# Location: mixview/docker-compose.yml
# Description: Fixed Docker Compose configuration with proper networking and health checks

version: "3.9"

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: mixview_backend
    env_file: .env
    ports:
      - "8001:8000"  # Host:Container - Frontend will connect to localhost:8001
    volumes:
      - ./backend:/app
    depends_on:
      db:
        condition: service_healthy
    networks:
      - mixview-network
    environment:
      - DATABASE_URL=postgresql://mixview:mixviewpass@db:5432/mixview
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: mixview_frontend
    ports:
      - "3001:3000"  # Frontend runs on 3000 inside container, exposed on 3001
    environment:
      # Use the host machine's localhost for browser access
      - VITE_BACKEND_URL=http://localhost:8001
    volumes:
      - ./frontend:/app
      - /app/node_modules
    networks:
      - mixview-network
    depends_on:
      backend:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 30s
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    container_name: mixview_db
    environment:
      POSTGRES_USER: mixview
      POSTGRES_PASSWORD: mixviewpass
      POSTGRES_DB: mixview
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    networks:
      - mixview-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mixview -d mixview"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped

volumes:
  pgdata:

networks:
  mixview-network:
    driver: bridge
'@
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would update docker-compose.yml" "Cyan"
        Write-ColorOutput "  - Add health checks for all services" "Cyan"
        Write-ColorOutput "  - Fix port mapping to 8001:8000" "Cyan"
        Write-ColorOutput "  - Add proper service dependencies" "Cyan"
        Write-ColorOutput "  - Add restart policies" "Cyan"
    } else {
        Set-Content -Path $FilePath -Value $NewContent -Encoding UTF8
        Write-ColorOutput "[SUCCESS] docker-compose.yml updated" "Green"
    }
    
    return $true
}

function Fix-BackendMainPy {
    Write-ColorOutput "Fixing backend/main.py..." "Yellow"
    
    $FilePath = Join-Path $ProjectRoot "backend\main.py"
    
    if (-not (Test-Path $FilePath)) {
        Write-ColorOutput "[ERROR] Backend main.py not found: $FilePath" "Red"
        return $false
    }
    
    # Read current content
    $CurrentContent = Get-Content -Path $FilePath -Raw
    
    # Check what fixes are needed
    $NeedsCORSFix = $CurrentContent -notmatch 'allow_origins.*\[\s*"\*"\s*\]'
    $NeedsSetupEndpoint = $CurrentContent -notmatch '/setup/status'
    
    if (-not ($NeedsCORSFix -or $NeedsSetupEndpoint)) {
        Write-ColorOutput "[SUCCESS] backend/main.py already has required fixes" "Green"
        return $true
    }
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would update backend/main.py" "Cyan"
        if ($NeedsCORSFix) {
            Write-ColorOutput "  - Fix CORS configuration to allow all origins for development" "Cyan"
        }
        if ($NeedsSetupEndpoint) {
            Write-ColorOutput "  - Add /setup/status endpoint for first-run detection" "Cyan"
        }
        return $true
    }
    
    # Apply CORS fix
    if ($NeedsCORSFix) {
        # Update CORS middleware to allow all origins
        $CurrentContent = $CurrentContent -replace 'allow_origins=\[.*?\]', 'allow_origins=["*"]'
        Write-ColorOutput "  [OK] Fixed CORS configuration" "Green"
    }
    
    # Add setup status endpoint if missing
    if ($NeedsSetupEndpoint) {
        $SetupEndpoint = @'

# Setup status endpoint for first-run detection
@app.get("/setup/status")
async def setup_status():
    """Check if the application requires initial setup"""
    try:
        config_status = Config.validate_config()
        has_services = any(config_status.values())
        
        return {
            "requires_setup": not has_services,
            "services_configured": config_status,
            "reason": "No services configured" if not has_services else "Setup complete"
        }
    except Exception as e:
        logger.error(f"Setup status check failed: {e}")
        return {"requires_setup": True, "reason": f"Error checking setup: {str(e)}"}
'@
        
        # Insert before the root endpoint
        $CurrentContent = $CurrentContent -replace '(@app\.get\("/"\))', "$SetupEndpoint`n`n`$1"
        Write-ColorOutput "  [OK] Added setup status endpoint" "Green"
    }
    
    Set-Content -Path $FilePath -Value $CurrentContent -Encoding UTF8
    Write-ColorOutput "[SUCCESS] backend/main.py updated" "Green"
    return $true
}

function Fix-FrontendAppJsx {
    Write-ColorOutput "Fixing frontend/src/App.jsx..." "Yellow"
    
    $FilePath = Join-Path $ProjectRoot "frontend\src\App.jsx"
    
    if (-not (Test-Path $FilePath)) {
        Write-ColorOutput "[ERROR] Frontend App.jsx not found: $FilePath" "Red"
        return $false
    }
    
    $CurrentContent = Get-Content -Path $FilePath -Raw
    
    # Check what fixes are needed
    $HasCorrectApiUrl = $CurrentContent -match 'import\.meta\.env\.VITE_BACKEND_URL.*8001'
    $HasFirstRunDetection = $CurrentContent -match 'useFirstRun'
    
    if ($HasCorrectApiUrl -and $HasFirstRunDetection) {
        Write-ColorOutput "[SUCCESS] frontend/src/App.jsx already has required fixes" "Green"
        return $true
    }
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would update frontend/src/App.jsx" "Cyan"
        if (-not $HasCorrectApiUrl) {
            Write-ColorOutput "  - Fix API URL to use port 8001" "Cyan"
        }
        if (-not $HasFirstRunDetection) {
            Write-ColorOutput "  - Add first-run detection logic" "Cyan"
        }
        return $true
    }
    
    # Fix API URL
    $NewContent = $CurrentContent -replace 'http://localhost:8000', 'http://localhost:8001'
    $NewContent = $NewContent -replace 'process\.env\.VITE_BACKEND_URL', 'import.meta.env.VITE_BACKEND_URL'
    
    # Add first-run detection if missing
    if (-not $HasFirstRunDetection) {
        $FirstRunHook = @'
// Custom hook for first-run detection
const useFirstRun = () => {
  const [isFirstRun, setIsFirstRun] = useState(null); // null = loading
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
  
  useEffect(() => {
    const checkFirstRun = async () => {
      try {
        // Check both localStorage AND backend setup status
        const localSetup = localStorage.getItem('mixview_app_initialized');
        
        // Also check backend setup status
        const response = await fetch(`${API_BASE}/setup/status`);
        let backendSetup = null;
        
        if (response.ok) {
          backendSetup = await response.json();
        } else {
          console.warn('Could not reach backend setup status endpoint');
        }
        
        const needsSetup = !localSetup || backendSetup?.requires_setup === true;
        
        if (needsSetup) {
          setIsFirstRun(true);
          localStorage.setItem('mixview_app_initialized', 'started'); // Mark as started
        } else {
          setIsFirstRun(false);
        }
      } catch (error) {
        console.error('First run detection failed:', error);
        // If we can't reach the backend, check localStorage only
        const localSetup = localStorage.getItem('mixview_app_initialized');
        setIsFirstRun(!localSetup);
      }
    };
    
    checkFirstRun();
  }, [API_BASE]);
  
  const completeSetup = () => {
    localStorage.setItem('mixview_app_initialized', 'true');
    setIsFirstRun(false);
  };
  
  return { isFirstRun, completeSetup };
};

'@
        
        # Insert after imports and before the main App function
        $NewContent = $NewContent -replace '(function App\(\))', "$FirstRunHook`n`$1"
        
        # Add usage of the hook in the App function
        $NewContent = $NewContent -replace '(const \[user, setUser\] = useState)', '// Use first-run detection`n  const { isFirstRun, completeSetup } = useFirstRun();`n`n  $1'
        
        # Add first-run loading state
        $LoadingState = @'
  // Show loading while checking first run status
  if (isFirstRun === null) {
    return (
      <div className="App">
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <div className="loading">
            <h3>Initializing MixView...</h3>
            <p>Checking setup status...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show setup wizard if first run (and no user logged in yet)
  if (isFirstRun && !user) {
    return (
      <div className="App">
        <SetupWizard onComplete={completeSetup} />
      </div>
    );
  }

'@
        
        # Insert before the main return statement
        $NewContent = $NewContent -replace '(\s+return \(\s+<div className="App">)', "$LoadingState`n`$1"
        
        Write-ColorOutput "  [OK] Added first-run detection logic" "Green"
    }
    
    Set-Content -Path $FilePath -Value $NewContent -Encoding UTF8
    Write-ColorOutput "[SUCCESS] frontend/src/App.jsx updated" "Green"
    return $true
}

function Update-EnvFile {
    Write-ColorOutput "Updating .env file..." "Yellow"
    
    $EnvPath = Join-Path $ProjectRoot ".env"
    
    if (-not (Test-Path $EnvPath)) {
        Write-ColorOutput "[WARN] .env file not found - will be created by deploy script on server" "Yellow"
        return $true
    }
    
    if ($WhatIf) {
        Write-ColorOutput "[WHATIF] Would update .env file with correct ports" "Cyan"
        return $true
    }
    
    $EnvContent = Get-Content -Path $EnvPath -Raw
    
    # Update ports to match our fixed configuration
    $EnvContent = $EnvContent -replace 'BACKEND_URL=http://localhost:8000', 'BACKEND_URL=http://localhost:8001'
    $EnvContent = $EnvContent -replace 'FRONTEND_URL=http://localhost:3000', 'FRONTEND_URL=http://localhost:3001'
    $EnvContent = $EnvContent -replace 'ALLOWED_ORIGINS=.*', 'ALLOWED_ORIGINS=http://localhost:3001,http://localhost:3000'
    $EnvContent = $EnvContent -replace 'SPOTIFY_REDIRECT_URI=http://localhost:8000', 'SPOTIFY_REDIRECT_URI=http://localhost:8001'
    
    Set-Content -Path $EnvPath -Value $EnvContent -Encoding UTF8
    Write-ColorOutput "[SUCCESS] .env file updated" "Green"
    
    return $true
}

function Show-Changes-Summary {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host " Files Modified Summary" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    
    if ($WhatIf) {
        Write-ColorOutput "This was a PREVIEW run. No files were changed." "Yellow"
        Write-ColorOutput "Run without -WhatIf to apply the fixes." "Yellow"
    } else {
        Write-ColorOutput "[SUCCESS] File fixes applied successfully!" "Green"
        Write-Host ""
        Write-ColorOutput "Modified files:" "Yellow"
        Write-ColorOutput "  [FILE] backend/Dockerfile - Host binding and port fixes" "White"
        Write-ColorOutput "  [FILE] docker-compose.yml - Health checks and networking" "White"  
        Write-ColorOutput "  [FILE] backend/main.py - CORS config and setup endpoint" "White"
        Write-ColorOutput "  [FILE] frontend/src/App.jsx - API URL and first-run detection" "White"
        
        if (Test-Path (Join-Path $ProjectRoot ".env")) {
            Write-ColorOutput "  [FILE] .env - Port corrections" "White"
        }
        
        if ($Backup) {
            Write-ColorOutput "  [BACKUP] Created at: $BackupDir" "Green"
        }
    }
    
    Write-Host ""
    Write-ColorOutput "Next Steps:" "Yellow"
    Write-ColorOutput "  1. Review the modified files" "White"
    Write-ColorOutput "  2. Test locally if desired (optional)" "White"
    Write-ColorOutput "  3. Commit and push to GitHub" "White"
    Write-ColorOutput "  4. Deploy on your Debian server" "White"
    Write-ColorOutput "  5. Access at: http://your-server:3001" "White"
    
    Write-Host ""
    Write-ColorOutput "Pro Tips:" "Yellow"
    Write-ColorOutput "  - Use git diff to see exactly what changed" "White"
    Write-ColorOutput "  - The fixes maintain backward compatibility" "White"
    Write-ColorOutput "  - Backups are available if you need to revert" "White"
}

# Main execution
function Main {
    try {
        Write-ColorOutput "Starting MixView file fixes..." "Green"
        Write-Host ""
        
        # Create backup first
        Create-Backup
        
        # Apply all fixes
        $AllFixesSuccessful = $true
        
        Write-ColorOutput "Applying fixes..." "Yellow"
        if (-not (Fix-BackendDockerfile)) { $AllFixesSuccessful = $false }
        if (-not (Fix-DockerCompose)) { $AllFixesSuccessful = $false }
        if (-not (Fix-BackendMainPy)) { $AllFixesSuccessful = $false }
        if (-not (Fix-FrontendAppJsx)) { $AllFixesSuccessful = $false }
        if (-not (Update-EnvFile)) { $AllFixesSuccessful = $false }
        
        if (-not $AllFixesSuccessful) {
            Write-ColorOutput "[ERROR] Some fixes failed to apply" "Red"
            exit 1
        }
        
        Show-Changes-Summary
        Write-ColorOutput "[SUCCESS] File fix operation completed successfully!" "Green"
        
    } catch {
        Write-ColorOutput "[ERROR] Fix operation failed: $_" "Red"
        
        if ($Backup -and (Test-Path $BackupDir)) {
            Write-ColorOutput "[BACKUP] Available at: $BackupDir" "Yellow"
            Write-ColorOutput "You can restore files if needed" "Yellow"
        }
        
        exit 1
    }
}

# Run main function
Main