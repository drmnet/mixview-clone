// Updated App.jsx - Import universal CSS framework
// Location: frontend/src/App.jsx

import React, { useState, useEffect } from 'react';
import GraphView from './components/GraphView';
import FiltersPanel from './components/FiltersPanel';
import ContextPanel from './components/ContextPanel';
import MainSetupController from './components/MainSetupController';
import ServiceManager from './components/ServiceManager';
import LoginForm from './components/LoginForm';
import SearchBar from './components/SearchBar';

// Import universal CSS framework (replaces App.css)
import './styles/globals.css';

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
        const response = await fetch(`${API_BASE}/setup/status/public`);
        let backendSetup = null;
        
        if (response.ok) {
          backendSetup = await response.json();
        } else {
          console.warn('Could not reach backend setup status endpoint');
        }
        
        const needsSetup = !localSetup || backendSetup?.setup_required === true;
        
        if (needsSetup) {
          setIsFirstRun(true);
          localStorage.setItem('mixview_app_initialized', 'true');
        } else {
          setIsFirstRun(false);
        }
      } catch (error) {
        console.error('Error checking first run status:', error);
        // Default to requiring setup if we can't determine status
        setIsFirstRun(true);
      }
    };

    checkFirstRun();
  }, [API_BASE]);

  return isFirstRun;
};

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [nodes, setNodes] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSetup, setShowSetup] = useState(false);
  const [showServiceManager, setShowServiceManager] = useState(false);
  
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
  const isFirstRun = useFirstRun();

  // Complete setup handler
  const completeSetup = (setupData) => {
    console.log('Setup completed:', setupData);
    localStorage.setItem('mixview_setup_completed', 'true');
    setShowSetup(false);
    
    // If user was created during setup, set them
    if (setupData.user) {
      setUser(setupData.user);
      setToken(setupData.token || localStorage.getItem('token'));
    }
  };

  // Login handler
  const handleLogin = (userData, userToken) => {
    setUser(userData);
    setToken(userToken);
    localStorage.setItem('token', userToken);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  // Logout handler
  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setNodes([]);
    setSelectedNode(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Search handler
  const handleSearch = async (query, searchType = 'all') => {
    if (!token) {
      setError('Please log in to search');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          type: searchType,
          filters
        })
      });

      if (response.ok) {
        const data = await response.json();
        setNodes(data.nodes || []);
        setSelectedNode(null);
      } else {
        throw new Error('Search failed');
      }
    } catch (error) {
      console.error('Search error:', error);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Node click handler
  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  // Update filters
  const updateFilters = (newFilters) => {
    setFilters(newFilters);
  };

  // Load user filters
  const loadUserFilters = async (userToken) => {
    try {
      const response = await fetch(`${API_BASE}/filters`, {
        headers: { 
          'Authorization': `Bearer ${userToken}`,
          'Content-Type': 'application/json'
        },
      });
      
      if (response.ok) {
        const userFilters = await response.json();
        setFilters(userFilters);
      }
    } catch (error) {
      console.error('Failed to load user filters:', error);
    }
  };

  // Check authentication on mount
  useEffect(() => {
    if (token && !user) {
      // Verify token and get user info
      fetch(`${API_BASE}/auth/me`, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          throw new Error('Invalid token');
        }
      })
      .then(userData => {
        setUser(userData);
        loadUserFilters(token);
      })
      .catch(() => {
        handleLogout();
      });
    }
  }, [token, user, API_BASE]);

  // Show loading while checking first run status
  if (isFirstRun === null) {
    return (
      <div className="App">
        <div className="flex justify-center items-center h-screen">
          <div className="text-center">
            <h3 className="text-xl font-semibold text-gray-700 mb-md">Initializing MixView...</h3>
            <p className="text-gray-600">Checking setup status...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show setup wizard if first run (and no user logged in yet)
  if (isFirstRun && !user) {
    return (
      <div className="App">
        <MainSetupController onSetupComplete={completeSetup} />
      </div>
    );
  }

  return (
    <div className="App">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {!user && <LoginForm onLogin={handleLogin} />}
      
      {user && showSetup && <MainSetupController onSetupComplete={() => setShowSetup(false)} />}
      
      {user && showServiceManager && (
        <ServiceManager
          user={user}
          token={token}
          onClose={() => setShowServiceManager(false)}
        />
      )}
      
      {user && !showSetup && !showServiceManager && (
        <>
          <header className="app-header">
            <h1>MixView</h1>
            <div className="user-controls">
              <span>Welcome, {user.username}</span>
              <button onClick={() => setShowServiceManager(true)}>Services</button>
              <button onClick={() => setShowSetup(true)}>Setup</button>
              <button onClick={handleLogout}>Logout</button>
            </div>
          </header>
          
          <SearchBar onSearch={handleSearch} loading={loading} />
          
          <div className="main-content">
            <GraphView 
              nodes={nodes} 
              onNodeClick={handleNodeClick} 
              selectedNode={selectedNode}
            />
            <div className="side-panels">
              <FiltersPanel 
                filters={filters} 
                onFiltersChange={updateFilters}
                token={token}
              />
              <ContextPanel node={selectedNode} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default App;