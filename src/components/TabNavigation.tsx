import React, { useEffect, useRef } from 'react';
import { Layers, MapPin, Palette, Database, Target } from 'lucide-react';
import './TabNavigation.css';

export interface TabItem {
  id: string;
  label: string;
  icon: string;
  badge?: number;
}

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: TabItem[];
  className?: string;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  tabs,
  className = ''
}) => {
  const tabListRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation handler
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
    let newIndex = currentIndex;

    switch (event.key) {
      case 'ArrowLeft':
        newIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
        break;
      case 'ArrowRight':
        newIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
        break;
      case 'Home':
        newIndex = 0;
        break;
      case 'End':
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    onTabChange(tabs[newIndex].id);
  };

  // Focus management
  useEffect(() => {
    const activeTabButton = tabListRef.current?.querySelector(
      `[data-tab-id="${activeTab}"]`
    ) as HTMLElement;

    if (activeTabButton) {
      activeTabButton.focus();
    }
  }, [activeTab]);

  return (
    <nav
      className={`tab-navigation ${className}`}
      role="tablist"
      aria-label="Side panel navigation"
      onKeyDown={handleKeyDown}
      ref={tabListRef}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`tabpanel-${tab.id}`}
          id={`tab-${tab.id}`}
          data-tab-id={tab.id}
          tabIndex={activeTab === tab.id ? 0 : -1}
        >
          <div className="tab-icon" aria-hidden="true">
            {getTabIcon(tab.icon)}
          </div>
          <span className="tab-label">{tab.label}</span>
          {tab.badge && tab.badge > 0 && (
            <span className="tab-badge" aria-label={`${tab.badge} items`}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </nav>
  );
};

// Icon mapping function using Lucide React icons
const getTabIcon = (iconName: string): React.ReactElement | null => {
  switch (iconName) {
    case 'layers':
      return <Layers size={18} />;
    case 'legend':
      return <MapPin size={18} />;
    case 'palette':
      return <Palette size={18} />;
    case 'database':
      return <Database size={18} />;
    case 'target':
      return <Target size={18} />;
    default:
      return null;
  }
};

export default TabNavigation;