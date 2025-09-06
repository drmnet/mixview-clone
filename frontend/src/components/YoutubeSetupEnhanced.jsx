/**
 * YoutubeSetupEnhanced.jsx
 * 
 * PURPOSE: Enhanced YouTube Data API setup component for the MixView setup wizard.
 * Handles YouTube Data API key setup, credential input, validation, and connection
 * testing. Provides comprehensive user guidance for obtaining and configuring YouTube API access.
 * 
 * DIRECTORY LOCATION: /src/components/setup/services/YoutubeSetupEnhanced.jsx
 * 
 * DEPENDENCIES:
 * - /src/components/shared/SetupUIComponents.jsx (shared UI components)
 * - React (useState, useEffect hooks)
 * 
 * BACKEND ENDPOINTS USED:
 * - POST /oauth/services/youtube/credentials - Save YouTube Data API key
 * - POST /oauth/services/test/youtube - Test YouTube API connection
 * - DELETE /oauth/services/youtube - Remove YouTube API credentials
 * - GET /oauth/services/youtube/status - Check YouTube connection status
 * 
 * AUTHENTICATION FLOW:
 * YouTube uses Google Cloud Console API key authentication:
 * 1. User creates/accesses Google Cloud Console project
 * 2. User enables YouTube Data API v3
 * 3. User creates API credentials (API Key)
 * 4. User configures API key restrictions (optional but recommended)
 * 5. User inputs API key in this component
 * 6. Component validates and saves credentials
 * 7. Component tests connection with YouTube Data API
 * 
 * FEATURES PROVIDED:
 * - Step-by-step Google Cloud Console setup guidance
 * - Direct links to Google Cloud Console and API enablement
 * - API key input with validation
 * - Quota limits and usage explanations
 * - API restrictions and security best practices
 * - Connection testing and status display
 * - Comprehensive error handling and troubleshooting
 * - YouTube-specific feature explanations
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

function YoutubeSetupEnhanced({ onConnected, onError, onLoadingChange, isConnected, error, loading }) {
  const [setupPhase, setSetupPhase] = useState('intro'); // intro, apikey, testing, connected, error
  const [apiKey, setApiKey] = useState('');
  const [validationError, setValidationError] = useState(null);
  const [testAttempts, setTestAttempts] = useState(0);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [connectionDetails, setConnectionDetails] = useState(null);
  const [quotaInfo, setQuotaInfo] = useState(null);

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

  // Validate YouTube API key format
  const validateApiKey = (keyValue) => {
    if (!keyValue) {
      return 'YouTube Data API Key is required';
    }
    
    // YouTube API keys are typically 39 characters long and start with "AIza"
    if (keyValue.length < 30) {
      return 'API Key appears too short - please check you copied the complete key';
    }
    
    if (keyValue.length > 50) {
      return 'API Key appears too long - please check you copied only the key';
    }
    
    // YouTube API keys typically start with "AIza"
    if (!keyValue.startsWith('AIza')) {
      return 'YouTube API Keys typically start with "AIza" - please verify this is the correct key';
    }
    
    // Check for obvious format issues
    if (keyValue.includes(' ') || keyValue.includes('\n') || keyValue.includes('\t')) {
      return 'API Key should not contain spaces or line breaks';
    }
    
    // Basic character validation (YouTube keys are base64-like)
    if (!/^[A-Za-z0-9_\-]+$/.test(keyValue)) {
      return 'API Key contains invalid characters';
    }
    
    return null;
  };

  // Handle API key input changes
  const handleApiKeyChange = (value) => {
    setApiKey(value.trim());
    
    // Clear validation error
    if (validationError) {
      setValidationError(null);
    }
  };

  // Validate API key field
  const handleApiKeyValidation = (value) => {
    const error = validateApiKey(value);
    setValidationError(error);
    return error;
  };

  // Check if API key is valid
  const isApiKeyValid = () => {
    return !validateApiKey(apiKey);
  };

  // Save and test API key
  const handleSaveApiKey = async () => {
    // Validate API key
    const keyError = validateApiKey(apiKey);
    
    if (keyError) {
      setValidationError(keyError);
      return;
    }

    setSetupPhase('testing');
    setTestAttempts(prev => prev + 1);

    try {
      // Save API key
      const saveResponse = await fetch(`${API_BASE}/oauth/services/youtube/credentials`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          api_key: apiKey
        })
      });

      if (!saveResponse.ok) {
        const errorData = await saveResponse.json();
        throw new Error(errorData.detail || 'Failed to save YouTube API key');
      }

      // Test connection
      const testResponse = await fetch(`${API_BASE}/oauth/services/test/youtube`, {
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
            apiKeyPreview: apiKey.substring(0, 8) + '...'
          });
          setQuotaInfo(result.quota_info || null);
          onConnected();
        } else {
          throw new Error(result.message || 'Connection test failed');
        }
      } else {
        const errorData = await testResponse.json();
        throw new Error(errorData.detail || 'API connection test failed');
      }
    } catch (error) {
      console.error('YouTube setup error:', error);
      setSetupPhase('apikey');
      onError(error.message);
    }
  };

  // Test existing connection
  const testConnection = async () => {
    setSetupPhase('testing');
    
    try {
      const response = await fetch(`${API_BASE}/oauth/services/test/youtube`, {
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
          setQuotaInfo(result.quota_info || null);
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
    if (!confirm('Are you sure you want to disconnect YouTube? You\'ll need to re-enter your API key to use YouTube features.')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/oauth/services/youtube`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        setSetupPhase('intro');
        setConnectionDetails(null);
        setQuotaInfo(null);
        setApiKey('');
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
    <div className="youtube-intro">
      <div className="service-header">
        <div className="service-icon-large">📺</div>
        <h2>Connect YouTube</h2>
        <p>Connect YouTube Data API to access music videos, artist channels, and video content discovery.</p>
      </div>

      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🎥</div>
          <h4>Music Videos</h4>
          <p>Discover official music videos, live performances, and acoustic sessions for your favorite artists.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📺</div>
          <h4>Artist Channels</h4>
          <p>Access official artist channels, behind-the-scenes content, and exclusive releases.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🎵</div>
          <div>
            <h4>Content Discovery</h4>
            <p>Find rare tracks, covers, remixes, and alternative versions available on YouTube.</p>
          </div>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📋</div>
          <h4>Playlist Integration</h4>
          <p>Explore curated playlists and discover music through YouTube's recommendation engine.</p>
        </div>
      </div>

      <InstructionPanel title="How YouTube API Connection Works" type="info">
        <ol>
          <li><strong>Google Cloud Project:</strong> Create or use an existing Google Cloud Console project</li>
          <li><strong>Enable API:</strong> Enable the YouTube Data API v3 for your project</li>
          <li><strong>Create Credentials:</strong> Generate an API Key credential</li>
          <li><strong>Configure Restrictions:</strong> (Optional) Set up API key restrictions for security</li>
          <li><strong>Enter Key:</strong> Input your API key in this setup wizard</li>
          <li><strong>Test Connection:</strong> We'll verify your API key works correctly</li>
          <li><strong>Ready to Use:</strong> Start accessing YouTube data and features</li>
        </ol>
        <p><strong>Privacy Note:</strong> Your API key is encrypted and stored securely. We only access publicly available YouTube data and respect all API usage policies.</p>
      </InstructionPanel>

      <div className="quota-warning">
        <h4>⚠️ Important: API Quota Limits</h4>
        <div className="quota-info">
          <div className="quota-item">
            <span className="quota-icon">📊</span>
            <div>
              <strong>Daily Quota</strong>
              <p>YouTube Data API has daily quota limits. Free tier provides 10,000 units per day.</p>
            </div>
          </div>
          <div className="quota-item">
            <span className="quota-icon">🔄</span>
            <div>
              <strong>Usage Monitoring</strong>
              <p>Monitor your API usage in Google Cloud Console to avoid hitting limits.</p>
            </div>
          </div>
          <div className="quota-item">
            <span className="quota-icon">💰</span>
            <div>
              <strong>Billing</strong>
              <p>YouTube API may require billing enabled for higher quotas, but basic usage is free.</p>
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
          onClick={() => setSetupPhase('apikey')}
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
              <span className="youtube-logo">📺</span>
              <span>Set Up YouTube API</span>
            </>
          )}
        </button>
        
        <a 
          href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="setup-button secondary"
        >
          <span>🔗</span>
          <span>Enable YouTube API</span>
        </a>
      </div>
    </div>
  );

  // Render API key input phase
  const renderApiKeyPhase = () => (
    <div className="youtube-apikey">
      <div className="apikey-header">
        <h3>Enter Your YouTube Data API Key</h3>
        <p>Input the API Key from your Google Cloud Console project.</p>
      </div>

      <InstructionPanel title="🔑 How to Get Your YouTube Data API Key" type="info" collapsible defaultExpanded>
        <div className="apikey-steps">
          <div className="apikey-step">
            <span className="step-number">1</span>
            <div className="step-content">
              <h5>Go to Google Cloud Console</h5>
              <p>Visit <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">console.cloud.google.com</a> and select or create a project</p>
            </div>
          </div>
          <div className="apikey-step">
            <span className="step-number">2</span>
            <div className="step-content">
              <h5>Enable YouTube Data API v3</h5>
              <p>Go to <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer">APIs & Services → Library</a> and enable "YouTube Data API v3"</p>
            </div>
          </div>
          <div className="apikey-step">
            <span className="step-number">3</span>
            <div className="step-content">
              <h5>Create Credentials</h5>
              <p>Go to <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">APIs & Services → Credentials</a> and click "Create Credentials" → "API Key"</p>
            </div>
          </div>
          <div className="apikey-step">
            <span className="step-number">4</span>
            <div className="step-content">
              <h5>Configure Restrictions (Recommended)</h5>
              <p>Click "Restrict Key" and limit to "YouTube Data API v3" for security</p>
            </div>
          </div>
          <div className="apikey-step">
            <span className="step-number">5</span>
            <div className="step-content">
              <h5>Copy API Key</h5>
              <p>Copy the generated API key - it should start with "AIza" and be about 39 characters long</p>
            </div>
          </div>
        </div>
      </InstructionPanel>

      <div className="apikey-form">
        <ValidatedInput
          label="YouTube Data API Key"
          type="password"
          value={apiKey}
          onChange={handleApiKeyChange}
          onValidate={handleApiKeyValidation}
          placeholder="AIzaSyC-... (typically 39 characters)"
          required
          error={validationError}
          success={apiKey && !validationError ? 'Valid API Key format' : null}
          helpText="Your YouTube Data API Key from Google Cloud Console - keep this private"
        />

        <InstructionPanel title="🔒 API Key Security Best Practices" type="warning">
          <ul>
            <li><strong>Restrict your key:</strong> Limit API access to only YouTube Data API v3</li>
            <li><strong>Set up application restrictions:</strong> Limit usage to specific domains or IP addresses</li>
            <li><strong>Monitor usage:</strong> Regularly check your API usage in Google Cloud Console</li>
            <li><strong>Regenerate if compromised:</strong> Create a new key if you suspect it's been exposed</li>
            <li><strong>Keep it private:</strong> Never share your API key or commit it to public repositories</li>
          </ul>
        </InstructionPanel>
      </div>

      {error && (
        <ErrorMessage 
          message={error} 
          onClose={() => onError(null)} 
        />
      )}

      <div className="apikey-actions">
        <button 
          onClick={() => setSetupPhase('intro')}
          className="action-button secondary"
        >
          Back
        </button>
        <button 
          onClick={handleSaveApiKey}
          disabled={!isApiKeyValid() || loading}
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
    <div className="youtube-testing">
      <div className="testing-animation">
        <LoadingSpinner size="large" />
        <h3>Testing YouTube Connection</h3>
        <p>Verifying your API key and testing YouTube Data API connectivity...</p>
      </div>

      <div className="testing-steps">
        <div className="test-step active">
          <span className="step-number">1</span>
          <span>Validating API key format</span>
        </div>
        <div className="test-step active">
          <span className="step-number">2</span>
          <span>Saving encrypted API key</span>
        </div>
        <div className="test-step active">
          <span className="step-number">3</span>
          <span>Testing YouTube Data API access</span>
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
    <div className="youtube-connected">
      <div className="success-header">
        <div className="success-icon">✅</div>
        <h3>YouTube Connected Successfully!</h3>
        <p>Your YouTube Data API key is configured and working.</p>
      </div>

      <ServiceConnectionStatus
        service="youtube"
        connected={true}
        testing={setupPhase === 'testing'}
        onTest={testConnection}
        onDisconnect={handleDisconnect}
      />

      {quotaInfo && (
        <div className="quota-status">
          <h4>API Quota Information</h4>
          <div className="quota-details">
            <div className="quota-metric">
              <span className="metric-label">Daily Limit:</span>
              <span className="metric-value">{quotaInfo.dailyLimit || '10,000'} units</span>
            </div>
            {quotaInfo.usedToday && (
              <div className="quota-metric">
                <span className="metric-label">Used Today:</span>
                <span className="metric-value">{quotaInfo.usedToday} units</span>
              </div>
            )}
            {quotaInfo.remainingToday && (
              <div className="quota-metric">
                <span className="metric-label">Remaining:</span>
                <span className="metric-value">{quotaInfo.remainingToday} units</span>
              </div>
            )}
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
            <span className="step-icon">🎥</span>
            <div>
              <strong>Music Video Discovery</strong>
              <p>Find official music videos, live performances, and acoustic sessions</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">📺</span>
            <div>
              <strong>Artist Channel Access</strong>
              <p>Explore official artist channels and exclusive video content</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">🔍</span>
            <div>
              <strong>Content Search</strong>
              <p>Search for covers, remixes, and alternative versions of your favorite songs</p>
            </div>
          </div>
        </div>
      </div>

      <InstructionPanel title="📊 Managing Your API Usage" type="info" collapsible>
        <ul>
          <li><strong>Monitor in Console:</strong> Check your usage at <a href="https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas" target="_blank" rel="noopener noreferrer">Google Cloud Console → APIs → Quotas</a></li>
          <li><strong>Request Quota Increase:</strong> If you need higher limits, you can request an increase</li>
          <li><strong>Optimize Usage:</strong> MixView is designed to minimize API calls and cache responses</li>
          <li><strong>Billing Account:</strong> Consider enabling billing for higher free tier limits</li>
        </ul>
      </InstructionPanel>
    </div>
  );

  // Render troubleshooting section
  const renderTroubleshooting = () => (
    <InstructionPanel title="🔧 Troubleshooting YouTube API Connection" type="warning">
      <div className="troubleshooting-sections">
        <div className="troubleshooting-section">
          <h5>API Key Issues</h5>
          <ul>
            <li>Ensure the API key is complete and starts with "AIza"</li>
            <li>Check that YouTube Data API v3 is enabled in your project</li>
            <li>Verify the API key hasn't been deleted or restricted</li>
            <li>Try creating a new API key if the current one doesn't work</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>Google Cloud Issues</h5>
          <ul>
            <li>Make sure you're logged into the correct Google account</li>
            <li>Verify your Google Cloud project is active and accessible</li>
            <li>Check that billing is enabled if using high quotas</li>
            <li>Ensure you have the necessary permissions in the project</li>
          </ul>
        </div>
        
        <div className="troubleshooting-section">
          <h5>Quota and Access Issues</h5>
          <ul>
            <li>Check if you've exceeded your daily API quota</li>
            <li>Verify API key restrictions aren't blocking access</li>
            <li>Try again tomorrow if quota is exhausted</li>
            <li>Check YouTube API status at <a href="https://status.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Status</a></li>
          </ul>
        </div>
      </div>
      
      <div className="help-contact">
        <p><strong>Still having issues?</strong> You can skip YouTube setup for now and add it later through the Service Manager.</p>
      </div>
    </InstructionPanel>
  );

  // Main render logic
  const renderCurrentPhase = () => {
    if (isConnected) {
      return renderConnectedPhase();
    }

    switch (setupPhase) {
      case 'apikey':
        return renderApiKeyPhase();
      case 'testing':
        return renderTestingPhase();
      case 'connected':
        return renderConnectedPhase();
      default:
        return renderIntroPhase();
    }
  };

  return (
    <div className="youtube-setup-enhanced">
      {renderCurrentPhase()}

      <style jsx>{`
        .youtube-setup-enhanced {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          max-width: 600px;
          margin: 0 auto;
        }

        /* Intro Phase Styles */
        .youtube-intro {
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
          border-color: #ff0000;
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

        .quota-warning {
          background: #fff3cd;
          padding: 1.5rem;
          border-radius: 8px;
          border-left: 4px solid #ffc107;
        }

        .quota-warning h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .quota-info {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .quota-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .quota-icon {
          font-size: 1.25rem;
          flex-shrink: 0;
        }

        .quota-item strong {
          display: block;
          color: #333;
          margin-bottom: 0.25rem;
          font-size: 0.9rem;
        }

        .quota-item p {
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
          color: #ff0000;
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
          background: linear-gradient(135deg, #ff0000 0%, #cc0000 100%);
          color: white;
        }

        .setup-button.primary:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 0, 0, 0.3);
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

        .youtube-logo {
          font-size: 1.3rem;
        }

        /* API Key Phase Styles */
        .youtube-apikey {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .apikey-header {
          text-align: center;
        }

        .apikey-header h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .apikey-header p {
          margin: 0;
          color: #666;
        }

        .apikey-steps {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .apikey-step {
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
          background: #ff0000;
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
          color: #ff0000;
          text-decoration: none;
        }

        .step-content a:hover {
          text-decoration: underline;
        }

        .apikey-form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .apikey-actions {
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
          background: #ff0000;
          color: white;
        }

        .action-button.primary:hover:not(:disabled) {
          background: #cc0000;
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
        .youtube-testing {
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
          border: 1px solid #ff0000;
        }

        .test-step .step-number {
          background: #ff0000;
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
        .youtube-connected {
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

        .quota-status {
          background: #e7f3ff;
          padding: 1.5rem;
          border-radius: 8px;
          border-left: 4px solid #007bff;
        }

        .quota-status h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .quota-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .quota-metric {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .metric-label {
          color: #333;
          font-weight: 500;
        }

        .metric-value {
          color: #007bff;
          font-weight: bold;
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

        .troubleshooting-section a {
          color: #ff0000;
          text-decoration: none;
        }

        .troubleshooting-section a:hover {
          text-decoration: underline;
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

          .youtube-setup-enhanced {
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

          .apikey-actions {
            flex-direction: column;
          }

          .action-button {
            width: 100%;
            justify-content: center;
          }

          .quota-info {
            gap: 0.75rem;
          }

          .quota-metric {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.25rem;
          }
        }
      `}</style>
    </div>
  );
}

export default YoutubeSetupEnhanced;