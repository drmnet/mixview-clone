/**
 * LastFmSetupEnhanced.jsx
 * 
 * PURPOSE: Enhanced Last.fm API setup component for the MixView setup wizard.
 * Handles Last.fm API key registration, credential input, validation, and connection
 * testing. Provides comprehensive user guidance for obtaining and configuring Last.fm API access.
 * 
 * DIRECTORY LOCATION: /src/components/setup/services/LastFmSetupEnhanced.jsx
 * 
 * DEPENDENCIES:
 * - /src/components/shared/SetupUIComponents.jsx (shared UI components)
 * - React (useState, useEffect, useRef hooks)
 * 
 * BACKEND ENDPOINTS USED:
 * - POST /oauth/services/lastfm/credentials - Save Last.fm API credentials
 * - POST /oauth/services/test/lastfm - Test Last.fm API connection
 * - DELETE /oauth/services/lastfm - Remove Last.fm API credentials
 * - GET /oauth/services/lastfm/status - Check Last.fm connection status
 * 
 * AUTHENTICATION FLOW:
 * Unlike Spotify OAuth, Last.fm uses API key authentication:
 * 1. User creates Last.fm API account at https://www.last.fm/api/account/create
 * 2. User obtains API Key and Shared Secret
 * 3. User inputs credentials in this component
 * 4. Component validates and saves credentials
 * 5. Component tests connection with Last.fm API
 * 
 * FEATURES PROVIDED:
 * - Step-by-step API account creation guidance
 * - Direct links to Last.fm API registration
 * - Credential input with validation
 * - Connection testing and status display
 * - Comprehensive error handling and troubleshooting
 * - Visual progress tracking through setup phases
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

function LastFmSetupEnhanced({ onConnected, onError, onLoadingChange, isConnected, error, loading }) {
  const [setupPhase, setSetupPhase] = useState('intro'); // intro, credentials, testing, connected, error
  const [credentials, setCredentials] = useState({
    apiKey: '',
    sharedSecret: ''
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [testAttempts, setTestAttempts] = useState(0);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState(null);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';
  const token = localStorage.getItem('token');

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

  // Validate API key format
  const validateApiKey = (apiKey) => {
    if (!apiKey) {
      return 'API Key is required';
    }
    if (apiKey.length !== 32) {
      return 'API Key should be exactly 32 characters long';
    }
    if (!/^[a-f0-9]{32}$/i.test(apiKey)) {
      return 'API Key should contain only hexadecimal characters (0-9, a-f)';
    }
    return null;
  };

  // Validate shared secret format
  const validateSharedSecret = (sharedSecret) => {
    if (!sharedSecret) {
      return 'Shared Secret is required';
    }
    if (sharedSecret.length !== 32) {
      return 'Shared Secret should be exactly 32 characters long';
    }
    if (!/^[a-f0-9]{32}$/i.test(sharedSecret)) {
      return 'Shared Secret should contain only hexadecimal characters (0-9, a-f)';
    }
    return null;
  };

  // Handle credential input changes
  const handleCredentialChange = (field, value) => {
    setCredentials(prev => ({ ...prev, [field]: value }));
    
    // Clear validation error for this field
    if (validationErrors[field]) {
      setValidationErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  // Validate credential field
  const handleCredentialValidation = (field, value) => {
    let error = null;
    if (field === 'apiKey') {
      error = validateApiKey(value);
    } else if (field === 'sharedSecret') {
      error = validateSharedSecret(value);
    }
    
    setValidationErrors(prev => ({ ...prev, [field]: error }));
    return error;
  };

  // Check if credentials are valid
  const areCredentialsValid = () => {
    const apiKeyError = validateApiKey(credentials.apiKey);
    const sharedSecretError = validateSharedSecret(credentials.sharedSecret);
    return !apiKeyError && !sharedSecretError;
  };

  // Save and test credentials
  const handleSaveCredentials = async () => {
    // Validate all fields
    const apiKeyError = validateApiKey(credentials.apiKey);
    const sharedSecretError = validateSharedSecret(credentials.sharedSecret);
    
    if (apiKeyError || sharedSecretError) {
      setValidationErrors({
        apiKey: apiKeyError,
        sharedSecret: sharedSecretError
      });
      return;
    }

    setSetupPhase('testing');
    setTestAttempts(prev => prev + 1);

    try {
      // Save credentials
      const saveResponse = await fetch(`${API_BASE}/oauth/services/lastfm/credentials`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: credentials.apiKey,
          shared_secret: credentials.sharedSecret
        })
      });

      if (!saveResponse.ok) {
        throw new Error('Failed to save Last.fm credentials');
      }

      // Test connection
      const testResponse = await fetch(`${API_BASE}/oauth/services/test/lastfm`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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
            apiKeyPreview: credentials.apiKey.substring(0, 8) + '...'
          });
          onConnected();
        } else {
          throw new Error(result.message || 'Connection test failed');
        }
      } else {
        const errorData = await testResponse.json();
        throw new Error(errorData.detail || 'API connection test failed');
      }
    } catch (error) {
      console.error('Last.fm setup error:', error);
      setSetupPhase('credentials');
      onError(error.message);
    }
  };

  // Test existing connection
  const testConnection = async () => {
    setSetupPhase('testing');
    
    try {
      const response = await fetch(`${API_BASE}/oauth/services/test/lastfm`, {
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
    if (!confirm('Are you sure you want to disconnect Last.fm? You\'ll need to re-enter your credentials to use Last.fm features.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/oauth/services/lastfm`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSetupPhase('intro');
        setConnectionDetails(null);
        setCredentials({ apiKey: '', sharedSecret: '' });
        setValidationErrors({});
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
    setValidationErrors({});
  };

  // Render intro phase
  const renderIntroPhase = () => (
    <div className="lastfm-intro">
      <div className="service-header">
        <div className="service-icon-large">🎧</div>
        <h2>Connect Last.fm</h2>
        <p>Connect your Last.fm account to unlock extended music data and scrobbling insights.</p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h4>Extended History</h4>
          <p>Access your complete listening history beyond what streaming services provide.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎵</div>
          <h4>Scrobble Analytics</h4>
          <p>Analyze your scrobbling patterns and discover insights about your music habits.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🔍</div>
          <h4>Artist Information</h4>
          <p>Get detailed artist biographies, similar artists, and comprehensive metadata.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎯</div>
          <h4>Music Discovery</h4>
          <p>Discover new music based on your Last.fm listening patterns and preferences.</p>
        </div>
      </div>

      <InstructionPanel title="How Last.fm Connection Works" type="info">
        <ol>
          <li><strong>API Account:</strong> Create a free Last.fm API account to get your credentials</li>
          <li><strong>Get Credentials:</strong> Obtain your API Key and Shared Secret from Last.fm</li>
          <li><strong>Enter Details:</strong> Input your credentials in this setup wizard</li>
          <li><strong>Test Connection:</strong> We'll verify your credentials work correctly</li>
          <li><strong>Ready to Use:</strong> Start accessing Last.fm data and features</li>
        </ol>
        <p><strong>Privacy Note:</strong> Your API credentials are encrypted and stored securely. We only access publicly available data and your authorized account information.</p>
      </InstructionPanel>

      <div className="api-requirements">
        <h4>📋 What You'll Need</h4>
        <ul className="requirements-list">
          <li>✓ A free Last.fm account (create at <a href="https://www.last.fm/join" target="_blank" rel="noopener noreferrer">last.fm/join</a>)</li>
          <li>✓ A Last.fm API account (separate from your regular account)</li>
          <li>✓ Your API Key (32-character hexadecimal string)</li>
          <li>✓ Your Shared Secret (32-character hexadecimal string)</li>
        </ul>
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
          onClick={() => setSetupPhase('credentials')}
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
              <span className="lastfm-logo">🎧</span>
              <span>Set Up Last.fm API</span>
            </>
          )}
        </button>
        
        <a 
          href="https://www.last.fm/api/account/create" 
          target="_blank" 
          rel="noopener noreferrer"
          className="setup-button secondary"
        >
          <span>🔗</span>
          <span>Get Last.fm API Key</span>
        </a>
      </div>
    </div>
  );

  // Render credentials input phase
  const renderCredentialsPhase = () => (
    <div className="lastfm-credentials">
      <div className="credentials-header">
        <h3>Enter Your Last.fm API Credentials</h3>
        <p>Input the API Key and Shared Secret from your Last.fm API account.</p>
      </div>

      <InstructionPanel title="🔑 How to Get Your Credentials" type="info" collapsible defaultExpanded>
        <div className="credential-steps">
          <div className="credential-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <h5>Create API Account</h5>
              <p>Visit <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">last.fm/api/account/create</a> and create your API account</p>
            </div>
          </div>
          <div className="credential-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <h5>Fill Application Details</h5>
              <p>Application Name: "MixView Music Discovery"<br/>
              Description: "Personal music discovery and analysis"<br/>
              Homepage: Leave blank or use your personal site</p>
            </div>
          </div>
          <div className="credential-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <h5>Copy Credentials</h5>
              <p>Once created, copy your API Key and Shared Secret from the API account page</p>
            </div>
          </div>
        </div>
      </InstructionPanel>

      <div className="credentials-form">
        <ValidatedInput
          label="API Key"
          type="text"
          value={credentials.apiKey}
          onChange={(value) => handleCredentialChange('apiKey', value)}
          onValidate={(value) => handleCredentialValidation('apiKey', value)}
          placeholder="32-character hexadecimal string (e.g., a1b2c3d4e5f6...)"
          required
          error={validationErrors.apiKey}
          success={credentials.apiKey && !validationErrors.apiKey ? 'Valid API Key format' : null}
          helpText="Your Last.fm API Key - exactly 32 characters, letters a-f and numbers 0-9 only"
        />

        <ValidatedInput
          label="Shared Secret"
          type="password"
          value={credentials.sharedSecret}
          onChange={(value) => handleCredentialChange('sharedSecret', value)}
          onValidate={(value) => handleCredentialValidation('sharedSecret', value)}
          placeholder="32-character hexadecimal string"
          required
          error={validationErrors.sharedSecret}
          success={credentials.sharedSecret && !validationErrors.sharedSecret ? 'Valid Shared Secret format' : null}
          helpText="Your Last.fm Shared Secret - exactly 32 characters, keep this private"
        />
      </div>

      {error && (
        <ErrorMessage 
          message={error} 
          onClose={() => onError(null)} 
        />
      )}

      <div className="credentials-actions">
        <button 
          onClick={() => setSetupPhase('intro')}
          className="action-button secondary"
        >
          Back
        </button>
        <button 
          onClick={handleSaveCredentials}
          disabled={!areCredentialsValid() || loading}
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
    <div className="lastfm-testing">
      <div className="testing-animation">
        <LoadingSpinner size="large" />
        <h3>Testing Last.fm Connection</h3>
        <p>Verifying your API credentials and testing connectivity...</p>
      </div>

      <div className="testing-steps">
        <div className="test-step active">
          <span className="step-number">1</span>
          <span>Validating API Key format</span>
        </div>
        <div className="test-step active">
          <span className="step-number">2</span>
          <span>Saving encrypted credentials</span>
        </div>
        <div className="test-step active">
          <span className="step-number">3</span>
          <span>Testing Last.fm API connection</span>
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
    <div className="lastfm-connected">
      <div className="success-header">
        <div className="success-icon">✅</div>
        <h3>Last.fm Connected Successfully!</h3>
        <p>Your Last.fm API credentials are configured and working.</p>
      </div>

      <ServiceConnectionStatus
        service="lastfm"
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
            {connectionDetails.apiKeyPreview && (
              <div className="detail-item">
                <strong>API Key:</strong>
                <span>{connectionDetails.apiKeyPreview}</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="next-steps">
        <h4>🎉 What's Available Now</h4>
        <div className="next-steps-list">
          <div className="next-step">
            <span className="step-icon">📊</span>
            <div>
              <strong>Extended Analytics</strong>
              <p>Access comprehensive listening history and scrobbling data</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">🎵</span>
            <div>
              <strong>Artist Information</strong>
              <p>Get detailed artist bios, similar artists, and comprehensive metadata</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">🔍</span>
            <div>
              <strong>Music Discovery</strong>
              <p>Discover new music based on Last.fm data and recommendations</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Render troubleshooting section
  const renderTroubleshooting = () => (
    <InstructionPanel title="🔧 Troubleshooting Last.fm Connection" type="warning">
      <div className="troubleshooting-sections">
        <div className="troubleshooting-section">
          <h5>Credential Issues</h5>
          <ul>
            <li>Ensure both API Key and Shared Secret are exactly 32 characters</li>
            <li>Check for typos - credentials are case-sensitive</li>
            <li>Make sure you're using the API credentials, not your regular Last.fm password</li>
            <li>Verify you copied the complete strings without extra spaces</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>API Account Issues</h5>
          <ul>
            <li>Make sure you created a Last.fm API account (separate from regular account)</li>
            <li>Check that your API application was approved (usually instant)</li>
            <li>Try generating new credentials from your API account page</li>
            <li>Ensure your Last.fm account is in good standing</li>
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
        <p><strong>Still having issues?</strong> You can skip Last.fm setup for now and add it later through the Service Manager.</p>
      </div>
    </InstructionPanel>
  );

  // Main render logic
  const renderCurrentPhase = () => {
    if (isConnected) {
      return renderConnectedPhase();
    }

    switch (setupPhase) {
      case 'credentials':
        return renderCredentialsPhase();
      case 'testing':
        return renderTestingPhase();
      case 'connected':
        return renderConnectedPhase();
      default:
        return renderIntroPhase();
    }
  };

  return (
    <div className="lastfm-setup-enhanced">
      {renderCurrentPhase()}

      <style jsx>{`
        .lastfm-setup-enhanced {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Intro Phase Styles */
        .lastfm-intro {
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
          border-color: #d51007;
          background: #fff5f5;
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

        .api-requirements {
          background: #fff3cd;
          padding: 1.5rem;
          border-radius: 8px;
          border-left: 4px solid #ffc107;
        }

        .api-requirements h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .requirements-list {
          margin: 0;
          padding-left: 1.5rem;
          color: #555;
        }

        .requirements-list li {
          margin-bottom: 0.5rem;
        }

        .requirements-list a {
          color: #d51007;
          text-decoration: none;
        }

        .requirements-list a:hover {
          text-decoration: underline;
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
          color: #d51007;
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
          background: linear-gradient(135deg, #d51007 0%, #ff1a1a 100%);
          color: white;
        }

        .setup-button.primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(213, 16, 7, 0.3);
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

        .lastfm-logo {
          font-size: 1.3rem;
        }

        /* Credentials Phase Styles */
        .lastfm-credentials {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .credentials-header {
          text-align: center;
        }

        .credentials-header h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .credentials-header p {
          margin: 0;
          color: #666;
        }

        .credential-steps {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .credential-step {
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
          background: #d51007;
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
          color: #d51007;
          text-decoration: none;
        }

        .step-content a:hover {
          text-decoration: underline;
        }

        .credentials-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .credentials-actions {
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
          background: #d51007;
          color: white;
        }

        .action-button.primary:hover:not(:disabled) {
          background: #b8000d;
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
        .lastfm-testing {
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
          background: #fff5f5;
          border: 1px solid #d51007;
        }

        .test-step .step-number {
          background: #d51007;
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
        .lastfm-connected {
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

          .lastfm-setup-enhanced {
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

          .credentials-actions {
            flex-direction: column;
          }

          .action-button {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default LastFmSetupEnhanced;