import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-section">
          <h3>Deckadence</h3>
          <p>The first step in learning to DJ</p>
        </div>
        
        <div className="footer-section">
          <h4>Legal</h4>
          <ul>
            <li><Link to="/terms">Terms of Service</Link></li>
            <li><Link to="/privacy">Privacy Policy</Link></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Support</h4>
          <ul>
            <li><a href="mailto:support@deckadence.com">Contact Us</a></li>
            <li><a href="#" onClick={(e) => e.preventDefault()}>Help Center</a></li>
          </ul>
        </div>
        
        <div className="footer-section">
          <h4>Follow Us</h4>
          <div className="social-links">
            <a href="#" onClick={(e) => e.preventDefault()} aria-label="Twitter">
              <i className="fab fa-twitter"></i>
            </a>
            <a href="#" onClick={(e) => e.preventDefault()} aria-label="Instagram">
              <i className="fab fa-instagram"></i>
            </a>
            <a href="#" onClick={(e) => e.preventDefault()} aria-label="YouTube">
              <i className="fab fa-youtube"></i>
            </a>
          </div>
        </div>
      </div>
      
      <div className="footer-bottom">
        <p>&copy; {new Date().getFullYear()} Deckadence. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default Footer; 