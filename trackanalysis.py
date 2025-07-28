#!/usr/bin/env python3
"""
Track Analysis Program - Rekordbox-style Audio Analysis
Analyzes MP3/audio files for BPM, key, beatgrid, and generates colored waveforms.
"""

import os
import sys
import json
import numpy as np
import librosa
import librosa.display
import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib.colors import LinearSegmentedColormap
import argparse
from pathlib import Path
import pickle
from typing import Dict, List, Tuple, Optional, Any
import warnings
warnings.filterwarnings('ignore')

# Fix for scipy version compatibility
try:
    from scipy.signal import hann
except ImportError:
    try:
        from scipy.signal.windows import hann
    except ImportError:
        # Fallback: create a simple hann window
        def hann(M):
            return 0.5 * (1 - np.cos(2 * np.pi * np.arange(M) / (M - 1)))

import scipy.signal
if not hasattr(scipy.signal, 'hann'):
    scipy.signal.hann = hann

class TrackAnalyzer:
    """Main class for analyzing audio tracks in Rekordbox style."""
    
    def __init__(self, audio_path: str):
        """
        Initialize the analyzer with an audio file path.
        
        Args:
            audio_path: Path to the audio file to analyze
        """
        self.audio_path = Path(audio_path)
        self.sample_rate = 44100
        self.y = None
        self.y_filtered = None
        self.sr = None
        self.tempo = None
        self.beats = None
        self.key = None
        self.mode = None
        self.beatgrid = None
        self.waveform_data = None
        self.analysis_data = {}
        
        # Musical key mapping
        self.key_mapping = {
            0: 'C', 1: 'C#', 2: 'D', 3: 'D#', 4: 'E', 5: 'F',
            6: 'F#', 7: 'G', 8: 'G#', 9: 'A', 10: 'A#', 11: 'B'
        }
        
        # Camelot wheel mapping for DJ-friendly key notation
        self.camelot_wheel = {
            'C': '8B', 'C#': '3B', 'D': '10B', 'D#': '5B', 'E': '12B', 'F': '7B',
            'F#': '2B', 'G': '9B', 'G#': '4B', 'A': '11B', 'A#': '6B', 'B': '1B',
            'Am': '8A', 'A#m': '3A', 'Bm': '10A', 'Cm': '5A', 'C#m': '12A', 'Dm': '7A',
            'D#m': '2A', 'Em': '9A', 'Fm': '4A', 'F#m': '11A', 'Gm': '6A', 'G#m': '1A'
        }
    
    def load_audio(self) -> bool:
        """
        Load and resample audio file.
        
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            print(f"Loading audio file: {self.audio_path}")
            self.y, self.sr = librosa.load(str(self.audio_path), sr=self.sample_rate)
            b, a = scipy.signal.butter(2, 30, btype='highpass', fs=self.sr)
            self.y_filtered = scipy.signal.lfilter(b, a, self.y)
            print(f"Audio loaded successfully. Duration: {len(self.y)/self.sr:.2f} seconds")
            return True
        except Exception as e:
            print(f"Error loading audio file: {e}")
            return False
    
    def detect_bpm(self) -> float:
        """
        Detect BPM and beat locations using a robust, two-step process.
        """
        print("Detecting BPM...")
        
        # 1. Create a high-quality onset strength envelope
        # Using the pre-filtered audio is a great choice.
        onset_env = librosa.onset.onset_strength(
            y=self.y_filtered, 
            sr=self.sr, 
            aggregate=np.mean, 
            hop_length=512
        )

        # 2. Estimate tempo from the onset envelope using librosa's dedicated function
        # This is more reliable than iterating through start_bpm values.
        # The result is an array, so we take the first element.
        prior_tempo = librosa.beat.tempo(onset_envelope=onset_env, sr=self.sr, hop_length=512)[0]
        
        # 3. Find the beat locations, providing the detected tempo as a strong prior.
        # Using the 'bpm' argument makes the beat tracker stick closely to the estimated tempo.
        # We also get the beat frames to use later in the beatgrid.
        # We ask for 'frames' here, as it's more direct for later processing.
        tempo, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=self.sr,
            hop_length=512,
            bpm=prior_tempo, # Use the robustly estimated tempo
            tightness=100,   # Default tightness, can be tuned
            trim=True,       # Trim weak beats from start/end
            units='frames'   # Get beat locations as frame indices
        )

        # Store the detected beats (as timestamps) for the beatgrid
        self.beats = librosa.frames_to_time(beat_frames, sr=self.sr, hop_length=512)

        # Ensure tempo is a scalar float and round it
        final_tempo = tempo.item() if hasattr(tempo, 'item') else tempo
        self.tempo = round(final_tempo, 2)
        
        print(f"Detected BPM: {self.tempo}")
        return self.tempo
    
    def detect_key(self) -> Tuple[str, str]:
        """
        Detect musical key using enhanced chromagram analysis.
        """
        print("Detecting musical key...")
        
        chromagram = librosa.feature.chroma_cqt(
            y=self.y, 
            sr=self.sr,
            hop_length=512,
            bins_per_octave=12 * 3, # Use more bins for better resolution
            n_octaves=7
        )
        
        # Weight chromagram by RMS energy to focus on harmonically rich parts
        rms = librosa.feature.rms(y=self.y, hop_length=512)[0]
        # Ensure rms has same number of frames as chromagram
        rms_normalized = rms[:chromagram.shape[1]] / (np.max(rms) + 1e-6)
        
        # Weighted average of chroma features
        chroma_weighted = np.sum(chromagram * rms_normalized, axis=1)
        chroma_normalized = chroma_weighted / (np.sum(chroma_weighted) + 1e-6)

        # Krumhansl-Kessler key profiles
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        
        # Normalize profiles
        major_profile /= np.sum(major_profile)
        minor_profile /= np.sum(minor_profile)

        major_correlations = []
        minor_correlations = []
        
        for i in range(12):
            # To test for a key, we shift the song's chroma BACK to align with C
            # A roll of -1 shifts C# to C, D to C#, etc.
            rotated_chroma = np.roll(chroma_normalized, -i)
            
            major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
            minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]
            
            major_correlations.append(major_corr)
            minor_correlations.append(minor_corr)

        # Find best match
        best_major_idx = np.argmax(major_correlations)
        best_minor_idx = np.argmax(minor_correlations)
        
        if major_correlations[best_major_idx] > minor_correlations[best_minor_idx]:
            self.key = self.key_mapping[best_major_idx]
            self.mode = 'major'
        else:
            self.key = self.key_mapping[best_minor_idx]
            self.mode = 'minor'
            
        camelot_key = f"{self.key}{'m' if self.mode == 'minor' else ''}"
        camelot_notation = self.camelot_wheel.get(camelot_key, "N/A")
        
        print(f"Detected key: {self.key} {self.mode} (Camelot: {camelot_notation})")
        
        return self.key, self.mode
    
    def generate_beatgrid(self) -> List[float]:
        """
        Generate a perfectly regular beatgrid based on the detected BPM and first beat.
        """
        print("Generating beatgrid...")
        
        # We already calculated self.beats in detect_bpm(). No need to run beat_track again.
        
        beatgrid = []
        if self.beats is not None and len(self.beats) > 0 and self.tempo > 0:
            first_beat_time = self.beats[0]
            beat_interval = 60.0 / self.tempo
            track_duration = len(self.y) / self.sr
            
            # Generate grid extending forward and backward from the first detected beat
            # This creates a "quantized" grid, typical for DJ software.
            current_beat = first_beat_time
            while current_beat > 0:
                current_beat -= beat_interval
            current_beat += beat_interval # Step back into the track's timeframe

            while current_beat < track_duration:
                beatgrid.append(current_beat)
                current_beat += beat_interval

            self.beatgrid = beatgrid
            print(f"Generated {len(self.beatgrid)} beatgrid markers based on a perfect grid.")
        else:
            self.beatgrid = []
            print("Could not generate beatgrid: No beats were detected.")
            
        return self.beatgrid
    
    def generate_waveform_data(self) -> Dict:
        """
        Generate Rekordbox-style waveform data with offline analysis.
        Creates efficient pre-calculated data for real-time rendering.
        
        Returns:
            Dict: Waveform data with amplitude and frequency band information
        """
        print("Generating Rekordbox-style waveform data...")
        
        # Parameters for efficient analysis
        frame_length = 2048
        hop_length = 512        
        # Calculate RMS energy for overall amplitude
        rms = librosa.feature.rms(
            y=self.y, 
            frame_length=frame_length, 
            hop_length=hop_length
        )[0]
        
        # Normalize RMS
        rms_normalized = rms / np.max(rms) if np.max(rms) > 0 else rms
        
        # Create time axis
        times = librosa.times_like(rms, sr=self.sr, hop_length=hop_length)
        
        # Calculate 3-band frequency analysis (like Rekordbox)
        # Low frequencies (20Hz) - Bass
        # Mid frequencies (2500 Hz) - Midrange  
        # High frequencies (20020000- Treble
        
        # Extract frequency bands using mel spectrogram
        mel_spec = librosa.feature.melspectrogram(
            y=self.y, 
            sr=self.sr, 
            hop_length=hop_length,
            n_mels=128
        )
        
        # Define frequency band boundaries with better ranges
        low_freq_range = (0, 12)    # Mel bands 0-12 ≈20 Hz (bass)
        mid_freq_range = (12, 48)   # Mel bands 1248≈ 400-30(midrange)
        high_freq_range = (48,128)# Mel bands4828 ≈ 30002050 (treble)

        # Calculate energy for each frequency band
        low_energy = np.mean(mel_spec[low_freq_range[0]:low_freq_range[1], :], axis=0)
        mid_energy = np.mean(mel_spec[mid_freq_range[0]:mid_freq_range[1], :], axis=0)
        high_energy = np.mean(mel_spec[high_freq_range[0]:high_freq_range[1], :], axis=0)

        # Apply smoothing to reduce noise
        from scipy.ndimage import gaussian_filter1d
        low_energy = gaussian_filter1d(low_energy, sigma=1)
        mid_energy = gaussian_filter1d(mid_energy, sigma=1)
        high_energy = gaussian_filter1d(high_energy, sigma=1)

        # Normalize each band independently with better scaling
        low_normalized = low_energy / np.max(low_energy) if np.max(low_energy) > 0 else low_energy
        mid_normalized = mid_energy / np.max(mid_energy) if np.max(mid_energy) > 0 else mid_energy
        high_normalized = high_energy / np.max(high_energy) if np.max(high_energy) > 0 else high_energy

        # Apply power scaling to make differences more visible
        low_normalized = np.power(low_normalized, 0.7)  # Less aggressive for bass
        mid_normalized = np.power(mid_normalized, 0.8) # Moderate for mids
        high_normalized = np.power(high_normalized, 0.9) # More aggressive for highs

        # Ensure all arrays have the same length
        min_length = min(len(times), len(rms_normalized), len(low_normalized), len(mid_normalized), len(high_normalized))

        # Create optimized waveform data structure for efficient rendering
        waveform_data = {
            'times': times[:min_length].tolist(),
            'amplitudes': rms_normalized[:min_length].tolist(),
            'frequency_bands': {
                'low': low_normalized[:min_length].tolist(),    # Bass (Blue)
                'mid': mid_normalized[:min_length].tolist(),   # Midrange (Yellow/Amber)
                'high': high_normalized[:min_length].tolist()  # Treble (White)
            },
            'sample_rate': self.sr,
            'duration': len(self.y) / self.sr,
            'frame_length': frame_length,
            'hop_length': hop_length,
            'analysis_version': '2.0.0'
        }

        # Calculate additional metadata for efficient rendering
        waveform_data['metadata'] = {
            'max_amplitude': float(np.max(rms_normalized)),
            'max_low': float(np.max(low_normalized)),
            'max_mid': float(np.max(mid_normalized)),
            'max_high': float(np.max(high_normalized)),
            'total_frames': min_length,
            'frames_per_second': self.sr / hop_length
        }

        self.waveform_data = waveform_data
        print(f"Generated Rekordbox-style waveform data with {min_length} frames")
        print(f"Frequency bands: Low={len(low_normalized)}, Mid={len(mid_normalized)}, High={len(high_normalized)}")

        return waveform_data
    
    def prepare_analysis_data(self) -> Dict[str, Any]:
        """
        Prepare analysis data for cloud storage (no file creation).
        
        Returns:
            Dict: Analysis data dictionary
        """
        # Calculate actual duration
        actual_duration = len(self.y) / self.sr
        print(f"Actual audio duration: {actual_duration:.2f} seconds ({int(actual_duration//60)}:{int(actual_duration%60):02d})")
        
        # Prepare analysis data
        self.analysis_data = {
            'file_info': {
                'original_file': str(self.audio_path),
                'duration': actual_duration,
                'sample_rate': self.sr,
                'channels': 1 if len(self.y.shape) == 1 else self.y.shape[1]
            },
            'bpm': {
                'value': self.tempo,
                'confidence': 0.95  # Placeholder confidence score
            },
            'key': {
                'note': self.key,
                'mode': self.mode,
                'camelot': self.camelot_wheel.get(f"{self.key}{'m' if self.mode == 'minor' else ''}", ''),
                'confidence': 0.85  # Placeholder confidence score
            },
            'beatgrid': {
                'beats': self.beatgrid,
                'first_beat': self.beatgrid[0] if self.beatgrid else 0.0,
                'beat_interval': 60.0 / self.tempo if self.tempo else 0.0
            },
            'analysis_metadata': {
                'analyzer_version': '1.0.0',
                'analysis_date': str(np.datetime64('now')),
                'analysis_method': 'librosa'
            }
        }
        
        print("Analysis data prepared for cloud storage")
        return self.analysis_data
    
    def prepare_waveform_data(self) -> Dict[str, Any]:
        """
        Prepare waveform data for cloud storage (no file creation).
        
        Returns:
            Dict: Waveform data dictionary
        """
        # Convert waveform data to JSON-serializable format
        waveform_data = {
            'times': self.waveform_data['times'],
            'amplitudes': self.waveform_data['amplitudes'],
            'frequency_bands': self.waveform_data['frequency_bands'],
            'duration': self.waveform_data['duration'],
            'sample_rate': self.waveform_data['sample_rate'],
            'frame_length': self.waveform_data['frame_length'],
            'hop_length': self.waveform_data['hop_length'],
            'analysis_version': self.waveform_data['analysis_version'],
            'metadata': self.waveform_data['metadata']
        }
        
        print("Waveform data prepared for cloud storage")
        return waveform_data
    
    def analyze_track(self) -> bool:
        """
        Perform complete track analysis for cloud storage.
        
        Returns:
            bool: True if analysis was successful
        """
        print(f"\n=== Analyzing Track: {self.audio_path.name} ===\n")
        
        # Load audio
        if not self.load_audio():
            return False
        
        # Perform analysis
        self.detect_bpm()
        self.detect_key()
        self.generate_beatgrid()
        self.generate_waveform_data()
        
        # Prepare data for cloud storage (no file creation)
        self.prepare_analysis_data()
        self.prepare_waveform_data()
        
        print(f"\n=== Analysis Complete ===")
        print(f"BPM: {self.tempo}")
        print(f"Key: {self.key} {self.mode}")
        print(f"Beatgrid: {len(self.beatgrid)} beats")
        print(f"Analysis data prepared for cloud storage")
        
        return True

def main():
    """Main function to run track analysis from command line."""
    parser = argparse.ArgumentParser(description='Analyze audio tracks in Rekordbox style')
    parser.add_argument('audio_file', help='Path to audio file to analyze')
    parser.add_argument('--visualize', '-v', action='store_true', 
                       help='Create visualization of analysis results')
    parser.add_argument('--output', '-o', help='Output directory for analysis files')
    
    args = parser.parse_args()
    
    # Check if file exists
    if not os.path.exists(args.audio_file):
        print(f"Error: File {args.audio_file} not found")
        sys.exit(1)
    
    # Create analyzer
    analyzer = TrackAnalyzer(args.audio_file)
    
    # Perform analysis
    if analyzer.analyze_track():
        print("\nAnalysis completed successfully!")
        
        # Create visualization if requested
        if args.visualize:
            viz_path = Path(args.audio_file).with_suffix('.png')
            analyzer.visualize_analysis(str(viz_path))
    else:
        print("Analysis failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
