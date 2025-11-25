import React from 'react';
import { useTheme } from '../hooks/useTheme';
import { Globe, Settings, Sun, Moon, Lock } from 'lucide-react';
import { NavLink } from 'react-router-dom'; // Import NavLink
import { usePasswordGate } from '../contexts/PasswordGateContext';

const Header: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const { isGateEnabled, lockApp } = usePasswordGate();

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-left">
          <NavLink to="/" className="header-logo-link"> {/* Wrap logo in NavLink to go home */}
            <img
              src="/logo-black-1024x_refined(1)_light_lower_white.png"
              alt="Logo"
              className="header-logo"
            />
          </NavLink>
        </div>
        <nav className="header-nav">
          {/* Commented out until pages are ready for public view */}
          {/* <NavLink to="/data-visualizations" className="nav-link">
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/analysis-guide" className="nav-link">
            <span>Analysis Guide</span>
          </NavLink> */}
          <a href="https://www.heliosenergy.io/" className="nav-link" target="_blank" rel="noopener noreferrer">
            <Globe size={18} />
            <span>Site</span>
          </a>
          <a href="https://console.heliosenergy.io/login?tab=signup" className="nav-link" target="_blank" rel="noopener noreferrer">
            <Settings size={18} />
            <span>Console</span>
          </a>
        </nav>
        <div className="header-right">
          {isGateEnabled && (
            <button onClick={lockApp} className="lock-toggle" aria-label="Lock app">
              <Lock size={16} />
              <span>Lock</span>
            </button>
          )}
          <button onClick={toggleTheme} className="theme-toggle">
            {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;