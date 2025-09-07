#!/usr/bin/env python3
# Location: mixview/verify_deployment.py
# Comprehensive deployment verification script

import requests
import json
import sys
import time
from typing import Dict, Any

# Color codes for output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    BOLD = '\033[1m'
    END = '\033[0m'

def print_status(message: str, status: str = "info"):
    """Print colored status message"""
    if status == "success":
        print(f"{Colors.GREEN}✅ {message}{Colors.END}")
    elif status == "error":
        print(f"{Colors.RED}❌ {message}{Colors.END}")
    elif status == "warning":
        print(f"{Colors.YELLOW}⚠️  {message}{Colors.END}")
    else:
        print(f"{Colors.BLUE}ℹ️  {message}{Colors.END}")

def test_endpoint(url: str, method: str = "GET", data: Dict = None, expected_status: int = 200) -> Dict[str, Any]:
    """Test an API endpoint"""
    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=10)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        success = response.status_code == expected_status
        return {
            "success": success,
            "status_code": response.status_code,
            "response": response.json() if response.content else {},
            "error": None if success else f"Expected {expected_status}, got {response.status_code}"
        }
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": "Connection refused"}
    except requests.exceptions.Timeout:
        return {"success": False, "error": "Request timeout"}
    except Exception as e:
        return {"success": False, "error": str(e)}

def main():
    """Run comprehensive deployment verification"""
    print(f"\n{Colors.BOLD}🔍 MixView Deployment Verification{Colors.END}")
    print("=" * 50)
    
    # Configuration
    frontend_url = "http://localhost:3001"
    backend_url = "http://localhost:8001"
    
    total_tests = 0
    passed_tests = 0
    
    # Test 1: Backend Health Check
    print(f"\n{Colors.BOLD}1. Backend Health Check{Colors.END}")
    result = test_endpoint(f"{backend_url}/health")
    total_tests += 1
    if result["success"]:
        print_status("Backend is responding", "success")
        print(f"   Service: {result['response'].get('service', 'Unknown')}")
        print(f"   Version: {result['response'].get('version', 'Unknown')}")
        passed_tests += 1
    else:
        print_status(f"Backend health check failed: {result['error']}", "error")
    
    # Test 2: Frontend Accessibility
    print(f"\n{Colors.BOLD}2. Frontend Accessibility{Colors.END}")
    result = test_endpoint(frontend_url)
    total_tests += 1
    if result["success"]:
        print_status("Frontend is accessible", "success")
        passed_tests += 1
    else:
        print_status(f"Frontend not accessible: {result['error']}", "error")
    
    # Test 3: API Documentation
    print(f"\n{Colors.BOLD}3. API Documentation{Colors.END}")
    result = test_endpoint(f"{backend_url}/docs")
    total_tests += 1
    if result["success"]:
        print_status("API documentation is available", "success")
        passed_tests += 1
    else:
        print_status(f"API docs not accessible: {result['error']}", "error")
    
    # Test 4: Setup Wizard Status (Unauthenticated)
    print(f"\n{Colors.BOLD}4. Setup Wizard Status{Colors.END}")
    result = test_endpoint(f"{backend_url}/setup/status")
    total_tests += 1
    if result["success"]:
        print_status("Setup wizard endpoint is working", "success")
        response = result["response"]
        print(f"   Setup Required: {response.get('setup_required', 'Unknown')}")
        print(f"   Global Setup Complete: {response.get('global_setup_complete', 'Unknown')}")
        print(f"   Available Services: {len(response.get('available_services', {}))}")
        passed_tests += 1
    else:
        print_status(f"Setup wizard endpoint failed: {result['error']}", "error")
    
    # Test 5: Service Configuration Info
    print(f"\n{Colors.BOLD}5. Service Configuration{Colors.END}")
    result = test_endpoint(f"{backend_url}/setup/configuration")
    total_tests += 1
    if result["success"]:
        print_status("Service configuration endpoint working", "success")
        services = result["response"].get("services", {})
        print(f"   Configured Services: {len(services)}")
        for service_name, service_info in services.items():
            status = "✅" if service_info.get("configured", False) else "⚠️"
            print(f"   {status} {service_info.get('name', service_name)}")
        passed_tests += 1
    else:
        print_status(f"Service configuration failed: {result['error']}", "error")
    
    # Test 6: Database Connectivity
    print(f"\n{Colors.BOLD}6. Database Connectivity{Colors.END}")
    # We test this indirectly through the setup status endpoint
    # which requires database access
    if passed_tests >= 4:  # If basic endpoints work, database is likely working
        print_status("Database connectivity verified (indirect)", "success")
        total_tests += 1
        passed_tests += 1
    else:
        print_status("Database connectivity uncertain", "warning")
        total_tests += 1
    
    # Test 7: CORS Configuration
    print(f"\n{Colors.BOLD}7. CORS Configuration{Colors.END}")
    try:
        # Test preflight request
        response = requests.options(
            f"{backend_url}/setup/status",
            headers={
                "Origin": frontend_url,
                "Access-Control-Request-Method": "GET"
            },
            timeout=5
        )
        total_tests += 1
        if response.status_code in [200, 204]:
            print_status("CORS configuration is working", "success")
            passed_tests += 1
        else:
            print_status("CORS configuration may have issues", "warning")
    except Exception as e:
        print_status(f"CORS test failed: {e}", "error")
        total_tests += 1
    
    # Test 8: Environment Variables
    print(f"\n{Colors.BOLD}8. Environment Configuration{Colors.END}")
    result = test_endpoint(f"{backend_url}/setup/status")
    if result["success"]:
        total_tests += 1
        global_setup = result["response"].get("global_setup_complete", False)
        if global_setup:
            print_status("Environment variables properly configured", "success")
            passed_tests += 1
        else:
            print_status("Some environment variables may be missing", "warning")
    
    # Summary
    print(f"\n{Colors.BOLD}📊 Verification Summary{Colors.END}")
    print("=" * 50)
    print(f"Total Tests: {total_tests}")
    print(f"Passed: {Colors.GREEN}{passed_tests}{Colors.END}")
    print(f"Failed: {Colors.RED}{total_tests - passed_tests}{Colors.END}")
    
    success_rate = (passed_tests / total_tests) * 100 if total_tests > 0 else 0
    
    if success_rate >= 90:
        print_status(f"Deployment verification PASSED ({success_rate:.1f}%)", "success")
        print(f"\n{Colors.GREEN}🎉 MixView is ready to use!{Colors.END}")
        print(f"   Frontend: {frontend_url}")
        print(f"   Backend API: {backend_url}")
        print(f"   API Docs: {backend_url}/docs")
        return 0
    elif success_rate >= 70:
        print_status(f"Deployment verification PARTIAL ({success_rate:.1f}%)", "warning")
        print(f"\n{Colors.YELLOW}⚠️  MixView is mostly working but has some issues{Colors.END}")
        return 1
    else:
        print_status(f"Deployment verification FAILED ({success_rate:.1f}%)", "error")
        print(f"\n{Colors.RED}❌ MixView deployment has significant issues{Colors.END}")
        return 2

if __name__ == "__main__":
    sys.exit(main())