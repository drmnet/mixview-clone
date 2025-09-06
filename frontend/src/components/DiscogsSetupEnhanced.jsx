/**
 * DiscogsSetupEnhanced.jsx
 * 
 * PURPOSE: Enhanced Discogs API setup component for the MixView setup wizard.
 * Handles Discogs personal access token setup, credential input, validation, and connection
 * testing. Provides comprehensive user guidance for obtaining and configuring Discogs API access.
 * 
 * DIRECTORY LOCATION: /src/components/setup/services/DiscogsSetupEnhanced.jsx
 * 
 * DEPENDENCIES:
 * - /src/components/shared/SetupUIComponents.jsx (shared UI components)
 * - React (useState, useEffect hooks)
 * 
 * BACKEND ENDPOINTS USED:
 * - POST /oauth/services/discogs/credentials - Save Discogs personal access token
 * - POST /oauth/services/test/discogs - Test Discogs API connection
 * - DELETE /oauth/services/discogs - Remove Discogs API credentials
 * - GET /oauth/services/discogs/status - Check Discogs connection status
 * 
 * AUTHENTICATION FLOW:
 * Discogs uses Personal Access Token authentication:
 * 1. User creates/logs into Discogs account
 * 2. User navigates to Developer Settings in their Discogs account
 * 3. User generates a Personal Access Token with appropriate permissions
 * 4. User inputs token in this component
 * 5. Component validates token format and saves credentials
 * 6. Component tests connection with Discogs API
 * 
 * FEATURES PROVIDED:
 * - Step-by-step token generation guidance
 * - Direct links to Discogs developer settings
 * - Token input with validation
 * - Permission scope explanations
 * - Connection testing and status display
 * - Comprehensive error handling and troubleshooting
 * - Collection access and marketplace features explanation
 */

import React, { useState, useEffect } from 'react';
import { SetupUIComponents } from '../shared/SetupUIComponents';

const { 
  LoadingSpinner, 
  ErrorMessage, 
  InstructionPanel, 
  ServiceConnectionStatus,
  ValidatedInput
} = SetupUIComponents;

function DiscogsSetupEnhanced({ onConnected, onError, onLoadingChange, isConnected, error, loading }) {
  const [setupPhase, setSetupPhase] = useState('intro'); // intro, token, testing, connected, error
  const [token, setToken] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [testAttempts, setTestAttempts] = useState(0);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [userInfo, setUserInfo] = useState(null);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
  const authToken = localStorage.getItem('token');

  // Update phase based on connection status
  useEffect(() => {
    if (isConnected && setupPhase !== 'connected') {
      setSetupPhase('connected');
      setConnectionDetails({ connectedAt: new Date().toISOString() });
      onConnected();
    }
  }, [isConnected, setupPhase, onConnected]);

  // Update loading state
  useEffect(() => {
    onLoadingChange(loading || setupPhase === 'testing');
  }, [loading, setupPhase, onLoadingChange]);

  // Validate Discogs token format
  const validateToken = (tokenValue) => {
    if (!tokenValue) {
      return 'Personal Access Token is required';
    }
    
    // Discogs tokens are typically alphanumeric strings
    if (tokenValue.length < 10) {
      return 'Token appears too short - please check you copied the complete token';
    }
    
    if (tokenValue.length > 200) {
      return 'Token appears too long - please check you copied only the token';
    }
    
    // Check for obvious format issues
    if (tokenValue.includes(' ') || tokenValue.includes('\n') || tokenValue.includes('\t')) {
      return 'Token should not contain spaces or line breaks';
    }
    
    // Basic alphanumeric check (Discogs tokens can contain various characters)
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(tokenValue)) {
      return 'Token contains invalid characters';
    }
    
    return null;
  };

  // Handle token input changes
  const handleTokenChange = (value) => {
    setToken(value.trim());
    
    // Clear validation error
    if (validationError) {
      setValidationError(null);
    }
  };

  // Validate token field
  const handleTokenValidation = (value) => {
    const error = validateToken(value);
    setValidationError(error);
    return error;
  };

  // Check if token is valid
  const isTokenValid = () => {
    return !validateToken(token);
  };

  // Save and test token
  const handleSaveToken = async () => {
    // Validate token
    const tokenError = validateToken(token);
    
    if (tokenError) {
      setValidationError(tokenError);
      return;
    }

    setSetupPhase('testing');
    setTestAttempts(prev => prev + 1);

    try {
      // Save token
      const saveResponse = await fetch(`${API_BASE}/oauth/services/discogs/credentials`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          personal_access_token: token
        })
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.detail || 'Failed to save Discogs token');
      }

      // Test connection
      const testResponse = await fetch(`${API_BASE}/oauth/services/test/discogs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (testResponse.ok) {
        const result = await testResponse.json();
        if (result.test_successful) {
          setSetupPhase('connected');
          setConnectionDetails({ 
            connectedAt: new Date().toISOString(),
            testResult: result.message,
            tokenPreview: token.substring(0, 8) + '...'
          });
          setUserInfo(result.user_info || null);
          onConnected();
        } else {
          throw new Error(result.message || 'Connection test failed');
        }
      } else {
        const errorData = await testResponse.json();
        throw new Error(errorData.detail || 'API connection test failed');
      }
    } catch (error) {
      console.error('Discogs setup error:', error);
      setSetupPhase('token');
      onError(error.message);
    }
  };

  // Test existing connection
  const testConnection = async () => {
    setSetupPhase('testing');
    
    try {
      const response = await fetch(`${API_BASE}/oauth/services/test/discogs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
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
          setUserInfo(result.user_info || null);
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
    if (!confirm('Are you sure you want to disconnect Discogs? You\'ll need to re-enter your token to use Discogs features.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/oauth/services/discogs`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      if (response.ok) {
        setSetupPhase('intro');
        setConnectionDetails(null);
        setUserInfo(null);
        setToken('');
        setValidationError(null);
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
    setValidationError(null);
  };

  // Render intro phase
  const renderIntroPhase = () => (
    <div className="discogs-intro">
      <div className="service-header">
        <div className="service-icon-large">💿</div>
        <h2>Connect Discogs</h2>
        <p>Connect your Discogs account to access the world's largest music database and marketplace.</p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🗃️</div>
          <h4>Release Database</h4>
          <p>Access comprehensive information about millions of music releases, including rare and obscure records.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📚</div>
          <h4>Collection Tracking</h4>
          <p>Track your personal music collection and discover what you're missing from your favorite artists.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">💰</div>
          <h4>Marketplace Data</h4>
          <p>Get current market values and pricing information for releases you own or want to buy.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎵</div>
          <h4>Detailed Metadata</h4>
          <p>Access rich metadata including credits, pressing details, and complete discographies.</p>
        </div>
      </div>

      <InstructionPanel title="How Discogs Connection Works" type="info">
        <ol>
          <li><strong>Discogs Account:</strong> Make sure you have a free Discogs account</li>
          <li><strong>Developer Settings:</strong> Access your personal developer settings</li>
          <li><strong>Generate Token:</strong> Create a Personal Access Token with read permissions</li>
          <li><strong>Enter Token:</strong> Input your token in this setup wizard</li>
          <li><strong>Test Connection:</strong> We'll verify your token works correctly</li>
          <li><strong>Ready to Use:</strong> Start accessing Discogs database and features</li>
        </ol>
        <p><strong>Privacy Note:</strong> Your token is encrypted and stored securely. We only request read access to public data and your authorized collection information.</p>
      </InstructionPanel>

      <div className="token-permissions">
        <h4>🔒 Token Permissions</h4>
        <div className="permissions-grid">
          <div className="permission-item">
            <span className="permission-icon">👁️</span>
            <div>
              <strong>Read Access</strong>
              <p>View releases, artists, and labels from the Discogs database</p>
            </div>
          </div>
          <div className="permission-item">
            <span className="permission-icon">📋</span>
            <div>
              <strong>Collection Access</strong>
              <p>View your personal collection and wantlist (if you choose to share)</p>
            </div>
          </div>
          <div className="permission-item">
            <span className="permission-icon">🔍</span>
            <div>
              <strong>Search & Browse</strong>
              <p>Search the database and browse release information</p>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <ErrorMessage 
          message={error} 
          onClose={() => onError(null)} 
        />
      )}

      {testAttempts > 0 && (
        <div className="retry-info">
          <p>Attempt #{testAttempts + 1}</p>
          {testAttempts >= 2 && (
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

      <div className="setup-actions">
        <button 
          onClick={() => setSetupPhase('token')}
          disabled={loading}
          className="setup-button primary"
        >
          {loading ? (
            <>
              <LoadingSpinner size="small" color="white" />
              <span>Loading...</span>
            </>
          ) : (
            <>
              <span className="discogs-logo">💿</span>
              <span>Set Up Discogs Token</span>
            </>
          )}
        </button>
        
        <a 
          href="https://www.discogs.com/settings/developers" 
          target="_blank" 
          rel="noopener noreferrer"
          className="setup-button secondary"
        >
          <span>🔗</span>
          <span>Get Discogs Token</span>
        </a>
      </div>
    </div>
  );

  // Render token input phase
  const renderTokenPhase = () => (
    <div className="discogs-token">
      <div className="token-header">
        <h3>Enter Your Discogs Personal Access Token</h3>
        <p>Input the Personal Access Token from your Discogs developer settings.</p>
      </div>

      <InstructionPanel title="🔑 How to Get Your Personal Access Token" type="info" collapsible defaultExpanded>
        <div className="token-steps">
          <div className="token-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <h5>Go to Developer Settings</h5>
              <p>Visit <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer">discogs.com/settings/developers</a> while logged into your account</p>
            </div>
          </div>
          <div className="token-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <h5>Generate New Token</h5>
              <p>Click "Generate new token" in the Personal Access Tokens section</p>
            </div>
          </div>
          <div className="token-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <h5>Set Token Name</h5>
              <p>Give your token a name like "MixView Music Discovery" to identify its purpose</p>
            </div>
          </div>
          <div className="token-step">
            <span className="step-number">4</span>
            <div className="step-content">
              <h5>Copy Token</h5>
              <p>Copy the generated token immediately - you won't be able to see it again!</p>
            </div>
          </div>
        </div>
      </InstructionPanel>

      <div className="token-form">
        <ValidatedInput
          label="Personal Access Token"
          type="password"
          value={token}
          onChange={handleTokenChange}
          onValidate={handleTokenValidation}
          placeholder="Enter your Discogs Personal Access Token"
          required
          error={validationError}
          success={token && !validationError ? 'Valid token format' : null}
          helpText="Your Discogs Personal Access Token - keep this private and secure"
        />

        <InstructionPanel title="⚠️ Token Security" type="warning">
          <ul>
            <li><strong>Keep it private:</strong> Never share your token with anyone</li>
            <li><strong>Single use:</strong> Only use this token for MixView</li>
            <li><strong>Revoke if needed:</strong> You can revoke this token anytime from your Discogs settings</li>
            <li><strong>Read-only:</strong> This token only allows reading data, not modifying your account</li>
          </ul>
        </InstructionPanel>
      </div>

      {error && (
        <ErrorMessage 
          message={error} 
          onClose={() => onError(null)} 
        />
      )}

      <div className="token-actions">
        <button 
          onClick={() => setSetupPhase('intro')}
          className="action-button secondary"
        >
          Back
        </button>
        <button 
          onClick={handleSaveToken}
          disabled={!isTokenValid() || loading}
          className="action-button primary"
        >
          {loading ? (
            <>
              <LoadingSpinner size="small" color="white" />
              <span>Testing...</span>
            </>
          ) : (
            'Save & Test Connection'
          )}
        </button>
      </div>
    </div>
  );

  // Render testing phase
  const renderTestingPhase = () => (
    <div className="discogs-testing">
      <div className="testing-animation">
        <LoadingSpinner size="large" />
        <h3>Testing Discogs Connection</h3>
        <p>Verifying your Personal Access Token and testing API connectivity...</p>
      </div>

      <div className="testing-steps">
        <div className="test-step active">
          <span className="step-number">1</span>
          <span>Validating token format</span>
        </div>
        <div className="test-step active">
          <span className="step-number">2</span>
          <span>Saving encrypted token</span>
        </div>
        <div className="test-step active">
          <span className="step-number">3</span>
          <span>Testing Discogs API access</span>
        </div>
        <div className="test-step">
          <span className="step-number">4</span>
          <span>Connection established!</span>
        </div>
      </div>

      <button onClick={resetSetup} className="cancel-button">
        Cancel Test
      </button>
    </div>
  );

  // Render connected phase
  const renderConnectedPhase = () => (
    <div className="discogs-connected">
      <div className="success-header">
        <div className="success-icon">✅</div>
        <h3>Discogs Connected Successfully!</h3>
        <p>Your Discogs Personal Access Token is configured and working.</p>
      </div>

      <ServiceConnectionStatus
        service="discogs"
        connected={true}
        testing={setupPhase === 'testing'}
        onTest={testConnection}
        onDisconnect={handleDisconnect}
      />

      {userInfo && (
        <div className="user-info">
          <h4>Connected Account</h4>
          <div className="user-details">
            <div className="user-avatar">
              {userInfo.avatar_url ? (
                <img src={userInfo.avatar_url} alt="User avatar" />
              ) : (
                <div className="avatar-placeholder">👤</div>
              )}
            </div>
            <div className="user-data">
              <strong>{userInfo.username || 'Discogs User'}</strong>
              {userInfo.name && <p>{userInfo.name}</p>}
              {userInfo.num_collection && (
                <p>{userInfo.num_collection} items in collection</p>
              )}
              {userInfo.num_wantlist && (
                <p>{userInfo.num_wantlist} items in wantlist</p>
              )}
            </div>
          </div>
        </div>
      )}

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
            {connectionDetails.tokenPreview && (
              <div className="detail-item">
                <strong>Token:</strong>
                <span>{connectionDetails.tokenPreview}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="next-steps">
        <h4>🎉 What's Available Now</h4>
        <div className="next-steps-list">
          <div className="next-step">
            <span className="step-icon">🗃️</span>
            <div>
              <strong>Release Database</strong>
              <p>Search and explore millions of music releases with detailed information</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">📚</span>
            <div>
              <strong>Collection Analysis</strong>
              <p>Analyze your Discogs collection and discover patterns in your music taste</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">💰</span>
            <div>
              <strong>Market Information</strong>
              <p>Get pricing data and market insights for releases you own or want</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render troubleshooting section
  const renderTroubleshooting = () => (
    <InstructionPanel title="🔧 Troubleshooting Discogs Connection" type="warning">
      <div className="troubleshooting-sections">
        <div className="troubleshooting-section">
          <h5>Token Issues</h5>
          <ul>
            <li>Make sure you copied the complete token without extra spaces</li>
            <li>Check that you're using a Personal Access Token, not an API key</li>
            <li>Verify the token hasn't been revoked in your Discogs settings</li>
            <li>Try generating a new token if the current one isn't working</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>Account Issues</h5>
          <ul>
            <li>Ensure you're logged into the correct Discogs account</li>
            <li>Check that your Discogs account is in good standing</li>
            <li>Verify you have access to the developer settings page</li>
            <li>Try logging out and back into Discogs, then regenerate the token</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>API Issues</h5>
          <ul>
            <li>Check if Discogs is experiencing service issues</li>
            <li>Try connecting from a different network</li>
            <li>Disable VPN if you're using one</li>
            <li>Wait a few minutes and try again (rate limiting)</li>
          </ul>
        </div>
      </div>
      
      <div className="help-contact">
        <p><strong>Still having issues?</strong> You can skip Discogs setup for now and add it later through the Service Manager.</p>
      </div>
    </InstructionPanel>
  );

  // Main render logic
  const renderCurrentPhase = () => {
    if (isConnected) {
      return renderConnectedPhase();
    }

    switch (setupPhase) {
      case 'token':
        return renderTokenPhase();
      case 'testing':
        return renderTestingPhase();
      case 'connected':
        return renderConnectedPhase();
      default:
        return renderIntroPhase();
    }
  };

  return (
    <div className="discogs-setup-enhanced">
      {renderCurrentPhase()}

      <style jsx>{`
        .discogs-setup-enhanced {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Intro Phase Styles */
        .discogs-intro {
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
          border-color: #333;
          background: #f5f5f5;
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

        .token-permissions {
          background: #e8f5e8;
          padding: 1.5rem;
          border-radius: 8px;
          border-left: 4px solid #28a745;
        }

        .token-permissions h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .permissions-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
        }

        .permission-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .permission-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .permission-item strong {
          display: block;
          color: #333;
          margin-bottom: 0.25rem;
          font-size: 0.9rem;
        }

        .permission-item p {
          margin: 0;
          color: #666;
          font-size: 0.8rem;
          line-height: 1.3;
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
          color: #333;
          text-decoration: underline;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .setup-actions {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
        }

        .setup-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          padding: 1rem 2rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          text-decoration: none;
          flex: 1;
        }

        .setup-button.primary {
          background: linear-gradient(135deg, #333 0%, #555 100%);
          color: white;
        }

        .setup-button.primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(51, 51, 51, 0.3);
        }

        .setup-button.secondary {
          background: #6c757d;
          color: white;
        }

        .setup-button.secondary:hover {
          background: #5a6268;
          transform: translateY(-1px);
        }

        .setup-button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
          transform: none;
        }

        .discogs-logo {
          font-size: 1.3rem;
        }

        /* Token Phase Styles */
        .discogs-token {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .token-header {
          text-align: center;
        }

        .token-header h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .token-header p {
          margin: 0;
          color: #666;
        }

        .token-steps {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .token-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
        }

        .step-number {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: #333;
          color: white;
          border-radius: 50%;
          font-size: 0.9rem;
          font-weight: bold;
          flex-shrink: 0;
        }

        .step-content h5 {
          margin: 0 0 0.25rem 0;
          color: #333;
          font-size: 0.95rem;
        }

        .step-content p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .step-content a {
          color: #333;
          text-decoration: none;
        }

        .step-content a:hover {
          text-decoration: underline;
        }

        .token-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .token-actions {
          display: flex;
          justify-content: space-between;
          gap: 1rem;
        }

        .action-button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: all 0.3s ease;
        }

        .action-button.primary {
          background: #333;
          color: white;
        }

        .action-button.primary:hover:not(:disabled) {
          background: #222;
          transform: translateY(-1px);
        }

        .action-button.secondary {
          background: #6c757d;
          color: white;
        }

        .action-button.secondary:hover {
          background: #5a6268;
        }

        .action-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        /* Testing Phase Styles */
        .discogs-testing {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .testing-animation {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .testing-animation h3 {
          margin: 0;
          color: #333;
        }

        .testing-animation p {
          margin: 0;
          color: #666;
        }

        .testing-steps {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 300px;
          margin: 0 auto;
        }

        .test-step {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.75rem;
          background: #f8f9fa;
          border-radius: 6px;
          opacity: 0.6;
          transition: opacity 0.3s ease;
        }

        .test-step.active {
          opacity: 1;
          background: #f5f5f5;
          border: 1px solid #333;
        }

        .test-step .step-number {
          background: #333;
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
        .discogs-connected {
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

        .user-info {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
        }

        .user-info h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .user-details {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .user-avatar img {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          object-fit: cover;
        }

        .avatar-placeholder {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #dee2e6;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
        }

        .user-data strong {
          display: block;
          color: #333;
          margin-bottom: 0.25rem;
        }

        .user-data p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.3;
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

          .discogs-setup-enhanced {
            max-width: 100%;
          }

          .setup-actions {
            flex-direction: column;
          }

          .setup-button {
            font-size: 0.95rem;
            padding: 0.875rem 1.5rem;
          }

          .testing-steps {
            max-width: 100%;
          }

          .detail-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }

          .token-actions {
            flex-direction: column;
          }

          .action-button {
            width: 100%;
            justify-content: center;
          }

          .permissions-grid {
            grid-template-columns: 1fr;
          }

          .user-details {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }
        }
      `}</style>
    </div>
  );
}

export default DiscogsSetupEnhanced;