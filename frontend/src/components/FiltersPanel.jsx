import React, { useState } from 'react';

function FiltersPanel({ filters = [], onFiltersChange, token }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newFilter, setNewFilter] = useState({ filter_type: 'exclude_genre', value: '' });
  const [loading, setLoading] = useState(false);

  const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001';

  const filterTypes = [
    { value: 'exclude_genre', label: 'Exclude Genre' },
    { value: 'exclude_artist', label: 'Exclude Artist' },
    { value: 'exclude_album', label: 'Exclude Album' },
    { value: 'exclude_track', label: 'Exclude Track' },
    { value: 'min_duration', label: 'Minimum Duration (seconds)' },
    { value: 'min_similarity', label: 'Minimum Similarity' }
  ];

  const addFilter = async () => {
    if (!newFilter.value.trim() || !token) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/filters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          filter_type: newFilter.filter_type,
          value: newFilter.value.trim()
        })
      });

      if (response.ok) {
        const createdFilter = await response.json();
        const updatedFilters = [...filters, createdFilter];
        onFiltersChange(updatedFilters);
        setNewFilter({ filter_type: 'exclude_genre', value: '' });
      } else {
        console.error('Failed to add filter');
      }
    } catch (error) {
      console.error('Error adding filter:', error);
    } finally {
      setLoading(false);
    }
  };

  const removeFilter = async (filterId) => {
    if (!token) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/filters/${filterId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const updatedFilters = filters.filter(f => f.id !== filterId);
        onFiltersChange(updatedFilters);
      } else {
        console.error('Failed to remove filter');
      }
    } catch (error) {
      console.error('Error removing filter:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilterDescription = (filter) => {
    const typeLabel = filterTypes.find(t => t.value === filter.filter_type)?.label || filter.filter_type;
    return `${typeLabel}: ${filter.value}`;
  };

  return (
    <div className="filters-panel">
      <div className="panel-header" onClick={() => setIsExpanded(!isExpanded)}>
        <h3>Filters ({filters.length})</h3>
        <span className={`expand-arrow ${isExpanded ? 'expanded' : ''}`}>â–¼</span>
      </div>

      {isExpanded && (
        <div className="panel-content">
          <div className="current-filters">
            {filters.length === 0 ? (
              <p className="no-filters">No filters applied</p>
            ) : (
              filters.map(filter => (
                <div key={filter.id} className="filter-item">
                  <span className="filter-description">
                    {getFilterDescription(filter)}
                  </span>
                  <button
                    onClick={() => removeFilter(filter.id)}
                    className="remove-filter"
                    disabled={loading}
                    title="Remove filter"
                  >
                    Ã—
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="add-filter">
            <h4>Add Filter</h4>
            <div className="filter-form">
              <select
                value={newFilter.filter_type}
                onChange={(e) => setNewFilter({ ...newFilter, filter_type: e.target.value })}
                className="filter-type-select"
                disabled={loading}
              >
                {filterTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={newFilter.value}
                onChange={(e) => setNewFilter({ ...newFilter, value: e.target.value })}
                placeholder="Filter value..."
                className="filter-value-input"
                disabled={loading}
                onKeyPress={(e) => e.key === 'Enter' && addFilter()}
              />

              <button
                onClick={addFilter}
                className="add-filter-button"
                disabled={loading || !newFilter.value.trim()}
              >
                {loading ? '...' : '+'}
              </button>
            </div>
          </div>

          <div className="filter-help">
            <details>
              <summary>Filter Help</summary>
              <ul>
                <li><strong>Exclude Genre:</strong> Hide items containing this genre</li>
                <li><strong>Exclude Artist/Album/Track:</strong> Hide specific items by name</li>
                <li><strong>Min Duration:</strong> Only show tracks longer than X seconds</li>
                <li><strong>Min Similarity:</strong> Only show highly related items</li>
              </ul>
            </details>
          </div>
        </div>
      )}

      <style jsx>{`
        .filters-panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 1rem;
          overflow: hidden;
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          cursor: pointer;
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
          transition: background-color 0.3s ease;
        }

        .panel-header:hover {
          background: #e9ecef;
        }

        .panel-header h3 {
          margin: 0;
          color: #333;
          font-size: 1rem;
        }

        .expand-arrow {
          transition: transform 0.3s ease;
          color: #666;
        }

        .expand-arrow.expanded {
          transform: rotate(180deg);
        }

        .panel-content {
          padding: 1rem;
        }

        .current-filters {
          margin-bottom: 1rem;
        }

        .no-filters {
          color: #666;
          font-style: italic;
          margin: 0;
        }

        .filter-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem;
          background: #f1f3f4;
          border-radius: 4px;
          margin-bottom: 0.5rem;
        }

        .filter-description {
          flex: 1;
          font-size: 0.9rem;
          color: #333;
        }

        .remove-filter {
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 50%;
          width: 24px;
          height: 24px;
          cursor: pointer;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.3s ease;
        }

        .remove-filter:hover:not(:disabled) {
          background: #c82333;
        }

        .remove-filter:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .add-filter {
          border-top: 1px solid #eee;
          padding-top: 1rem;
        }

        .add-filter h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 0.9rem;
        }

        .filter-form {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .filter-type-select {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          background: white;
          font-size: 0.9rem;
          min-width: 140px;
        }

        .filter-type-select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .filter-value-input {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 0.9rem;
        }

        .filter-value-input:focus {
          outline: none;
          border-color: #667eea;
        }

        .filter-value-input:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .add-filter-button {
          background: #28a745;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          font-size: 0.9rem;
          transition: background-color 0.3s ease;
        }

        .add-filter-button:hover:not(:disabled) {
          background: #218838;
        }

        .add-filter-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .filter-help {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }

        .filter-help details {
          font-size: 0.9rem;
        }

        .filter-help summary {
          cursor: pointer;
          color: #667eea;
          font-weight: 500;
        }

        .filter-help ul {
          margin: 0.5rem 0 0 1rem;
          padding: 0;
        }

        .filter-help li {
          margin-bottom: 0.25rem;
          color: #666;
        }
      `}</style>
    </div>
  );
}

export default FiltersPanel;
