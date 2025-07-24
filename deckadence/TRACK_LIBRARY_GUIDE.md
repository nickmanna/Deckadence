# Track Library & Data Storage Implementation Guide

## Overview
This guide covers the implementation of track library management and data storage using Firebase Firestore for the Deckadence application.

## Features Implemented

### ✅ Track Management
- **Cloud Storage**: Tracks saved to Firestore with user ownership
- **Track Upload**: Audio files uploaded to Firebase Storage
- **Track Analysis**: Backend analysis results stored in Firestore
- **Track Retrieval**: Load user tracks from Firestore
- **Track Updates**: Update track metadata and statistics
- **Track Deletion**: Remove tracks with storage cleanup

### ✅ User Library
- **Personal Library**: Each user has their own track collection
- **Track Statistics**: Play counts, like counts, user stats
- **Memory Cues**: Add/remove DJ cues for tracks
- **Search & Filter**: Filter by BPM, key, status
- **Sorting**: Sort by name, BPM, key, duration, date

### ✅ Data Security
- **User Isolation**: Users can only access their own tracks
- **Firestore Rules**: Secure access control
- **Storage Rules**: Protected file access
- **Authentication Required**: Must be logged in to save tracks

## Database Schema

### Tracks Collection
```javascript
{
  trackID: "auto-generated-id",
  uploaderID: "user-uid",
  title: "Track Title",
  artist: "Artist Name",
  duration: 284, // seconds
  status: "ready", // ready, processing, error
  bpm: 172.01,
  key: "Fm",
  camelotKey: "4A",
  playCount: 0,
  likeCount: 0,
  likedBy: ["user1", "user2"], // array of user IDs
  beatGrid: [
    { beat: 1, time: 500, bpm: 172.01 },
    { beat: 2, time: 848, bpm: 172.01 }
  ],
  memoryCues: [
    {
      id: "cue-id",
      type: "point", // point or loop
      time: 32500, // milliseconds
      loopTime: null, // for loop type
      comment: "First drop vocal",
      createdAt: timestamp
    }
  ],
  waveforms: {
    previewUrl: "gs://.../preview.png",
    detailUrl: "gs://.../detail.json"
  },
  waveformData: {
    times: [...],
    amplitudes: [...],
    frequency_bands: { low: [...], mid: [...], high: [...] }
  },
  analysisMetadata: {
    analysisDate: timestamp,
    analyzerVersion: "1.0.0",
    confidence: { bpm: 0.95, key: 0.85 }
  },
  createdAt: timestamp,
  updatedAt: timestamp
}
```

### Users Collection
```javascript
{
  uid: "user-uid",
  email: "user@example.com",
  displayName: "User Name",
  photoURL: "https://...",
  trackCount: 15,
  createdAt: timestamp,
  lastLogin: timestamp,
  isGuest: false
}
```

## File Structure

### Services
- **`src/services/trackService.js`**: Main service for track operations
- **`src/contexts/AuthContext.js`**: Authentication and user management

### Components Updated
- **`src/components/AudioUploader.js`**: Save tracks to Firestore
- **`src/components/Dashboard.js`**: Load tracks from Firestore
- **`src/components/TrackLibrary.js`**: Display Firestore tracks

## Usage Examples

### Saving a Track
```javascript
import { TrackService } from '../services/trackService';

// After analysis is complete
const trackData = {
  title: "Track Title",
  artist: "Artist Name",
  duration: 284,
  bpm: 172.01,
  key: "Fm",
  camelotKey: "4A",
  beatGrid: [...],
  waveformData: {...}
};

const savedTrack = await TrackService.saveTrack(trackData, currentUser.uid);
```

### Loading User Tracks
```javascript
// Load all user tracks
const tracks = await TrackService.getUserTracks(currentUser.uid);

// Search with filters
const filteredTracks = await TrackService.searchTracks(currentUser.uid, {
  bpmMin: 120,
  bpmMax: 140,
  key: "C"
});
```

### Updating Track Statistics
```javascript
// Increment play count
await TrackService.incrementPlayCount(trackId);

// Toggle like
await TrackService.toggleLike(trackId, currentUser.uid);

// Add memory cue
await TrackService.addMemoryCue(trackId, {
  type: "point",
  time: 32500,
  comment: "First drop"
});
```

## Firestore Security Rules

### Tracks Collection
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own tracks
    match /tracks/{trackId} {
      allow read, write: if request.auth != null && 
        resource.data.uploaderID == request.auth.uid;
    }
    
    // Users can read/write their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId;
    }
  }
}
```

### Storage Rules
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Users can access their own audio files
    match /audio/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId;
    }
    
    // Users can access their own waveform files
    match /waveforms/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && 
        request.auth.uid == userId;
    }
  }
}
```

## Track Service Methods

### Core Operations
- `saveTrack(trackData, userId)` - Save new track
- `getUserTracks(userId)` - Get all user tracks
- `getTrack(trackId)` - Get single track
- `updateTrack(trackId, updates)` - Update track data
- `deleteTrack(trackId, userId)` - Delete track and files

### Statistics & Interactions
- `incrementPlayCount(trackId)` - Increment play counter
- `toggleLike(trackId, userId)` - Toggle like status
- `addMemoryCue(trackId, cueData)` - Add DJ cue
- `removeMemoryCue(trackId, cueId)` - Remove DJ cue

### Search & Analytics
- `searchTracks(userId, filters)` - Search with filters
- `getUserStats(userId)` - Get user statistics
- `uploadFile(file, userId, fileName)` - Upload to storage

## User Statistics

The system automatically calculates and maintains:
- **Total Tracks**: Number of tracks in library
- **Total Duration**: Combined duration of all tracks
- **Average BPM**: Mean BPM across all tracks
- **Total Plays**: Combined play count
- **Total Likes**: Combined like count
- **Key Distribution**: Count of tracks by musical key
- **BPM Distribution**: Count of tracks by BPM range

## Error Handling

### Common Error Scenarios
1. **Authentication Required**: User must be logged in
2. **Permission Denied**: User can't access other users' tracks
3. **Storage Quota**: Firebase Storage limits
4. **Network Issues**: Connection problems
5. **Invalid Data**: Malformed track data

### Error Recovery
- Automatic retry for network issues
- Graceful degradation for missing data
- User-friendly error messages
- Fallback to local storage when needed

## Performance Optimizations

### Data Loading
- **Lazy Loading**: Load tracks on demand
- **Pagination**: Load tracks in batches
- **Caching**: Cache frequently accessed data
- **Indexing**: Optimize Firestore queries

### File Management
- **Compression**: Compress audio files
- **CDN**: Use Firebase CDN for fast delivery
- **Cleanup**: Remove unused files
- **Optimization**: Optimize file formats

## Testing

### Unit Tests
```javascript
// Test track saving
test('should save track to Firestore', async () => {
  const trackData = { title: 'Test Track', bpm: 120 };
  const savedTrack = await TrackService.saveTrack(trackData, 'user123');
  expect(savedTrack.trackID).toBeDefined();
});

// Test track retrieval
test('should get user tracks', async () => {
  const tracks = await TrackService.getUserTracks('user123');
  expect(Array.isArray(tracks)).toBe(true);
});
```

### Integration Tests
- Test complete upload flow
- Test track library loading
- Test search and filtering
- Test user statistics

## Monitoring & Analytics

### Firebase Analytics
- Track upload events
- Track play events
- User engagement metrics
- Error tracking

### Performance Monitoring
- Query performance
- Storage usage
- Network latency
- Error rates

## Future Enhancements

### Planned Features
1. **Playlists**: Create and manage track playlists
2. **Sharing**: Share tracks with other users
3. **Collaboration**: Collaborative playlists
4. **Advanced Search**: Full-text search
5. **Batch Operations**: Bulk import/export
6. **Sync**: Offline sync capabilities

### Technical Improvements
1. **Real-time Updates**: Live track updates
2. **Advanced Caching**: Smart caching strategies
3. **Background Processing**: Async track processing
4. **API Rate Limiting**: Prevent abuse
5. **Data Migration**: Version migration tools

## Troubleshooting

### Common Issues

1. **"Permission denied" errors**
   - Check Firestore security rules
   - Verify user authentication
   - Ensure user owns the track

2. **Tracks not loading**
   - Check network connection
   - Verify Firestore indexes
   - Check user authentication status

3. **Upload failures**
   - Check storage quota
   - Verify file format
   - Check storage security rules

4. **Performance issues**
   - Optimize queries with indexes
   - Implement pagination
   - Use caching strategies

### Debug Tools
- Firebase Console for monitoring
- Browser DevTools for network issues
- Firestore logs for query performance
- Storage logs for file operations

## Best Practices

### Data Management
- Always validate data before saving
- Use transactions for related operations
- Implement proper error handling
- Clean up unused data

### Security
- Never trust client-side data
- Use security rules for access control
- Validate user permissions
- Sanitize user inputs

### Performance
- Use appropriate indexes
- Implement pagination
- Cache frequently accessed data
- Optimize file sizes

### User Experience
- Show loading states
- Provide clear error messages
- Implement retry mechanisms
- Use optimistic updates 