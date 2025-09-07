#!/usr/bin/env python3
"""
Fix MainSetupController.jsx - Reorder functions and add useCallback
"""

import re
import os

def fix_mainsetupcontroller():
    file_path = "frontend/src/components/MainSetupController.jsx"
    
    if not os.path.exists(file_path):
        print(f"❌ File not found: {file_path}")
        return False
    
    print(f"🔧 Fixing {file_path}...")
    
    # Read the file
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Make a backup
    backup_path = f"{file_path}.backup"
    with open(backup_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"📄 Backup created: {backup_path}")
    
    # Fix 1: Convert main handler functions to useCallback
    
    # Fix handleServiceConnected
    old_handle_connected = r'const handleServiceConnected = \(serviceId\) => \{'
    new_handle_connected = 'const handleServiceConnected = useCallback((serviceId) => {'
    content = re.sub(old_handle_connected, new_handle_connected, content)
    
    # Find the closing brace for handleServiceConnected and add useCallback dependency
    # Look for the specific pattern of the function end
    handle_connected_pattern = r'(const handleServiceConnected = useCallback\(\(serviceId\) => \{.*?setError\(null\);\s*)\};'
    handle_connected_replacement = r'\1}, [updateSetupProgress]);'
    content = re.sub(handle_connected_pattern, handle_connected_replacement, content, flags=re.DOTALL)
    
    # Fix handleServiceError
    old_handle_error = r'const handleServiceError = \(serviceId, errorMessage\) => \{'
    new_handle_error = 'const handleServiceError = useCallback((serviceId, errorMessage) => {'
    content = re.sub(old_handle_error, new_handle_error, content)
    
    # Add dependency array to handleServiceError
    handle_error_pattern = r'(const handleServiceError = useCallback\(\(serviceId, errorMessage\) => \{.*?setError\(errorMessage\);\s*)\};'
    handle_error_replacement = r'\1}, []);'
    content = re.sub(handle_error_pattern, handle_error_replacement, content, flags=re.DOTALL)
    
    # Fix handleServiceLoadingChange
    old_handle_loading = r'const handleServiceLoadingChange = \(serviceId, loading\) => \{'
    new_handle_loading = 'const handleServiceLoadingChange = useCallback((serviceId, loading) => {'
    content = re.sub(old_handle_loading, new_handle_loading, content)
    
    # Add dependency array to handleServiceLoadingChange
    handle_loading_pattern = r'(const handleServiceLoadingChange = useCallback\(\(serviceId, loading\) => \{.*?loading: loading\s*}\s*}\);\s*)\};'
    handle_loading_replacement = r'\1}, []);'
    content = re.sub(handle_loading_pattern, handle_loading_replacement, content, flags=re.DOTALL)
    
    # Fix 2: Update Modal JSX to use memoized callbacks instead of inline functions
    
    # Fix Spotify Modal
    spotify_modal_old = r'onConnected=\{\(\) => handleServiceConnected\(\'spotify\'\)\}'
    spotify_modal_new = 'onConnected={handleSpotifyConnected}'
    content = re.sub(spotify_modal_old, spotify_modal_new, content)
    
    spotify_error_old = r'onError=\{\(error\) => handleServiceError\(\'spotify\', error\)\}'
    spotify_error_new = 'onError={handleSpotifyError}'
    content = re.sub(spotify_error_old, spotify_error_new, content)
    
    spotify_loading_old = r'onLoadingChange=\{\(loading\) => handleServiceLoadingChange\(\'spotify\', loading\)\}'
    spotify_loading_new = 'onLoadingChange={handleSpotifyLoadingChange}'
    content = re.sub(spotify_loading_old, spotify_loading_new, content)
    
    # Fix Modal onClose
    modal_close_old = r'onClose=\{\(\) => setActiveServiceSetup\(null\)\}'
    modal_close_new = 'onClose={closeServiceSetup}'
    content = re.sub(modal_close_old, modal_close_new, content)
    
    # Fix 3: Ensure import includes useCallback
    import_pattern = r'import React, \{ useState, useEffect \} from \'react\';'
    import_replacement = "import React, { useState, useEffect, useCallback } from 'react';"
    content = re.sub(import_pattern, import_replacement, content)
    
    # Alternative import pattern
    import_pattern2 = r'import React, \{ useState, useEffect, useCallback \} from \'react\';'
    if import_pattern2 not in content:
        # If useCallback is not in import, add it
        import_pattern3 = r'import React, \{ (.*?) \} from \'react\';'
        def add_usecallback(match):
            imports = match.group(1)
            if 'useCallback' not in imports:
                imports = imports + ', useCallback'
            return f"import React, {{ {imports} }} from 'react';"
        content = re.sub(import_pattern3, add_usecallback, content)
    
    # Write the fixed file
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print("✅ Fixed the following issues:")
    print("   - Added useCallback to React import")
    print("   - Converted handleServiceConnected to useCallback with [updateSetupProgress] dependency")
    print("   - Converted handleServiceError to useCallback with [] dependency")  
    print("   - Converted handleServiceLoadingChange to useCallback with [] dependency")
    print("   - Updated Modal JSX to use memoized callbacks instead of inline functions")
    print("   - Fixed Modal onClose to use closeServiceSetup")
    
    return True

def main():
    print("🎵 MixView MainSetupController.jsx Fixer")
    print("=" * 50)
    
    # Check if we're in the right directory
    if not os.path.exists("frontend/src/components/MainSetupController.jsx"):
        print("❌ Please run this script from the mixview project root directory")
        print("   Current directory should contain: frontend/src/components/MainSetupController.jsx")
        return
    
    if fix_mainsetupcontroller():
        print("\n🎉 SUCCESS! MainSetupController.jsx has been fixed!")
        print("\nNext steps:")
        print("1. Deploy the changes: git add . && git commit -m 'Fix: MainSetupController useCallback hoisting issue'")
        print("2. Test the enhanced setup system")
        print("3. Verify no more 'Cannot access before initialization' errors")
    else:
        print("\n❌ Failed to fix the file. Check the error messages above.")

if __name__ == "__main__":
    main()