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
from typing import Dict, List, Tuple, Optional
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
            print(f"Audio loaded successfully. Duration: {len(self.y)/self.sr:.2f} seconds")
            return True
        except Exception as e:
            print(f"Error loading audio file: {e}")
            return False
    
    def detect_bpm(self) -> float:
        """
        Detect BPM using multiple methods for better accuracy.
        
        Returns:
            float: Detected BPM
        """
        print("Detecting BPM...")
        
        # Method 1: Onset strength with dynamic programming
        onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
        
        # Try different starting BPMs to find the best match
        start_bpms = [60, 70, 80, 90, 100, 110, 120, 123, 125, 130, 140, 150, 160, 170, 180]
        best_tempo = None
        best_score = -1
        
        for start_bpm in start_bpms:
            try:
                tempo, beats = librosa.beat.beat_track(
                    onset_envelope=onset_env,
                    sr=self.sr,
                    hop_length=512,
                    start_bpm=start_bpm,
                    units='time'
                )
                
                # Calculate how well the detected beats align with onset strength
                beat_times = librosa.frames_to_time(beats, sr=self.sr, hop_length=512)
                onset_times = librosa.times_like(onset_env, sr=self.sr, hop_length=512)
                
                # Score based on onset strength at beat times
                score = 0
                for beat_time in beat_times:
                    if beat_time < len(onset_times):
                        frame_idx = int(beat_time * self.sr / 512)
                        if frame_idx < len(onset_env):
                            score += onset_env[frame_idx]
                
                if score > best_score:
                    best_score = score
                    # Ensure tempo is a scalar value
                    if hasattr(tempo, 'item'):
                        best_tempo = tempo.item()
                    else:
                        best_tempo = tempo
                    
            except Exception as e:
                print(f"Warning: BPM detection failed for start_bpm={start_bpm}: {e}")
                continue
        
        # Method 2: Autocorrelation for tempo detection
        if best_tempo is None:
            print("Falling back to autocorrelation method...")
            try:
                tempo_ac, _ = librosa.beat.beat_track(
                    onset_envelope=onset_env,
                    sr=self.sr,
                    hop_length=512,
                    start_bpm=120.0
                )
                # Ensure tempo is a scalar value
                if hasattr(tempo_ac, 'item'):
                    best_tempo = tempo_ac.item()
                else:
                    best_tempo = tempo_ac
            except Exception as e:
                print(f"Fallback method failed: {e}")
        
        # Method 3: Use librosa's tempo detection with wider range
        if best_tempo is None or best_tempo < 60 or best_tempo > 200:
            print("Using wide-range tempo detection...")
            tempo_wide, _ = librosa.beat.beat_track(
                onset_envelope=onset_env,
                sr=self.sr,
                hop_length=512,
                start_bpm=120.0
            )
            # Ensure tempo is a scalar value
            if hasattr(tempo_wide, 'item'):
                best_tempo = tempo_wide.item()
            else:
                best_tempo = tempo_wide
        
        # Additional method: Use librosa's tempo detection directly
        if best_tempo is None:
            print("Using librosa's direct tempo detection...")
            best_tempo = librosa.beat.tempo(
                onset_envelope=onset_env,
                sr=self.sr,
                hop_length=512
            )[0]
        
        # Ensure best_tempo is a scalar value (not numpy array)
        if hasattr(best_tempo, 'item'):
            best_tempo = best_tempo.item()
        
        # Round to nearest 0.01 for precision
        self.tempo = round(best_tempo, 2)
        print(f"Detected BPM: {self.tempo}")
        
        # Print all correlation scores for debugging
        print("BPM detection scores:")
        for i, start_bpm in enumerate(start_bpms):
            if i < len(start_bpms):
                print(f"  Start BPM {start_bpm}: Score calculated")
        
        return self.tempo
    
    def detect_key(self) -> Tuple[str, str]:
        """
        Detect musical key using enhanced chromagram analysis.
        
        Returns:
            Tuple[str, str]: (key, mode) where mode is 'major' or 'minor'
        """
        print("Detecting musical key...")
        
        # Extract chromagram with different parameters for better accuracy
        chromagram = librosa.feature.chroma_cqt(
            y=self.y, 
            sr=self.sr,
            hop_length=512,
            bins_per_octave=12
        )
        
        # Use weighted average over time (give more weight to louder sections)
        rms = librosa.feature.rms(y=self.y, hop_length=512)[0]
        rms_normalized = rms / np.max(rms)
        
        # Weight chromagram by RMS energy
        weighted_chroma = np.zeros(12)
        for i in range(chromagram.shape[1]):
            if i < len(rms_normalized):
                weighted_chroma += chromagram[:, i] * rms_normalized[i]
        
        # Normalize
        weighted_chroma = weighted_chroma / np.sum(weighted_chroma)
        
        # Define enhanced key profiles (Krumhansl-Kessler profiles)
        major_profile = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
        minor_profile = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
        
        # Normalize profiles
        major_profile = major_profile / np.sum(major_profile)
        minor_profile = minor_profile / np.sum(minor_profile)
        
        # Calculate correlation for each key
        major_correlations = []
        minor_correlations = []
        
        for i in range(12):
            # Rotate chroma vector
            rotated_chroma = np.roll(weighted_chroma, i)
            rotated_chroma = rotated_chroma / np.sum(rotated_chroma)
            
            # Calculate correlations
            major_corr = np.corrcoef(rotated_chroma, major_profile)[0, 1]
            minor_corr = np.corrcoef(rotated_chroma, minor_profile)[0, 1]
            
            major_correlations.append(major_corr)
            minor_correlations.append(minor_corr)
        
        # Find best match
        best_major_idx = np.argmax(major_correlations)
        best_minor_idx = np.argmax(minor_correlations)
        best_major_corr = major_correlations[best_major_idx]
        best_minor_corr = minor_correlations[best_minor_idx]
        
        # No biases - let the algorithm work naturally
        # The biases were causing incorrect detection
        
        if best_major_corr > best_minor_corr:
            self.key = self.key_mapping[best_major_idx]
            self.mode = 'major'
        else:
            self.key = self.key_mapping[best_minor_idx]
            self.mode = 'minor'
        
        # Get Camelot notation
        camelot_key = f"{self.key}{'m' if self.mode == 'minor' else ''}"
        camelot_notation = self.camelot_wheel.get(camelot_key, f"{self.key}{'m' if self.mode == 'minor' else ''}")
        
        print(f"Detected key: {self.key} {self.mode} (Camelot: {camelot_notation})")
        print(f"Major correlation: {best_major_corr:.3f}, Minor correlation: {best_minor_corr:.3f}")
        
        # Print all key correlations for debugging
        print("Key detection correlations:")
        for i, key in enumerate(self.key_mapping.values()):
            if i < len(major_correlations):
                print(f"  {key} Major: {major_correlations[i]:.3f}, Minor: {minor_correlations[i]:.3f}")
        
        return self.key, self.mode
    
    def generate_beatgrid(self) -> List[float]:
        """
        Generate beatgrid timestamps.
        
        Returns:
            List[float]: List of beat timestamps in seconds
        """
        print("Generating beatgrid...")
        
        # Get onset strength
        onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
        
        # Detect beats
        self.beats = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=self.sr,
            hop_length=512,
            start_bpm=self.tempo,
            units='time'
        )[1]
        
        # Create beatgrid with consistent spacing
        beatgrid = []
        if len(self.beats) > 0 and self.tempo > 0:
            # Use detected tempo to create regular grid
            beat_interval = 60.0 / self.tempo
            print(f"Beat interval: {beat_interval:.3f} seconds")
            
            # Start from the first detected beat
            first_detected_beat = self.beats[0]
            print(f"First detected beat at: {first_detected_beat:.3f} seconds")
            
            # Backtrack to create beats before the first detected beat
            # Calculate how many beats we need to go back to reach 0 seconds
            beats_before_first = int(first_detected_beat / beat_interval)
            
            # Generate beats backwards from the first detected beat
            for i in range(beats_before_first, -1, -1):
                beat_time = first_detected_beat - (beats_before_first - i) * beat_interval
                if beat_time >= 0:  # Only add beats that are at or after 0 seconds
                    beatgrid.append(beat_time)
            
            # Generate beats forward from the first detected beat
            current_time = first_detected_beat + beat_interval
            while current_time <= len(self.y) / self.sr:
                beatgrid.append(current_time)
                current_time += beat_interval
            
            # Sort the beatgrid to ensure proper order
            beatgrid.sort()
            
            print(f"Beatgrid starting at: {beatgrid[0]:.3f} seconds")
            print(f"Generated {len(beatgrid)} beats (including {beats_before_first} beats before first detected beat)")
        
        self.beatgrid = beatgrid
        print(f"Generated {len(self.beatgrid)} beatgrid markers")
        
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
    
    def create_analysis_file(self) -> str:
        """
        Create .anlz file with analysis data.
        
        Returns:
            str: Path to the created analysis file
        """
        analysis_path = self.audio_path.with_suffix('.anlz')
        
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
        
        # Save as JSON
        with open(analysis_path, 'w') as f:
            json.dump(self.analysis_data, f, indent=2)
        
        print(f"Analysis data saved to: {analysis_path}")
        return str(analysis_path)
    
    def create_waveform_file(self) -> str:
        """
        Create .ext file with waveform data.
        
        Returns:
            str: Path to the created waveform file
        """
        waveform_path = self.audio_path.with_suffix('.ext')
        
        # Save waveform data as pickle for efficient storage
        with open(waveform_path, 'wb') as f:
            pickle.dump(self.waveform_data, f)
        
        print(f"Waveform data saved to: {waveform_path}")
        return str(waveform_path)
    
    def analyze_track(self) -> bool:
        """
        Perform complete track analysis.
        
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
        
        # Create output files
        analysis_file = self.create_analysis_file()
        waveform_file = self.create_waveform_file()
        
        print(f"\n=== Analysis Complete ===")
        print(f"BPM: {self.tempo}")
        print(f"Key: {self.key} {self.mode}")
        print(f"Beatgrid: {len(self.beatgrid)} beats")
        print(f"Analysis file: {analysis_file}")
        print(f"Waveform file: {waveform_file}")
        
        return True
    
    def visualize_analysis(self, save_path: Optional[str] = None):
        """
        Create visualization of the analysis results.
        
        Args:
            save_path: Optional path to save the visualization
        """
        if not self.waveform_data:
            print("No waveform data available for visualization")
            return
        
        # Create figure with subplots
        fig, (ax1, ax2, ax3) = plt.subplots(3, 1, figsize=(15, 10))
        fig.suptitle(f'Track Analysis: {self.audio_path.name}', fontsize=16)
        
        # Plot 1: Waveform with beatgrid
        times = np.array(self.waveform_data['times'])
        amplitudes = np.array(self.waveform_data['amplitudes'])
        
        # Create colored waveform
        for i in range(len(times) - 1):
            color = self.waveform_data['colors'][i]
            ax1.plot([times[i], times[i+1]], [amplitudes[i], amplitudes[i+1]], 
                    color=color, linewidth=1)
        
        # Add beatgrid markers
        if self.beatgrid:
            for beat in self.beatgrid:
                ax1.axvline(x=beat, color='red', alpha=0.7, linestyle='--', linewidth=0.5)
        
        ax1.set_title('Waveform with Beatgrid')
        ax1.set_ylabel('Amplitude')
        ax1.grid(True, alpha=0.3)
        
        # Plot 2: Spectral features
        spectral_centroid = librosa.feature.spectral_centroid(y=self.y, sr=self.sr)[0]
        spectral_times = librosa.times_like(spectral_centroid, sr=self.sr)
        ax2.plot(spectral_times, spectral_centroid, color='green', linewidth=1)
        ax2.set_title('Spectral Centroid')
        ax2.set_ylabel('Frequency (Hz)')
        ax2.grid(True, alpha=0.3)
        
        # Plot 3: Onset strength
        onset_env = librosa.onset.onset_strength(y=self.y, sr=self.sr)
        onset_times = librosa.times_like(onset_env, sr=self.sr)
        ax3.plot(onset_times, onset_env, color='orange', linewidth=1)
        ax3.set_title('Onset Strength')
        ax3.set_xlabel('Time (s)')
        ax3.set_ylabel('Strength')
        ax3.grid(True, alpha=0.3)
        
        # Add analysis info text
        info_text = f'BPM: {self.tempo}\nKey: {self.key} {self.mode}\nBeats: {len(self.beatgrid)}'
        fig.text(0.02, 0.02, info_text, fontsize=12, verticalalignment='bottom',
                bbox=dict(boxstyle='round', facecolor='wheat', alpha=0.8))
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            print(f"Visualization saved to: {save_path}")
        else:
            plt.show()


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
