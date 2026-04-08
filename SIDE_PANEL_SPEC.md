# Side Panel Redesign - Component Specifications

## Overview
This document outlines the specifications for a unified tabbed side panel system that replaces the current fragmented control panel and legend panel design.

## Architecture

### Main Components
- `SidePanel` - Main container component
- `TabNavigation` - Tab switching component
- `LayersFiltersTab` - Primary tab for essential controls
- `VisualizationTab` - Secondary tab for display options
- `DataExportTab` - Tertiary tab for data management
- `LegendFooter` - Always-visible legend component

### Design Principles
- **Unified Experience**: Single panel with clear navigation
- **Progressive Disclosure**: Essential → Advanced → Expert features
- **Accessibility First**: WCAG 2.1 AA compliant
- **Responsive Design**: Adapts to screen sizes
- **Performance Optimized**: Efficient rendering and interactions

## Component Specifications

### SidePanel (Main Container)

**Purpose**: Main container that orchestrates the entire side panel experience

**Props**:
```typescript
interface SidePanelProps {
  // Layer visibility
  showPowerPlants: boolean;
  showWfsCables: boolean;
  onTogglePowerPlants: () => void;
  onToggleWfsCables: () => void;

  // Filtering state
  filteredSources: Set<string>;
  onToggleSourceFilter: (source: string) => void;
  showCanadianPlants: boolean;
  showAmericanPlants: boolean;
  onToggleCanadianPlants: () => void;
  onToggleAmericanPlants: () => void;
  minPowerOutput: number;
  maxPowerOutput: number;
  onMinPowerOutputChange: (value: number) => void;
  onMaxPowerOutputChange: (value: number) => void;

  // Proximity filtering
  showOnlyNearbyPlants: boolean;
  proximityDistance: number;
  onToggleNearbyPlants: () => void;
  onProximityDistanceChange: (value: number) => void;

  // Visualization
  baseSize: number;
  dataEmphasis: number;
  sizeBy: string;
  onBaseSizeChange: (value: number) => void;
  onDataEmphasisChange: (value: number) => void;
  onSizeByChange: (value: string) => void;

  // Data
  powerPlants: PowerPlant[];
  allSourcesInData: string[];

  // UI state
  isCollapsed?: boolean;
  onToggleCollapsed?: () => void;
}
```

**State**:
```typescript
interface SidePanelState {
  activeTab: 'layers' | 'visualization' | 'data';
  expandedSections: Set<string>;
  legendSearchQuery: string;
}
```

**Behavior**:
- Manages active tab state
- Handles keyboard navigation
- Coordinates state between tabs
- Manages panel collapse/expand
- Provides context to child components

### TabNavigation

**Purpose**: Provides tab switching interface with accessibility support

**Props**:
```typescript
interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
  tabs: Array<{
    id: string;
    label: string;
    icon: string;
    badge?: number;
  }>;
}
```

**Features**:
- Icon + text labels
- Active state indication
- Keyboard navigation (arrow keys, home/end)
- Screen reader announcements
- Optional badges for notifications

**Accessibility**:
- `role="tablist"`
- `aria-label="Side panel navigation"`
- Individual tabs: `role="tab"`, `aria-selected`, `aria-controls`

### LayersFiltersTab

**Purpose**: Essential map controls and basic filtering options

**Sections**:
1. **Layer Visibility**
   - Power Plants toggle
   - Infrastructure toggle

2. **Quick Filters**
   - Country selection (CA/US/Both)
   - Power range presets (Small/Medium/Large/Custom)

3. **Advanced Filters** (Expandable)
   - Custom power output range slider
   - Proximity distance slider

**Props**: Subset of SidePanelProps related to layers and filtering

**State**:
```typescript
interface LayersFiltersTabState {
  showAdvancedFilters: boolean;
  powerRangePreset: 'small' | 'medium' | 'large' | 'custom' | null;
}
```

### VisualizationTab

**Purpose**: Advanced styling and display customization

**Sections**:
1. **Circle Sizing**
   - Base size slider (with live preview)
   - Data emphasis slider
   - Size by dropdown (nameplateCapacity/capacityFactor/generation)

2. **Color Schemes**
   - Power plant color presets
   - Infrastructure color options

3. **Display Options**
   - Show labels toggle
   - Animation toggle
   - Opacity controls

**Props**: Subset of SidePanelProps related to visualization

### DataExportTab

**Purpose**: Data management, statistics, and export functionality

**Sections**:
1. **Data Summary**
   - Total plants count
   - Filtered plants count
   - Active filters list
   - Date range information

2. **Export Options**
   - Download CSV button
   - Share link button
   - Print view button
   - API endpoint info

3. **Data Sources**
   - Last updated timestamp
   - Source attribution links
   - Data quality indicators

**Props**: Subset of SidePanelProps related to data

### LegendFooter

**Purpose**: Always-visible legend with search functionality

**Features**:
- Compact grid layout (auto-fit columns)
- Search/filter input
- Expandable to full view
- Click-to-toggle functionality
- Infrastructure items always visible

**Props**:
```typescript
interface LegendFooterProps {
  allSourcesInData: string[];
  filteredSources: Set<string>;
  onToggleSourceFilter: (source: string) => void;
  showWfsCables: boolean;
  onToggleWfsCables: () => void;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}
```

**State**:
```typescript
interface LegendFooterState {
  searchQuery: string;
  isExpanded: boolean;
}
```

## Styling Specifications

### CSS Architecture
- CSS Modules for component isolation
- CSS custom properties for theming
- Responsive breakpoints: 768px, 1024px
- Dark mode support

### Key Design Tokens
```css
:root {
  --panel-width: 340px;
  --panel-bg: rgba(255, 255, 255, 0.95);
  --panel-border: rgba(0, 0, 0, 0.1);
  --tab-height: 60px;
  --legend-footer-height: 200px;
  --border-radius: 8px;
  --transition-duration: 0.2s;
}
```

### Responsive Breakpoints
- **Mobile (< 768px)**: Full-screen overlay modal
- **Tablet (768px - 1024px)**: Overlay with backdrop, collapsible
- **Desktop (> 1024px)**: Fixed side panel

## Accessibility Specifications

### Keyboard Navigation
- **Tab**: Move between interactive elements
- **Arrow Keys**: Navigate within tab groups
- **Enter/Space**: Activate controls
- **Escape**: Close modals/dropdowns

### Screen Reader Support
- Semantic HTML structure
- ARIA labels and descriptions
- Live regions for dynamic content
- Focus management

### Focus Management
- Visible focus indicators (3:1 contrast)
- Logical tab order
- Focus trapping in modals

## Performance Specifications

### Rendering Optimization
- React.memo for pure components
- useMemo for expensive calculations
- useCallback for event handlers
- Virtual scrolling for large lists

### Bundle Size
- Tree-shaking friendly
- Lazy loading for non-critical components
- Minimal dependencies

### Runtime Performance
- 60fps animations
- < 100ms initial render
- < 16ms interaction response
- Memory usage < 50MB

## Testing Specifications

### Unit Tests
- Component rendering
- Props handling
- State management
- Event handling

### Integration Tests
- Tab switching
- State synchronization
- Responsive behavior

### E2E Tests
- Complete user workflows
- Accessibility compliance
- Cross-browser compatibility

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Create component skeletons
- [ ] Implement basic tab navigation
- [ ] Set up CSS architecture
- [ ] Basic responsive layout

### Phase 2: Core Features (Week 2)
- [ ] Implement LayersFiltersTab
- [ ] Create LegendFooter
- [ ] Add state management
- [ ] Basic accessibility

### Phase 3: Advanced Features (Week 3)
- [ ] VisualizationTab implementation
- [ ] DataExportTab implementation
- [ ] Advanced interactions
- [ ] Performance optimization

### Phase 4: Polish & Testing (Week 4)
- [ ] Responsive design refinement
- [ ] Accessibility audit
- [ ] Performance testing
- [ ] User testing

## Success Criteria

### Functional Requirements
- [ ] All existing functionality preserved
- [ ] Improved discoverability of features
- [ ] Better mobile experience
- [ ] Enhanced accessibility

### Quality Requirements
- [ ] Zero accessibility violations
- [ ] < 100ms load time
- [ ] 60fps smooth interactions
- [ ] Cross-browser compatibility

### User Experience Requirements
- [ ] Simplified mental model
- [ ] Reduced cognitive load
- [ ] Intuitive navigation
- [ ] Clear visual hierarchy