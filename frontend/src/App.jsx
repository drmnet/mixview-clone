// Location: mixview/frontend/src/App.jsx
// Fixed to use import.meta.env instead of process.env for Vite

import React, { useState, useEffect } from 'react';
import GraphView from './components/GraphView';
import FiltersPanel from './components/FiltersPanel';
import ContextPanel from './components/ContextPanel';
import MainSetupController from './components/MainSetupController';
import ServiceManager from './components/ServiceManager';
import LoginForm from './components/LoginForm';
import SearchBar from './components/SearchBar';
import './App.css';

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

function App() {
  // Use first-run detection
  const { isFirstRun, completeSetup } = useFirstRun();

  // FIXED: Define all state variables before using them in useEffect
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [nodes, setNodes] = useState({ artists: [], albums: [], tracks: [] });
  const [selectedNode, setSelectedNode] = useState(null);
  const [filters, setFilters] = useState([]);
  const [showSetup, setShowSetup] = useState(false);
  const [showServiceManager, setShowServiceManager] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Use import.meta.env for Vite instead of process.env
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  const handleLogin = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem('token', authToken);
    setShowSetup(false);
    loadUserFilters(authToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    setNodes({ artists: [], albums: [], tracks: [] });
    setSelectedNode(null);
    setFilters([]);
  };

  const loadUserFilters = async (authToken) => {
    try {
      const response = await fetch(`${API_BASE}/auth/filters`, {
        headers: { 
          'Authorization': `Bearer ${authToken}`,
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

  const handleSearch = async (query, searchType = 'all') => {
    if (!token) {
      setError('Please log in to search');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the aggregator endpoint for combined results
      const response = await fetch(
        `${API_BASE}/aggregator/combined?artist_name=${encodeURIComponent(query)}&album_title=${encodeURIComponent(query)}&track_title=${encodeURIComponent(query)}`,
        {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          handleLogout();
          throw new Error('Session expired. Please log in again.');
        }
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      setNodes(data);
    } catch (error) {
      console.error('Search error:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = async (node) => {
    setSelectedNode(node);
    
    // Optionally fetch detailed information about the clicked node
    if (node && token) {
      try {
        const nodeType = node.type;
        const response = await fetch(
          `${API_BASE}/aggregator/${nodeType}/${node.id.split('-')[1]}`,
          {
            headers: { 
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
          }
        );
        
        if (response.ok) {
          const details = await response.json();
          setSelectedNode({...node, details});
        }
      } catch (error) {
        console.error('Failed to fetch node details:', error);
      }
    }
  };

  const updateFilters = async (newFilters) => {
    setFilters(newFilters);
    // Optionally trigger a search refresh with new filters
  };

  // FIXED: Check if user is logged in on component mount - now user is defined
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
  }, [token, user, API_BASE]); // Now 'user' is properly defined

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
        <MainSetupController onSetupComplete={completeSetup} />
      </div>
    );
  }

  return (
    <div className="App">
      {error && (
        <div className="error-banner">
          {error}
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