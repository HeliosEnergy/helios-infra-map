import React, { useState, useRef, useEffect } from 'react';
import './RadiusSlider.css';

interface RadiusSliderProps {
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  step?: number;
  className?: string;
  disabled?: boolean;
}

const RadiusSlider: React.FC<RadiusSliderProps> = ({
  min,
  max,
  value,
  onChange,
  step = 1,
  className = '',
  disabled = false,
}) => {
  const [localValue, setLocalValue] = useState<number>(value);
  const isDraggingRef = useRef<boolean>(false);
  const lastSyncedValueRef = useRef<number>(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync when NOT dragging
  useEffect(() => {
    if (isDraggingRef.current) {
      return;
    }
    
    if (value !== lastSyncedValueRef.current) {
      setLocalValue(value);
      lastSyncedValueRef.current = value;
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    isDraggingRef.current = true;
    
    const newValue = Number(e.target.value);
    const constrainedValue = Math.max(min, Math.min(newValue, max));
    
    setLocalValue(constrainedValue);
    lastSyncedValueRef.current = constrainedValue;
    onChange(constrainedValue);
  };

  const handleMouseDown = () => {
    isDraggingRef.current = true;
  };

  const handleMouseUp = () => {
    setTimeout(() => {
      isDraggingRef.current = false;
    }, 100);
  };

  // Document-level mouse up to catch all cases
  useEffect(() => {
    const handleDocumentMouseUp = () => {
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 100);
    };

    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('touchend', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp);
      document.removeEventListener('touchend', handleDocumentMouseUp);
    };
  }, []);

  const percent = ((localValue - min) / (max - min)) * 100;

  return (
    <div className={`radius-slider ${className} ${disabled ? 'disabled' : ''}`}>
      <div className="slider-container">
        <input
          ref={inputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={localValue}
          onChange={handleChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchEnd={handleMouseUp}
          className="slider-input"
          disabled={disabled}
          aria-label="Radius value"
        />

        {/* Track highlight showing selected range */}
        <div className="slider-track">
          <div 
            className="slider-track-highlight"
            style={{
              width: `${percent}%`,
            }}
          />
        </div>
      </div>

      {/* Value display */}
      <div className="slider-value-display">
        <span className="slider-value">{localValue.toLocaleString()}</span>
        <span className="slider-unit">mi</span>
      </div>
    </div>
  );
};

export default RadiusSlider;
