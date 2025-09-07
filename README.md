#Placeholder# MixView Clone

A modern recreation of Zune's groundbreaking MixView feature, bringing intelligent music discovery and relationship visualization to today's streaming services.

## What is MixView?

MixView was a revolutionary feature in Microsoft's Zune music player that visualized the relationships between artists, albums, and tracks in an interactive network graph. It helped users discover new music by exploring connections between their favorite artists and related musicians, creating a serendipitous discovery experience that went far beyond simple recommendations.

This project recreates that magic using modern web technologies and freely available music services.

## Vision

Create an intelligent music discovery platform that:
- **Visualizes music relationships** in an interactive graph interface
- **Connects multiple music services** (Spotify, Last.fm, Discogs, Apple Music, MusicBrainz)
- **Provides zero-configuration setup** through an intuitive UI
- **Enables serendipitous discovery** of new artists and music
- **Respects user privacy** with local credential storage
- **Works across platforms** via modern web technologies

## Key Features

### Interactive Music Discovery
- **Graph Visualization**: Explore music relationships through interactive network graphs
- **Multi-Service Integration**: Aggregate data from multiple music platforms
- **Intelligent Search**: Find artists, albums, and tracks across all connected services
- **Relationship Mapping**: Discover similar artists, collaborations, and influences

### Seamless Setup Experience
- **Guided Configuration**: Step-by-step setup wizard for all music services
- **No Manual Editing**: All configuration happens through the UI
- **Secure Credential Storage**: Encrypted storage of API keys and OAuth tokens
- **Service Testing**: Built-in connection validation and troubleshooting

### Professional User Experience
- **Modern Interface**: Clean, responsive design built with React
- **Advanced Error Handling**: Detailed troubleshooting and recovery options
- **Real-time Updates**: Live data synchronization across services
- **Comprehensive Filtering**: Advanced search and filtering capabilities

## Supported Services

### Primary Integrations
- **Spotify**: Full OAuth integration for personal libraries and recommendations
- **Last.fm**: Rich metadata and scrobbling data integration
- **Discogs**: Comprehensive music release database access

### Built-in Services
- **Apple Music**: Search integration (no authentication required)
- **MusicBrainz**: Open music encyclopedia integration

### Extensible Architecture
The platform is designed to easily accommodate additional music services and APIs.

## Technical Architecture

### Backend
- **FastAPI**: High-performance Python web framework
- **PostgreSQL**: Robust relational database with full-text search
- **SQLAlchemy**: Modern ORM with relationship mapping
- **OAuth2/JWT**: Secure authentication and authorization
- **Docker**: Containerized deployment and development

### Frontend
- **React 18**: Modern component-based UI framework
- **Vite**: Fast build tool and development server
- **D3.js**: Interactive graph visualizations
- **CSS3**: Custom styling with responsive design

### Infrastructure
- **Docker Compose**: Multi-service orchestration
- **GitHub Actions**: Continuous integration (optional)
- **Nginx**: Reverse proxy and static file serving
- **SSL/TLS**: Secure HTTPS deployment

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Git
- Modern web browser

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/drmnet/mixview-clone.git
   cd mixview-clone
   ```

2. **Deploy the application**
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```

3. **Access the application**
   - Open http://localhost:3001 in your browser
   - Follow the setup wizard to configure your music services

### Configuration

The application uses a comprehensive setup wizard that guides you through:

1. **Account Creation**: Create your local MixView account
2. **Service Registration**: Get API keys and OAuth credentials from music services
3. **Service Configuration**: Connect and test your music service integrations
4. **Verification**: Confirm all services are working correctly

No manual file editing is required - everything is configured through the web interface.

## Development

### Architecture Overview

```
mixview/
├── backend/          # FastAPI application
│   ├── routes/       # API endpoints
│   ├── db_package/   # Database models and connection
│   └── services/     # Music service integrations
├── frontend/         # React application
│   ├── src/
│   │   ├── components/   # UI components
│   │   └── shared/       # Shared utilities
└── docker-compose.yml   # Service orchestration
```

### Development Workflow

1. **Local Development**: Use Docker Compose for consistent environment
2. **Hot Reloading**: Both frontend and backend support live reloading
3. **Database Migrations**: Automatic schema management
4. **Service Testing**: Built-in tools for API validation

### API Documentation

Once running, visit `http://localhost:8001/docs` for interactive API documentation.

## Contributing

### Core Principles

1. **Zero Manual Configuration**: All setup must be possible through the UI
2. **Privacy First**: User credentials stored locally with encryption
3. **Service Agnostic**: Support for multiple music platforms
4. **User Experience**: Intuitive, professional interface design

### Development Guidelines

- Follow existing code style and patterns
- Add tests for new features
- Update documentation for API changes
- Ensure all configuration remains UI-based

### Adding New Music Services

The platform is designed for extensibility. To add a new service:

1. Create service integration in `backend/services/`
2. Add database models for service-specific data
3. Implement OAuth or API key authentication
4. Create frontend setup component
5. Add service to the setup wizard flow

## Deployment

### Production Deployment

1. **Server Requirements**
   - Docker and Docker Compose
   - 2GB+ RAM recommended
   - SSL certificate for HTTPS

2. **Environment Configuration**
   - All secrets managed through setup wizard
   - Database automatically initialized
   - Services auto-configured on first run

3. **Monitoring**
   - Application logs via Docker Compose
   - Health check endpoints
   - Service status monitoring

### Security Considerations

- All user credentials encrypted at rest
- JWT tokens for secure API access
- HTTPS required for production
- OAuth state validation
- Input sanitization and validation

## Music Service Setup Guides

### Spotify Integration
1. Visit [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/)
2. Create a new application
3. Configure redirect URI: `https://yourdomain.com/oauth/spotify/callback`
4. Copy Client ID and Client Secret to MixView setup wizard

### Last.fm Integration
1. Visit [Last.fm API Account Creation](https://www.last.fm/api/account/create)
2. Fill out the application form
3. Copy the API key to MixView setup wizard

### Discogs Integration
1. Visit [Discogs Developer Settings](https://www.discogs.com/settings/developers)
2. Generate a personal access token
3. Copy the token to MixView setup wizard

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- **Microsoft Zune Team**: For the original MixView concept and inspiration
- **Music Service Providers**: Spotify, Last.fm, Discogs, Apple Music, MusicBrainz
- **Open Source Community**: For the tools and libraries that make this possible

## Support

For questions, issues, or contributions:
- **GitHub Issues**: Report bugs and request features
- **Discussions**: Share ideas and get help from the community
- **Documentation**: Comprehensive guides in the `/docs` directory

---

**Experience music discovery the way it was meant to be.**