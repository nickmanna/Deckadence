# Track Analysis Program - Rekordbox Style

This program analyzes audio files (MP3, WAV, FLAC, etc.) and extracts key information similar to Pioneer DJ's Rekordbox software, including BPM, musical key, beatgrid, and colored waveform data.

## Features

- **BPM Detection**: Accurate tempo detection using onset strength analysis
- **Key Detection**: Musical key detection with both traditional notation and Camelot wheel notation
- **Beatgrid Generation**: Creates precise beat markers throughout the track
- **Colored Waveform**: Generates frequency-based colored waveform data
- **Analysis Files**: Creates `.anlz` files with analysis data (JSON format)
- **Waveform Files**: Creates `.ext` files with colored waveform data (pickle format)
- **Visualization**: Optional visualization of analysis results

## Installation

1. Install Python 3.7 or higher
2. Install required dependencies:

```bash
pip install -r requirements.txt
```

## Usage

### Command Line Usage

Basic analysis:
```bash
python trackanalysis.py path/to/your/audio/file.mp3
```

With visualization:
```bash
python trackanalysis.py path/to/your/audio/file.mp3 --visualize
```

### Programmatic Usage

```python
from trackanalysis import TrackAnalyzer

# Create analyzer
analyzer = TrackAnalyzer("path/to/your/audio/file.mp3")

# Perform complete analysis
if analyzer.analyze_track():
    print(f"BPM: {analyzer.tempo}")
    print(f"Key: {analyzer.key} {analyzer.mode}")
    print(f"Beatgrid: {len(analyzer.beatgrid)} beats")

# Create visualization
analyzer.visualize_analysis("output.png")
```

## Output Files

### .anlz Files (Analysis Data)
JSON files containing:
- File information (duration, sample rate, channels)
- BPM with confidence score
- Musical key (note, mode, Camelot notation)
- Beatgrid data (beat timestamps, first beat, beat interval)
- Analysis metadata

Example `.anlz` file structure:
```json
{
  "file_info": {
    "original_file": "track.mp3",
    "duration": 180.5,
    "sample_rate": 44100,
    "channels": 1
  },
  "bpm": {
    "value": 128.0,
    "confidence": 0.95
  },
  "key": {
    "note": "A",
    "mode": "minor",
    "camelot": "8A",
    "confidence": 0.85
  },
  "beatgrid": {
    "beats": [0.0, 0.46875, 0.9375, ...],
    "first_beat": 0.0,
    "beat_interval": 0.46875
  },
  "analysis_metadata": {
    "analyzer_version": "1.0.0",
    "analysis_date": "2024-01-01T12:00:00",
    "analysis_method": "librosa"
  }
}
```

### .ext Files (Waveform Data)
Pickle files containing:
- Time points
- Amplitude values
- Color data (frequency-based coloring)
- Sample rate and duration

## Color Coding

The waveform uses frequency-based color coding:
- **Red to Orange**: Low frequencies (bass)
- **Green to Yellow**: Mid frequencies (mids)
- **Blue to Cyan**: High frequencies (treble)

## Supported Audio Formats

- MP3
- WAV
- FLAC
- OGG
- M4A
- And other formats supported by librosa

## Technical Details

### BPM Detection
Uses librosa's onset strength analysis with dynamic programming for accurate tempo detection.

### Key Detection
Implements Krumhansl-Kessler key profiles with chromagram analysis for both major and minor keys.

### Beatgrid Generation
Creates regular beat markers based on detected BPM, aligned with actual beat onsets.

### Waveform Generation
Uses RMS energy for amplitude and spectral centroid for frequency-based color mapping.

## Error Handling

The program includes comprehensive error handling for:
- Invalid audio files
- Corrupted files
- Unsupported formats
- Memory issues with large files

## Performance

- Typical analysis time: 10-30 seconds for a 3-5 minute track
- Memory usage: ~2-3x the audio file size during analysis
- Output files: ~1-5% of original audio file size

## Limitations

- Works best with electronic music and clear rhythmic content
- Key detection accuracy varies with complex harmonic content
- Large files (>100MB) may require more memory
- Real-time analysis not supported (batch processing only)

## Troubleshooting

### Common Issues

1. **"No module named 'librosa'"**
   - Install dependencies: `pip install -r requirements.txt`

2. **"Error loading audio file"**
   - Check file format is supported
   - Ensure file is not corrupted
   - Try converting to WAV format

3. **"Analysis failed"**
   - Check audio file has sufficient length (>10 seconds)
   - Ensure file has clear rhythmic content
   - Try with different audio file

### Performance Tips

- Use SSD storage for faster file I/O
- Close other applications to free memory
- For batch processing, analyze files sequentially

## License

This program is provided as-is for educational and personal use. 