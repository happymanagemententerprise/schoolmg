# ============================================================
# Happy Man Academy - Project Launcher
# ============================================================

Write-Host @"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         🎓 HAPPY MAN ACADEMY                             ║
║         School Management System                          ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

Write-Host ""

# Check project files
Write-Host "📋 Checking project files..." -ForegroundColor Yellow
$requiredFiles = @("index.html", "app.js", "data.js", "styles.css")
$allPresent = $true

foreach ($file in $requiredFiles) {
    if (Test-Path $file) {
        Write-Host "   ✅ $file" -ForegroundColor Green
    } else {
        Write-Host "   ❌ $file (MISSING!)" -ForegroundColor Red
        $allPresent = $false
    }
}

if (-not $allPresent) {
    Write-Host "`n❌ Some required files are missing! Please check your project directory." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Extract Supabase URL from data.js
Write-Host "🔗 Checking Supabase connection..." -ForegroundColor Yellow
$dataContent = Get-Content "data.js" -Raw
if ($dataContent -match "https://([a-z0-9]+)\.supabase\.co") {
    $projectUrl = "https://$($Matches[1]).supabase.co"
    Write-Host "   ✅ Connected to: $projectUrl" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Supabase URL not detected" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Display options
Write-Host "🚀 HOW WOULD YOU LIKE TO RUN THE PROJECT?" -ForegroundColor Cyan
Write-Host ""
Write-Host "   [1] Open in Default Browser (Quickest)" -ForegroundColor White
Write-Host "       → Opens index.html directly" -ForegroundColor Gray
Write-Host ""
Write-Host "   [2] Python HTTP Server (Recommended)" -ForegroundColor White
Write-Host "       → Runs on http://localhost:8000" -ForegroundColor Gray
Write-Host ""
Write-Host "   [3] PHP Built-in Server" -ForegroundColor White
Write-Host "       → Runs on http://localhost:8000" -ForegroundColor Gray
Write-Host ""
Write-Host "   [4] Check Supabase Status" -ForegroundColor White
Write-Host "       → Verify database connection" -ForegroundColor Gray
Write-Host ""
Write-Host "   [5] View Demo Accounts" -ForegroundColor White
Write-Host "       → List all login credentials" -ForegroundColor Gray
Write-Host ""
Write-Host "   [6] Open Supabase Dashboard" -ForegroundColor White
Write-Host "       → Manage database online" -ForegroundColor Gray
Write-Host ""
Write-Host "   [Q] Quit" -ForegroundColor White
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "Enter your choice (1-6 or Q)"

switch ($choice) {
    "1" {
        Write-Host "`n🌐 Opening in default browser..." -ForegroundColor Green
        Start-Process "index.html"
        Write-Host "✅ Browser opened!" -ForegroundColor Green
        Write-Host "`n💡 Tip: If you see CORS errors, use option 2 (Python server) instead." -ForegroundColor Yellow
    }
    
    "2" {
        Write-Host "`n🐍 Starting Python HTTP Server..." -ForegroundColor Green
        
        # Check if Python is available
        $pythonCmd = $null
        if (Get-Command python -ErrorAction SilentlyContinue) {
            $pythonCmd = "python"
        } elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
            $pythonCmd = "python3"
        } elseif (Get-Command py -ErrorAction SilentlyContinue) {
            $pythonCmd = "py"
        }
        
        if ($pythonCmd) {
            Write-Host "✅ Python found!" -ForegroundColor Green
            Write-Host ""
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
            Write-Host "🌍 Server running at: http://localhost:8000" -ForegroundColor Green
            Write-Host "🌍 Or try: http://127.0.0.1:8000" -ForegroundColor Green
            Write-Host ""
            Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
            Write-Host ""
            
            Start-Sleep -Seconds 2
            Start-Process "http://localhost:8000"
            
            & $pythonCmd -m http.server 8000
        } else {
            Write-Host "❌ Python not found!" -ForegroundColor Red
            Write-Host "   Install Python from: https://www.python.org/downloads/" -ForegroundColor Yellow
            Write-Host "   Or try option 1 (Open in Browser) instead" -ForegroundColor Yellow
        }
    }
    
    "3" {
        Write-Host "`n🐘 Starting PHP Built-in Server..." -ForegroundColor Green
        
        if (Get-Command php -ErrorAction SilentlyContinue) {
            Write-Host "✅ PHP found!" -ForegroundColor Green
            Write-Host ""
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
            Write-Host "🌍 Server running at: http://localhost:8000" -ForegroundColor Green
            Write-Host ""
            Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
            Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
            Write-Host ""
            
            Start-Sleep -Seconds 2
            Start-Process "http://localhost:8000"
            
            php -S localhost:8000
        } else {
            Write-Host "❌ PHP not found!" -ForegroundColor Red
            Write-Host "   Try option 1 or 2 instead" -ForegroundColor Yellow
        }
    }
    
    "4" {
        Write-Host "`n🔍 Checking Supabase Status..." -ForegroundColor Green
        
        if (Get-Command supabase -ErrorAction SilentlyContinue) {
            Write-Host "✅ Supabase CLI installed" -ForegroundColor Green
            supabase status
        } else {
            Write-Host "⚠️  Supabase CLI not installed" -ForegroundColor Yellow
            Write-Host "   Install from: https://supabase.com/docs/guides/cli" -ForegroundColor Gray
        }
        
        Write-Host ""
        Write-Host "📊 Project Configuration:" -ForegroundColor Cyan
        if ($dataContent -match "https://([a-z0-9]+)\.supabase\.co") {
            Write-Host "   Project URL: https://$($Matches[1]).supabase.co" -ForegroundColor White
            Write-Host "   Project ID:  $($Matches[1])" -ForegroundColor White
            Write-Host "   Status:      ✅ Configured" -ForegroundColor Green
        }
        
        Write-Host ""
        Read-Host "Press Enter to continue"
    }
    
    "5" {
        Write-Host "`n👥 DEMO ACCOUNTS" -ForegroundColor Cyan
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host ""
        
        $accounts = @(
            @{Role="Administrator"; Email="admin@happyman.edu"; Password="admin123"},
            @{Role="Class Teacher"; Email="class@happyman.edu"; Password="class123"},
            @{Role="Subject Teacher"; Email="subject@happyman.edu"; Password="subject123"},
            @{Role="HOD"; Email="hod@happyman.edu"; Password="hod123"},
            @{Role="Student (Good)"; Email="ama.osei@happyman.edu"; Password="student123"},
            @{Role="Student (Repeat)"; Email="emeka.okafor@happyman.edu"; Password="student123"},
            @{Role="Parent"; Email="parent@happyman.edu"; Password="parent123"}
        )
        
        foreach ($account in $accounts) {
            Write-Host "🔹 $($account.Role)" -ForegroundColor Yellow
            Write-Host "   Email:    $($account.Email)" -ForegroundColor White
            Write-Host "   Password: $($account.Password)" -ForegroundColor White
            Write-Host ""
        }
        
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Read-Host "Press Enter to continue"
    }
    
    "6" {
        Write-Host "`n🌐 Opening Supabase Dashboard..." -ForegroundColor Green
        if ($dataContent -match "https://([a-z0-9]+)\.supabase\.co") {
            $dashboardUrl = "https://supabase.com/dashboard/project/$($Matches[1])"
            Start-Process $dashboardUrl
            Write-Host "✅ Dashboard opened in browser!" -ForegroundColor Green
        } else {
            Write-Host "❌ Could not detect project URL" -ForegroundColor Red
        }
    }
    
    {$_ -eq "Q" -or $_ -eq "q"} {
        Write-Host "`n👋 Goodbye!" -ForegroundColor Cyan
        exit 0
    }
    
    default {
        Write-Host "`n❌ Invalid choice. Please run the script again." -ForegroundColor Red
    }
}

Write-Host ""
Read-Host "Press Enter to exit"
