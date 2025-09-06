/**
 * SetupUIComponents.jsx
 * 
 * PURPOSE: Shared UI component library for the MixView setup wizard system.
 * Provides reusable, consistent components for service setup flows, error handling,
 * loading states, and user interactions across all setup modules.
 * 
 * DIRECTORY LOCATION: /src/components/shared/SetupUIComponents.jsx
 * 
 * DEPENDENCIES:
 * - React (useState, useEffect hooks)
 * - No external CSS frameworks required (self-contained styling)
 * 
 * COMPONENTS INCLUDED:
 * - LoadingSpinner: Customizable loading animations with size/color options
 * - ErrorMessage: Error/warning/info display with dismiss functionality
 * - InstructionPanel: Collapsible help sections with different visual types
 * - ServiceConnectionStatus: Service status display with test/disconnect actions
 * - ProgressIndicator: Step-by-step progress visualization for wizards
 * - ValidatedInput: Input fields with real-time validation and error states
 * - ServiceCard: Service overview cards showing connection status and actions
 * - Modal: Overlay dialogs for detailed interactions and service setup
 * 
 * USAGE EXAMPLE:
 * ```jsx
 * import { SetupUIComponents } from '../shared/SetupUIComponents';
 * const { LoadingSpinner, ErrorMessage, InstructionPanel } = SetupUIComponents;
 * 
 * // Or import individual components:
 * import { LoadingSpinner, ErrorMessage } from '../shared/SetupUIComponents';
 * ```
 * 
 * INTEGRATION:
 * - Used by all service setup components (SpotifySetupEnhanced, etc.)
 * - Used by MainSetupController for orchestration UI
 * - Designed for consistent theming and responsive behavior
 * - Self-contained styling eliminates external CSS dependencies
 */

import React, { useState, useEffect } from 'react';

// Loading Spinner Component
export const LoadingSpinner = ({ size = 'medium', color = '#667eea', className = '' }) => {
  const sizeMap = {
    small: '20px',
    medium: '32px',
    large: '48px'
  };

  return (
    <div 
      className={`loading-spinner ${className}`}
      style={{
        width: sizeMap[size],
        height: sizeMap[size],
        border: `3px solid ${color}20`,
        borderTop: `3px solid ${color}`,
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }}
    >
      <style jsx>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// Error Message Component
export const ErrorMessage = ({ message, onClose, type = 'error', dismissible = true }) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  if (!isVisible || !message) return null;

  const typeStyles = {
    error: {
      background: '#fee',
      border: '1px solid #fcc',
      color: '#c33'
    },
    warning: {
      background: '#fff3cd',
      border: '1px solid #ffeaa7',
      color: '#856404'
    },
    info: {
      background: '#e7f3ff',
      border: '1px solid #b3d9ff',
      color: '#004085'
    }
  };

  return (
    <div 
      className="error-message"
      style={{
        ...typeStyles[type],
        padding: '12px 16px',
        borderRadius: '6px',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        margin: '8px 0'
      }}
    >
      <div style={{ flex: 1 }}>
        <strong>{type === 'error' ? '⚠️ Error: ' : type === 'warning' ? '⚠️ Warning: ' : 'ℹ️ Info: '}</strong>
        {message}
      </div>
      {dismissible && (
        <button
          onClick={handleClose}
          style={{
            background: 'none',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer',
            color: 'inherit',
            padding: '0',
            lineHeight: '1'
          }}
          title="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
};

// Instruction Panel Component
export const InstructionPanel = ({ title, children, type = 'info', collapsible = false, defaultExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const typeStyles = {
    info: {
      background: '#e7f3ff',
      border: '1px solid #b3d9ff',
      borderLeft: '4px solid #667eea'
    },
    warning: {
      background: '#fff3cd',
      border: '1px solid #ffeaa7',
      borderLeft: '4px solid #ffc107'
    },
    success: {
      background: '#d4edda',
      border: '1px solid #c3e6cb',
      borderLeft: '4px solid #28a745'
    },
    error: {
      background: '#f8d7da',
      border: '1px solid #f5c6cb',
      borderLeft: '4px solid #dc3545'
    }
  };

  const iconMap = {
    info: 'ℹ️',
    warning: '⚠️',
    success: '✅',
    error: '❌'
  };

  return (
    <div 
      className="instruction-panel"
      style={{
        ...typeStyles[type],
        borderRadius: '8px',
        margin: '16px 0'
      }}
    >
      <div 
        className="panel-header"
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: collapsible ? 'pointer' : 'default'
        }}
        onClick={collapsible ? () => setIsExpanded(!isExpanded) : undefined}
      >
        <h4 style={{ margin: 0, color: '#333', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>{iconMap[type]}</span>
          {title}
        </h4>
        {collapsible && (
          <span style={{ fontSize: '14px', color: '#666' }}>
            {isExpanded ? '▼' : '▶️'}
          </span>
        )}
      </div>
      {isExpanded && (
        <div 
          className="panel-content"
          style={{
            padding: collapsible ? '0 16px 16px 16px' : '0 16px 16px 16px',
            color: '#555',
            lineHeight: '1.5'
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};

// Service Connection Status Component
export const ServiceConnectionStatus = ({ 
  service, 
  connected, 
  testing = false, 
  onTest, 
  onDisconnect, 
  lastTested,
  testResult 
}) => {
  const serviceInfo = {
    spotify: { name: 'Spotify', icon: '🎵', color: '#1db954' },
    lastfm: { name: 'Last.fm', icon: '🎧', color: '#d51007' },
    discogs: { name: 'Discogs', icon: '💿', color: '#333' },
    youtube: { name: 'YouTube', icon: '📺', color: '#ff0000' }
  };

  const info = serviceInfo[service] || { name: service, icon: '🔗', color: '#667eea' };

  return (
    <div 
      className="service-connection-status"
      style={{
        background: '#f8f9fa',
        border: `2px solid ${connected ? '#28a745' : '#6c757d'}`,
        borderRadius: '8px',
        padding: '20px',
        margin: '16px 0'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <span style={{ fontSize: '24px' }}>{info.icon}</span>
        <div>
          <h4 style={{ margin: 0, color: '#333' }}>{info.name}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span 
              style={{
                padding: '4px 8px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 'bold',
                background: connected ? '#28a745' : '#6c757d',
                color: 'white'
              }}
            >
              {connected ? 'Connected' : 'Not Connected'}
            </span>
            {connected && lastTested && (
              <span style={{ fontSize: '12px', color: '#666' }}>
                Last tested: {new Date(lastTested).toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {connected && testResult && (
        <div 
          style={{
            background: '#e7f3ff',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '16px',
            fontSize: '14px',
            color: '#004085'
          }}
        >
          <strong>Status:</strong> {testResult}
        </div>
      )}

      {connected && (
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onTest}
            disabled={testing}
            style={{
              padding: '8px 16px',
              background: testing ? '#6c757d' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: testing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {testing ? (
              <>
                <LoadingSpinner size="small" color="white" />
                <span>Testing...</span>
              </>
            ) : (
              <>
                <span>🔍</span>
                <span>Test Connection</span>
              </>
            )}
          </button>
          <button
            onClick={onDisconnect}
            style={{
              padding: '8px 16px',
              background: '#dc3545',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <span>🔌</span>
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
};

// Progress Indicator Component
export const ProgressIndicator = ({ steps, currentStep, completedSteps = [] }) => {
  return (
    <div 
      className="progress-indicator"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        margin: '24px 0',
        flexWrap: 'wrap'
      }}
    >
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = completedSteps.includes(index);
        const isAccessible = index <= currentStep || isCompleted;

        return (
          <div
            key={index}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold',
                background: isCompleted ? '#28a745' : isActive ? '#667eea' : isAccessible ? '#e9ecef' : '#f8f9fa',
                color: isCompleted || isActive ? 'white' : isAccessible ? '#495057' : '#adb5bd',
                border: `2px solid ${isCompleted ? '#28a745' : isActive ? '#667eea' : isAccessible ? '#dee2e6' : '#e9ecef'}`
              }}
            >
              {isCompleted ? '✓' : index + 1}
            </div>
            <span
              style={{
                fontSize: '14px',
                color: isCompleted || isActive ? '#333' : isAccessible ? '#666' : '#adb5bd',
                fontWeight: isActive ? 'bold' : 'normal',
                whiteSpace: 'nowrap'
              }}
            >
              {step}
            </span>
            {index < steps.length - 1 && (
              <div
                style={{
                  width: '20px',
                  height: '2px',
                  background: isCompleted ? '#28a745' : '#e9ecef',
                  margin: '0 4px'
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

// Input Field Component with Validation
export const ValidatedInput = ({ 
  label, 
  type = 'text', 
  value, 
  onChange, 
  onValidate,
  placeholder,
  required = false,
  error,
  success,
  helpText,
  disabled = false,
  ...props 
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [hasBeenTouched, setHasBeenTouched] = useState(false);

  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    if (onValidate && hasBeenTouched) {
      onValidate(newValue);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    setHasBeenTouched(true);
    if (onValidate) {
      onValidate(value);
    }
  };

  const getBorderColor = () => {
    if (error && hasBeenTouched) return '#dc3545';
    if (success && hasBeenTouched) return '#28a745';
    if (isFocused) return '#667eea';
    return '#ced4da';
  };

  return (
    <div 
      className="validated-input"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        margin: '12px 0'
      }}
    >
      {label && (
        <label 
          style={{
            fontSize: '14px',
            fontWeight: '500',
            color: '#333'
          }}
        >
          {label} {required && <span style={{ color: '#dc3545' }}>*</span>}
        </label>
      )}
      
      <input
        type={type}
        value={value}
        onChange={handleChange}
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          padding: '12px',
          border: `2px solid ${getBorderColor()}`,
          borderRadius: '6px',
          fontSize: '16px',
          transition: 'border-color 0.2s ease',
          background: disabled ? '#f8f9fa' : 'white',
          color: disabled ? '#6c757d' : '#333'
        }}
        {...props}
      />

      {error && hasBeenTouched && (
        <span style={{ fontSize: '12px', color: '#dc3545' }}>
          ❌ {error}
        </span>
      )}

      {success && hasBeenTouched && !error && (
        <span style={{ fontSize: '12px', color: '#28a745' }}>
          ✅ {success}
        </span>
      )}

      {helpText && !error && (
        <span style={{ fontSize: '12px', color: '#6c757d' }}>
          {helpText}
        </span>
      )}
    </div>
  );
};

// Service Card Component
export const ServiceCard = ({ 
  service, 
  icon, 
  title, 
  description, 
  isConnected, 
  isRequired = false, 
  onConnect, 
  onManage,
  disabled = false 
}) => {
  return (
    <div 
      className="service-card"
      style={{
        background: 'white',
        border: `2px solid ${isConnected ? '#28a745' : disabled ? '#e9ecef' : '#dee2e6'}`,
        borderRadius: '12px',
        padding: '20px',
        transition: 'all 0.3s ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1
      }}
      onMouseEnter={(e) => !disabled && (e.target.style.borderColor = isConnected ? '#28a745' : '#667eea')}
      onMouseLeave={(e) => !disabled && (e.target.style.borderColor = isConnected ? '#28a745' : '#dee2e6')}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ fontSize: '32px', flexShrink: 0 }}>{icon}</div>
        
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: '#333', fontSize: '18px' }}>{title}</h3>
            {isRequired && (
              <span style={{
                padding: '2px 8px',
                background: '#ffc107',
                color: '#000',
                borderRadius: '12px',
                fontSize: '10px',
                fontWeight: 'bold'
              }}>
                REQUIRED
              </span>
            )}
            {isConnected && (
              <span style={{
                padding: '2px 8px',
                background: '#28a745',
                color: 'white',
                borderRadius: '12px',
                fontSize: '10px',
                fontWeight: 'bold'
              }}>
                CONNECTED
              </span>
            )}
          </div>
          
          <p style={{ margin: '0 0 16px 0', color: '#666', fontSize: '14px', lineHeight: '1.4' }}>
            {description}
          </p>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            {isConnected ? (
              <button
                onClick={() => !disabled && onManage?.()}
                disabled={disabled}
                style={{
                  padding: '8px 16px',
                  background: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: disabled ? 'not-allowed' : 'pointer'
                }}
              >
                Manage Connection
              </button>
            ) : (
              <button
                onClick={() => !disabled && onConnect?.()}
                disabled={disabled}
                style={{
                  padding: '8px 16px',
                  background: disabled ? '#6c757d' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  cursor: disabled ? 'not-allowed' : 'pointer'
                }}
              >
                Connect {title}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Modal Component
export const Modal = ({ isOpen, onClose, title, children, size = 'medium' }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeMap = {
    small: '400px',
    medium: '600px',
    large: '800px',
    xlarge: '1000px'
  };

  return (
    <div 
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px'
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div 
        className="modal-content"
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: sizeMap[size],
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
        }}
      >
        <div 
          className="modal-header"
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #e9ecef',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h2 style={{ margin: 0, color: '#333', fontSize: '20px' }}>{title}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6c757d',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ✕
          </button>
        </div>
        <div 
          className="modal-body"
          style={{
            padding: '24px'
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// Export all components as named exports and as a single object
export const SetupUIComponents = {
  LoadingSpinner,
  ErrorMessage,
  InstructionPanel,
  ServiceConnectionStatus,
  ProgressIndicator,
  ValidatedInput,
  ServiceCard,
  Modal
};