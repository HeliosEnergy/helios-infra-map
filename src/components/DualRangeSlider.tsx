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
  const [isDraggingMin, setIsDraggingMin] = useState<boolean>(false);
  const [isDraggingMax, setIsDraggingMax] = useState<boolean>(false);
  const [hoveredSlider, setHoveredSlider] = useState<'min' | 'max' | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const isDraggingMinRef = useRef<boolean>(false);
  const isDraggingMaxRef = useRef<boolean>(false);
  const lastSyncedValueRef = useRef<[number, number]>(value);
  const minInputRef = useRef<HTMLInputElement>(null);
  const maxInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync ONLY when NOT dragging - completely block while dragging
  useEffect(() => {
    // If dragging, completely ignore this update
    if (isDraggingRef.current || isDraggingMinRef.current || isDraggingMaxRef.current) {
      return;
    }
    
    // Only sync if value actually changed from what we last synced
    if (value[0] !== lastSyncedValueRef.current[0] || value[1] !== lastSyncedValueRef.current[1]) {
      setLocalValue(value);
      lastSyncedValueRef.current = value;
    }
  }, [value]);

  const [minValue, maxValue] = localValue;

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // SET DRAGGING FLAGS FIRST - BEFORE ANYTHING ELSE
    isDraggingRef.current = true;
    isDraggingMinRef.current = true;
    setIsDraggingMin(true);
    setIsDraggingMax(false); // Ensure max is not dragging
    
    const newMin = Number(e.target.value);
    // Use current maxValue from state - keep it EXACTLY the same
    const constrainedMin = Math.max(min, Math.min(newMin, maxValue - step));
    const newValue: [number, number] = [constrainedMin, maxValue]; // maxValue stays unchanged
    
    setLocalValue(newValue);
    lastSyncedValueRef.current = newValue;
    onChange(newValue);
  };

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // SET DRAGGING FLAGS FIRST - BEFORE ANYTHING ELSE
    isDraggingRef.current = true;
    isDraggingMaxRef.current = true;
    setIsDraggingMax(true);
    setIsDraggingMin(false); // Ensure min is not dragging
    
    const newMax = Number(e.target.value);
    // Use current minValue from state - keep it EXACTLY the same
    const constrainedMax = Math.min(max, Math.max(newMax, minValue + step));
    const newValue: [number, number] = [minValue, constrainedMax]; // minValue stays unchanged
    
    setLocalValue(newValue);
    lastSyncedValueRef.current = newValue;
    onChange(newValue);
  };

  const handleMinMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    isDraggingMinRef.current = true;
    isDraggingMaxRef.current = false;
    setIsDraggingMin(true);
    setIsDraggingMax(false);
  };

  const handleMaxMouseDown = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    isDraggingRef.current = true;
    isDraggingMaxRef.current = true;
    isDraggingMinRef.current = false;
    setIsDraggingMax(true);
    setIsDraggingMin(false);
  };



  const handleMouseUp = () => {
    // Wait longer before allowing sync - give parent time to update
    setTimeout(() => {
      isDraggingRef.current = false;
      isDraggingMinRef.current = false;
      isDraggingMaxRef.current = false;
      setIsDraggingMin(false);
      setIsDraggingMax(false);
    }, 350);
  };

  // Document-level mouse up to catch all cases
  useEffect(() => {
    const handleDocumentMouseUp = () => {
      setTimeout(() => {
        isDraggingRef.current = false;
        isDraggingMinRef.current = false;
        isDraggingMaxRef.current = false;
        setIsDraggingMin(false);
        setIsDraggingMax(false);
      }, 350);
    };

    document.addEventListener('mouseup', handleDocumentMouseUp);
    document.addEventListener('touchend', handleDocumentMouseUp);

    return () => {
      document.removeEventListener('mouseup', handleDocumentMouseUp);
      document.removeEventListener('touchend', handleDocumentMouseUp);
    };
  }, []);

  const minPercent = ((minValue - min) / (max - min)) * 100;
  const maxPercent = ((maxValue - min) / (max - min)) * 100;

  const handleContainerMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current || isDraggingRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mousePercent = (mouseX / rect.width) * 100;
    
    // Determine which thumb is closer to mouse position
    const distanceToMin = Math.abs(mousePercent - minPercent);
    const distanceToMax = Math.abs(mousePercent - maxPercent);
    
    // Raise the slider whose thumb is closer (within 20% of track width)
    if (distanceToMin < distanceToMax && distanceToMin < 20) {
      setHoveredSlider('min');
    } else if (distanceToMax < 20) {
      setHoveredSlider('max');
    } else {
      // Mouse is in the middle, don't change
      setHoveredSlider(null);
    }
  };

  const handleContainerMouseLeave = () => {
    if (!isDraggingRef.current) {
      setHoveredSlider(null);
    }
  };

  return (
    <div className={`dual-range-slider ${className} ${disabled ? 'disabled' : ''}`}>
      <div 
        ref={containerRef}
        className="slider-container"
        onMouseMove={handleContainerMouseMove}
        onMouseLeave={handleContainerMouseLeave}
      >
        {/* Maximum pointer - independent control (rendered first) */}
        <input
          ref={maxInputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxValue}
          onChange={handleMaxChange}
          onMouseDown={handleMaxMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={(e) => handleMaxMouseDown(e as any)}
          onTouchEnd={handleMouseUp}
          className="slider-input slider-max"
          disabled={disabled}
          aria-label="Maximum value"
          style={{ 
            zIndex: isDraggingMax ? 1003 : (isDraggingMin ? 1000 : (hoveredSlider === 'max' ? 1002 : 1001)),
            pointerEvents: isDraggingMin ? 'none' : 'auto'
          }}
        />

        {/* Minimum pointer - independent control */}
        <input
          ref={minInputRef}
          type="range"
          min={min}
          max={max}
          step={step}
          value={minValue}
          onChange={handleMinChange}
          onMouseDown={handleMinMouseDown}
          onMouseUp={handleMouseUp}
          onTouchStart={(e) => handleMinMouseDown(e as any)}
          onTouchEnd={handleMouseUp}
          className="slider-input slider-min"
          disabled={disabled}
          aria-label="Minimum value"
          style={{ 
            zIndex: isDraggingMin ? 1003 : (isDraggingMax ? 1000 : (hoveredSlider === 'min' ? 1002 : 1001)),
            pointerEvents: isDraggingMax ? 'none' : 'auto'
          }}
        />

        {/* Track highlight showing selected range */}
        <div className="slider-track">
          <div 
            className="slider-track-highlight"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />
        </div>
      </div>

      {/* Value display */}
      <div className="slider-values">
        <span className="slider-value">{minValue.toLocaleString()}</span>
        <span className="slider-separator">–</span>
        <span className="slider-value">{maxValue.toLocaleString()}</span>
      </div>
    </div>
  );
};

export default DualRangeSlider;
