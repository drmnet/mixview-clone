import React, { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

function GraphView({ nodes, onNodeClick, selectedNode }) {
  const fgRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Combine all node types into one array for visualization
  const combinedNodes = [
    ...nodes.artists.map(a => ({ 
      id: `artist-${a.id}`, 
      type: 'artist', 
      label: a.name, 
      image: a.image_url, 
      apple_link: a.apple_link,
      spotify_id: a.spotify_id,
      lastfm_id: a.lastfm_id,
      discogs_id: a.discogs_id,
      description: a.description,
      ...a
    })),
    ...nodes.albums.map(a => ({ 
      id: `album-${a.id}`, 
      type: 'album', 
      label: a.title, 
      image: a.image_url, 
      apple_link: a.apple_link,
      spotify_id: a.spotify_id,
      lastfm_id: a.lastfm_id,
      discogs_id: a.discogs_id,
      artist: a.artist,
      release_year: a.release_year,
      ...a
    })),
    ...nodes.tracks.map(t => ({ 
      id: `track-${t.id}`, 
      type: 'track', 
      label: t.title, 
      image: t.cover_url, 
      apple_link: t.apple_link,
      spotify_id: t.spotify_id,
      lastfm_id: t.lastfm_id,
      discogs_id: t.discogs_id,
      artist: t.artist,
      album: t.album,
      duration_seconds: t.duration_seconds,
      ...t
    })),
  ];

  // Create links based on relationships
  const links = [];

  // Artist-Album relationships
  nodes.albums.forEach(album => {
    if (album.artist) {
      const artistNodeExists = combinedNodes.some(n => n.id === `artist-${album.artist.id}`);
      const albumNodeExists = combinedNodes.some(n => n.id === `album-${album.id}`);
      
      if (artistNodeExists && albumNodeExists) {
        links.push({ 
          source: `artist-${album.artist.id}`, 
          target: `album-${album.id}`,
          type: 'hierarchy',
          strength: 0.8
        });
      }
    }
  });

  // Album-Track relationships
  nodes.tracks.forEach(track => {
    if (track.album) {
      const albumNodeExists = combinedNodes.some(n => n.id === `album-${track.album.id}`);
      const trackNodeExists = combinedNodes.some(n => n.id === `track-${track.id}`);
      
      if (albumNodeExists && trackNodeExists) {
        links.push({ 
          source: `album-${track.album.id}`, 
          target: `track-${track.id}`,
          type: 'hierarchy',
          strength: 0.7
        });
      }
    } else if (track.artist) {
      // Direct artist-track relationship if no album
      const artistNodeExists = combinedNodes.some(n => n.id === `artist-${track.artist.id}`);
      const trackNodeExists = combinedNodes.some(n => n.id === `track-${track.id}`);
      
      if (artistNodeExists && trackNodeExists) {
        links.push({ 
          source: `artist-${track.artist.id}`, 
          target: `track-${track.id}`,
          type: 'hierarchy',
          strength: 0.6
        });
      }
    }
  });

  // Add similarity relationships (these would come from your similarity data)
  // For now, we'll create some based on shared artists or similar names
  const createSimilarityLinks = () => {
    const artistNodes = combinedNodes.filter(n => n.type === 'artist');
    const similarityLinks = [];

    // Create connections between artists with similar names or shared albums
    for (let i = 0; i < artistNodes.length; i++) {
      for (let j = i + 1; j < artistNodes.length; j++) {
        const artist1 = artistNodes[i];
        const artist2 = artistNodes[j];
        
        // Simple similarity check - you'd replace this with actual similarity data
        const nameSimilarity = calculateNameSimilarity(artist1.label, artist2.label);
        if (nameSimilarity > 0.3) {
          similarityLinks.push({
            source: artist1.id,
            target: artist2.id,
            type: 'similarity',
            strength: nameSimilarity * 0.5
          });
        }
      }
    }

    return similarityLinks;
  };

  const calculateNameSimilarity = (name1, name2) => {
    const words1 = name1.toLowerCase().split(' ');
    const words2 = name2.toLowerCase().split(' ');
    const commonWords = words1.filter(word => words2.includes(word));
    return commonWords.length / Math.max(words1.length, words2.length);
  };

  const allLinks = [...links, ...createSimilarityLinks()];

  useEffect(() => {
    if (fgRef.current) {
      // Configure force simulation
      fgRef.current.d3Force('charge').strength(-300);
      fgRef.current.d3Force('link').distance(link => {
        return link.type === 'hierarchy' ? 80 : 120;
      }).strength(link => link.strength || 0.5);
      
      // Center the graph
      fgRef.current.zoomToFit(400, 200);
    }
  }, [nodes]);

  // Update dimensions on window resize
  useEffect(() => {
    const updateDimensions = () => {
      const container = document.querySelector('.graph-container');
      if (container) {
        const rect = container.getBoundingClientRect();
        setDimensions({
          width: Math.max(400, rect.width - 40),
          height: Math.max(300, rect.height - 40)
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeClick = (node) => {
    onNodeClick(node);
    
    // Highlight connected nodes
    if (fgRef.current) {
      const connectedNodeIds = new Set();
      allLinks.forEach(link => {
        if (link.source.id === node.id || link.source === node.id) {
          connectedNodeIds.add(typeof link.target === 'object' ? link.target.id : link.target);
        }
        if (link.target.id === node.id || link.target === node.id) {
          connectedNodeIds.add(typeof link.source === 'object' ? link.source.id : link.source);
        }
      });
      
      // You could use this to highlight connected nodes
      console.log('Connected nodes:', connectedNodeIds);
    }
  };

  const getNodeColor = (node) => {
    const isSelected = selectedNode && selectedNode.id === node.id;
    
    if (isSelected) {
      return '#ff6b6b'; // Red for selected
    }
    
    switch (node.type) {
      case 'artist':
        return '#667eea'; // Blue for artists
      case 'album':
        return '#4ecdc4'; // Teal for albums
      case 'track':
        return '#45b7d1'; // Light blue for tracks
      default:
        return '#95a5a6';
    }
  };

  const getNodeSize = (node) => {
    const baseSize = {
      artist: 12,
      album: 10,
      track: 8
    };
    
    // Make selected node larger
    const sizeMultiplier = selectedNode && selectedNode.id === node.id ? 1.5 : 1;
    
    return (baseSize[node.type] || 8) * sizeMultiplier;
  };

  const nodePaint = (node, ctx, globalScale) => {
    const label = node.label;
    const fontSize = Math.max(10, 12 / globalScale);
    const nodeSize = getNodeSize(node);
    
    // Draw node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
    ctx.fillStyle = getNodeColor(node);
    ctx.fill();
    
    // Draw border for selected node
    if (selectedNode && selectedNode.id === node.id) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Draw label
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#333';
    
    // Background for text readability
    const textWidth = ctx.measureText(label).width;
    const textHeight = fontSize;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillRect(
      node.x - textWidth / 2 - 4,
      node.y - nodeSize - textHeight / 2 - 2,
      textWidth + 8,
      textHeight + 4
    );
    
    // Draw text
    ctx.fillStyle = '#333';
    ctx.fillText(label, node.x, node.y - nodeSize - fontSize/2);
    
    // Draw type indicator
    const typeIndicator = node.type === 'artist' ? '♪' : node.type === 'album' ? '◉' : '•';
    ctx.font = `${fontSize * 0.8}px Sans-Serif`;
    ctx.fillStyle = getNodeColor(node);
    ctx.fillText(typeIndicator, node.x, node.y + nodeSize + fontSize/2);
  };

  const linkPaint = (link, ctx) => {
    const { source, target } = link;
    
    // Different colors for different link types
    ctx.strokeStyle = link.type === 'hierarchy' ? '#999' : '#ccc';
    ctx.lineWidth = link.type === 'hierarchy' ? 2 : 1;
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    
    // Draw arrow for hierarchy relationships
    if (link.type === 'hierarchy') {
      const arrowSize = 8;
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(angle);
      
      ctx.beginPath();
      ctx.moveTo(-arrowSize, -arrowSize/2);
      ctx.lineTo(0, 0);
      ctx.lineTo(-arrowSize, arrowSize/2);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      
      ctx.restore();
    }
  };

  if (combinedNodes.length === 0) {
    return (
      <div className="graph-container empty">
        <div className="empty-state">
          <h3>No Data</h3>
          <p>Search for artists, albums, or tracks to see the relationship graph</p>
        </div>
        
        <style jsx>{`
          .graph-container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #f8f9fa;
            border-radius: 8px;
            margin: 1rem;
          }
          
          .empty-state {
            text-align: center;
            color: #666;
          }
          
          .empty-state h3 {
            margin: 0 0 0.5rem 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="graph-container">
      <div className="graph-controls">
        <div className="legend">
          <div className="legend-item">
            <span className="legend-color artist"></span>
            Artists ({nodes.artists.length})
          </div>
          <div className="legend-item">
            <span className="legend-color album"></span>
            Albums ({nodes.albums.length})
          </div>
          <div className="legend-item">
            <span className="legend-color track"></span>
            Tracks ({nodes.tracks.length})
          </div>
        </div>
        
        <button 
          className="center-button"
          onClick={() => fgRef.current && fgRef.current.zoomToFit(400, 200)}
        >
          Center Graph
        </button>
      </div>
      
      <ForceGraph2D
        ref={fgRef}
        graphData={{ nodes: combinedNodes, links: allLinks }}
        nodeCanvasObject={nodePaint}
        linkCanvasObject={linkPaint}
        onNodeClick={handleNodeClick}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#fafafa"
        nodePointerAreaPaint={(node, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, getNodeSize(node), 0, 2 * Math.PI, false);
          ctx.fill();
        }}
        enableZoomInteraction={true}
        enablePanInteraction={true}
        cooldownTime={15000}
        cooldownTicks={100}
      />

      <style jsx>{`
        .graph-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin: 1rem;
          overflow: hidden;
        }

        .graph-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem;
          background: #f8f9fa;
          border-bottom: 1px solid #eee;
        }

        .legend {
          display: flex;
          gap: 1rem;
        }

        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
          color: #333;
        }

        .legend-color {
          width: 16px;
          height: 16px;
          border-radius: 50%;
        }

        .legend-color.artist {
          background: #667eea;
        }

        .legend-color.album {
          background: #4ecdc4;
        }

        .legend-color.track {
          background: #45b7d1;
        }

        .center-button {
          background: #667eea;
          color: white;
          border: none;
          padding: 0.5rem 1rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.9rem;
          transition: opacity 0.3s ease;
        }

        .center-button:hover {
          opacity: 0.9;
        }
      `}</style>
    </div>
  );
}

export default GraphView;