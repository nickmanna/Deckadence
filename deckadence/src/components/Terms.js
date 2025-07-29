import React from 'react';
import { Link } from 'react-router-dom';
import './Terms.css';

const Terms = () => {
  return (
    <div className="terms-container">
      <div className="terms-content">
        <header className="terms-header">
          <h1>Terms of Service</h1>
          <Link to="/" className="back-link">← Back to Home</Link>
        </header>
        
        <div className="terms-body">
          <section className="terms-section">
            <h2>1. Acceptance of Terms</h2>
            <p>
              By accessing and using Deckadence ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section className="terms-section">
            <h2>2. Description of Service</h2>
            <p>
              Deckadence is a DJ learning platform that provides tools and resources for individuals to learn and practice DJ skills. The service includes audio analysis, beat matching tools, and educational content.
            </p>
          </section>

          <section className="terms-section">
            <h2>3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account and password. You agree to accept responsibility for all activities that occur under your account or password.
            </p>
          </section>

          <section className="terms-section">
            <h2>4. Acceptable Use</h2>
            <p>
              You agree not to use the Service to:
            </p>
            <ul>
              <li>Upload or share copyrighted material without permission</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Harass, abuse, or harm other users</li>
              <li>Attempt to gain unauthorized access to the Service</li>
            </ul>
          </section>

          <section className="terms-section">
            <h2>5. Intellectual Property</h2>
            <p>
              The Service and its original content, features, and functionality are and will remain the exclusive property of Deckadence and its licensors. The Service is protected by copyright, trademark, and other laws.
            </p>
          </section>

          <section className="terms-section">
            <h2>6. Privacy</h2>
            <p>
              Your privacy is important to us. Please review our Privacy Policy, which also governs your use of the Service, to understand our practices.
            </p>
          </section>

          <section className="terms-section">
            <h2>7. Termination</h2>
            <p>
              We may terminate or suspend your account and bar access to the Service immediately, without prior notice or liability, under our sole discretion, for any reason whatsoever and without limitation.
            </p>
          </section>

          <section className="terms-section">
            <h2>8. Limitation of Liability</h2>
            <p>
              In no event shall Deckadence, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages.
            </p>
          </section>

          <section className="terms-section">
            <h2>9. Changes to Terms</h2>
            <p>
              We reserve the right, at our sole discretion, to modify or replace these Terms at any time. If a revision is material, we will try to provide at least 30 days notice prior to any new terms taking effect.
            </p>
          </section>

          <section className="terms-section">
            <h2>10. Contact Information</h2>
            <p>
              If you have any questions about these Terms of Service, please contact us at support@deckadence.com
            </p>
          </section>

          <footer className="terms-footer">
            <p>Last updated: {new Date().toLocaleDateString()}</p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Terms; 