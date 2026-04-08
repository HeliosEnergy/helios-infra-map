import React from 'react';
import { Shield, FileText, Mail } from 'lucide-react';

const Footer: React.FC = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-left">
          <img
            src="/logo-black-1024x_refined(1)_light_lower_white.png"
            alt="Logo"
            className="footer-logo"
          />
          <span className="footer-text">&copy; 2025 All rights reserved.</span>
        </div>
        <div className="footer-center">
          <img
            src="/nvidia-inception-program-badge-rgb-for-screen.png"
            alt="NVIDIA Inception Program"
            className="nvidia-badge"
          />
        </div>
        <div className="footer-links">
          <a href="#" className="footer-link">
            <Shield size={16} />
            <span>Privacy</span>
          </a>
          <a href="#" className="footer-link">
            <FileText size={16} />
            <span>Terms</span>
          </a>
          <a href="#" className="footer-link">
            <Mail size={16} />
            <span>Contact</span>
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;