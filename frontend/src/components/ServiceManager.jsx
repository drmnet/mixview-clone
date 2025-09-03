import React, { useState, useEffect } from 'react';

function ServiceManager({ user, token, onClose }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('status');
  const [credentialInputs, setCredentialInputs] = useState({
    lastfm: { api_key: '' },
    discogs: { token: '' }
  });
  const [submitting, setSubmitting] = useState({});

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  useEffect(() => {
    loadServiceStatus();
  }, []);

  const loadServiceStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/oauth/services/status`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setServices(data.services);
      }
    } catch (error) {
      console.error('Failed to load service status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpotifyConnect = async () => {
    setSubmitting(prev => ({ ...prev, spotify: true }));
    try {
      const response = await fetch(`${API_BASE}/oauth/spotify/auth`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        window.open(data.auth_url, '_blank', 'width=600,height=700');
        
        // Poll for connection status
        const pollInterval = setInterval(async () => {
          await loadServiceStatus();
          const spotifyService = services.find(s => s.service_name === 'spotify');
          if (spotifyService && spotifyService.is_connected) {
            clearInterval(pollInterval);
            setSubmitting(prev => ({ ...prev, spotify: false }));
          }
        }, 2000);

        // Stop polling after 2 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          setSubmitting(prev => ({ ...prev, spotify: false }));
        }, 120000);
      }
    } catch (error) {
      console.error('Spotify connection failed:', error);
      setSubmitting(prev => ({ ...prev, spotify: false }));
    }
  };

  const handleCredentialSubmit = async (serviceName) => {
    setSubmitting(prev => ({ ...prev, [serviceName]: true }));
    try {
      const endpoint = `${API_BASE}/oauth/${serviceName}/credentials`;
      const credentials = credentialInputs[serviceName];

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(credentials)
      });

      if (response.ok) {
        setCredentialInputs(prev => ({
          ...prev,
          [serviceName]: serviceName === 'lastfm' ? { api_key: '' } : { token: '' }
        }));
        await loadServiceStatus();
      } else {
        const error = await response.json();
        alert(`Failed to save ${serviceName} credentials: ${error.detail}`);
      }
    } catch (error) {
      console.error(`${serviceName} credential submission failed:`, error);
      alert(`Error saving ${serviceName} credentials`);
    } finally {
      setSubmitting(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  const handleServiceDisconnect = async (serviceName) => {
    if (!confirm(`Are you sure you want to disconnect ${serviceName}?`)) {
      return;
    }

    setSubmitting(prev => ({ ...prev, [serviceName]: true }));
    try {
      const response = await fetch(`${API_BASE}/oauth/services/${serviceName}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadServiceStatus();
      }
    } catch (error) {
      console.error(`Failed to disconnect ${serviceName}:`, error);
    } finally {
      setSubmitting(prev => ({ ...prev, [serviceName]: false }));
    }
  };

  const testServiceConnection = async (serviceName) => {
    setSubmitting(prev => ({ ...prev, [`${serviceName}_test`]: true }));
    try {
      const response = await fetch(`${API_BASE}/oauth/services/test/${serviceName}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        alert(`${serviceName} test: ${result.message}`);
      }
    } catch (error) {
      console.error(`${serviceName} test failed:`, error);
      alert(`${serviceName} test failed`);
    } finally {
      setSubmitting(prev => ({ ...prev, [`${serviceName}_test`]: false }));
    }
  };

  const getServiceIcon = (serviceName) => {
    const icons = {
      spotify: 'ðŸŽµ',
      lastfm: 'ðŸŽ§',
      discogs: 'ðŸ’¿',
      apple_music: 'ðŸŽ',
      musicbrainz: 'ðŸŽ¼'
    };
    return icons[serviceName] || 'ðŸ”—';
  };

  const renderServiceStatus = () => (
    <div className="service-status-grid">
      {services.map(service => (
        <div key={service.service_name} className={`service-card ${service.is_connected ? 'connected' : 'disconnected'}`}>
          <div className="service-header">
            <div className="service-info">
              <span className="service-icon">{getServiceIcon(service.service_name)}</span>
              <div>
                <h3>{service.service_name.replace('_', ' ').toUpperCase()}</h3>
                <span className={`status ${service.is_connected ? 'connected' : 'disconnected'}`}>
                  {service.is_connected ? 'Connected' : 'Not Connected'}
                </span>
              </div>
            </div>
            <div className="service-actions">
              {service.is_connected ? (
                <>
                  <button 
                    onClick={() => testServiceConnection(service.service_name)}
                    disabled={submitting[`${service.service_name}_test`]}
                    className="test-button"
                  >
                    {submitting[`${service.service_name}_test`] ? 'Testing...' : 'Test'}
                  </button>
                  {!['apple_music', 'musicbrainz'].includes(service.service_name) && (
                    <button 
                      onClick={() => handleServiceDisconnect(service.service_name)}
                      disabled={submitting[service.service_name]}
                      className="disconnect-button"
                    >
                      {submitting[service.service_name] ? 'Removing...' : 'Disconnect'}
                    </button>
                  )}
                </>
              ) : (
                !['apple_music', 'musicbrainz'].includes(service.service_name) && (
                  <button 
                    onClick={() => setActiveTab(`connect_${service.service_name}`)}
                    className="connect-button"
                  >
                    Connect
                  </button>
                )
              )}
            </div>
          </div>
          
          {service.credential_type && (
            <div className="service-details">
              <small>Type: {service.credential_type}</small>
              {service.expires_at && (
                <small>Expires: {new Date(service.expires_at).toLocaleDateString()}</small>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderSpotifyConnect = () => (
    <div className="connect-form">
      <h3>Connect Spotify</h3>
      <p>Connect your Spotify account to access your music library and get personalized recommendations.</p>
      
      <div className="oauth-info">
        <h4>Required Permissions:</h4>
        <ul>
          <li>Access your profile information</li>
          <li>View your music library</li>
          <li>Read your top artists and tracks</li>
        </ul>
      </div>

      <button 
        onClick={handleSpotifyConnect}
        disabled={submitting.spotify}
        className="oauth-button spotify"
      >
        {submitting.spotify ? 'Connecting...' : 'Connect with Spotify'}
      </button>
    </div>
  );

  const renderLastFMConnect = () => (
    <div className="connect-form">
      <h3>Connect Last.fm</h3>
      <p>Enter your Last.fm API key to access rich music metadata and scrobbling data.</p>
      
      <div className="setup-instructions">
        <h4>How to get your API key:</h4>
        <ol>
          <li>Go to <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer">Last.fm API</a></li>
          <li>Create a new API account</li>
          <li>Copy your API key</li>
          <li>Paste it below</li>
        </ol>
      </div>

      <div className="form-group">
        <label>API Key:</label>
        <input
          type="text"
          value={credentialInputs.lastfm.api_key}
          onChange={(e) => setCredentialInputs(prev => ({
            ...prev,
            lastfm: { api_key: e.target.value }
          }))}
          placeholder="Your Last.fm API key"
          disabled={submitting.lastfm}
        />
      </div>

      <button 
        onClick={() => handleCredentialSubmit('lastfm')}
        disabled={submitting.lastfm || !credentialInputs.lastfm.api_key}
        className="submit-button"
      >
        {submitting.lastfm ? 'Validating...' : 'Save Last.fm API Key'}
      </button>
    </div>
  );

  const renderDiscogsConnect = () => (
    <div className="connect-form">
      <h3>Connect Discogs</h3>
      <p>Enter your Discogs personal access token to access the music database.</p>
      
      <div className="setup-instructions">
        <h4>How to get your token:</h4>
        <ol>
          <li>Go to <a href="https://www.discogs.com/settings/developers" target="_blank" rel="noopener noreferrer">Discogs Developer Settings</a></li>
          <li>Create a new personal access token</li>
          <li>Copy the token</li>
          <li>Paste it below</li>
        </ol>
      </div>

      <div className="form-group">
        <label>Personal Access Token:</label>
        <input
          type="text"
          value={credentialInputs.discogs.token}
          onChange={(e) => setCredentialInputs(prev => ({
            ...prev,
            discogs: { token: e.target.value }
          }))}
          placeholder="Your Discogs access token"
          disabled={submitting.discogs}
        />
      </div>

      <button 
        onClick={() => handleCredentialSubmit('discogs')}
        disabled={submitting.discogs || !credentialInputs.discogs.token}
        className="submit-button"
      >
        {submitting.discogs ? 'Validating...' : 'Save Discogs Token'}
      </button>
    </div>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'status':
        return renderServiceStatus();
      case 'connect_spotify':
        return renderSpotifyConnect();
      case 'connect_lastfm':
        return renderLastFMConnect();
      case 'connect_discogs':
        return renderDiscogsConnect();
      default:
        return renderServiceStatus();
    }
  };

  return (
    <div className="service-manager-overlay">
      <div className="service-manager-modal">
        <div className="modal-header">
          <h2>Music Service Manager</h2>
          <button onClick={onClose} className="close-button">Ã—</button>
        </div>

        <div className="tab-navigation">
          <button 
            className={`tab ${activeTab === 'status' ? 'active' : ''}`}
            onClick={() => setActiveTab('status')}
          >
            Service Status
          </button>
        </div>

        <div className="modal-content">
          {loading ? (
            <div className="loading">Loading service status...</div>
          ) : (
            renderTabContent()
          )}
        </div>
      </div>

      <style jsx>{`
        .service-manager-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .service-manager-modal {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          width: 90%;
          max-width: 800px;
          max-height: 90vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1.5rem;
          border-bottom: 1px solid #eee;
        }

        .modal-header h2 {
          margin: 0;
          color: #333;
        }

        .close-button {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0.5rem;
          color: #666;
        }

        .close-button:hover {
          color: #333;
        }

        .tab-navigation {
          display: flex;
          border-bottom: 1px solid #eee;
        }

        .tab {
          background: none;
          border: none;
          padding: 1rem 2rem;
          cursor: pointer;
          color: #666;
          border-bottom: 2px solid transparent;
          transition: all 0.3s ease;
        }

        .tab.active {
          color: #667eea;
          border-bottom-color: #667eea;
        }

        .tab:hover {
          background: #f8f9fa;
        }

        .modal-content {
          flex: 1;
          padding: 2rem;
          overflow-y: auto;
        }

        .service-status-grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        }

        .service-card {
          border: 2px solid #eee;
          border-radius: 8px;
          padding: 1rem;
          transition: border-color 0.3s ease;
        }

        .service-card.connected {
          border-color: #28a745;
          background: #f8fff8;
        }

        .service-card.disconnected {
          border-color: #dc3545;
          background: #fff8f8;
        }

        .service-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .service-info {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .service-icon {
          font-size: 1.5rem;
        }

        .service-info h3 {
          margin: 0;
          color: #333;
          font-size: 1rem;
        }

        .status {
          font-size: 0.9rem;
          font-weight: bold;
        }

        .status.connected {
          color: #28a745;
        }

        .status.disconnected {
          color: #dc3545;
        }

        .service-actions {
          display: flex;
          gap: 0.5rem;
        }

        .test-button, .connect-button, .disconnect-button {
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: opacity 0.3s ease;
        }

        .test-button {
          background: #17a2b8;
          color: white;
        }

        .connect-button {
          background: #28a745;
          color: white;
        }

        .disconnect-button {
          background: #dc3545;
          color: white;
        }

        .test-button:hover, .connect-button:hover, .disconnect-button:hover {
          opacity: 0.9;
        }

        .test-button:disabled, .connect-button:disabled, .disconnect-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .service-details {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          color: #666;
          font-size: 0.8rem;
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #eee;
        }

        .connect-form {
          max-width: 500px;
        }

        .connect-form h3 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .connect-form p {
          color: #666;
          margin-bottom: 1.5rem;
        }

        .oauth-info, .setup-instructions {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 6px;
          margin-bottom: 1.5rem;
        }

        .oauth-info h4, .setup-instructions h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .oauth-info ul, .setup-instructions ol {
          margin: 0;
          padding-left: 1.5rem;
        }

        .setup-instructions a {
          color: #667eea;
          text-decoration: none;
        }

        .setup-instructions a:hover {
          text-decoration: underline;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group label {
          display: block;
          margin-bottom: 0.5rem;
          color: #333;
          font-weight: 500;
        }

        .form-group input {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 1rem;
          transition: border-color 0.3s ease;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.2);
        }

        .form-group input:disabled {
          background-color: #f5f5f5;
          cursor: not-allowed;
        }

        .oauth-button {
          background: linear-gradient(135deg, #1db954 0%, #1ed760 100%);
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.3s ease;
          width: 100%;
        }

        .oauth-button.spotify {
          background: linear-gradient(135deg, #1db954 0%, #1ed760 100%);
        }

        .oauth-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .oauth-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .submit-button {
          background: #667eea;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 6px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: opacity 0.3s ease;
          width: 100%;
        }

        .submit-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading {
          text-align: center;
          color: #666;
          padding: 2rem;
        }
      `}</style>
    </div>
  );
}

export default ServiceManager;
