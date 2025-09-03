import React, { useState, useEffect } from 'react';

function SetupWizard({ onComplete }) {
  const [serviceStatus, setServiceStatus] = useState({});
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  const steps = [
    {
      title: 'Service Status',
      description: 'Check which music services are configured',
      component: 'status'
    },
    {
      title: 'Configuration Guide',
      description: 'How to configure missing services',
      component: 'guide'
    },
    {
      title: 'Test Connection',
      description: 'Verify your services are working',
      component: 'test'
    }
  ];

  const serviceInfo = {
    spotify: {
      name: 'Spotify',
      description: 'Access to Spotify\'s music database and recommendations',
      setupUrl: 'https://developer.spotify.com/dashboard',
      envVars: ['SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET']
    },
    lastfm: {
      name: 'Last.fm',
      description: 'Rich metadata and listening history data',
      setupUrl: 'https://www.last.fm/api/account/create',
      envVars: ['LASTFM_API_KEY']
    },
    discogs: {
      name: 'Discogs',
      description: 'Comprehensive music release database',
      setupUrl: 'https://www.discogs.com/settings/developers',
      envVars: ['DISCOGS_TOKEN']
    },
    apple_music: {
      name: 'Apple Music',
      description: 'Links to Apple Music (no API key required)',
      setupUrl: null,
      envVars: []
    },
    musicbrainz: {
      name: 'MusicBrainz',
      description: 'Open music database (no API key required)',
      setupUrl: null,
      envVars: []
    }
  };

  useEffect(() => {
    checkServiceStatus();
  }, []);

  const checkServiceStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/health`);
      if (response.ok) {
        const data = await response.json();
        setServiceStatus(data.services || {});
      }
    } catch (error) {
      console.error('Failed to check service status:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatusStep = () => (
    <div className="step-content">
      <h3>Service Configuration Status</h3>
      {loading ? (
        <div className="loading">Checking service status...</div>
      ) : (
        <div className="service-list">
          {Object.entries(serviceInfo).map(([key, info]) => (
            <div key={key} className={`service-item ${serviceStatus[key] ? 'configured' : 'not-configured'}`}>
              <div className="service-header">
                <div className="service-name">
                  <span className={`status-indicator ${serviceStatus[key] ? 'active' : 'inactive'}`}></span>
                  {info.name}
                </div>
                <div className="service-status">
                  {serviceStatus[key] ? 'Configured' : 'Not Configured'}
                </div>
              </div>
              <div className="service-description">
                {info.description}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <div className="step-actions">
        <button onClick={() => setCurrentStep(1)} className="next-button">
          Continue to Setup Guide
        </button>
      </div>
    </div>
  );

  const GuideStep = () => (
    <div className="step-content">
      <h3>Configuration Guide</h3>
      <p>To configure missing services, you'll need to add environment variables to your .env file:</p>
      
      <div className="service-guides">
        {Object.entries(serviceInfo).map(([key, info]) => {
          if (!serviceStatus[key] && info.envVars.length > 0) {
            return (
              <div key={key} className="guide-item">
                <h4>{info.name}</h4>
                <p>Required environment variables:</p>
                <ul>
                  {info.envVars.map(envVar => (
                    <li key={envVar}><code>{envVar}</code></li>
                  ))}
                </ul>
                {info.setupUrl && (
                  <p>
                    <a href={info.setupUrl} target="_blank" rel="noopener noreferrer">
                      Get API credentials â†’
                    </a>
                  </p>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>

      <div className="env-example">
        <h4>Example .env entries:</h4>
        <pre>
{`# Spotify
SPOTIFY_CLIENT_ID=your_client_id_here
SPOTIFY_CLIENT_SECRET=your_client_secret_here

# Last.fm
LASTFM_API_KEY=your_api_key_here

# Discogs
DISCOGS_TOKEN=your_token_here`}
        </pre>
      </div>
      
      <div className="step-actions">
        <button onClick={() => setCurrentStep(0)} className="back-button">
          Back
        </button>
        <button onClick={() => setCurrentStep(2)} className="next-button">
          Test Configuration
        </button>
      </div>
    </div>
  );

  const TestStep = () => (
    <div className="step-content">
      <h3>Test Service Connections</h3>
      <p>Click the button below to refresh the service status after making configuration changes:</p>
      
      <div className="test-actions">
        <button onClick={checkServiceStatus} disabled={loading} className="test-button">
          {loading ? 'Testing...' : 'Test Services'}
        </button>
      </div>

      <div className="service-summary">
        <h4>Current Status:</h4>
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-number">{Object.values(serviceStatus).filter(Boolean).length}</span>
            <span className="stat-label">Services Active</span>
          </div>
          <div className="stat">
            <span className="stat-number">{Object.values(serviceStatus).filter(status => !status).length}</span>
            <span className="stat-label">Services Inactive</span>
          </div>
        </div>
      </div>
      
      <div className="step-actions">
        <button onClick={() => setCurrentStep(1)} className="back-button">
          Back
        </button>
        <button onClick={onComplete} className="complete-button">
          Complete Setup
        </button>
      </div>
    </div>
  );

  const renderStep = () => {
    switch (steps[currentStep].component) {
      case 'status':
        return <StatusStep />;
      case 'guide':
        return <GuideStep />;
      case 'test':
        return <TestStep />;
      default:
        return <StatusStep />;
    }
  };

  return (
    <div className="setup-wizard">
      <div className="wizard-container">
        <div className="wizard-header">
          <h2>MixView Setup</h2>
          <div className="step-indicator">
            {steps.map((step, index) => (
              <div key={index} className={`step-dot ${index === currentStep ? 'active' : index < currentStep ? 'completed' : ''}`}>
                {index + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="wizard-content">
          <div className="step-header">
            <h3>{steps[currentStep].title}</h3>
            <p>{steps[currentStep].description}</p>
          </div>
          
          {renderStep()}
        </div>

        <div className="wizard-footer">
          <button onClick={onComplete} className="skip-button">
            Skip Setup
          </button>
        </div>
      </div>

      <style jsx>{`
        .setup-wizard {
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

        .wizard-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          width: 90%;
          max-width: 600px;
          max-height: 90vh;
          overflow-y: auto;
        }

        .wizard-header {
          padding: 2rem 2rem 1rem;
          border-bottom: 1px solid #eee;
          text-align: center;
        }

        .wizard-header h2 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .step-indicator {
          display: flex;
          justify-content: center;
          gap: 1rem;
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
          transition: all 0.3s ease;
        }

        .step-dot.active {
          background: #667eea;
          color: white;
        }

        .step-dot.completed {
          background: #28a745;
          color: white;
        }

        .wizard-content {
          padding: 2rem;
        }

        .step-header {
          margin-bottom: 1.5rem;
          text-align: center;
        }

        .step-header h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .step-header p {
          margin: 0;
          color: #666;
        }

        .service-list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .service-item {
          padding: 1rem;
          border: 2px solid #eee;
          border-radius: 8px;
          transition: border-color 0.3s ease;
        }

        .service-item.configured {
          border-color: #28a745;
          background: #f8fff8;
        }

        .service-item.not-configured {
          border-color: #dc3545;
          background: #fff8f8;
        }

        .service-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .service-name {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: bold;
          color: #333;
        }

        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
        }

        .status-indicator.active {
          background: #28a745;
        }

        .status-indicator.inactive {
          background: #dc3545;
        }

        .service-status {
          font-size: 0.9rem;
          font-weight: bold;
        }

        .service-item.configured .service-status {
          color: #28a745;
        }

        .service-item.not-configured .service-status {
          color: #dc3545;
        }

        .service-description {
          color: #666;
          font-size: 0.9rem;
        }

        .service-guides {
          margin-bottom: 2rem;
        }

        .guide-item {
          margin-bottom: 1.5rem;
          padding: 1rem;
          border: 1px solid #eee;
          border-radius: 6px;
        }

        .guide-item h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .guide-item ul {
          margin: 0.5rem 0;
        }

        .guide-item code {
          background: #f1f1f1;
          padding: 0.2rem 0.4rem;
          border-radius: 3px;
          font-family: monospace;
        }

        .guide-item a {
          color: #667eea;
          text-decoration: none;
        }

        .guide-item a:hover {
          text-decoration: underline;
        }

        .env-example {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 6px;
          margin-top: 1rem;
        }

        .env-example h4 {
          margin: 0 0 0.5rem 0;
        }

        .env-example pre {
          margin: 0;
          font-size: 0.9rem;
          color: #333;
          overflow-x: auto;
        }

        .loading {
          text-align: center;
          color: #666;
          padding: 2rem;
        }

        .test-actions {
          text-align: center;
          margin: 2rem 0;
        }

        .test-button {
          background: #667eea;
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 6px;
          font-size: 1rem;
          cursor: pointer;
          transition: opacity 0.3s ease;
        }

        .test-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .test-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .service-summary {
          margin: 2rem 0;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 6px;
        }

        .service-summary h4 {
          margin: 0 0 1rem 0;
        }

        .summary-stats {
          display: flex;
          gap: 2rem;
        }

        .stat {
          text-align: center;
        }

        .stat-number {
          display: block;
          font-size: 2rem;
          font-weight: bold;
          color: #333;
        }

        .stat-label {
          font-size: 0.9rem;
          color: #666;
        }

        .step-actions {
          display: flex;
          justify-content: space-between;
          margin-top: 2rem;
        }

        .back-button, .next-button, .complete-button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 1rem;
          transition: opacity 0.3s ease;
        }

        .back-button {
          background: #6c757d;
          color: white;
        }

        .next-button, .complete-button {
          background: #667eea;
          color: white;
        }

        .back-button:hover, .next-button:hover, .complete-button:hover {
          opacity: 0.9;
        }

        .wizard-footer {
          padding: 1rem 2rem;
          border-top: 1px solid #eee;
          text-align: center;
        }

        .skip-button {
          background: none;
          border: none;
          color: #666;
          cursor: pointer;
          text-decoration: underline;
        }

        .skip-button:hover {
          color: #333;
        }
      `}</style>
    </div>
  );
}

export default SetupWizard;
