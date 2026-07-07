import React from 'react';
import { Link } from 'react-router-dom';
import './ComingSoon.css';

const ComingSoon = ({ feature }) => {
  return (
    <div className="coming-soon">
      <div className="coming-soon-icon">🚧</div>
      <h1>{feature} is coming soon</h1>
      <p>We're still building this one out. Check back soon.</p>
      <Link to="/" className="coming-soon-link">
        ← Back to Discover
      </Link>
    </div>
  );
};

export default ComingSoon;
