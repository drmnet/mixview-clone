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

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
  const token = localStorage.getItem('token');

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

  // Handle OAuth initiation
  const handleSpotifyConnect = async () => {
    setSetupPhase('connecting');
    setOauthAttempts(prev => prev + 1);
    
    try {
      const response = await fetch(`${API_BASE}/oauth/spotify/auth`, {
        headers: {
          'Authorization': `Bearer ${token}`,
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
  const renderIntroPhase = () => (
    <div className="spotify-intro">
      <div className="service-header">
        <div className="service-icon-large">🎵</div>
        <h2>Connect Spotify</h2>
        <p>Connect your Spotify account to unlock powerful music discovery features.</p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🎧</div>
          <h4>Your Music Library</h4>
          <p>Access your saved tracks, albums, and playlists for personalized recommendations.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h4>Listening History</h4>
          <p>Discover patterns in your top artists and tracks across different time periods.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔍</div>
          <h4>Rich Metadata</h4>
          <p>Get detailed information about artists, albums, and tracks from Spotify's database.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎯</div>
          <h4>Smart Recommendations</h4>
          <p>Receive personalized music suggestions based on your listening preferences.</p>
        </div>
      </div>

      <InstructionPanel title="How Spotify Connection Works" type="info">
        <ol>
          <li><strong>OAuth Authorization:</strong> We'll open Spotify's secure login page in a popup window</li>
          <li><strong>Permission Grant:</strong> You'll authorize MixView to access your music data</li>
          <li><strong>Secure Storage:</strong> Your access credentials are encrypted and stored securely</li>
          <li><strong>Ready to Use:</strong> Start exploring your music connections immediately</li>
        </ol>
        <p><strong>Privacy Note:</strong> We only request read access to your music data. We cannot modify your playlists or listening history.</p>
      </InstructionPanel>

      <div className="oauth-permissions">
        <h4>🔒 Required Permissions</h4>
        <ul className="permissions-list">
          <li>✓ View your profile information</li>
          <li>✓ Access your saved music library</li>
          <li>✓ Read your top artists and tracks</li>
          <li>✓ View your playlists (read-only)</li>
        </ul>
      </div>

      {error && (
        <ErrorMessage 
          message={error} 
          onClose={() => onError(null)} 
        />
      )}

      {oauthAttempts > 0 && (
        <div className="retry-info">
          <p>Attempt #{oauthAttempts + 1}</p>
          {oauthAttempts >= 2 && (
            <button 
              onClick={() => setShowTroubleshooting(!showTroubleshooting)}
              className="troubleshooting-button"
            >
              {showTroubleshooting ? 'Hide' : 'Show'} Troubleshooting Tips
            </button>
          )}
        </div>
      )}

      {showTroubleshooting && renderTroubleshooting()}

      <button 
        onClick={handleSpotifyConnect}
        disabled={loading}
        className="oauth-button"
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
  );

  const renderConnectingPhase = () => (
    <div className="spotify-connecting">
      <div className="connecting-animation">
        <LoadingSpinner size="large" />
        <h3>Connecting to Spotify</h3>
        <p>Please complete the authorization in the popup window...</p>
      </div>

      <div className="connecting-steps">
        <div className="step active">
          <span className="step-number">1</span>
          <span>Opening Spotify authorization</span>
        </div>
        <div className="step">
          <span className="step-number">2</span>
          <span>Log in to your Spotify account</span>
        </div>
        <div className="step">
          <span className="step-number">3</span>
          <span>Grant permissions to MixView</span>
        </div>
        <div className="step">
          <span className="step-number">4</span>
          <span>Connection established!</span>
        </div>
      </div>

      <div className="connecting-help">
        <h4>Don't see the popup?</h4>
        <ul>
          <li>Check if your browser blocked the popup</li>
          <li>Disable any popup blockers for this site</li>
          <li>Try clicking the connect button again</li>
        </ul>
      </div>

      <button onClick={resetSetup} className="cancel-button">
        Cancel Connection
      </button>
    </div>
  );

  const renderConnectedPhase = () => (
    <div className="spotify-connected">
      <div className="success-header">
        <div className="success-icon">✅</div>
        <h3>Spotify Connected Successfully!</h3>
        <p>Your Spotify account is now linked and ready to use.</p>
      </div>

      <ServiceConnectionStatus
        service="spotify"
        connected={true}
        testing={setupPhase === 'testing'}
        onTest={testConnection}
        onDisconnect={handleDisconnect}
      />

      {connectionDetails && (
        <div className="connection-details">
          <h4>Connection Details</h4>
          <div className="detail-grid">
            <div className="detail-item">
              <strong>Connected:</strong>
              <span>{new Date(connectionDetails.connectedAt).toLocaleString()}</span>
            </div>
            {connectionDetails.lastTested && (
              <div className="detail-item">
                <strong>Last Tested:</strong>
                <span>{new Date(connectionDetails.lastTested).toLocaleString()}</span>
              </div>
            )}
            {connectionDetails.testResult && (
              <div className="detail-item">
                <strong>Status:</strong>
                <span>{connectionDetails.testResult}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="next-steps">
        <h4>🎉 What's Next</h4>
        <div className="next-steps-list">
          <div className="next-step">
            <span className="step-icon">🔍</span>
            <div>
              <strong>Start Searching</strong>
              <p>Search for your favorite artists to see your music connections</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">📊</span>
            <div>
              <strong>Explore Your Data</strong>
              <p>Discover insights from your Spotify listening history</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">🎯</span>
            <div>
              <strong>Get Recommendations</strong>
              <p>Receive personalized music suggestions based on your taste</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

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