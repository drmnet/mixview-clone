import React, { useState, useEffect } from 'react';
import LoginForm from './LoginForm';

function SetupWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [serviceStatus, setServiceStatus] = useState({});
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState({
    lastfm: { api_key: '' },
    discogs: { token: '' }
  });
  const [errors, setErrors] = useState({});
  const [successMessages, setSuccessMessages] = useState({});
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  const steps = [
  {
    title: 'Account',
    description: 'Create your MixView account',
    component: 'account'
  },
  {
    title: 'Welcome',
    description: 'Set up your music services',
    component: 'welcome'
  },
  {
    title: 'Spotify',
    description: 'Connect your Spotify account',
    component: 'spotify'
  },
  {
    title: 'Last.fm',
    description: 'Enter your Last.fm API key',
    component: 'lastfm'
  },
  {
    title: 'Discogs',
    description: 'Enter your Discogs token',
    component: 'discogs'
  },
  {
    title: 'Complete',
    description: 'Setup complete!',
    component: 'complete'
  }
];

  useEffect(() => {
    checkServiceStatus();
    
    // Listen for OAuth callback messages
    const handleMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'SPOTIFY_OAUTH_SUCCESS') {
        setSuccessMessages(prev => ({ ...prev, spotify: 'Spotify connected successfully!' }));
        checkServiceStatus();
      } else if (event.data.type === 'SPOTIFY_OAUTH_ERROR') {
        setErrors(prev => ({ ...prev, spotify: 'Spotify connection failed. Please try again.' }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const checkServiceStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const response = await fetch(`${API_BASE}/oauth/services/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const status = {};
        data.services.forEach(service => {
          status[service.service_name] = service.is_connected;
        });
        setServiceStatus(status);
      }
    } catch (error) {
      console.error('Failed to check service status:', error);
    }
  };

      const handleLogin = (userData, userToken) => {
        setUser(userData);
        setToken(userToken);
        localStorage.setItem('token', userToken);
        // Move to next step after successful login
        setCurrentStep(1);
        // Check service status now that we have a token
        checkServiceStatus();
      };

  const handleSpotifyConnect = async () => {
    setLoading(true);
    setErrors(prev => ({ ...prev, spotify: '' }));
    
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/oauth/spotify/auth`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // Open OAuth popup
        const popup = window.open(
          data.auth_url, 
          'spotify-oauth', 
          'width=600,height=700,scrollbars=yes,resizable=yes'
        );

        // Poll for popup closure
        const pollTimer = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(pollTimer);
              setLoading(false);
              // Check status after popup closes
              setTimeout(checkServiceStatus, 1000);
            }
          } catch (e) {
            // Popup might be cross-origin, ignore errors
          }
        }, 1000);

        // Timeout after 5 minutes
        setTimeout(() => {
          clearInterval(pollTimer);
          if (!popup.closed) {
            popup.close();
          }
          setLoading(false);
        }, 300000);

      } else {
        throw new Error('Failed to initiate Spotify OAuth');
      }
    } catch (error) {
      console.error('Spotify OAuth error:', error);
      setErrors(prev => ({ ...prev, spotify: 'Failed to start Spotify connection. Please try again.' }));
      setLoading(false);
    }
  };

  const handleCredentialSubmit = async (serviceName) => {
    setLoading(true);
    setErrors(prev => ({ ...prev, [serviceName]: '' }));
    setSuccessMessages(prev => ({ ...prev, [serviceName]: '' }));

    try {
      const token = localStorage.getItem('token');
      const endpoint = `${API_BASE}/oauth/${serviceName}/credentials`;
      const credentialData = credentials[serviceName];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentialData)
      });

      if (response.ok) {
        setSuccessMessages(prev => ({ 
          ...prev, 
          [serviceName]: `${serviceName.charAt(0).toUpperCase() + serviceName.slice(1)} connected successfully!` 
        }));
        setCredentials(prev => ({
          ...prev,
          [serviceName]: serviceName === 'lastfm' ? { api_key: '' } : { token: '' }
        }));
        await checkServiceStatus();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Invalid credentials');
      }
    } catch (error) {
      console.error(`${serviceName} credential error:`, error);
      setErrors(prev => ({ 
        ...prev, 
        [serviceName]: error.message || `Failed to save ${serviceName} credentials` 
      }));
    } finally {
      setLoading(false);
    }
  };

  const canProceedToNext = () => {
    switch (currentStep) {
      case 0: return true; // Welcome
      case 1: return true; // Spotify (optional)
      case 2: return true; // Last.fm (optional)
      case 3: return true; // Discogs (optional)
      case 4: return true; // Complete
      default: return true;
    }
  };

  const getConfiguredServicesCount = () => {
    return Object.values(serviceStatus).filter(Boolean).length;
  };

  const AccountStep = () => (
    <div className="step-content">
      <div className="account-setup">
        <h2>Create Your MixView Account</h2>
        <p>First, let's create your personal MixView account. This will allow you to save your preferences and connect to music services.</p>
        <LoginForm onLogin={handleLogin} />
      </div>
    </div>
  );

  const WelcomeStep = () => (
    <div className="step-content">
      <div className="welcome-header">
        <h2>Welcome to MixView!</h2>
        <p>Let's set up your music services to start discovering amazing music connections.</p>
      </div>

      <div className="service-overview">
        <div className="service-card">
          <div className="service-icon">🎵</div>
          <h3>Spotify</h3>
          <p>Access your music library and get personalized recommendations</p>
          <span className="service-type">OAuth Login</span>
        </div>

        <div className="service-card">
          <div className="service-icon">🎧</div>
          <h3>Last.fm</h3>
          <p>Rich music metadata and scrobbling data</p>
          <span className="service-type">API Key</span>
        </div>

        <div className="service-card">
          <div className="service-icon">💿</div>
          <h3>Discogs</h3>
          <p>Comprehensive music release database</p>
          <span className="service-type">Access Token</span>
        </div>

        <div className="service-card auto-available">
          <div className="service-icon">🍎</div>
          <h3>Apple Music + MusicBrainz</h3>
          <p>Automatically available - no setup required!</p>
          <span className="service-type">Built-in</span>
        </div>
      </div>

      <div className="welcome-note">
        <p><strong>Note:</strong> All services are optional! You can skip any service and configure them later through the service manager.</p>
      </div>
    </div>
  );

  const SpotifyStep = () => (
    <div className="step-content">
      <div className="service-setup-header">
        <div className="service-icon-large">🎵</div>
        <h2>Connect Spotify</h2>
        <p>Connect your Spotify account to access your music library and get personalized recommendations.</p>
      </div>

      {serviceStatus.spotify ? (
        <div className="success-state">
          <div className="success-icon">✅</div>
          <h3>Spotify Connected!</h3>
          <p>Your Spotify account is successfully connected and ready to use.</p>
        </div>
      ) : (
        <div className="connection-form">
          <div className="oauth-info">
            <h4>What you'll get:</h4>
            <ul>
              <li>Access to your music library</li>
              <li>Personalized recommendations</li>
              <li>Your top artists and tracks</li>
              <li>Playlist integration</li>
            </ul>
          </div>

          {errors.spotify && (
            <div className="error-message">{errors.spotify}</div>
          )}

          {successMessages.spotify && (
            <div className="success-message">{successMessages.spotify}</div>
          )}

          <button
            onClick={handleSpotifyConnect}
            disabled={loading}
            className="oauth-button spotify"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Connecting...
              </>
            ) : (
              'Connect with Spotify'
            )}
          </button>

          <div className="skip-option">
            <p>Don't have Spotify or want to skip? That's okay!</p>
          </div>
        </div>
      )}
    </div>
  );

  const LastFmStep = () => (
    <div className="step-content">
      <div className="service-setup-header">
        <div className="service-icon-large">🎧</div>
        <h2>Connect Last.fm</h2>
        <p>Add your Last.fm API key to access rich music metadata and scrobbling data.</p>
      </div>

      {serviceStatus.lastfm ? (
        <div className="success-state">
          <div className="success-icon">✅</div>
          <h3>Last.fm Connected!</h3>
          <p>Your Last.fm API key is configured and working.</p>
        </div>
      ) : (
        <div className="connection-form">
          <div className="setup-instructions">
            <h4>How to get your API key:</h4>
            <ol>
              <li>Visit <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">Last.fm API Account Creation</a></li>
              <li>Fill out the form to create your API account</li>
              <li>Copy your API key from the confirmation page</li>
              <li>Paste it in the field below</li>
            </ol>
          </div>

          <div className="form-group">
            <label htmlFor="lastfm-api-key">Last.fm API Key</label>
            <input
              type="text"
              id="lastfm-api-key"
              value={credentials.lastfm.api_key}
              onChange={(e) => setCredentials(prev => ({
                ...prev,
                lastfm: { api_key: e.target.value }
              }))}
              placeholder="Enter your Last.fm API key"
              disabled={loading}
            />
          </div>

          {errors.lastfm && (
            <div className="error-message">{errors.lastfm}</div>
          )}

          {successMessages.lastfm && (
            <div className="success-message">{successMessages.lastfm}</div>
          )}

          <button
            onClick={() => handleCredentialSubmit('lastfm')}
            disabled={loading || !credentials.lastfm.api_key.trim()}
            className="submit-button"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Validating...
              </>
            ) : (
              'Save Last.fm API Key'
            )}
          </button>

          <div className="skip-option">
            <p>Don't have Last.fm or want to skip? No problem!</p>
          </div>
        </div>
      )}
    </div>
  );

  const DiscogsStep = () => (
    <div className="step-content">
      <div className="service-setup-header">
        <div className="service-icon-large">💿</div>
        <h2>Connect Discogs</h2>
        <p>Add your Discogs personal access token to access the comprehensive music database.</p>
      </div>

      {serviceStatus.discogs ? (
        <div className="success-state">
          <div className="success-icon">✅</div>
          <h3>Discogs Connected!</h3>
          <p>Your Discogs access token is configured and working.</p>
        </div>
      ) : (
        <div className="connection-form">
          <div className="setup-instructions">
            <h4>How to get your access token:</h4>
            <ol>
              <li>Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer">Discogs Developer Settings</a></li>
              <li>Scroll down to "Personal access tokens"</li>
              <li>Click "Generate new token"</li>
              <li>Give it a name (e.g., "MixView")</li>
              <li>Copy the generated token and paste it below</li>
            </ol>
          </div>

          <div className="form-group">
            <label htmlFor="discogs-token">Discogs Personal Access Token</label>
            <input
              type="text"
              id="discogs-token"
              value={credentials.discogs.token}
              onChange={(e) => setCredentials(prev => ({
                ...prev,
                discogs: { token: e.target.value }
              }))}
              placeholder="Enter your Discogs access token"
              disabled={loading}
            />
          </div>

          {errors.discogs && (
            <div className="error-message">{errors.discogs}</div>
          )}

          {successMessages.discogs && (
            <div className="success-message">{successMessages.discogs}</div>
          )}

          <button
            onClick={() => handleCredentialSubmit('discogs')}
            disabled={loading || !credentials.discogs.token.trim()}
            className="submit-button"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Validating...
              </>
            ) : (
              'Save Discogs Token'
            )}
          </button>

          <div className="skip-option">
            <p>Don't have Discogs or want to skip? That's fine!</p>
          </div>
        </div>
      )}
    </div>
  );

  const CompleteStep = () => (
    <div className="step-content">
      <div className="completion-header">
        <div className="completion-icon">🎉</div>
        <h2>Setup Complete!</h2>
        <p>You're all set to start discovering amazing music connections.</p>
      </div>

      <div className="completion-stats">
        <div className="stat-card">
          <div className="stat-number">{getConfiguredServicesCount()}</div>
          <div className="stat-label">Services Connected</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">2</div>
          <div className="stat-label">Always Available</div>
        </div>
      </div>

      <div className="service-summary">
        <h4>Your Connected Services:</h4>
        <div className="connected-services">
          {serviceStatus.spotify && <span className="service-badge spotify">🎵 Spotify</span>}
          {serviceStatus.lastfm && <span className="service-badge lastfm">🎧 Last.fm</span>}
          {serviceStatus.discogs && <span className="service-badge discogs">💿 Discogs</span>}
          <span className="service-badge always">🍎 Apple Music</span>
          <span className="service-badge always">🎼 MusicBrainz</span>
        </div>
        
        {getConfiguredServicesCount() === 0 && (
          <p className="no-services-note">
            No external services connected, but you can still use Apple Music and MusicBrainz! 
            You can always add more services later through the Service Manager.
          </p>
        )}
      </div>

      <div className="next-steps">
        <h4>What's Next:</h4>
        <ul>
          <li>🔍 Search for your favorite artists, albums, or tracks</li>
          <li>🕸️ Explore the interactive relationship graphs</li>
          <li>🎯 Use filters to customize your discovery experience</li>
          <li>⚙️ Manage your services anytime through the Service Manager</li>
        </ul>
      </div>

      <button
        onClick={onComplete}
        className="complete-button"
      >
        Start Exploring Music!
      </button>
    </div>
  );

  const renderStep = () => {
    switch (steps[currentStep].component) {
      case 'account':
        return <AccountStep />;
      case 'welcome':
        return <WelcomeStep />;
      case 'spotify':
        return <SpotifyStep />;
      case 'lastfm':
        return <LastFmStep />;
      case 'discogs':
        return <DiscogsStep />;
      case 'complete':
        return <CompleteStep />;
      default:
        return <AccountStep />;
    }
  };

  return (
    <div className="setup-wizard">
      <div className="wizard-container">
        <div className="wizard-header">
          <h1>MixView Setup</h1>
          <div className="step-indicator">
            {steps.map((step, index) => (
              <div key={index} className={`step-dot ${index === currentStep ? 'active' : index < currentStep ? 'completed' : ''}`}>
                {index < currentStep ? '✓' : index + 1}
              </div>
            ))}
          </div>
          <div className="step-info">
            <span className="step-title">{steps[currentStep].title}</span>
            <span className="step-description">{steps[currentStep].description}</span>
          </div>
        </div>

        <div className="wizard-content">
          {renderStep()}
        </div>

        {currentStep < steps.length - 1 && (
          <div className="wizard-footer">
            <div className="footer-actions">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="back-button"
                  disabled={loading}
                >
                  ← Back
                </button>
              )}
              
              <button
                onClick={() => setCurrentStep(currentStep + 1)}
                className="next-button"
                disabled={loading || !canProceedToNext()}
              >
                {currentStep === 0 ? 'Start Setup →' : 'Next →'}
              </button>
            </div>
            
            <button
              onClick={onComplete}
              className="skip-button"
              disabled={loading}
            >
              Skip Setup
            </button>
          </div>
        )}
      </div>

      <style jsx>{`
        .setup-wizard {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .wizard-container {
          background: white;
          border-radius: 16px;
          box-shadow: 0 25px 80px rgba(0, 0, 0, 0.3);
          width: 90%;
          max-width: 700px;
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .wizard-header {
          padding: 2rem 2rem 1rem;
          text-align: center;
          background: #f8f9fa;
          border-radius: 16px 16px 0 0;
        }

        .wizard-header h1 {
          margin: 0 0 1.5rem 0;
          color: #333;
          font-size: 1.8rem;
        }

        .step-indicator {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .step-dot {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ddd;
          color: #666;
          font-weight: bold;
          font-size: 0.9rem;
          transition: all 0.3s ease;
        }

        .step-dot.active {
          background: #667eea;
          color: white;
          transform: scale(1.1);
        }

        .step-dot.completed {
          background: #28a745;
          color: white;
        }

        .step-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .step-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #333;
        }

        .step-description {
          font-size: 0.9rem;
          color: #666;
        }

        .wizard-content {
          flex: 1;
          padding: 2rem;
        }

        .step-content {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .welcome-header {
          text-align: center;
        }

        .welcome-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1.5rem;
        }

        .welcome-header p {
          margin: 0;
          color: #666;
          font-size: 1.1rem;
        }

        .service-overview {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
          margin: 2rem 0;
        }

        .service-card {
          padding: 1.5rem;
          border: 2px solid #eee;
          border-radius: 12px;
          text-align: center;
          transition: all 0.3s ease;
        }

        .service-card:hover {
          border-color: #667eea;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
        }

        .service-card.auto-available {
          border-color: #28a745;
          background: #f8fff8;
        }

        .service-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .service-card h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1.1rem;
        }

        .service-card p {
          margin: 0 0 1rem 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.4;
        }

        .service-type {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          background: #667eea;
          color: white;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .service-card.auto-available .service-type {
          background: #28a745;
        }

        .welcome-note {
          text-align: center;
          padding: 1rem;
          background: #f0f7ff;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .welcome-note p {
          margin: 0;
          color: #555;
        }

        .account-setup {
          text-align: center;
          max-width: 400px;
          margin: 0 auto;
        }

        .account-setup h2 {
          color: #333;
          margin-bottom: 1rem;
          font-size: 1.5rem;
        }

        .account-setup p {
          color: #666;
          margin-bottom: 2rem;
          line-height: 1.5;
          font-size: 1rem;
        }

        .service-setup-header {
          text-align: center;
        }

        .service-icon-large {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .service-setup-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1.5rem;
        }

        .service-setup-header p {
          margin: 0;
          color: #666;
          font-size: 1rem;
        }

        .success-state {
          text-align: center;
          padding: 2rem;
        }

        .success-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .success-state h3 {
          margin: 0 0 0.5rem 0;
          color: #28a745;
          font-size: 1.3rem;
        }

        .success-state p {
          margin: 0;
          color: #666;
        }

        .connection-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .oauth-info, .setup-instructions {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
          border-left: 4px solid #667eea;
        }

        .oauth-info h4, .setup-instructions h4 {
          margin: 0 0 1rem 0;
          color: #333;
          font-size: 1rem;
        }

        .oauth-info ul, .setup-instructions ol {
          margin: 0;
          padding-left: 1.5rem;
        }

        .oauth-info li, .setup-instructions li {
          margin-bottom: 0.5rem;
          color: #555;
        }

        .setup-instructions a {
          color: #667eea;
          text-decoration: none;
          font-weight: 500;
        }

        .setup-instructions a:hover {
          text-decoration: underline;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-weight: 600;
          color: #333;
        }

        .form-group input {
          padding: 0.75rem;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 1rem;
          transition: border-color 0.3s ease;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-group input:disabled {
          background: #f5f5f5;
          cursor: not-allowed;
        }

        .oauth-button, .submit-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 1rem 2rem;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .oauth-button.spotify {
          background: linear-gradient(135deg, #1db954 0%, #1ed760 100%);
          color: white;
        }

        .submit-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }

        .oauth-button:hover:not(:disabled), .submit-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .oauth-button:disabled, .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid currentColor;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .skip-option {
          text-align: center;
          padding: 1rem;
          color: #666;
          font-style: italic;
        }

        .skip-option p {
          margin: 0;
        }

        .error-message {
          padding: 0.75rem;
          background: #fee;
          color: #c33;
          border: 1px solid #fcc;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .success-message {
          padding: 0.75rem;
          background: #efe;
          color: #363;
          border: 1px solid #cfc;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        .completion-header {
          text-align: center;
        }

        .completion-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .completion-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1.8rem;
        }

        .completion-header p {
          margin: 0;
          color: #666;
          font-size: 1.1rem;
        }

        .completion-stats {
          display: flex;
          justify-content: center;
          gap: 2rem;
          margin: 2rem 0;
        }

        .stat-card {
          text-align: center;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          min-width: 100px;
        }

        .stat-number {
          display: block;
          font-size: 2rem;
          font-weight: bold;
          color: #667eea;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #666;
        }

        .service-summary {
          margin: 2rem 0;
        }

        .service-summary h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .connected-services {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .service-badge {
          padding: 0.5rem 1rem;
          border-radius: 20px;
          font-size: 0.9rem;
          font-weight: 500;
          color: white;
        }

        .service-badge.spotify {
          background: #1db954;
        }

        .service-badge.lastfm {
          background: #d51007;
        }

        .service-badge.discogs {
          background: #333;
        }

        .service-badge.always {
          background: #28a745;
        }

        .no-services-note {
          color: #666;
          font-style: italic;
          margin: 1rem 0 0 0;
        }

        .next-steps {
          margin: 2rem 0;
        }

        .next-steps h4 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .next-steps ul {
          margin: 0;
          padding-left: 1.5rem;
        }

        .next-steps li {
          margin-bottom: 0.5rem;
          color: #555;
        }

        .complete-button {
          width: 100%;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #28a745 0%, #20c997 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1.1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .complete-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(40, 167, 69, 0.3);
        }

        .wizard-footer {
          padding: 1.5rem 2rem;
          border-top: 1px solid #eee;
          background: #f8f9fa;
          border-radius: 0 0 16px 16px;
        }

        .footer-actions {
          display: flex;
          justify-content: space-between;
          margin-bottom: 1rem;
        }

        .back-button, .next-button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .back-button {
          background: #6c757d;
          color: white;
        }

        .next-button {
          background: #667eea;
          color: white;
        }

        .back-button:hover:not(:disabled), .next-button:hover:not(:disabled) {
          opacity: 0.9;
          transform: translateY(-1px);
        }

        .back-button:disabled, .next-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        .skip-button {
          display: block;
          width: 100%;
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          text-decoration: underline;
          font-size: 0.9rem;
        }

        .skip-button:hover:not(:disabled) {
          color: #333;
        }

        .skip-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .wizard-container {
            width: 95%;
            margin: 1rem;
          }

          .wizard-header {
            padding: 1.5rem 1rem 1rem;
          }

          .wizard-content {
            padding: 1.5rem 1rem;
          }

          .wizard-footer {
            padding: 1rem;
          }

          .service-overview {
            grid-template-columns: 1fr;
          }

          .completion-stats {
            flex-direction: column;
            align-items: center;
            gap: 1rem;
          }

          .footer-actions {
            flex-direction: column;
            gap: 0.5rem;
          }

          .connected-services {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default SetupWizard;