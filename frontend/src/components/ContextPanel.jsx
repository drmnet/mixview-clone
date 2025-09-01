import React from 'react';

function ContextPanel({ node }) {
  if (!node) {
    return (
      <div className="context-panel">
        <div className="panel-content empty">
          <h3>Node Details</h3>
          <p>Click on a node in the graph to view its details</p>
        </div>
        
        <style jsx>{`
          .context-panel {
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            height: fit-content;
          }

          .panel-content {
            padding: 1rem;
          }

          .empty {
            text-align: center;
            color: #666;
          }

          .empty h3 {
            margin: 0 0 0.5rem 0;
            color: #333;
          }

          .empty p {
            margin: 0;
            font-style: italic;
          }
        `}</style>
      </div>
    );
  }

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getNodeTypeIcon = (type) => {
    switch (type) {
      case 'artist': return '👤';
      case 'album': return '💿';
      case 'track': return '🎵';
      default: return '❓';
    }
  };

  const openAppleMusic = () => {
    if (node.apple_link) {
      window.open(node.apple_link, '_blank');
    }
  };

  const openSpotify = () => {
    if (node.spotify_id) {
      const spotifyUrl = `https://open.spotify.com/${node.type}/${node.spotify_id}`;
      window.open(spotifyUrl, '_blank');
    }
  };

  return (
    <div className="context-panel">
      <div className="panel-content">
        <div className="node-header">
          <div className="node-icon">
            {getNodeTypeIcon(node.type)}
          </div>
          <div className="node-info">
            <h3 className="node-title">{node.label || node.name || node.title}</h3>
            <span className="node-type">{node.type}</span>
          </div>
        </div>

        {node.image_url && (
          <div className="node-image">
            <img src={node.image_url} alt={node.label} />
          </div>
        )}

        <div className="node-details">
          {node.type === 'artist' && (
            <>
              {node.description && (
                <div className="detail-item">
                  <strong>Bio:</strong>
                  <p className="description">{node.description}</p>
                </div>
              )}
              {node.details?.albums && (
                <div className="detail-item">
                  <strong>Albums:</strong> {node.details.albums.length}
                </div>
              )}
              {node.details?.tracks && (
                <div className="detail-item">
                  <strong>Tracks:</strong> {node.details.tracks.length}
                </div>
              )}
            </>
          )}

          {node.type === 'album' && (
            <>
              {node.artist && (
                <div className="detail-item">
                  <strong>Artist:</strong> {node.artist.name}
                </div>
              )}
              {node.release_year && (
                <div className="detail-item">
                  <strong>Year:</strong> {node.release_year}
                </div>
              )}
              {node.details?.tracks && (
                <div className="detail-item">
                  <strong>Tracks:</strong> {node.details.tracks.length}
                </div>
              )}
            </>
          )}

          {node.type === 'track' && (
            <>
              {node.artist && (
                <div className="detail-item">
                  <strong>Artist:</strong> {node.artist.name}
                </div>
              )}
              {node.album && (
                <div className="detail-item">
                  <strong>Album:</strong> {node.album.title}
                </div>
              )}
              {node.duration_seconds && (
                <div className="detail-item">
                  <strong>Duration:</strong> {formatDuration(node.duration_seconds)}
                </div>
              )}
            </>
          )}

          <div className="service-ids">
            <strong>Available on:</strong>
            <div className="service-list">
              {node.spotify_id && (
                <span className="service-tag spotify">Spotify</span>
              )}
              {node.lastfm_id && (
                <span className="service-tag lastfm">Last.fm</span>
              )}
              {node.discogs_id && (
                <span className="service-tag discogs">Discogs</span>
              )}
              {node.apple_music_url && (
                <span className="service-tag apple">Apple Music</span>
              )}
            </div>
          </div>
        </div>

        <div className="action-buttons">
          {node.apple_link && (
            <button onClick={openAppleMusic} className="action-button apple">
              Open in Apple Music
            </button>
          )}
          {node.spotify_id && (
            <button onClick={openSpotify} className="action-button spotify">
              Open in Spotify
            </button>
          )}
        </div>

        {node.details && (
          <div className="related-items">
            {node.details.related_artists && node.details.related_artists.length > 0 && (
              <div className="related-section">
                <h4>Related Artists</h4>
                <div className="related-list">
                  {node.details.related_artists.slice(0, 5).map(artist => (
                    <div key={artist.id} className="related-item">
                      {artist.name}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {node.details.albums && node.details.albums.length > 0 && (
              <div className="related-section">
                <h4>Albums</h4>
                <div className="related-list">
                  {node.details.albums.slice(0, 3).map(album => (
                    <div key={album.id} className="related-item">
                      {album.title}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {node.details.tracks && node.details.tracks.length > 0 && (
              <div className="related-section">
                <h4>Tracks</h4>
                <div className="related-list">
                  {node.details.tracks.slice(0, 5).map(track => (
                    <div key={track.id} className="related-item">
                      {track.title}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx>{`
        .context-panel {
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          max-height: calc(100vh - 200px);
          overflow-y: auto;
        }

        .panel-content {
          padding: 1rem;
        }

        .node-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .node-icon {
          font-size: 2rem;
        }

        .node-info {
          flex: 1;
        }

        .node-title {
          margin: 0;
          color: #333;
          font-size: 1.2rem;
          line-height: 1.2;
        }

        .node-type {
          color: #666;
          text-transform: capitalize;
          font-size: 0.9rem;
        }

        .node-image {
          margin-bottom: 1rem;
          text-align: center;
        }

        .node-image img {
          max-width: 200px;
          max-height: 200px;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .node-details {
          margin-bottom: 1rem;
        }

        .detail-item {
          margin-bottom: 0.75rem;
        }

        .detail-item strong {
          display: block;
          color: #333;
          margin-bottom: 0.25rem;
          font-size: 0.9rem;
        }

        .description {
          margin: 0;
          color: #666;
          font-size: 0.9rem;
          line-height: 1.4;
          max-height: 100px;
          overflow-y: auto;
        }

        .service-ids {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }

        .service-ids strong {
          display: block;
          margin-bottom: 0.5rem;
          color: #333;
          font-size: 0.9rem;
        }

        .service-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .service-tag {
          padding: 0.25rem 0.5rem;
          border-radius: 12px;
          font-size: 0.8rem;
          color: white;
          font-weight: 500;
        }

        .service-tag.spotify {
          background: #1db954;
        }

        .service-tag.lastfm {
          background: #d51007;
        }

        .service-tag.discogs {
          background: #333;
        }

        .service-tag.apple {
          background: #fa233b;
        }

        .action-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin: 1rem 0;
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }

        .action-button {
          padding: 0.75rem 1rem;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: opacity 0.3s ease;
          color: white;
        }

        .action-button:hover {
          opacity: 0.9;
        }

        .action-button.apple {
          background: linear-gradient(135deg, #fa233b 0%, #fb5c74 100%);
        }

        .action-button.spotify {
          background: linear-gradient(135deg, #1db954 0%, #1ed760 100%);
        }

        .related-items {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid #eee;
        }

        .related-section {
          margin-bottom: 1rem;
        }

        .related-section h4 {
          margin: 0 0 0.5rem 0;
          color: #333;
          font-size: 1rem;
        }

        .related-list {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .related-item {
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 4px;
          font-size: 0.9rem;
          color: #333;
        }
      `}</style>
    </div>
  );
}

export default ContextPanel;