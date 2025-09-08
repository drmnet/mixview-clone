import React, { useState, useEffect, useRef } from 'react';
import { SetupUIComponents } from '../shared/SetupUIComponents';

const { 
  LoadingSpinner, 
  ErrorMessage, 
  InstructionPanel, 
  ServiceConnectionStatus 
} = SetupUIComponents;

function SpotifySetupEnhanced({ onConnected, onError, onLoadingChange, isConnected, error, loading }) {
  const [setupPhase, setSetupPhase] = useState('intro'); // intro, connecting, testing, connected, error
  const [oauthAttempts, setOauthAttempts] = useState(0);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [popupWindow, setPopupWindow] = useState(null);
  const [connectionDetails, setConnectionDetails] = useState(null);
  const pollTimerRef = useRef(null);
  const [serverCredentialsConfigured, setServerCredentialsConfigured] = useState(false);
  const [serverCredentials, setServerCredentials] = useState({
    client_id: '',
    client_secret: ''
  });
  const [credentialErrors, setCredentialErrors] = useState({});
  const [savingCredentials, setSavingCredentials] = useState(false);
  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
  const authToken = localStorage.getItem('token');

  // Cleanup popup on unmount
  useEffect(() => {
    return () => {
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [popupWindow]);

  // Update phase based on connection status
  useEffect(() => {
    if (isConnected && setupPhase !== 'connected') {
      setSetupPhase('connected');
      setConnectionDetails({ connectedAt: new Date().toISOString() });
      if (popupWindow && !popupWindow.closed) {
        popupWindow.close();
      }
      onConnected();
    }
  }, [isConnected, setupPhase, popupWindow, onConnected]);

  // Update loading state
  useEffect(() => {
    onLoadingChange(loading || setupPhase === 'connecting');
  }, [loading, setupPhase, onLoadingChange]);

// Handle server credential input changes
  const handleCredentialChange = (field, value) => {
    setServerCredentials(prev => ({ ...prev, [field]: value }));
    
    // Clear field error
    if (credentialErrors[field]) {
      setCredentialErrors(prev => ({ ...prev, [field]: null }));
    }
  };

const handleSaveServerCredentials = async () => {
  // Validate credentials
  const errors = {};
  if (!serverCredentials.client_id) {
    errors.client_id = 'Client ID is required';
  }
  if (!serverCredentials.client_secret) {
    errors.client_secret = 'Client Secret is required';
  }
  
  if (Object.keys(errors).length > 0) {
    setCredentialErrors(errors);
    return;
  }

  setSavingCredentials(true);
  
  try {
    const response = await fetch(`${API_BASE}/setup/server-config`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        service_name: 'spotify',
        credentials: {
          client_id: serverCredentials.client_id,
          client_secret: serverCredentials.client_secret
        }
      })
    });

    if (response.ok) {
      setServerCredentialsConfigured(true);
      setCredentialErrors({});
      setSetupPhase('intro'); // Move to OAuth phase    } else {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Failed to save server credentials');
    }
  } catch (error) {
    console.error('Error saving server credentials:', error);
    setCredentialErrors({ general: error.message });
  } finally {
    setSavingCredentials(false);
  }
};

  // Handle OAuth initiation
  const handleSpotifyConnect = async () => {
    setSetupPhase('connecting');
    setOauthAttempts(prev => prev + 1);
    
    try {
      const response = await fetch(`${API_BASE}/oauth/spotify/auth`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to initiate Spotify OAuth');
      }

      const data = await response.json();
      
      // Open OAuth popup
      const popup = window.open(
        data.auth_url,
        'spotify-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes,menubar=no,toolbar=no,status=no'
      );

      setPopupWindow(popup);

      if (!popup) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }

      // Start polling for popup closure and connection status
      startOAuthPolling(popup);

    } catch (error) {
      console.error('Spotify OAuth error:', error);
      setSetupPhase('error');
      onError(error.message);
    }
  };

  // OAuth polling logic
  const startOAuthPolling = (popup) => {
    let pollCount = 0;
    const maxPolls = 150; // 5 minutes at 2-second intervals

    const poll = () => {
      pollCount++;

      try {
        // Check if popup was closed manually
        if (popup.closed) {
          clearInterval(pollTimerRef.current);
          if (!isConnected) {
            setSetupPhase('intro');
            onError('OAuth process was cancelled. Please try again.');
          }
          return;
        }

        // Check for successful connection
        if (isConnected) {
          clearInterval(pollTimerRef.current);
          popup.close();
          return;
        }

        // Timeout after max polls
        if (pollCount >= maxPolls) {
          clearInterval(pollTimerRef.current);
          popup.close();
          setSetupPhase('error');
          onError('OAuth process timed out. Please try again.');
          return;
        }

      } catch (e) {
        // Popup might be cross-origin, ignore access errors
      }
    };

    pollTimerRef.current = setInterval(poll, 2000);
  };

  // Test existing connection
  const testConnection = async () => {
    setSetupPhase('testing');
    
    try {
      const response = await fetch(`${API_BASE}/oauth/services/test/spotify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.test_successful) {
          setSetupPhase('connected');
          setConnectionDetails({ 
            ...connectionDetails, 
            lastTested: new Date().toISOString(),
            testResult: result.message 
          });
        } else {
          throw new Error(result.message || 'Connection test failed');
        }
      } else {
        throw new Error('Test request failed');
      }
    } catch (error) {
      setSetupPhase('error');
      onError(`Connection test failed: ${error.message}`);
    }
  };

  // Disconnect service
  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Spotify? You\'ll need to reconnect to use Spotify features.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/oauth/services/spotify`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSetupPhase('intro');
        setConnectionDetails(null);
        // Note: The parent component should handle updating isConnected state
      } else {
        throw new Error('Failed to disconnect service');
      }
    } catch (error) {
      onError(`Disconnection failed: ${error.message}`);
    }
  };

  // Reset to try again
  const resetSetup = () => {
    setSetupPhase('intro');
    setShowTroubleshooting(false);
    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }
  };

  // Render different phases
  const renderIntroPhase = () => {
  if (!serverCredentialsConfigured) {
    return (
      <div className="server-credentials-setup">
        <div className="service-header">
          <div className="service-icon-large">🎵</div>
          <h2>Configure Spotify Server Settings</h2>
          <p>First, we need to set up your Spotify Developer credentials to enable OAuth authentication.</p>
        </div>

        <InstructionPanel title="Get Your Spotify Developer Credentials" type="info" collapsible defaultExpanded>
          <ol>
            <li>Go to <a href="https://developer.spotify.com/dashboard/" target="_blank" rel="noopener noreferrer">Spotify Developer Dashboard</a></li>
            <li>Log in with your Spotify account</li>
            <li>Click "Create an App"</li>
            <li>Fill in the app details:
              <ul>
                <li><strong>App name:</strong> "MixView Music Discovery"</li>
                <li><strong>App description:</strong> "Personal music discovery application"</li>
                <li><strong>Website:</strong> Leave blank or use your personal site</li>
                <li><strong>Redirect URI:</strong> <code>{API_BASE}/oauth/spotify/callback</code></li>
              </ul>
            </li>
            <li>Click "Save"</li>
            <li>Copy your <strong>Client ID</strong> and <strong>Client Secret</strong> from the app settings</li>
          </ol>
        </InstructionPanel>

        <div className="credentials-form">
          {credentialErrors.general && (
            <div className="error-message" style={{
              background: '#f8d7da',
              color: '#721c24',
              padding: '12px',
              borderRadius: '6px',
              marginBottom: '1rem'
            }}>
              {credentialErrors.general}
            </div>
          )}
          
          <div className="form-group">
            <label htmlFor="client_id">Spotify Client ID</label>
            <input
              type="text"
              id="client_id"
              value={serverCredentials.client_id}
              onChange={(e) => handleCredentialChange('client_id', e.target.value)}
              placeholder="Enter your Spotify Client ID"
              disabled={savingCredentials}
              style={{
                padding: '12px',
                border: credentialErrors.client_id ? '2px solid #dc3545' : '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '16px',
                width: '100%'
              }}
            />
            {credentialErrors.client_id && (
              <span style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                {credentialErrors.client_id}
              </span>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="client_secret">Spotify Client Secret</label>
            <input
              type="password"
              id="client_secret"
              value={serverCredentials.client_secret}
              onChange={(e) => handleCredentialChange('client_secret', e.target.value)}
              placeholder="Enter your Spotify Client Secret"
              disabled={savingCredentials}
              style={{
                padding: '12px',
                border: credentialErrors.client_secret ? '2px solid #dc3545' : '2px solid #ddd',
                borderRadius: '6px',
                fontSize: '16px',
                width: '100%'
              }}
            />
            {credentialErrors.client_secret && (
              <span style={{ color: '#dc3545', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                {credentialErrors.client_secret}
              </span>
            )}
          </div>

          <button
            onClick={handleSaveServerCredentials}
            disabled={savingCredentials}
            style={{
              padding: '14px 24px',
              background: savingCredentials ? '#6c757d' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: savingCredentials ? 'not-allowed' : 'pointer',
              width: '100%',
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {savingCredentials ? (
              <>
                <LoadingSpinner size="small" color="white" />
                <span>Saving Server Credentials...</span>
              </>
            ) : (
              'Save Server Credentials'
            )}
          </button>
        </div>
      </div>
    );
  }

  // Original intro phase content for OAuth connection
  return (
    <div className="spotify-intro">
      <div className="service-header">
        <div className="service-icon-large">🎵</div>
        <h2>Connect Your Spotify Account</h2>
        <p>Great! Server credentials are configured. Now connect your personal Spotify account.</p>
      </div>

      <div className="features-overview">
        <h3>What you'll get with Spotify:</h3>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎵</div>
            <h4>Your Music Library</h4>
            <p>Access your saved tracks, albums, and playlists</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h4>Listening Insights</h4>
            <p>Discover patterns in your music taste and habits</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h4>Smart Recommendations</h4>
            <p>Get personalized suggestions based on your preferences</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h4>Music Discovery</h4>
            <p>Find connections between artists, albums, and genres</p>
          </div>
        </div>
      </div>

      <div className="setup-actions">
        <button 
          onClick={handleSpotifyConnect}
          disabled={loading}
          className="setup-button primary"
        >
          {loading ? (
            <>
              <LoadingSpinner size="small" color="white" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              <span className="spotify-logo">🎵</span>
              <span>Connect with Spotify</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

  const renderTroubleshooting = () => (
    <InstructionPanel title="🔧 Troubleshooting Spotify Connection" type="warning">
      <div className="troubleshooting-sections">
        <div className="troubleshooting-section">
          <h5>Popup Issues</h5>
          <ul>
            <li>Disable popup blockers for this website</li>
            <li>Try using a different browser (Chrome, Firefox, Safari)</li>
            <li>Temporarily disable browser extensions</li>
            <li>Clear your browser cache and cookies</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>Spotify Account Issues</h5>
          <ul>
            <li>Make sure you have a valid Spotify account (Free or Premium)</li>
            <li>Try logging out and back into Spotify first</li>
            <li>Check if Spotify is experiencing service issues</li>
            <li>Verify your account email is confirmed</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>Network Issues</h5>
          <ul>
            <li>Check your internet connection</li>
            <li>Try connecting from a different network</li>
            <li>Disable VPN if you're using one</li>
            <li>Contact your IT administrator if on a corporate network</li>
          </ul>
        </div>
      </div>
      
      <div className="help-contact">
        <p><strong>Still having issues?</strong> You can skip Spotify setup for now and add it later through the Service Manager.</p>
      </div>
    </InstructionPanel>
  );

  // Main render logic
  const renderCurrentPhase = () => {
    if (isConnected) {
      return renderConnectedPhase();
    }

    switch (setupPhase) {
      case 'connecting':
        return renderConnectingPhase();
      case 'connected':
        return renderConnectedPhase();
      default:
        return renderIntroPhase();
    }
  };

  return (
    <div className="spotify-setup-enhanced">
      {renderCurrentPhase()}

      <style jsx>{`
        .spotify-setup-enhanced {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Intro Phase Styles */
        .spotify-intro {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .service-header {
          text-align: center;
        }

        .service-icon-large {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .service-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1.5rem;
        }

        .service-header p {
          margin: 0;
          color: #666;
          font-size: 1rem;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .feature-card {
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
          text-align: center;
          border: 2px solid transparent;
          transition: all 0.3s ease;
        }

        .feature-card:hover {
          border-color: #667eea;
          background: #f0f7ff;
        }

        .feature-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .feature-card h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1rem;
        }

        .feature-card p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .oauth-permissions {
          background: #f0f7ff;
          padding: 1.5rem;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .oauth-permissions h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .permissions-list {
          margin: 0;
          padding-left: 1.5rem;
          color: #555;
        }

        .permissions-list li {
          margin-bottom: 0.5rem;
        }

        .retry-info {
          text-align: center;
          padding: 1rem;
          background: #fff3cd;
          border-radius: 6px;
          border: 1px solid #ffeaa7;
        }

        .retry-info p {
          margin: 0 0 0.5rem 0;
          color: #856404;
          font-weight: 500;
        }

        .troubleshooting-button {
          background: none;
          border: none;
          color: #667eea;
          text-decoration: underline;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .oauth-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #1db954 0%, #1ed760 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          margin-top: 1rem;
        }

        .oauth-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(29, 185, 84, 0.3);
        }

        .oauth-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .spotify-logo {
          font-size: 1.3rem;
        }

        /* Connecting Phase Styles */
        .spotify-connecting {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .connecting-animation {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .connecting-animation h3 {
          margin: 0;
          color: #333;
        }

        .connecting-animation p {
          margin: 0;
          color: #666;
        }

        .connecting-steps {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 300px;
          margin: 0 auto;
        }

        .step {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 6px;
          opacity: 0.6;
          transition: opacity 0.3s ease;
        }

        .step.active {
          opacity: 1;
          background: #e7f3ff;
          border: 1px solid #667eea;
        }

        .step-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: #667eea;
          color: white;
          border-radius: 50%;
          font-size: 0.8rem;
          font-weight: bold;
        }

        .connecting-help {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
          text-align: left;
        }

        .connecting-help h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .connecting-help ul {
          margin: 0;
          padding-left: 1.5rem;
          color: #666;
        }

        .connecting-help li {
          margin-bottom: 0.5rem;
        }

        .cancel-button {
          padding: 0.75rem 1.5rem;
          background: #6c757d;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1rem;
        }

        .cancel-button:hover {
          opacity: 0.9;
        }

        /* Connected Phase Styles */
        .spotify-connected {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .success-header {
          text-align: center;
        }

        .success-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .success-header h3 {
          margin: 0 0 0.5rem 0;
          color: #28a745;
          font-size: 1.3rem;
        }

        .success-header p {
          margin: 0;
          color: #666;
        }

        .connection-details {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
        }

        .connection-details h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .detail-grid {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .detail-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .detail-item strong {
          color: #333;
        }

        .detail-item span {
          color: #666;
          font-size: 0.9rem;
        }

        .next-steps h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .next-steps-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .next-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .step-icon {
          font-size: 1.5rem;
        }

        .next-step strong {
          display: block;
          color: #333;
          margin-bottom: 0.25rem;
        }

        .next-step p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        /* Troubleshooting Styles */
        .troubleshooting-sections {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .troubleshooting-section h5 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1rem;
        }

        .troubleshooting-section ul {
          margin: 0;
          padding-left: 1.5rem;
        }

        .troubleshooting-section li {
          margin-bottom: 0.5rem;
          color: #555;
        }

        .help-contact {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #ddd;
        }

        .help-contact p {
          margin: 0;
          color: #555;
          font-style: italic;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .features-grid {
            grid-template-columns: 1fr;
          }

          .spotify-setup-enhanced {
            max-width: 100%;
          }

          .oauth-button {
            font-size: 1rem;
            padding: 0.875rem 1.5rem;
          }

          .connecting-steps {
            max-width: 100%;
          }

          .detail-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }
      `}</style>
    </div>
  );
}

export default SpotifySetupEnhanced;