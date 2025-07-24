import { 
  collection, 
  doc, 
  addDoc, 
  getDocs, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';

// Collection names
const TRACKS_COLLECTION = 'tracks';
const USERS_COLLECTION = 'users';

export class TrackService {
  // Save a new track to Firestore
  static async saveTrack(trackData, userId) {
    try {
      // Create track document
      const trackDoc = {
        ...trackData,
        uploaderID: userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        status: 'ready',
        playCount: 0,
        likeCount: 0,
        memoryCues: []
      };

      // Add to Firestore
      console.log("about to add Doc");
      const docRef = await addDoc(collection(db, TRACKS_COLLECTION), trackDoc);
      console.log("Doc added");
      // Update user's track count
      await this.updateUserTrackCount(userId, 1);
      
      return {
        ...trackDoc,
        trackID: docRef.id
      };
    } catch (error) {
      console.error('Error saving track:', error);
      throw error;
    }
  }

  // Get all tracks for a user
  static async getUserTracks(userId) {
    try {
      const q = query(
        collection(db, TRACKS_COLLECTION),
        where('uploaderID', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const tracks = [];
      
      querySnapshot.forEach((doc) => {
        tracks.push({
          ...doc.data(),
          trackID: doc.id
        });
      });
      
      return tracks;
    } catch (error) {
      console.error('Error getting user tracks:', error);
      throw error;
    }
  }

  // Get a single track by ID
  static async getTrack(trackId) {
    try {
      const docRef = doc(db, TRACKS_COLLECTION, trackId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        return {
          ...docSnap.data(),
          trackID: docSnap.id
        };
      } else {
        throw new Error('Track not found');
      }
    } catch (error) {
      console.error('Error getting track:', error);
      throw error;
    }
  }

  // Update track data
  static async updateTrack(trackId, updates) {
    try {
      const docRef = doc(db, TRACKS_COLLECTION, trackId);
      await updateDoc(docRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating track:', error);
      throw error;
    }
  }

  // Delete a track
  static async deleteTrack(trackId, userId) {
    try {
      // Get track data first
      const track = await this.getTrack(trackId);
      
      // Verify ownership
      if (track.uploaderID !== userId) {
        throw new Error('Unauthorized to delete this track');
      }
      
      // Delete from Firestore
      await deleteDoc(doc(db, TRACKS_COLLECTION, trackId));
      
      // Update user's track count
      await this.updateUserTrackCount(userId, -1);
      
      // Delete associated files from storage if they exist
      if (track.storagePath) {
        try {
          const storageRef = ref(storage, track.storagePath);
          await deleteObject(storageRef);
        } catch (storageError) {
          console.warn('Could not delete storage file:', storageError);
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error deleting track:', error);
      throw error;
    }
  }

  // Increment play count
  static async incrementPlayCount(trackId) {
    try {
      const docRef = doc(db, TRACKS_COLLECTION, trackId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const currentPlayCount = docSnap.data().playCount || 0;
        await updateDoc(docRef, {
          playCount: currentPlayCount + 1,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error incrementing play count:', error);
      throw error;
    }
  }

  // Toggle like status
  static async toggleLike(trackId, userId) {
    try {
      const docRef = doc(db, TRACKS_COLLECTION, trackId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const track = docSnap.data();
        const likedBy = track.likedBy || [];
        const isLiked = likedBy.includes(userId);
        
        if (isLiked) {
          // Unlike
          const newLikedBy = likedBy.filter(id => id !== userId);
          await updateDoc(docRef, {
            likedBy: newLikedBy,
            likeCount: Math.max(0, (track.likeCount || 0) - 1),
            updatedAt: serverTimestamp()
          });
        } else {
          // Like
          const newLikedBy = [...likedBy, userId];
          await updateDoc(docRef, {
            likedBy: newLikedBy,
            likeCount: (track.likeCount || 0) + 1,
            updatedAt: serverTimestamp()
          });
        }
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      throw error;
    }
  }

  // Add memory cue
  static async addMemoryCue(trackId, cueData) {
    try {
      const docRef = doc(db, TRACKS_COLLECTION, trackId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const track = docSnap.data();
        const memoryCues = track.memoryCues || [];
        
        const newCue = {
          id: Date.now().toString(),
          ...cueData,
          createdAt: serverTimestamp()
        };
        
        await updateDoc(docRef, {
          memoryCues: [...memoryCues, newCue],
          updatedAt: serverTimestamp()
        });
        
        return newCue;
      }
    } catch (error) {
      console.error('Error adding memory cue:', error);
      throw error;
    }
  }

  // Remove memory cue
  static async removeMemoryCue(trackId, cueId) {
    try {
      const docRef = doc(db, TRACKS_COLLECTION, trackId);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const track = docSnap.data();
        const memoryCues = track.memoryCues || [];
        const updatedCues = memoryCues.filter(cue => cue.id !== cueId);
        
        await updateDoc(docRef, {
          memoryCues: updatedCues,
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error removing memory cue:', error);
      throw error;
    }
  }

  // Search tracks by various criteria
  static async searchTracks(userId, filters = {}) {
    try {
      let q = query(
        collection(db, TRACKS_COLLECTION),
        where('uploaderID', '==', userId)
      );
      
      // Add filters
      if (filters.bpmMin && filters.bpmMax) {
        q = query(q, where('bpm', '>=', filters.bpmMin), where('bpm', '<=', filters.bpmMax));
      }
      
      if (filters.key) {
        q = query(q, where('key', '==', filters.key));
      }
      
      if (filters.status) {
        q = query(q, where('status', '==', filters.status));
      }
      
      // Add ordering
      q = query(q, orderBy('createdAt', 'desc'));
      
      const querySnapshot = await getDocs(q);
      const tracks = [];
      
      querySnapshot.forEach((doc) => {
        tracks.push({
          ...doc.data(),
          trackID: doc.id
        });
      });
      
      return tracks;
    } catch (error) {
      console.error('Error searching tracks:', error);
      throw error;
    }
  }

  // Get user statistics
  static async getUserStats(userId) {
    try {
      const tracks = await this.getUserTracks(userId);
      
      const stats = {
        totalTracks: tracks.length,
        totalDuration: tracks.reduce((sum, track) => sum + (track.duration || 0), 0),
        averageBPM: tracks.length > 0 ? 
          tracks.reduce((sum, track) => sum + (track.bpm || 0), 0) / tracks.length : 0,
        totalPlays: tracks.reduce((sum, track) => sum + (track.playCount || 0), 0),
        totalLikes: tracks.reduce((sum, track) => sum + (track.likeCount || 0), 0),
        keyDistribution: {},
        bpmDistribution: {}
      };
      
      // Calculate key distribution
      tracks.forEach(track => {
        const key = track.key || 'Unknown';
        stats.keyDistribution[key] = (stats.keyDistribution[key] || 0) + 1;
      });
      
      // Calculate BPM distribution
      tracks.forEach(track => {
        const bpm = track.bpm || 0;
        if (bpm > 0) {
          const bpmRange = Math.floor(bpm / 10) * 10;
          const rangeKey = `${bpmRange}-${bpmRange + 9}`;
          stats.bpmDistribution[rangeKey] = (stats.bpmDistribution[rangeKey] || 0) + 1;
        }
      });
      
      return stats;
    } catch (error) {
      console.error('Error getting user stats:', error);
      throw error;
    }
  }

  // Update user's track count
  static async updateUserTrackCount(userId, increment) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const currentCount = userSnap.data().trackCount || 0;
        await updateDoc(userRef, {
          trackCount: Math.max(0, currentCount + increment),
          updatedAt: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error updating user track count:', error);
      throw error;
    }
  }

  // Upload file to Firebase Storage
  static async uploadFile(file, userId, fileName) {
    try {
      const fileExtension = fileName.split('.').pop();
      const uniqueFileName = `${userId}/${Date.now()}.${fileExtension}`;
      const storageRef = ref(storage, `audio/${uniqueFileName}`);
      
      const snapshot = await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(snapshot.ref);
      
      return {
        storagePath: `audio/${uniqueFileName}`,
        downloadURL
      };
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }

  // Get audio file from Firebase Storage
  static async getAudioFile(track) {
    try {
      let downloadURL;
      
      if (track.downloadURL) {
        downloadURL = track.downloadURL;
      } else if (track.storagePath) {
        // If we only have storage path, get the download URL first
        const storageRef = ref(storage, track.storagePath);
        downloadURL = await getDownloadURL(storageRef);
      } else {
        throw new Error('No audio file reference found');
      }
      
      // Use XMLHttpRequest to avoid CORS issues with Firebase Storage URLs
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', downloadURL, true);
        xhr.responseType = 'blob';
        
        xhr.onload = function() {
          if (xhr.status === 200) {
            const blob = xhr.response;
            const file = new File([blob], track.fileName || 'audio.mp3', { type: blob.type });
            resolve(file);
          } else {
            reject(new Error('Failed to fetch audio file'));
          }
        };
        
        xhr.onerror = function() {
          reject(new Error('Failed to fetch audio file'));
        };
        
        xhr.send();
      });
    } catch (error) {
      console.error('Error getting audio file:', error);
      throw error;
    }
  }
} 