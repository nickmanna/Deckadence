#!/usr/bin/env python3
"""
Cloud-based Flask Backend API for Deckadence Track Analysis
Provides endpoints for uploading and analyzing audio files for multi-user cloud platform.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import json
import uuid
from datetime import datetime
from pathlib import Path
from trackanalysis import TrackAnalyzer
import traceback
from typing import Dict, Any, Optional

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configuration
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

# Mock database for tracks (in production, this would be MongoDB/Firestore)
tracks_collection = {}

# Mock cloud storage paths (in production, this would be Google Cloud Storage/AWS S3)
CLOUD_STORAGE_BASE = "gs://deckadence-audio-files"
WAVEFORM_STORAGE_BASE = "gs://deckadence-audio-files/waveforms"

def generate_track_id() -> str:
    """Generate a unique track ID."""
    return f"track_{uuid.uuid4().hex[:8]}"

def generate_storage_path(user_id: str, file_id: str, filename: str) -> str:
    """Generate cloud storage path for audio file."""
    extension = Path(filename).suffix
    return f"{CLOUD_STORAGE_BASE}/audio/{user_id}/{file_id}{extension}"

def generate_waveform_urls(track_id: str) -> Dict[str, str]:
    """Generate waveform URLs for cloud storage."""
    return {
        "previewUrl": f"{WAVEFORM_STORAGE_BASE}/{track_id}_preview.png",
        "detailUrl": f"{WAVEFORM_STORAGE_BASE}/{track_id}_detail.json"
    }

def create_track_document(
    track_id: str,
    user_id: str,
    file_id: str,
    filename: str,
    analysis_data: Dict[str, Any],
    storage_path: str
) -> Dict[str, Any]:
    """Create a track document following the new schema."""
    
    # Extract metadata from filename (in production, this would come from ID3 tags)
    title = Path(filename).stem
    artist = "Unknown Artist"  # Would be extracted from ID3 tags
    
    # Convert beatgrid to the new format
    beatgrid = []
    if 'beatgrid' in analysis_data and 'beats' in analysis_data['beatgrid']:
        for i, beat_time in enumerate(analysis_data['beatgrid']['beats'], 1):
            beatgrid.append({
                "beat": i,
                "time": int(beat_time * 1000),  # Convert to milliseconds
                "bpm": float(analysis_data['bpm']['value'])
            })
    
    # Generate waveform URLs
    waveform_urls = generate_waveform_urls(track_id)
    
    # Ensure all numeric values are JSON-serializable
    def convert_numpy_values(obj):
        if isinstance(obj, dict):
            return {key: convert_numpy_values(value) for key, value in obj.items()}
        elif isinstance(obj, list):
            return [convert_numpy_values(item) for item in obj]
        elif hasattr(obj, 'item'):  # numpy scalar
            return obj.item()
        elif hasattr(obj, 'tolist'):  # numpy array
            return obj.tolist()
        else:
            return obj
    
    track_doc = {
        "trackID": track_id,
        "storagePath": storage_path,
        "uploaderID": user_id,
        "title": title,
        "artist": artist,
        "duration": int(analysis_data['file_info']['duration']),
        "status": "ready",
        "bpm": float(analysis_data['bpm']['value']),
        "key": analysis_data['key']['note'],
        "camelotKey": analysis_data['key']['camelot'],
        "playCount": 0,
        "likeCount": 0,
        "beatGrid": beatgrid,
        "memoryCues": [],  # Would be populated from user interactions
        "waveforms": waveform_urls,
        "analysisMetadata": {
            "analysisDate": analysis_data['analysis_metadata']['analysis_date'],
            "analyzerVersion": analysis_data['analysis_metadata']['analyzer_version'],
            "confidence": {
                "bpm": analysis_data['bpm'].get('confidence', 0.95),
                "key": analysis_data['key'].get('confidence', 0.85)
            }
        }
    }
    
    return track_doc

@app.route('/api/analyze', methods=['POST'])
def analyze_track():
    """
    Analyze an uploaded audio file and return track document for cloud storage.
    """
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Get user ID from request (in production, this would come from authentication)
        user_id = request.form.get('userID', 'user_123')  # Default for testing
        
        # Check file extension
        allowed_extensions = {'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'}
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        if file_extension not in allowed_extensions:
            return jsonify({'error': f'Unsupported file format. Allowed: {", ".join(allowed_extensions)}'}), 400
        
        # Generate unique IDs
        track_id = generate_track_id()
        file_id = f"uniquefileid_{uuid.uuid4().hex[:8]}"
        
        # Save uploaded file temporarily for analysis
        with tempfile.NamedTemporaryFile(delete=False, suffix=f'.{file_extension}') as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
        
        try:
            # Analyze the track
            analyzer = TrackAnalyzer(temp_path)
            
            if not analyzer.analyze_track():
                return jsonify({'error': 'Track analysis failed'}), 500
            
            # Get analysis results
            analysis_data = analyzer.analysis_data
            
            # Generate cloud storage path
            storage_path = generate_storage_path(user_id, file_id, file.filename)
            
            # Create track document
            track_doc = create_track_document(
                track_id=track_id,
                user_id=user_id,
                file_id=file_id,
                filename=file.filename,
                analysis_data=analysis_data,
                storage_path=storage_path
            )
            
            # Add waveform data to the track document
            waveform_data = analyzer.prepare_waveform_data()
            track_doc['waveformData'] = waveform_data
            
            # Store in mock database (in production, this would be saved to MongoDB/Firestore)
            tracks_collection[track_id] = track_doc
            
            # Prepare response
            result = {
                'success': True,
                'trackID': track_id,
                'track': track_doc,
                'message': 'Track analyzed successfully'
            }
            return jsonify(result)
            
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_path)
            except:
                pass
        
    except Exception as e:
        print(f"Error analyzing track: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/api/tracks/<track_id>', methods=['GET'])
def get_track(track_id: str):
    """
    Get track information by track ID.
    """
    if track_id not in tracks_collection:
        return jsonify({'error': 'Track not found'}), 404
    
    return jsonify(tracks_collection[track_id])

@app.route('/api/tracks', methods=['GET'])
def list_tracks():
    """
    List all tracks (with optional filtering).
    """
    user_id = request.args.get('userID')
    
    if user_id:
        user_tracks = {k: v for k, v in tracks_collection.items() if v['uploaderID'] == user_id}
        return jsonify(list(user_tracks.values()))
    else:
        return jsonify(list(tracks_collection.values()))

@app.route('/api/tracks/<track_id>/play', methods=['POST'])
def increment_play_count(track_id: str):
    """
    Increment play count for a track.
    """
    if track_id not in tracks_collection:
        return jsonify({'error': 'Track not found'}), 404
    
    tracks_collection[track_id]['playCount'] += 1
    return jsonify({'success': True, 'playCount': tracks_collection[track_id]['playCount']})

@app.route('/api/tracks/<track_id>/like', methods=['POST'])
def toggle_like(track_id: str):
    """
    Toggle like status for a track.
    """
    if track_id not in tracks_collection:
        return jsonify({'error': 'Track not found'}), 404
    
    # In production, this would check if the user has already liked the track
    tracks_collection[track_id]['likeCount'] += 1
    return jsonify({'success': True, 'likeCount': tracks_collection[track_id]['likeCount']})

@app.route('/api/tracks/<track_id>/cues', methods=['POST'])
def add_memory_cue(track_id: str):
    """
    Add a memory cue to a track.
    """
    if track_id not in tracks_collection:
        return jsonify({'error': 'Track not found'}), 404
    
    data = request.get_json()
    cue = {
        "type": data.get('type', 'point'),  # 'point' or 'loop'
        "time": data['time'],  # in milliseconds
        "loopTime": data.get('loopTime'),  # for loop type
        "comment": data.get('comment', '')
    }
    
    tracks_collection[track_id]['memoryCues'].append(cue)
    return jsonify({'success': True, 'cue': cue})

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.
    """
    return jsonify({
        'status': 'healthy', 
        'message': 'Deckadence Cloud API is running',
        'tracks_count': len(tracks_collection)
    })

if __name__ == '__main__':
    print("Starting Deckadence Cloud Analysis API...")
    print("API will be available at: http://localhost:5000")
    print("Health check: http://localhost:5000/api/health")
    app.run(debug=False, host='0.0.0.0', port=5000)