# Deckadence Cloud Architecture

## Overview
Deckadence has been transformed from a single-user desktop application to a multi-user cloud-based web platform. This document outlines the new architecture and data schema.

## Key Changes

### 1. Cloud-Based Storage
- **Audio Files**: Stored in cloud storage (Google Cloud Storage/AWS S3)
- **Analysis Data**: Stored in cloud database (MongoDB/Firestore)
- **Waveforms**: Pre-rendered images and JSON data stored in cloud storage

### 2. Multi-User Support
- User authentication and authorization
- User-specific track collections
- Shared playlists and social features

### 3. New Data Schema

#### Track Collection Schema
```json
{
  "trackID": "track_abc123",
  "storagePath": "gs://deckadence-audio-files/audio/user_123/uniquefileid_1.mp3",
  "uploaderID": "user_123",
  "title": "Solaris",
  "artist": "Mefjus & Camo & Krooked",
  "duration": 284,
  "status": "ready",
  "bpm": 172.01,
  "key": "Fm",
  "camelotKey": "4A",
  "playCount": 4501,
  "likeCount": 892,
  "beatGrid": [
    { "beat": 1, "time": 500, "bpm": 172.01 },
    { "beat": 2, "time": 848, "bpm": 172.01 }
  ],
  "memoryCues": [
    {
      "type": "point",
      "time": 32500,
      "loopTime": null,
      "comment": "First drop vocal"
    }
  ],
  "waveforms": {
    "previewUrl": "gs://deckadence-audio-files/waveforms/track_abc_preview.png",
    "detailUrl": "gs://deckadence-audio-files/waveforms/track_abc_detail.json"
  },
  "analysisMetadata": {
    "analysisDate": "2024-01-15T10:30:00Z",
    "analyzerVersion": "1.0.0",
    "confidence": {
      "bpm": 0.95,
      "key": 0.85
    }
  }
}
```

## API Endpoints

### Track Analysis
- `POST /api/analyze` - Upload and analyze audio file
- `GET /api/tracks/<track_id>` - Get track information
- `GET /api/tracks` - List tracks (with optional user filtering)

### Track Management
- `POST /api/tracks/<track_id>/play` - Increment play count
- `POST /api/tracks/<track_id>/like` - Toggle like status
- `POST /api/tracks/<track_id>/cues` - Add memory cue

### System
- `GET /api/health` - Health check

## Backend Changes

### 1. File Handling
- **Before**: Created local `.anlz` and `.ext` files
- **After**: Prepares data for cloud storage, no local file creation

### 2. Data Storage
- **Before**: Local file system
- **After**: Cloud storage + database

### 3. User Management
- **Before**: Single user
- **After**: Multi-user with user IDs and permissions

## Frontend Integration

### Upload Process
1. User selects audio file
2. Frontend sends file + userID to `/api/analyze`
3. Backend analyzes file and creates track document
4. Returns track data for frontend display

### Track Display
1. Frontend fetches track list from `/api/tracks`
2. Displays track information and waveforms
3. Handles play/like interactions

## Cloud Storage Structure

```
gs://deckadence-audio-files/
├── audio/
│   └── user_123/
│       ├── uniquefileid_1.mp3
│       └── uniquefileid_2.wav
└── waveforms/
    ├── track_abc_preview.png
    ├── track_abc_detail.json
    ├── track_def_preview.png
    └── track_def_detail.json
```

## Database Collections

### Tracks Collection
- Stores track metadata and analysis results
- Indexed by trackID and uploaderID
- Supports queries by user, BPM range, key, etc.

### Users Collection (Future)
- User profiles and preferences
- Authentication data
- Playlists and favorites

## Security Considerations

1. **File Upload**: Validate file types and sizes
2. **User Authentication**: Implement proper auth system
3. **Data Access**: User can only access their own tracks
4. **Cloud Storage**: Secure bucket permissions

## Performance Optimizations

1. **Waveform Caching**: Pre-render waveform images
2. **CDN**: Use CDN for waveform images
3. **Database Indexing**: Index frequently queried fields
4. **Lazy Loading**: Load detailed waveform data on demand

## Migration Path

1. **Phase 1**: Implement cloud backend (current)
2. **Phase 2**: Add user authentication
3. **Phase 3**: Implement cloud storage integration
4. **Phase 4**: Add social features and playlists

## Development Setup

1. Install dependencies: `pip install -r requirements.txt`
2. Start backend: `python backend.py`
3. Backend runs on: `http://localhost:5000`
4. Health check: `http://localhost:5000/api/health`

## Testing

Use the provided test endpoints to verify functionality:
- Upload a track and check the returned track document
- Verify track listing and filtering
- Test play count and like functionality 