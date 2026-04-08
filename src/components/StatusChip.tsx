import React from 'react';

interface StatusChipProps {
  status: string;
  onRemove: (status: string) => void;
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

const StatusChip: React.FC<StatusChipProps> = ({ status, onRemove }) => {
  const shortStatus = getShortStatus(status);
  const fullDescription = getStatusDescription(shortStatus);

  return (
    <div className="status-chip">
      <span className="chip-text" title={fullDescription}>{shortStatus}</span>
      <button
        className="chip-remove"
        onClick={() => onRemove(status)}
        aria-label={`Remove ${fullDescription} filter`}
      >
        ×
      </button>
    </div>
  );
};

export default StatusChip;