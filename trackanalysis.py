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
# Only silence the specific noisy/harmless warnings we've actually seen from
# these libraries - a blanket ignore() was hiding real FutureWarnings (e.g.
# librosa.beat.tempo's deprecation) that are worth seeing during development.
warnings.filterwarnings('ignore', category=DeprecationWarning, module='audioread')

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
    
    @staticmethod
    def _clean_beat_times(beats: np.ndarray) -> np.ndarray:
        """
        Locally de-duplicate spurious double-detections and fill obvious
        dropped beats, using a rolling local-median interval as the
        reference instead of one global constant tempo. This deliberately
        does NOT reconstruct beat times by summing/integrating intervals -
        doing so compounds even tiny systematic bias into multi-second
        drift over a full track (verified empirically). Every beat that
        survives keeps its original, independently-detected timestamp;
        we only ever drop a spurious one or insert a single interpolated
        one into a genuine gap.
        """
        beats = list(beats)
        if len(beats) < 4:
            return np.array(beats)

        window = 8
        changed = True
        while changed:
            changed = False
            intervals = np.diff(beats)
            for i, iv in enumerate(intervals):
                lo = max(0, i - window // 2)
                hi = min(len(intervals), i + window // 2 + 1)
                local_median = np.median(intervals[lo:hi])
                if local_median <= 0:
                    continue
                if iv < 0.6 * local_median:
                    # Spurious extra detection - drop the later beat of the pair.
                    del beats[i + 1]
                    changed = True
                    break
                if iv > 1.6 * local_median:
                    # Likely missed beat - insert one at the expected local spacing.
                    beats.insert(i + 1, beats[i] + local_median)
                    changed = True
                    break

        return np.array(beats)

    def detect_bpm(self) -> float:
        """
        Detect beat locations directly from the onset envelope, clean up
        any spurious/missed detections, and report BPM from the actual
        detected spacing (not a separate tempo estimate that can disagree
        with the beats it supposedly describes).
        """
        print("Detecting BPM...")

        onset_env = librosa.onset.onset_strength(
            y=self.y_filtered,
            sr=self.sr,
            aggregate=np.mean,
            hop_length=512
        )

        # Letting beat_track estimate tempo internally (no forced bpm prior)
        # produces identical results to a separate two-step tempo-then-track
        # process on real material - verified empirically - so there's no
        # value in the extra step. Simpler is better here.
        _, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=self.sr,
            hop_length=512,
            trim=True,
            units='frames'
        )

        raw_beats = librosa.frames_to_time(beat_frames, sr=self.sr, hop_length=512)
        self.beats = self._clean_beat_times(raw_beats)

        if len(self.beats) > 1:
            # Median is robust to the residual per-beat jitter that's
            # inherent to onset-based tracking on real percussive material.
            median_interval = float(np.median(np.diff(self.beats)))
            self.tempo = round(60.0 / median_interval, 2) if median_interval > 0 else 0.0
        else:
            self.tempo = 0.0

        print(f"Detected BPM: {self.tempo} ({len(self.beats)} beats)")
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
        Build the beatgrid from the actual (cleaned) detected beat
        positions from detect_bpm() - NOT a synthetic grid extrapolated
        from a single anchor beat and one constant tempo.

        That extrapolation approach was measured (against real detected
        beats on real tracks) to drift by hundreds of milliseconds to
        several seconds by the end of a track, since any tiny mismatch
        between the assumed constant tempo and the track's actual pace
        compounds beat after beat. Using the real per-beat positions
        directly has no such compounding error - each position is
        independently anchored to actual audio evidence.
        """
        print("Generating beatgrid...")

        if self.beats is not None and len(self.beats) > 0:
            self.beatgrid = [float(b) for b in self.beats]
            print(f"Generated {len(self.beatgrid)} beatgrid markers from detected beats.")
        else:
            self.beatgrid = []
            print("Could not generate beatgrid: No beats were detected.")

        return self.beatgrid
    
    # Cap on the number of points shipped in waveform data. Firestore
    # documents have a hard 1 MiB limit; at the raw analysis frame rate
    # (~86 fps) a single 4-minute track's waveform arrays alone serialize
    # to nearly 2 MB - well over the limit, so every save of a real
    # (non-trivially-short) track was failing before this cap existed.
    # 1500 points is far more resolution than any on-screen waveform
    # actually needs (the frontend downsamples further for rendering
    # anyway) and keeps the payload in the tens of KB.
    WAVEFORM_TARGET_POINTS = 1500

    @staticmethod
    def _downsample_block_average(values: np.ndarray, target_points: int) -> np.ndarray:
        """Downsample by averaging contiguous blocks (not naive striding,
        which would just discard most of the signal and can skip
        transients entirely)."""
        values = np.asarray(values, dtype=float)
        n = len(values)
        if n <= target_points:
            return values

        edges = np.linspace(0, n, target_points + 1).astype(int)
        out = np.empty(target_points)
        for i in range(target_points):
            start, end = edges[i], edges[i + 1]
            out[i] = values[start:end].mean() if end > start else values[min(start, n - 1)]
        return out

    def generate_waveform_data(self) -> Dict:
        """
        Generate Rekordbox-style 3-band waveform data (overall amplitude
        plus separate low/mid/high energy per point), downsampled to a
        fixed point budget so the payload stays well within Firestore's
        per-document size limit regardless of track length.

        Returns:
            Dict: Waveform data with amplitude and frequency band information
        """
        print("Generating Rekordbox-style waveform data...")

        frame_length = 2048
        hop_length = 512

        rms = librosa.feature.rms(
            y=self.y,
            frame_length=frame_length,
            hop_length=hop_length
        )[0]
        rms_normalized = rms / np.max(rms) if np.max(rms) > 0 else rms

        times = librosa.times_like(rms, sr=self.sr, hop_length=hop_length)

        # 3-band frequency split (verified against librosa.mel_frequencies
        # for n_mels=128, fmax=sr/2=22050Hz):
        #   low  (mel bands  0-12):  ~0-378 Hz    - bass/kick
        #   mid  (mel bands 12-48):  ~378-1695 Hz - mid-range/vocals/snare
        #   high (mel bands 48-128): ~1695-22050 Hz - treble/hi-hats/cymbals
        mel_spec = librosa.feature.melspectrogram(
            y=self.y,
            sr=self.sr,
            hop_length=hop_length,
            n_mels=128
        )
        low_freq_range = (0, 12)
        mid_freq_range = (12, 48)
        high_freq_range = (48, 128)

        low_energy = np.mean(mel_spec[low_freq_range[0]:low_freq_range[1], :], axis=0)
        mid_energy = np.mean(mel_spec[mid_freq_range[0]:mid_freq_range[1], :], axis=0)
        high_energy = np.mean(mel_spec[high_freq_range[0]:high_freq_range[1], :], axis=0)

        from scipy.ndimage import gaussian_filter1d
        low_energy = gaussian_filter1d(low_energy, sigma=1)
        mid_energy = gaussian_filter1d(mid_energy, sigma=1)
        high_energy = gaussian_filter1d(high_energy, sigma=1)

        low_normalized = low_energy / np.max(low_energy) if np.max(low_energy) > 0 else low_energy
        mid_normalized = mid_energy / np.max(mid_energy) if np.max(mid_energy) > 0 else mid_energy
        high_normalized = high_energy / np.max(high_energy) if np.max(high_energy) > 0 else high_energy

        low_normalized = np.power(low_normalized, 0.7)
        mid_normalized = np.power(mid_normalized, 0.8)
        high_normalized = np.power(high_normalized, 0.9)

        min_length = min(len(times), len(rms_normalized), len(low_normalized), len(mid_normalized), len(high_normalized))

        target_points = min(self.WAVEFORM_TARGET_POINTS, min_length)
        ds_times = self._downsample_block_average(times[:min_length], target_points)
        ds_amplitudes = self._downsample_block_average(rms_normalized[:min_length], target_points)
        ds_low = self._downsample_block_average(low_normalized[:min_length], target_points)
        ds_mid = self._downsample_block_average(mid_normalized[:min_length], target_points)
        ds_high = self._downsample_block_average(high_normalized[:min_length], target_points)

        # Round to keep the JSON payload small - this is display data, not
        # something that needs float64 precision.
        waveform_data = {
            'times': np.round(ds_times, 4).tolist(),
            'amplitudes': np.round(ds_amplitudes, 4).tolist(),
            'frequency_bands': {
                'low': np.round(ds_low, 4).tolist(),
                'mid': np.round(ds_mid, 4).tolist(),
                'high': np.round(ds_high, 4).tolist()
            },
            'sample_rate': self.sr,
            'duration': len(self.y) / self.sr,
            'frame_length': frame_length,
            'hop_length': hop_length,
            'analysis_version': '2.1.0'
        }

        waveform_data['metadata'] = {
            'max_amplitude': float(np.max(ds_amplitudes)) if target_points else 0.0,
            'max_low': float(np.max(ds_low)) if target_points else 0.0,
            'max_mid': float(np.max(ds_mid)) if target_points else 0.0,
            'max_high': float(np.max(ds_high)) if target_points else 0.0,
            'total_frames': target_points,
            'original_frames': min_length,
            'frames_per_second': target_points / (len(self.y) / self.sr) if len(self.y) > 0 else 0.0
        }

        self.waveform_data = waveform_data
        print(f"Generated waveform data: {target_points} points (downsampled from {min_length} raw analysis frames)")

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
                'analyzer_version': '2.0.0',
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
