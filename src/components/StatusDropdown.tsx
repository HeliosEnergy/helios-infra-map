import React from 'react';

interface StatusDropdownProps {
  allStatuses: string[];
  filteredStatuses: Set<string>;
  onToggleStatus: (status: string) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  isOpen: boolean;
}

// Map status codes and descriptions to short codes
const getShortStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    // Full descriptions to short codes
    'Operating': 'OP',
    'Planned': 'PL',
    'Retired': 'RT',
    'Under Construction': 'UC',
    'Cancelled': 'CN',
    'Suspended': 'SP',
    'Standby': 'SB',
    'Standby/Backup: available for service but not normally used': 'SB',
    'Out of Service': 'OOS',
    'Out of service and NOT expected to return to service in next calendar year': 'OS',
    'Out of service but expected to return to service in next calendar year': 'OA',
    'Mothballed': 'MB',
    'Decommissioned': 'DC',
    'N/A': 'N/A',
    
    // Short codes to short codes (for direct use)
    'OP': 'OP',
    'PL': 'PL',
    'RT': 'RT',
    'UC': 'UC',
    'CN': 'CN',
    'SP': 'SP',
    'SB': 'SB',
    'OOS': 'OOS',
    'OS': 'OS',
    'OA': 'OA',
    'MB': 'MB',
    'DC': 'DC'
  };

  return statusMap[status] || status.substring(0, 4).toUpperCase(); // Fallback to first 4 chars uppercase
};

// Map short status codes to human-readable descriptions
const getStatusDescription = (status: string): string => {
  const descriptionMap: Record<string, string> = {
    'OP': 'Operating',
    'PL': 'Planned',
    'RT': 'Retired',
    'UC': 'Under Construction',
    'CN': 'Cancelled',
    'SP': 'Suspended',
    'SB': 'Standby/Backup: available for service but not normally used',
    'OOS': 'Out of Service',
    'OS': 'Out of service and NOT expected to return to service in next calendar year',
    'OA': 'Out of service but expected to return to service in next calendar year',
    'MB': 'Mothballed',
    'DC': 'Decommissioned',
    'N/A': 'N/A'
  };

  // If it's already a description, return as is
  if (!descriptionMap[status]) {
    // Check if it's one of the known descriptions
    const descriptions = Object.keys(descriptionMap);
    for (const desc of descriptions) {
      if (descriptionMap[desc] === status) {
        return status;
      }
    }
    // If not found, return the status as is
    return status;
  }
  
  return descriptionMap[status];
};

const StatusDropdown: React.FC<StatusDropdownProps> = ({
  allStatuses,
  filteredStatuses,
  onToggleStatus,
  onSelectAll,
  onClearAll,
  isOpen
}) => {
  if (!isOpen) return null;

  return (
    <div className="status-dropdown">
      <div className="dropdown-header">
        <button
          className="dropdown-action"
          onClick={onSelectAll}
          disabled={filteredStatuses.size === allStatuses.length}
        >
          Select All
        </button>
        <button
          className="dropdown-action"
          onClick={onClearAll}
          disabled={filteredStatuses.size === 0}
        >
          Clear All
        </button>
      </div>
      <div className="dropdown-list">
        {allStatuses.map(status => {
          const shortStatus = getShortStatus(status);
          const fullDescription = getStatusDescription(shortStatus);
          return (
            <label key={status} className="dropdown-item">
              <input
                type="checkbox"
                checked={filteredStatuses.has(status)}
                onChange={() => onToggleStatus(status)}
              />
              <span className="item-text" title={fullDescription}>
                {shortStatus} - {fullDescription}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

export default StatusDropdown;