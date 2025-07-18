#!/usr/bin/env python3
"""
Flask Backend API for Deckadence Track Analysis
Provides endpoints for uploading and analyzing audio files.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import json
from pathlib import Path
from trackanalysis import TrackAnalyzer
import traceback

app = Flask(__name__)
CORS(app)  # Enable CORS for React frontend

# Configure upload folder
UPLOAD_FOLDER = 'uploads'
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max file size

@app.route('/api/analyze', methods=['POST'])
def analyze_track():
    """
    Analyze an uploaded audio file and return analysis results.
    """
    try:
        # Check if file was uploaded
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Check file extension
        allowed_extensions = {'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac'}
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        if file_extension not in allowed_extensions:
            return jsonify({'error': f'Unsupported file format. Allowed: {", ".join(allowed_extensions)}'}), 400
        
        # Save uploaded file temporarily
        temp_path = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
        file.save(temp_path)
        
        # Analyze the track (now generates all color schemes)
        analyzer = TrackAnalyzer(temp_path)
        
        if not analyzer.analyze_track():
            return jsonify({'error': 'Track analysis failed'}), 500
        
        # Get analysis results
        analysis_data = analyzer.analysis_data
        
        # Convert numpy values to Python types for JSON serialization
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
        
        # Prepare response with analysis data
        result = {
            'fileName': file.filename,
            'fileSize': os.path.getsize(temp_path),
            'duration': convert_numpy_values(analysis_data['file_info']['duration']),
            'bpm': convert_numpy_values(analysis_data['bpm']['value']),
            'key': analysis_data['key']['note'],
            'mode': analysis_data['key']['mode'],
            'camelot': analysis_data['key']['camelot'],
            'beatgrid': convert_numpy_values(analysis_data['beatgrid']['beats']),
            'waveformData': convert_numpy_values(analyzer.waveform_data),  # Waveform data
            'analysisDate': analysis_data['analysis_metadata']['analysis_date'],
            'confidence': {
                'bpm': 0.95,  # High confidence for BPM detection
                'key': 0.85   # Good confidence for key detection
            }
        }
        
        # Clean up temporary file
        try:
            os.remove(temp_path)
        except:
            pass
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error analyzing track: {str(e)}")
        print(traceback.format_exc())
        return jsonify({'error': f'Analysis failed: {str(e)}'}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """
    Health check endpoint.
    """
    return jsonify({'status': 'healthy', 'message': 'Deckadence API is running'})

if __name__ == '__main__':
    print("Starting Deckadence Analysis API...")
    print("API will be available at: http://localhost:5000")
    print("Health check: http://localhost:5000/api/health")
    app.run(debug=False, host='0.0.0.0', port=5000)