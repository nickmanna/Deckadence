import React from 'react';
import { Link } from 'react-router-dom';
import './Privacy.css';

const Privacy = () => {
  return (
    <div className="privacy-container">
      <div className="privacy-content">
        <header className="privacy-header">
          <h1>Privacy Policy</h1>
          <Link to="/" className="back-link">← Back to Home</Link>
        </header>
        
        <div className="privacy-body">
          <section className="privacy-section">
            <h2>1. Information We Collect</h2>
            <p>
              We collect information you provide directly to us, such as when you create an account, upload audio files, or contact us for support.
            </p>
            <h3>Personal Information:</h3>
            <ul>
              <li>Email address and password when you create an account</li>
              <li>Profile information you choose to provide</li>
              <li>Audio files you upload for analysis</li>
              <li>Usage data and preferences</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve our services</li>
              <li>Process and analyze your audio files</li>
              <li>Send you technical notices and support messages</li>
              <li>Respond to your comments and questions</li>
              <li>Develop new features and services</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>3. Information Sharing</h2>
            <p>
              We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except in the following circumstances:
            </p>
            <ul>
              <li>With your explicit permission</li>
              <li>To comply with legal obligations</li>
              <li>To protect our rights and safety</li>
              <li>In connection with a business transfer or merger</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>4. Data Security</h2>
            <p>
              We implement appropriate security measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction. However, no method of transmission over the internet is 100% secure.
            </p>
          </section>

          <section className="privacy-section">
            <h2>5. Audio File Processing</h2>
            <p>
              When you upload audio files to Deckadence:
            </p>
            <ul>
              <li>Files are processed for beat analysis and educational purposes</li>
              <li>We do not store or share your audio content with third parties</li>
              <li>You retain ownership of your uploaded content</li>
              <li>You can delete your uploaded files at any time</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>6. Cookies and Tracking</h2>
            <p>
              We use cookies and similar technologies to:
            </p>
            <ul>
              <li>Remember your preferences and settings</li>
              <li>Analyze how you use our service</li>
              <li>Improve our website functionality</li>
              <li>Provide personalized content</li>
            </ul>
            <p>
              You can control cookie settings through your browser preferences.
            </p>
          </section>

          <section className="privacy-section">
            <h2>7. Third-Party Services</h2>
            <p>
              We may use third-party services for:
            </p>
            <ul>
              <li>Analytics and performance monitoring</li>
              <li>Payment processing</li>
              <li>Cloud storage and hosting</li>
              <li>Customer support tools</li>
            </ul>
            <p>
              These services have their own privacy policies, and we encourage you to review them.
            </p>
          </section>

          <section className="privacy-section">
            <h2>8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal information</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your data</li>
              <li>Opt out of marketing communications</li>
              <li>Export your data</li>
            </ul>
          </section>

          <section className="privacy-section">
            <h2>9. Data Retention</h2>
            <p>
              We retain your personal information for as long as necessary to provide our services and comply with legal obligations. You can request deletion of your account and associated data at any time.
            </p>
          </section>

          <section className="privacy-section">
            <h2>10. Children's Privacy</h2>
            <p>
              Our service is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If you are a parent and believe your child has provided us with personal information, please contact us.
            </p>
          </section>

          <section className="privacy-section">
            <h2>11. International Transfers</h2>
            <p>
              Your information may be transferred to and processed in countries other than your own. We ensure appropriate safeguards are in place to protect your information in accordance with this privacy policy.
            </p>
          </section>

          <section className="privacy-section">
            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page and updating the "Last Updated" date.
            </p>
          </section>

          <section className="privacy-section">
            <h2>13. Contact Us</h2>
            <p>
              If you have any questions about this privacy policy or our data practices, please contact us at:
            </p>
            <div className="contact-info">
              <p><strong>Email:</strong> privacy@deckadence.com</p>
              <p><strong>Address:</strong> [Your Business Address]</p>
            </div>
          </section>

          <footer className="privacy-footer">
            <p>Last updated: {new Date().toLocaleDateString()}</p>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Privacy; 