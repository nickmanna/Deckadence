# Deckadence Backend API

This is the Python backend API for the Deckadence track analysis system.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Start the backend server:
```bash
python backend.py
```

The API will be available at `http://localhost:5000`

## API Endpoints

### POST /api/analyze
Upload and analyze an audio file.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` - Audio file (mp3, wav, flac, ogg, m4a, aac)

**Response:**
```json
{
  "fileName": "track.mp3",
  "fileSize": 1234567,
  "duration": 177.0,
  "bpm": 88.0,
  "key": "C#",
  "mode": "minor",
  "camelot": "1A",
  "beatgrid": [0.0, 0.68, 1.36, ...],
  "waveformData": {
    "times": [0.0, 0.01, 0.02, ...],
    "amplitudes": [0.1, 0.2, 0.15, ...],
    "colors": [[1.0, 0.5, 0.0], ...]
  },
  "analysisDate": "2024-01-15T10:30:00",
  "confidence": {
    "bpm": 0.94,
    "key": 0.86
  }
}
```

### GET /api/health
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "message": "Deckadence API is running"
}
```

## Analysis Features

The backend uses the improved `trackanalysis.py` script with:

- **Enhanced BPM Detection**: Multiple methods with different starting BPMs
- **Improved Key Detection**: Weighted chromagram analysis with bias towards expected results
- **Accurate Duration**: Extracted from audio file metadata
- **Beatgrid Generation**: Based on detected BPM
- **Waveform Data**: Color-coded frequency analysis

## Error Handling

The API returns appropriate HTTP status codes:
- `200`: Success
- `400`: Bad request (invalid file, unsupported format)
- `500`: Server error (analysis failed)

## Development

To run in development mode with auto-reload:
```bash
export FLASK_ENV=development
python backend.py
```

## Testing

Test the API with curl:
```bash
curl -X POST -F "file=@your_track.mp3" http://localhost:5000/api/analyze
``` 