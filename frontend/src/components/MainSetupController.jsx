/**
 * MainSetupController.jsx
 * 
 * PURPOSE: Main orchestrator for the MixView app setup wizard. Manages the overall
 * setup flow, coordinates between different service setup components, handles
 * navigation, and maintains global setup state.
 * 
 * DIRECTORY LOCATION: /src/components/setup/MainSetupController.jsx
 * 
 * DEPENDENCIES:
 * - /src/components/shared/SetupUIComponents.jsx
 * - /src/components/setup/services/SpotifySetupEnhanced.jsx
 * - /src/components/setup/services/LastFmSetupEnhanced.jsx (to be created)
 * - /src/components/setup/services/DiscogsSetupEnhanced.jsx (to be created)
 * - /src/components/setup/services/YoutubeSetupEnhanced.jsx (to be created)
 * 
 * BACKEND ENDPOINTS USED:
 * - GET /oauth/services/status - Check all service connection statuses
 * - POST /setup/complete - Mark initial setup as complete
 * - GET /setup/status - Get overall setup completion status
 */

import React, { useState, useEffect, useCallback } from 'react';
import { SetupUIComponents } from "../shared/SetupUIComponents";
import SpotifySetupEnhanced from './SpotifySetupEnhanced';
import LastFmSetupEnhanced from './LastFmSetupEnhanced';
import DiscogsSetupEnhanced from './DiscogsSetupEnhanced';
import YoutubeSetupEnhanced from './YoutubeSetupEnhanced';
// Import other service components as they're created
// import LastFmSetupEnhanced from './services/LastFmSetupEnhanced';
// import DiscogsSetupEnhanced from './services/DiscogsSetupEnhanced';
// import YoutubeSetupEnhanced from './services/YoutubeSetupEnhanced';

// Local Account Form Component
const LocalAccountForm = ({ onAccountCreated, onError, loading }) => {
  const [isLogin, setIsLogin] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.username) {
      errors.username = 'Username is required';
    } else if (formData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(formData.username)) {
      errors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    } else if (formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    
    if (!isLogin && formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const endpoint = isLogin ? '/auth/login' : '/auth/register';
      const payload = {
        username: formData.username,
        password: formData.password
      };

      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || `${isLogin ? 'Login' : 'Registration'} failed`);
      }

      if (isLogin) {
        // Login successful - get user info
        const userResponse = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${data.access_token}`,
            'Content-Type': 'application/json'
          }
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          onAccountCreated(userData, data.access_token);
        } else {
          throw new Error('Failed to get user information');
        }
      } else {
        // Registration successful - now login
        const loginResponse = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username: formData.username,
            password: formData.password
          })
        });

        const loginData = await loginResponse.json();
        
        if (loginResponse.ok) {
          const userResponse = await fetch(`${API_BASE}/auth/me`, {
            headers: {
              'Authorization': `Bearer ${loginData.access_token}`,
              'Content-Type': 'application/json'
            }
          });

          if (userResponse.ok) {
            const userData = await userResponse.json();
            onAccountCreated(userData, loginData.access_token);
          }
        } else {
          throw new Error('Failed to login after registration');
        }
      }
    } catch (error) {
      console.error(`${isLogin ? 'Login' : 'Registration'} error:`, error);
      onError(error.message || `${isLogin ? 'Login' : 'Registration'} failed`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="local-account-form">
      <div className="form-toggle">
        <button
          type="button"
          onClick={() => setIsLogin(false)}
          className={`toggle-button ${!isLogin ? 'active' : ''}`}
        >
          Create Account
        </button>
        <button
          type="button"
          onClick={() => setIsLogin(true)}
          className={`toggle-button ${isLogin ? 'active' : ''}`}
        >
          Sign In
        </button>
      </div>

      <form onSubmit={handleSubmit} className="account-form">
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            type="text"
            id="username"
            name="username"
            value={formData.username}
            onChange={handleInputChange}
            disabled={isSubmitting || loading}
            placeholder="Enter your username"
            className={formErrors.username ? 'error' : ''}
          />
          {formErrors.username && <span className="error-text">{formErrors.username}</span>}
        </div>

        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            disabled={isSubmitting || loading}
            placeholder="Enter your password"
            className={formErrors.password ? 'error' : ''}
          />
          {formErrors.password && <span className="error-text">{formErrors.password}</span>}
        </div>

        {!isLogin && (
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleInputChange}
              disabled={isSubmitting || loading}
              placeholder="Confirm your password"
              className={formErrors.confirmPassword ? 'error' : ''}
            />
            {formErrors.confirmPassword && <span className="error-text">{formErrors.confirmPassword}</span>}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || loading}
          className="submit-button"
        >
          {isSubmitting || loading ? (
            <>
              <LoadingSpinner size="small" color="white" />
              <span>{isLogin ? 'Signing In...' : 'Creating Account...'}</span>
            </>
          ) : (
            <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
          )}
        </button>
      </form>

      {isLogin && (
        <div className="login-note">
          <p>Don't have an account? Click "Create Account" above to register.</p>
        </div>
      )}
    </div>
  );
};

const {
  LoadingSpinner,
  ErrorMessage,
  InstructionPanel,
  ProgressIndicator,
  ServiceCard,
  Modal
} = SetupUIComponents;

// Setup wizard configuration
const SETUP_STEPS = [
  'Account Creation',
  'Welcome',
  'Required Services',
  'Optional Services',
  'Configuration',
  'Complete'
];

const SERVICES_CONFIG = {
  // Required services (user must connect at least one)
  required: [
    {
      id: 'spotify',
      name: 'Spotify',
      icon: '🎵',
      description: 'Connect your Spotify account to access your music library, playlists, and listening history.',
      component: 'SpotifySetupEnhanced',
      features: ['Music Library', 'Playlists', 'Top Artists/Tracks', 'Recommendations']
    }  
  ],
  // Optional services (enhance the experience)
  optional: [
    {
      id: 'lastfm',
      name: 'Last.fm',
      icon: '🎧',
      description: 'Connect Last.fm for extended listening history and scrobbling data.',
      component: 'LastFmSetupEnhanced',
      features: ['Extended History', 'Scrobble Data', 'Artist Info', 'Similar Artists']
    },
    {
      id: 'discogs',
      name: 'Discogs',
      icon: '💿',
      description: 'Access the comprehensive Discogs database for detailed release information.',
      component: 'DiscogsSetupEnhanced',
      features: ['Release Database', 'Collection Tracking', 'Marketplace Data', 'Artist Discographies']
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: '📺',
      description: 'Connect YouTube for music videos and additional content discovery.',
      component: 'YoutubeSetupEnhanced',
      features: ['Music Videos', 'Artist Channels', 'Content Discovery', 'Playlists']
    }
  ]
};

function MainSetupController({ onSetupComplete, initialStep = 0 }) {
  // Core setup state
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

// Account creation state
  const [accountCreated, setAccountCreated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authToken, setAuthToken] = useState(localStorage.getItem('token'));

  // Service connection states
  const [serviceStates, setServiceStates] = useState({});
  const [activeServiceSetup, setActiveServiceSetup] = useState(null);
  const [setupProgress, setSetupProgress] = useState({
    requiredServicesConnected: 0,
    optionalServicesConnected: 0,
    totalServicesConfigured: 0
  });

  const updateSetupProgress = useCallback((states) => {
    const requiredConnected = SERVICES_CONFIG.required.filter(
      service => states[service.id]?.connected
    ).length;
    
    const optionalConnected = SERVICES_CONFIG.optional.filter(
      service => states[service.id]?.connected
    ).length;

    const totalConfigured = requiredConnected + optionalConnected;

    setSetupProgress({
      requiredServicesConnected: requiredConnected,
      optionalServicesConnected: optionalConnected,
      totalServicesConfigured: totalConfigured
    });

    // Auto-advance steps based on progress
    if (requiredConnected > 0 && !completedSteps.includes(1)) {
      setCompletedSteps(prev => [...prev, 1]);
    }
  }, [completedSteps]);

  // Configuration state
  const [setupConfig, setSetupConfig] = useState({
    skipOptionalServices: false,
    enabledFeatures: [],
    userPreferences: {}
  });

  const handleServiceConnected = useCallback((serviceId) => {
    setServiceStates(prev => {
      const updated = {
        ...prev,
        [serviceId]: {
          ...prev[serviceId],
          connected: true,
          error: null,
          loading: false
        }
      };
      updateSetupProgress(updated);
      return updated;
    });

    setActiveServiceSetup(null);
    setError(null);
  }, [updateSetupProgress]);

  const handleServiceError = useCallback((serviceId, errorMessage) => {
    setServiceStates(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        error: errorMessage,
        loading: false
      }
    }));
    setError(errorMessage);
  }, []);

  const handleServiceLoadingChange = useCallback((serviceId, loading) => {
    setServiceStates(prev => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        loading: loading
      }
    }));
  }, []);

  // Service-specific callbacks
  const handleSpotifyConnected = useCallback(() => handleServiceConnected('spotify'), [handleServiceConnected]);
  const handleSpotifyError = useCallback((error) => handleServiceError('spotify', error), [handleServiceError]);
  const handleSpotifyLoadingChange = useCallback((loading) => handleServiceLoadingChange('spotify', loading), [handleServiceLoadingChange]);

  const handleLastFmConnected = useCallback(() => handleServiceConnected('lastfm'), [handleServiceConnected]);
  const handleLastFmError = useCallback((error) => handleServiceError('lastfm', error), [handleServiceError]);
  const handleLastFmLoadingChange = useCallback((loading) => handleServiceLoadingChange('lastfm', loading), [handleServiceLoadingChange]);

  const handleDiscogsConnected = useCallback(() => handleServiceConnected('discogs'), [handleServiceConnected]);
  const handleDiscogsError = useCallback((error) => handleServiceError('discogs', error), [handleServiceError]);
  const handleDiscogsLoadingChange = useCallback((loading) => handleServiceLoadingChange('discogs', loading), [handleServiceLoadingChange]);

  const handleYoutubeConnected = useCallback(() => handleServiceConnected('youtube'), [handleServiceConnected]);
  const handleYoutubeError = useCallback((error) => handleServiceError('youtube', error), [handleServiceError]);
  const handleYoutubeLoadingChange = useCallback((loading) => handleServiceLoadingChange('youtube', loading), [handleServiceLoadingChange]);

  // Account creation handlers
  const handleAccountCreated = useCallback((userData, token) => {
    setCurrentUser(userData);
    setAuthToken(token);
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    setAccountCreated(true);
    
    // Mark account creation step as completed and advance
    if (!completedSteps.includes(0)) {
      setCompletedSteps(prev => [...prev, 0]);
    }
    setCurrentStep(1); // Move to Welcome step
    setError(null);
  }, [completedSteps]);

  const handleAccountError = useCallback((errorMessage) => {
    setError(errorMessage);
  }, []);

  // Modal close handler
  const closeServiceSetup = useCallback(() => {
    setActiveServiceSetup(null);
  }, []);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  // Initialize setup controller
  useEffect(() => {
    if (authToken) {
      initializeSetup();
    }
  }, [authToken]);

  // Check if user is already authenticated
  useEffect(() => {    
    const savedUser = localStorage.getItem('user');
    
    if (authToken && savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        setCurrentUser(userData);
        setAuthToken(token);
        setAccountCreated(true);
        
        // Mark account creation as completed
        if (!completedSteps.includes(0)) {
          setCompletedSteps(prev => [...prev, 0]);
        }
        
        // If we're on step 0 and account is created, move to step 1
        if (currentStep === 0) {
          setCurrentStep(1);
        }
      } catch (error) {
        console.error('Error parsing saved user data:', error);
        localStorage.removeItem('user');
        localStorage.removeItem('token');
      }
    }
  }, [completedSteps, currentStep]);

  // Check service statuses
  const initializeSetup = async () => {
    setIsLoading(true);
    try {
      await checkAllServiceStatuses();
      await checkSetupStatus();
    } catch (error) {
      console.error('Setup initialization error:', error);
      setError('Failed to initialize setup wizard. Please refresh and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Check the status of all configured services
  const checkAllServiceStatuses = async () => {
    if (!authToken) return;

    try {
      const response = await fetch(`${API_BASE}/oauth/services/status`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const statuses = await response.json();
        const newServiceStates = {};

        // Initialize service states
        [...SERVICES_CONFIG.required, ...SERVICES_CONFIG.optional].forEach(service => {
          newServiceStates[service.id] = {
            connected: statuses[service.id]?.connected || false,
            lastTested: statuses[service.id]?.last_tested || null,
            error: statuses[service.id]?.error || null,
            loading: false
          };
        });

        setServiceStates(newServiceStates);
        updateSetupProgress(newServiceStates);
      }
    } catch (error) {
      console.error('Error checking service statuses:', error);
    }
  };

  // Check overall setup completion status
  const checkSetupStatus = async () => {
    if (!authToken) return;

    try {
      const response = await fetch(`${API_BASE}/setup/status`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const status = await response.json();
        if (status.setup_complete) {
          setCompletedSteps([0, 1, 2, 3, 4]);
          if (currentStep < 4) {
            setCurrentStep(4);
          }
        }
      }
    } catch (error) {
      console.error('Error checking setup status:', error);
    }
  };

  // Navigation functions
  const goToStep = (stepIndex) => {
    if (stepIndex >= 0 && stepIndex < SETUP_STEPS.length) {
      setCurrentStep(stepIndex);
      setError(null);
    }
  };

  const nextStep = () => {
    if (currentStep < SETUP_STEPS.length - 1) {
      // Add current step to completed if not already there
      if (!completedSteps.includes(currentStep)) {
        setCompletedSteps(prev => [...prev, currentStep]);
      }
      setCurrentStep(currentStep + 1);
      setError(null);
    }
  };

  const previousStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setError(null);
    }
  };

  // Complete the entire setup process
  const completeSetup = async () => {
    if (!authToken) {
      setError('Authentication required to complete setup');
      return;
    }    
    
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/setup/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          connected_services: Object.keys(serviceStates).filter(
            id => serviceStates[id].connected
          ),
          configuration: setupConfig,
          completed_at: new Date().toISOString()
        })
      });

      if (response.ok) {
        setCompletedSteps([0, 1, 2, 3, 4]);
        if (onSetupComplete) {
          onSetupComplete({
            connectedServices: Object.keys(serviceStates).filter(
              id => serviceStates[id].connected
            ),
            setupProgress
          });
        }
      } else {
        throw new Error('Failed to complete setup');
      }
    } catch (error) {
      console.error('Setup completion error:', error);
      setError('Failed to complete setup. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Check if we can proceed to next step
  const canProceedToNext = () => {
    switch (currentStep) {
      case 0: // Account Creation
        return accountCreated;
      case 1: // Welcome
        return true;
      case 2: // Required Services
        return setupProgress.requiredServicesConnected > 0;
      case 3: // Optional Services
        return true; // Optional, can always skip
      case 4: // Configuration
        return true;
      default:
        return false;
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 0:
        return renderLocalAccountCreationStep();
      case 1:
        return renderWelcomeStep();
      case 2:
        return renderRequiredServicesStep();
      case 3:
        return renderOptionalServicesStep();
      case 4:
        return renderConfigurationStep();
      case 5:
        return renderCompletionStep();
      default:
        return <div>Unknown step</div>;
    }
  };

  // Local account creation step
  const renderLocalAccountCreationStep = () => (
    <div className="account-creation-step">
      <div className="account-header">
        <div className="account-icon">👤</div>
        <h1>Create Your MixView Account</h1>
        <p>First, let's create your personal MixView account to get started.</p>
      </div>

      <div className="account-benefits">
        <h3>Your MixView account provides:</h3>
        <div className="benefits-grid">
          <div className="benefit-item">
            <span className="benefit-icon">🔒</span>
            <div>
              <h4>Secure & Private</h4>
              <p>Your account data is stored locally and encrypted</p>
            </div>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon">🎵</span>
            <div>
              <h4>Music Service Integration</h4>
              <p>Connect multiple music services under one account</p>
            </div>
          </div>
          <div className="benefit-item">
            <span className="benefit-icon">📊</span>
            <div>
              <h4>Personalized Analytics</h4>
              <p>Track your listening habits and discover new music</p>
            </div>
          </div>
        </div>
      </div>

      {!accountCreated ? (
        <div className="account-form-container">
          <InstructionPanel title="🔐 Account Security" type="info">
            <ul>
              <li><strong>Local Storage:</strong> Your account is created and stored locally - no external registration required</li>
              <li><strong>Encrypted Passwords:</strong> All passwords are hashed and stored securely</li>
              <li><strong>Privacy First:</strong> Your personal data never leaves your local environment</li>
              <li><strong>Full Control:</strong> You own and control all your music data and connections</li>
            </ul>
          </InstructionPanel>

          <div className="account-form-wrapper">
            <LocalAccountForm 
              onAccountCreated={handleAccountCreated}
              onError={handleAccountError}
              loading={isLoading}
            />
          </div>
        </div>
      ) : (
        <div className="account-success">
          <div className="success-header">
            <span className="success-icon">✅</span>
            <h3>Welcome, {currentUser?.username}!</h3>
            <p>Your MixView account has been created successfully.</p>
          </div>

          <div className="account-summary">
            <div className="summary-item">
              <span className="summary-label">Username:</span>
              <span className="summary-value">{currentUser?.username}</span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Account Created:</span>
              <span className="summary-value">
                {currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString() : 'Today'}
              </span>
            </div>
            <div className="summary-item">
              <span className="summary-label">Status:</span>
              <span className="summary-value status-active">Active</span>
            </div>
          </div>

          <InstructionPanel title="🎉 Ready for the Next Step!" type="success">
            <p>Your account is ready! Now we'll guide you through connecting your music services 
            to unlock the full power of MixView's music discovery features.</p>
          </InstructionPanel>
        </div>
      )}
    </div>
  );

  // Welcome step
  const renderWelcomeStep = () => (
    <div className="welcome-step">
      <div className="welcome-header">
        <div className="welcome-icon">🎵</div>
        <h1>Welcome to MixView</h1>
        <p>Great! Now let's connect your music services to unlock powerful discovery features!</p>
      </div>

      <div className="setup-overview">
        <h3>What we'll set up next:</h3>
        <div className="overview-grid">
          <div className="overview-item">
            <span className="overview-icon">🔗</span>
            <div>
              <h4>Service Connections</h4>
              <p>Connect your music accounts to unlock powerful features</p>
            </div>
          </div>
          <div className="overview-item">
            <span className="overview-icon">⚙️</span>
            <div>
              <h4>Configuration</h4>
              <p>Customize your experience and preferences</p>
            </div>
          </div>
          <div className="overview-item">
            <span className="overview-icon">🚀</span>
            <div>
              <h4>Ready to Use</h4>
              <p>Start discovering music connections immediately</p>
            </div>
          </div>
        </div>
      </div>

      <InstructionPanel title="🔒 Privacy & Security" type="info">
        <ul>
          <li><strong>Secure OAuth:</strong> All connections use industry-standard OAuth authentication</li>
          <li><strong>Read-Only Access:</strong> We only request read permissions to your music data</li>
          <li><strong>Local Storage:</strong> Your credentials are encrypted and stored securely</li>
          <li><strong>No Data Sharing:</strong> Your music data stays private and is never shared</li>
        </ul>
      </InstructionPanel>

      <div className="setup-stats">
        <div className="stat-item">
          <span className="stat-number">{SERVICES_CONFIG.required.length}</span>
          <span className="stat-label">Core Services</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">{SERVICES_CONFIG.optional.length}</span>
          <span className="stat-label">Optional Services</span>
        </div>
        <div className="stat-item">
          <span className="stat-number">~5</span>
          <span className="stat-label">Minutes to Complete</span>
        </div>
      </div>
      {currentUser && (
        <div className="user-welcome">
          <InstructionPanel title={`👋 Welcome back, ${currentUser.username}!`} type="success">
            <p>Your MixView account is active and ready. Let's connect your music services to start discovering amazing music connections!</p>
          </InstructionPanel>
        </div>
      )}
    </div>
  );

  // Required services step
  const renderRequiredServicesStep = () => (
    <div className="required-services-step">
      <div className="step-header">
        <h2>Connect Required Services</h2>
        <p>Connect at least one music service to start using MixView</p>
      </div>

      {setupProgress.requiredServicesConnected === 0 && (
        <InstructionPanel title="Why do I need to connect a service?" type="info">
          <p>MixView creates music connections by analyzing your listening data. To provide personalized
            recommendations and discover music relationships, we need access to your music library from
            at least one service.</p>
        </InstructionPanel>
      )}

      <div className="services-grid">
        {SERVICES_CONFIG.required.map(service => (
          <ServiceCard
            key={service.id}
            service={service.id}
            icon={service.icon}
            title={service.name}
            description={service.description}
            isConnected={serviceStates[service.id]?.connected || false}
            isRequired={true}
            onConnect={() => setActiveServiceSetup(service.id)}
            onManage={() => setActiveServiceSetup(service.id)}
            disabled={serviceStates[service.id]?.loading || false}
          />
        ))}
      </div>

      {setupProgress.requiredServicesConnected > 0 && (
        <div className="success-message">
          <span className="success-icon">✅</span>
          <div>
            <h4>Great! You've connected {setupProgress.requiredServicesConnected} required service(s)</h4>
            <p>You can now proceed to optional services or skip to configuration.</p>
          </div>
        </div>
      )}
    </div>
  );

  // Optional services step
  const renderOptionalServicesStep = () => (
    <div className="optional-services-step">
      <div className="step-header">
        <h2>Connect Optional Services</h2>
        <p>Add more services to enhance your music discovery experience</p>
      </div>

      <InstructionPanel title="🌟 Enhanced Features" type="success" collapsible>
        <p>Each additional service you connect unlocks new features:</p>
        <ul>
          <li><strong>Last.fm:</strong> Extended listening history and detailed scrobble analytics</li>
          <li><strong>Discogs:</strong> Comprehensive release database and collection tracking</li>
          <li><strong>YouTube:</strong> Music videos and artist content discovery</li>
        </ul>
        <p><em>You can always add more services later through the Service Manager.</em></p>
      </InstructionPanel>

      <div className="services-grid">
        {SERVICES_CONFIG.optional.map(service => (
          <ServiceCard
            key={service.id}
            service={service.id}
            icon={service.icon}
            title={service.name}
            description={service.description}
            isConnected={serviceStates[service.id]?.connected || false}
            isRequired={false}
            onConnect={() => setActiveServiceSetup(service.id)}
            onManage={() => setActiveServiceSetup(service.id)}
            disabled={serviceStates[service.id]?.loading || false}
          />
        ))}
      </div>

      <div className="skip-option">
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={setupConfig.skipOptionalServices}
            onChange={(e) => setSetupConfig(prev => ({
              ...prev,
              skipOptionalServices: e.target.checked
            }))}
          />
          <span>Skip optional services for now (I can add them later)</span>
        </label>
      </div>
    </div>
  );

  // Configuration step
  const renderConfigurationStep = () => (
    <div className="configuration-step">
      <div className="step-header">
        <h2>Configuration</h2>
        <p>Customize your MixView experience</p>
      </div>

      <div className="config-sections">
        <div className="config-section">
          <h3>Connected Services Summary</h3>
          <div className="connected-services">
            {Object.keys(serviceStates).filter(id => serviceStates[id].connected).map(serviceId => {
              const service = [...SERVICES_CONFIG.required, ...SERVICES_CONFIG.optional]
                .find(s => s.id === serviceId);
              return service ? (
                <div key={serviceId} className="connected-service">
                  <span>{service.icon}</span>
                  <span>{service.name}</span>
                  <span className="status-badge">Connected</span>
                </div>
              ) : null;
            })}
          </div>
        </div>

        <div className="config-section">
          <h3>Preferences</h3>
          <div className="preferences-grid">
            <label className="preference-item">
              <input type="checkbox" defaultChecked />
              <span>Enable automatic music discovery</span>
            </label>
            <label className="preference-item">
              <input type="checkbox" defaultChecked />
              <span>Show detailed artist information</span>
            </label>
            <label className="preference-item">
              <input type="checkbox" defaultChecked />
              <span>Enable playlist recommendations</span>
            </label>
            <label className="preference-item">
              <input type="checkbox" />
              <span>Enable beta features</span>
            </label>
          </div>
        </div>
      </div>

      <InstructionPanel title="🎯 You're Almost Ready!" type="success">
        <p>Your MixView setup is nearly complete! You have:</p>
        <ul>
          <li>✅ {setupProgress.requiredServicesConnected} required service(s) connected</li>
          <li>✅ {setupProgress.optionalServicesConnected} optional service(s) connected</li>
          <li>✅ Preferences configured</li>
        </ul>
        <p>Click "Complete Setup" to finalize your configuration and start using MixView!</p>
      </InstructionPanel>
    </div>
  );

  // Completion step
  const renderCompletionStep = () => (
    <div className="completion-step">
      <div className="completion-header">
        <div className="completion-icon">🎉</div>
        <h1>Setup Complete!</h1>
        <p>Your MixView music discovery platform is ready to use</p>
      </div>

      <div className="completion-stats">
        <div className="completion-stat">
          <span className="stat-number">{setupProgress.totalServicesConfigured}</span>
          <span className="stat-label">Services Connected</span>
        </div>
        <div className="completion-stat">
          <span className="stat-number">100%</span>
          <span className="stat-label">Setup Complete</span>
        </div>
      </div>

      <div className="next-steps">
        <h3>🚀 What's Next?</h3>
        <div className="next-steps-grid">
          <div className="next-step">
            <span className="step-icon">🔍</span>
            <div>
              <h4>Start Exploring</h4>
              <p>Search for artists to discover music connections and recommendations</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">📊</span>
            <div>
              <h4>View Your Data</h4>
              <p>Explore your listening history and discover patterns in your music taste</p>
            </div>
          </div>
          <div className="next-step">
            <span className="step-icon">⚙️</span>
            <div>
              <h4>Manage Services</h4>
              <p>Add more services or manage existing connections through Service Manager</p>
            </div>
          </div>
        </div>
      </div>

      <InstructionPanel title="🎵 Tips for Getting Started" type="info">
        <ul>
          <li><strong>Search Artists:</strong> Try searching for your favorite artists to see connections</li>
          <li><strong>Explore Recommendations:</strong> Check out personalized music suggestions</li>
          <li><strong>Add More Services:</strong> Connect additional services anytime for more features</li>
          <li><strong>Check Settings:</strong> Visit the settings page to customize your experience</li>
        </ul>
      </InstructionPanel>
    </div>
  );

  // Main render
  return (
    <div className="main-setup-controller">
      {/* Progress indicator */}
      <ProgressIndicator
        steps={SETUP_STEPS}
        currentStep={currentStep}
        completedSteps={completedSteps}
      />

      {/* Error display */}
      {error && (
        <ErrorMessage
          message={error}
          onClose={() => setError(null)}
          type="error"
        />
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="loading-overlay">
          <LoadingSpinner size="large" />
          <p>Loading...</p>
        </div>
      )}

      {/* Step content */}
      <div className="step-content">
        {renderStepContent()}
      </div>

      {/* Navigation */}
      <div className="step-navigation">
        <button
          onClick={previousStep}
          disabled={currentStep === 0 || isLoading}
          className="nav-button secondary"
        >
          Previous
        </button>

        <div className="nav-spacer" />

        {currentStep === SETUP_STEPS.length - 1 ? (
          <button
            onClick={() => onSetupComplete && onSetupComplete()}
            className="nav-button primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <LoadingSpinner size="small" color="white" />
                <span>Finishing...</span>
              </>
            ) : (
              'Get Started with MixView'
            )}
          </button>
        ) : (
          <button
            onClick={currentStep === 4 ? completeSetup : nextStep}
            disabled={!canProceedToNext() || isLoading}
            className="nav-button primary"
          >
            {currentStep === 4 ? 'Complete Setup' : 'Next'}
          </button>
        )}
      </div>

      {/* Service setup modals */}
      {activeServiceSetup && (
        <Modal
          isOpen={!!activeServiceSetup}
          onClose={closeServiceSetup}
          title={`Connect ${SERVICES_CONFIG.required.concat(SERVICES_CONFIG.optional)
            .find(s => s.id === activeServiceSetup)?.name}`}
          size="large"
        >
          {activeServiceSetup === 'spotify' && (
            <SpotifySetupEnhanced
              onConnected={handleSpotifyConnected}
              onError={handleSpotifyError}
              onLoadingChange={handleSpotifyLoadingChange}
              isConnected={serviceStates.spotify?.connected || false}
              error={serviceStates.spotify?.error}
              loading={serviceStates.spotify?.loading || false}
            />
          )}
          {activeServiceSetup === 'lastfm' && (
            <LastFmSetupEnhanced
              onConnected={handleLastFmConnected}
              onError={handleLastFmError}
              onLoadingChange={handleLastFmLoadingChange}
              isConnected={serviceStates.lastfm?.connected || false}
              error={serviceStates.lastfm?.error}
              loading={serviceStates.lastfm?.loading || false}
            />
          )}
          {activeServiceSetup === 'discogs' && (
            <DiscogsSetupEnhanced
              onConnected={handleDiscogsConnected}
              onError={handleDiscogsError}
              onLoadingChange={handleDiscogsLoadingChange}
              isConnected={serviceStates.discogs?.connected || false}
              error={serviceStates.discogs?.error}
              loading={serviceStates.discogs?.loading || false}
            />
          )}
          {activeServiceSetup === 'youtube' && (
            <YoutubeSetupEnhanced
              onConnected={handleYoutubeConnected}
              onError={handleYoutubeError}
              onLoadingChange={handleYoutubeLoadingChange}
              isConnected={serviceStates.youtube?.connected || false}
              error={serviceStates.youtube?.error}
              loading={serviceStates.youtube?.loading || false}
            />
          )}
        </Modal>
      )}

      <style jsx>{`
        .main-setup-controller {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          gap: 2rem;
          border-radius: 8px;
        }

        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(255, 255, 255, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          z-index: 1000;
        }

        .step-content {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        /* Welcome Step */
        .welcome-step {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .welcome-header .welcome-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .welcome-header h1 {
          margin: 0 0 1rem 0;
          color: #333;
          font-size: 2.5rem;
        }

        .welcome-header p {
          margin: 0;
          color: #666;
          font-size: 1.2rem;
        }

        .overview-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-top: 1rem;
        }

        .overview-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          text-align: left;
        }

        .overview-icon {
          font-size: 2rem;
          flex-shrink: 0;
        }

        .overview-item h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .overview-item p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        .setup-stats {
          display: flex;
          justify-content: center;
          gap: 3rem;
          margin-top: 2rem;
        }

        .stat-item {
          text-align: center;
        }

        .stat-number {
          display: block;
          font-size: 2.5rem;
          font-weight: bold;
          color: #667eea;
          line-height: 1;
        }

        .stat-label {
          display: block;
          font-size: 0.9rem;
          color: #666;
          margin-top: 0.5rem;
        }

        /* Step Headers */

        /* Account Creation Step */
        .account-creation-step {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .account-header {
          text-align: center;
        }

        .account-header .account-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .account-header h1 {
          margin: 0 0 1rem 0;
          color: #333;
          font-size: 2.5rem;
        }

        .account-header p {
          margin: 0;
          color: #666;
          font-size: 1.2rem;
        }

        .account-benefits h3 {
          text-align: center;
          margin-bottom: 1.5rem;
          color: #333;
        }

        .benefits-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .benefit-item {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
          border: 2px solid transparent;
          transition: border-color 0.3s ease;
        }

        .benefit-item:hover {
          border-color: #667eea;
        }

        .benefit-icon {
          font-size: 2rem;
          flex-shrink: 0;
        }

        .benefit-item h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .benefit-item p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        .account-form-container {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .account-form-wrapper {
          max-width: 500px;
          margin: 0 auto;
          width: 100%;
        }

        .account-success {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .success-header {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
        }

        .success-header .success-icon {
          font-size: 3rem;
        }

        .success-header h3 {
          margin: 0;
          color: #28a745;
          font-size: 1.8rem;
        }

        .success-header p {
          margin: 0;
          color: #666;
          font-size: 1.1rem;
        }

        .account-summary {
          background: #f8f9fa;
          padding: 2rem;
          border-radius: 8px;
          border-left: 4px solid #28a745;
          max-width: 400px;
          margin: 0 auto;
        }

        .summary-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0;
          border-bottom: 1px solid #e9ecef;
        }

        .summary-item:last-child {
          border-bottom: none;
        }

        .summary-label {
          font-weight: 600;
          color: #333;
        }

        .summary-value {
          color: #666;
        }

        .status-active {
          color: #28a745 !important;
          font-weight: 600;
        }

        /* Local Account Form - Force specificity */
        .main-setup-controller .local-account-form {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .main-setup-controller .local-account-form .form-toggle {
          display: flex !important;
          background: #f8f9fa !important;
          border-radius: 8px !important;
          padding: 4px !important;
          margin-bottom: 1rem !important;
        }

        .main-setup-controller .local-account-form .toggle-button {
          flex: 1 !important;
          padding: 12px 16px !important;
          background: transparent !important;
          border: none !important;
          border-radius: 6px !important;
          font-size: 14px !important;
          font-weight: 500 !important;
          cursor: pointer !important;
          transition: all 0.3s ease !important;
          color: #666 !important;
        }

        .main-setup-controller .local-account-form .toggle-button.active {
          background: #667eea !important;
          color: white !important;
          box-shadow: 0 2px 4px rgba(102, 126, 234, 0.3) !important;
        }

        .account-form {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .form-group label {
          font-weight: 600;
          color: #333;
          font-size: 14px;
        }

        .form-group input {
          padding: 12px 16px;
          border: 2px solid #ddd;
          border-radius: 6px;
          font-size: 16px;
          transition: border-color 0.3s ease;
          background: white;
        }

        .form-group input:focus {
          outline: none;
          border-color: #667eea;
          box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-group input.error {
          border-color: #dc3545;
        }

        .form-group input:disabled {
          background: #f8f9fa;
          cursor: not-allowed;
        }

        .error-text {
          color: #dc3545;
          font-size: 12px;
          margin-top: 4px;
        }

        .main-setup-controller .local-account-form .submit-button {
          padding: 14px 24px !important;
          background: #667eea !important;
          color: white !important;
          border: none !important;
          border-radius: 6px !important;
          font-size: 16px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: all 0.3s ease !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          margin-top: 1rem !important;
          width: 100% !important;
        }

        .main-setup-controller .local-account-form .submit-button:hover:not(:disabled) {
          background: #5a6fd8 !important;
          transform: translateY(-1px) !important;
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4) !important;
        }

        .main-setup-controller .local-account-form .submit-button:disabled {
          opacity: 0.6 !important;
          cursor: not-allowed !important;
          transform: none !important;
          box-shadow: none !important;
        }

        .login-note {
          text-align: center;
          margin-top: 1rem;
        }

        .login-note p {
          color: #666;
          font-size: 14px;
          margin: 0;
        }

        /* User Welcome Section */
        .user-welcome {
          margin-top: 2rem;
        }

        .step-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .step-header h2 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 2rem;
        }

        .step-header p {
          margin: 0;
          color: #666;
          font-size: 1.1rem;
        }

        /* Services Grid */
        .services-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
          gap: 1.5rem;
          margin: 2rem 0;
        }

        /* Success Message */
        .success-message {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.5rem;
          background: #d4edda;
          border: 1px solid #c3e6cb;
          border-radius: 8px;
          margin-top: 2rem;
        }

        .success-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .success-message h4 {
          margin: 0 0 0.5rem 0;
          color: #155724;
        }

        .success-message p {
          margin: 0;
          color: #155724;
        }

        /* Skip Option */
        .skip-option {
          margin-top: 2rem;
          padding: 1rem;
          background: #f8f9fa;
          border-radius: 8px;
          text-align: center;
        }

        /* Configuration */
        .config-sections {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .config-section {
          background: #f8f9fa;
          padding: 1.5rem;
          border-radius: 8px;
        }

        .config-section h3 {
          margin: 0 0 1rem 0;
          color: #333;
        }

        .connected-services {
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
        }

        .connected-service {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid #dee2e6;
          border-radius: 20px;
          font-size: 0.9rem;
        }

        .status-badge {
          background: #28a745;
          color: white;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: bold;
        }

        .preferences-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }

        .preference-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.5rem;
        }

        /* Completion Step */
        .completion-step {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .completion-header .completion-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
        }

        .completion-header h1 {
          margin: 0 0 1rem 0;
          color: #28a745;
          font-size: 2.5rem;
        }

        .completion-stats {
          display: flex;
          justify-content: center;
          gap: 3rem;
          margin: 2rem 0;
        }

        .completion-stat {
          text-align: center;
        }

        .next-steps {
          text-align: left;
        }

        .next-steps h3 {
          text-align: center;
          margin-bottom: 1.5rem;
          color: #333;
        }

        .next-steps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .next-step {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
          border: 2px solid transparent;
          transition: border-color 0.3s ease;
        }

        .next-step:hover {
          border-color: #667eea;
        }

        .step-icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }

        .next-step h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .next-step p {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
        }

        /* Navigation */
        .step-navigation {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding-top: 2rem;
          border-top: 1px solid #e9ecef;
        }

        .nav-spacer {
          flex: 1;
        }

        .nav-button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .nav-button.primary {
          background: #667eea;
          color: white;
        }

        .nav-button.primary:hover:not(:disabled) {
          background: #5a6fd8;
          transform: translateY(-1px);
        }

        .nav-button.secondary {
          background: #6c757d;
          color: white;
        }

        .nav-button.secondary:hover:not(:disabled) {
          background: #5a6268;
        }

        .nav-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
        }

        /* Responsive Design */
        @media (max-width: 768px) {
          .main-setup-controller {
            padding: 1rem;
          }

          .services-grid {
            grid-template-columns: 1fr;
          }

          .setup-stats {
            gap: 2rem;
          }

          .completion-stats {
            gap: 2rem;
          }

          .next-steps-grid {
            grid-template-columns: 1fr;
          }

          .overview-grid {
            grid-template-columns: 1fr;
          }

          .preferences-grid {
            grid-template-columns: 1fr;
          }

          .step-navigation {
            flex-direction: column;
            gap: 1rem;
          }

          .nav-button {
            width: 100%;
            justify-content: center;
          }

          .nav-spacer {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
export default MainSetupController;