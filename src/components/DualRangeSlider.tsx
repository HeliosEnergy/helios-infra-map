 import React, { useEffect, useRef, useState } from 'react';
import './DualRangeSlider.css';

interface DualRangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
  className?: string;
  disabled?: boolean;
}

const DualRangeSlider: React.FC<DualRangeSliderProps> = ({
  min,
  max,
  value,
  onChange,
  step = 1,
  className = '',
  disabled = false,
}) => {
  const [localValue, setLocalValue] = useState<[number, number]>(value);
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);
  const isDraggingRef = useRef(false);
  const lastSyncedValueRef = useRef<[number, number]>(value);

  // Sync local state with props when value changes externally
  // Only sync if we're not currently dragging to avoid interference
  useEffect(() => {
    if (!isDraggingRef.current) {
      // Only sync if the prop value actually changed (not just a re-render)
      if (value[0] !== lastSyncedValueRef.current[0] || value[1] !== lastSyncedValueRef.current[1]) {
        setLocalValue(value);
        lastSyncedValueRef.current = value;
      }
    }
  }, [value]);

  const [minValue, maxValue] = localValue;

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMin = Number(e.target.value);
    // Simply constrain min: must be >= min bound and < maxValue
    const constrainedMin = Math.max(min, Math.min(newMin, maxValue - step));
    // Keep maxValue unchanged
    const newValue: [number, number] = [constrainedMin, maxValue];
    setLocalValue(newValue);
    lastSyncedValueRef.current = newValue;
    // Update parent immediately for real-time feedback
    onChange(newValue);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newMax = Number(e.target.value);
    // Simply constrain max: must be <= max bound and > minValue
    const constrainedMax = Math.min(max, Math.max(newMax, minValue + step));
    // Keep minValue unchanged
    const newValue: [number, number] = [minValue, constrainedMax];
    setLocalValue(newValue);
    lastSyncedValueRef.current = newValue;
    // Update parent immediately for real-time feedback
    onChange(newValue);
  };

  const handleMouseDown = () => {
    isDraggingRef.current = true;
  };

  const handleMouseUp = () => {
    if (isDraggingRef.current) {
      // Sync the ref when dragging ends to prevent unnecessary re-syncs
      lastSyncedValueRef.current = localValue;
    }
    isDraggingRef.current = false;
  };

  // Add document-level mouse up listener to ensure isDraggingRef is reset
  useEffect(() => {
    const handleDocumentMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('touchend', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp);
      document.removeEventListener('touchend', handleDocumentMouseUp);
    };
  }, []);

  // Handle dragging the middle section (range highlight) to move the whole range
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValue, setDragStartValue] = useState<[number, number]>([0, 0]);

  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleTrackMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // This handler is only called from the draggable area in the middle
    // which already excludes the handle areas, so we can proceed
    isDraggingRef.current = true;
    setIsDraggingRange(true);
    setDragStartX(e.clientX);
    setDragStartValue([minValue, maxValue]);
    e.preventDefault();
    e.stopPropagation();
  };

  useEffect(() => {
    if (!isDraggingRange) return;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const deltaX = e.clientX - dragStartX;
      const deltaPercent = (deltaX / containerRect.width) * 100;
      const deltaValue = (deltaPercent / 100) * (max - min);

      const newMin = dragStartValue[0] + deltaValue;
      const newMax = dragStartValue[1] + deltaValue;

      // Constrain to bounds independently
      const constrainedMin = Math.max(min, Math.min(newMin, max - step));
      const constrainedMax = Math.min(max, Math.max(newMax, min + step));
      
      // Ensure min doesn't exceed max and vice versa
      const finalMin = Math.min(constrainedMin, constrainedMax - step);
      const finalMax = Math.max(constrainedMax, finalMin + step);
      
      const newValue: [number, number] = [finalMin, finalMax];
      setLocalValue(newValue);
      lastSyncedValueRef.current = newValue;
      // Update parent in real-time while dragging
      onChange(newValue);
    };

    const handleMouseUp = () => {
      if (isDraggingRange) {
        isDraggingRef.current = false;
        setIsDraggingRange(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingRange, dragStartX, dragStartValue, min, max, step, onChange]);

  // Calculate percentage positions for the track highlight
  const minPercent = ((minValue - min) / (max - min)) * 100;
  const maxPercent = ((maxValue - min) / (max - min)) * 100;

  return (
    <div className={`dual-range-slider ${className} ${disabled ? 'disabled' : ''}`}>
      <div ref={containerRef} className="slider-container">
        {/* Min input */}
        <input
          ref={minInputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={minValue}
          onChange={handleMinChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
          className="slider-input slider-min"
          disabled={disabled}
          aria-label="Minimum value"
          style={{ zIndex: 1000 }}
        />

        {/* Max input */}
        <input
          ref={maxInputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxValue}
          onChange={handleMaxChange}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
          className="slider-input slider-max"
          disabled={disabled}
          aria-label="Maximum value"
          style={{ zIndex: 1001 }}
        />

        {/* Track highlight */}
        <div className="slider-track">
          <div 
            className="slider-track-highlight"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />
          {/* Draggable area in the middle portion only - only show if range is large enough */}
          {(maxPercent - minPercent) > 10 && (
            <div 
              className="slider-track-draggable"
              style={{
                left: `${minPercent + (maxPercent - minPercent) * 0.35}%`,
                width: `${(maxPercent - minPercent) * 0.3}%`,
                cursor: isDraggingRange ? 'grabbing' : 'grab',
              }}
              onMouseDown={handleTrackMouseDown}
            />
          )}
        </div>
      </div>

      {/* Value display */}
      <div className="slider-values">
        <span className="slider-value">
          {minValue.toLocaleString()}
        </span>
        <span className="slider-separator">–</span>
        <span className="slider-value">
          {maxValue.toLocaleString()}
        </span>
      </div>
    </div>
  );
};

export default DualRangeSlider;