import React, { useState } from 'react';

function SearchBar({ onSearch, loading = false }) {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState('all');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !loading) {
      onSearch(query.trim(), searchType);
    }
  };

  const handleClear = () => {
    setQuery('');
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="search-input-group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for artists, albums, or tracks..."
            className="search-input"
            disabled={loading}
          />
          
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="clear-button"
              disabled={loading}
            >
              ×
            </button>
          )}
          
          <button 
            type="submit" 
            className="search-button"
            disabled={loading || !query.trim()}
          >
            {loading ? (
              <span className="loading-spinner"></span>
            ) : (
              '🔍'
            )}
          </button>
        </div>

        <div className="search-filters">
          <select
            value={searchType}
            onChange={(e) => setSearchType(e.target.value)}
            className="search-type-select"
            disabled={loading}
          >
            <option value="all">All</option>
            <option value="artist">Artists</option>
            <option value="album">Albums</option>
            <option value="track">Tracks</option>
          </select>
        </div>
      </form>

      <style jsx>{`
        .search-container {
          background: white;
          padding: 1rem;
          border-bottom: 1px solid #eee;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        .search-form {
          display: flex;
          gap: 1rem;
          align-items: center;
          max-width: 800px;
          margin: 0 auto;
        }

        .search-input-group {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
          border: 2px solid #ddd;
          border-radius: 25px;
          overflow: hidden;
          transition: border-color 0.3s ease;
        }

        .search-input-group:focus-within {
          border-color: #667eea;
        }

        .search-input {
          flex: 1;
          padding: 0.75rem 1rem;
          border: none;
          outline: none;
          font-size: 1rem;
          background: transparent;
        }

        .search-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .clear-button {
          background: none;
          border: none;
          padding: 0.5rem;
          cursor: pointer;
          font-size: 1.2rem;
          color: #999;
          transition: color 0.3s ease;
        }

        .clear-button:hover:not(:disabled) {
          color: #666;
        }

        .clear-button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .search-button {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border: none;
          padding: 0.75rem 1rem;
          cursor: pointer;
          color: white;
          font-size: 1rem;
          transition: opacity 0.3s ease;
          min-width: 50px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .search-button:hover:not(:disabled) {
          opacity: 0.9;
        }

        .search-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid transparent;
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .search-filters {
          display: flex;
          gap: 0.5rem;
        }

        .search-type-select {
          padding: 0.75rem 1rem;
          border: 2px solid #ddd;
          border-radius: 20px;
          background: white;
          cursor: pointer;
          outline: none;
          font-size: 0.9rem;
          transition: border-color 0.3s ease;
        }

        .search-type-select:focus {
          border-color: #667eea;
        }

        .search-type-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (max-width: 768px) {
          .search-form {
            flex-direction: column;
            gap: 0.5rem;
          }

          .search-input-group {
            width: 100%;
          }

          .search-filters {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}

export default SearchBar;