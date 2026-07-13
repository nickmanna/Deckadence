import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthContext';
import { TrackCacheProvider } from '../contexts/TrackCacheContext';
import Layout from './Layout';
import DiscoverPage from './DiscoverPage';
import TrackAnalysisPage from './TrackAnalysisPage';
import TrackLibraryPage from './TrackLibraryPage';
import GreenRoom from './GreenRoom';
import ComingSoon from './ComingSoon';
import Terms from './Terms';
import Privacy from './Privacy';
import { FEATURES } from '../config/features';
import './App.css';

const App = () => {
  return (
    <Router>
      <AuthProvider>
        <TrackCacheProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<DiscoverPage />} />
              <Route path="/library" element={<TrackLibraryPage />} />
              <Route path="/analyze" element={<TrackAnalysisPage />} />
              <Route
                path="/green-room"
                element={FEATURES.greenRoom ? <GreenRoom /> : <ComingSoon feature="Green Room" />}
              />
              <Route path="/games" element={<ComingSoon feature="Games" />} />
            </Route>
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
          </Routes>
        </TrackCacheProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
