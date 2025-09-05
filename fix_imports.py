#!/usr/bin/env python3
"""
Import Fix Script for MixView Backend
This script fixes all relative imports in the backend to use absolute imports
"""

import os
import re
import shutil
from pathlib import Path

def backup_file(file_path):
    """Create a backup of the file before modifying"""
    backup_path = str(file_path) + '.backup'
    shutil.copy2(file_path, backup_path)
    print(f"  📁 Backup created: {backup_path}")

def fix_imports_in_file(file_path):
    """Fix imports in a single file"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        changes_made = []
        
        # Fix relative imports - convert to absolute imports
        import_fixes = [
            # Database package imports
            (r'from \.\.db_package\.database import', 'from db_package.database import'),
            (r'from \.\.db_package\.models import', 'from db_package.models import'),
            (r'from \.\.db_package import', 'from db_package import'),
            
            # Route imports
            (r'from \.auth import', 'from routes.auth import'),
            (r'from \.oauth import', 'from routes.oauth import'),
            (r'from \.search import', 'from routes.search import'),
            (r'from \.aggregator import', 'from routes.aggregator import'),
            
            # Other backend module imports
            (r'from \.\.aggregator import', 'from aggregator import'),
            (r'from \.\.user_services import', 'from user_services import'),
            (r'from \.\.encryption import', 'from encryption import'),
            (r'from \.\.config import', 'from config import'),
            
            # Fix any remaining relative imports
            (r'from \.\.(\w+) import', r'from \1 import'),
            (r'from \.(\w+) import', r'from routes.\1 import'),
        ]
        
        for pattern, replacement in import_fixes:
            new_content = re.sub(pattern, replacement, content)
            if new_content != content:
                # Count how many replacements were made
                matches = re.findall(pattern, content)
                changes_made.append(f"{len(matches)} × {pattern} → {replacement}")
                content = new_content
        
        # Write the file only if changes were made
        if content != original_content:
            backup_file(file_path)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return changes_made
        else:
            return []
            
    except Exception as e:
        print(f"  ❌ Error processing {file_path}: {e}")
        return []

def fix_syntax_errors():
    """Fix known syntax errors"""
    main_py = Path('backend/main.py')
    
    if main_py.exists():
        print(f"🔧 Fixing syntax error in {main_py}")
        
        with open(main_py, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Remove the stray closing parenthesis
        content = re.sub(r'^[)\s]*$', '', content, flags=re.MULTILINE)
        
        # Fix the import section
        content = re.sub(
            r'# Add the current directory to Python path for absolute imports\s*\)\)',
            '# Add the current directory to Python path for absolute imports',
            content
        )
        
        backup_file(main_py)
        with open(main_py, 'w', encoding='utf-8') as f:
            f.write(content)
        
        print(f"  ✅ Fixed syntax errors in {main_py}")

def main():
    print("🚀 Starting MixView Import Fix Script")
    print("=" * 50)
    
    # Check if we're in the right directory
    if not Path('backend').exists():
        print("❌ Error: 'backend' directory not found. Run this script from the mixview root directory.")
        return
    
    # Fix syntax errors first
    fix_syntax_errors()
    
    # Files to fix
    files_to_fix = [
        'backend/routes/aggregator.py',
        'backend/routes/auth.py', 
        'backend/routes/oauth.py',
        'backend/routes/search.py',
        'backend/main.py',
        'backend/aggregator.py',
        'backend/user_services.py'
    ]
    
    total_changes = 0
    
    for file_path in files_to_fix:
        file_path = Path(file_path)
        
        if not file_path.exists():
            print(f"⚠️  File not found: {file_path}")
            continue
            
        print(f"\n🔍 Processing: {file_path}")
        
        changes = fix_imports_in_file(file_path)
        
        if changes:
            print(f"  ✅ Fixed {len(changes)} import patterns:")
            for change in changes:
                print(f"    • {change}")
            total_changes += len(changes)
        else:
            print(f"  ℹ️  No changes needed")
    
    print("\n" + "=" * 50)
    print(f"🎉 Import fix complete!")
    print(f"📊 Total patterns fixed: {total_changes}")
    
    if total_changes > 0:
        print(f"📁 Backup files created with .backup extension")
        print(f"🚀 Ready to deploy! Run: ./deploy.sh")
    else:
        print(f"ℹ️  No imports needed fixing")

if __name__ == "__main__":
    main()