
import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CircleSizingControlProps {
  baseSize: number;
  setBaseSize: (size: number) => void;
  dataEmphasis: number;
  setDataEmphasis: (emphasis: number) => void;
  sizeBy: string;
  setSizeBy: (sizeBy: string) => void;
}

const CircleSizingControl: React.FC<CircleSizingControlProps> = ({
  baseSize,
  setBaseSize,
  dataEmphasis,
  setDataEmphasis,
  sizeBy,
  setSizeBy,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="bg-gray-800 text-white p-4 rounded-lg">
      <button
        className="w-full flex justify-between items-center text-left font-semibold"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>Circle Sizing</span>
        {isOpen ? <ChevronUp /> : <ChevronDown />}
      </button>
      {isOpen && (
        <div className="mt-4">
          <div className="mb-4">
            <label htmlFor="baseSize" className="block mb-2">
              Base Size
            </label>
            <input
              type="range"
              id="baseSize"
              min="1"
              max="100"
              value={baseSize}
              onChange={(e) => setBaseSize(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="dataEmphasis" className="block mb-2">
              Data Emphasis
            </label>
            <input
              type="range"
              id="dataEmphasis"
              min="0"
              max="1"
              step="0.1"
              value={dataEmphasis}
              onChange={(e) => setDataEmphasis(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div>
            <span className="block mb-2">Size Circles By</span>
            <div className="flex flex-col">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="sizeBy"
                  value="nameplateCapacity"
                  checked={sizeBy === 'nameplateCapacity'}
                  onChange={(e) => setSizeBy(e.target.value)}
                  className="mr-2"
                />
                Nameplate Capacity
              </label>
               <label className="flex items-center">
                 <input
                   type="radio"
                   name="sizeBy"
                   value="capacityFactor"
                   checked={sizeBy === 'capacityFactor'}
                   onChange={(e) => setSizeBy(e.target.value)}
                   className="mr-2"
                 />
                 Capacity Factor
               </label>
               <label className="flex items-center">
                 <input
                   type="radio"
                   name="sizeBy"
                   value="generation"
                   checked={sizeBy === 'generation'}
                   onChange={(e) => setSizeBy(e.target.value)}
                   className="mr-2"
                 />
                 Generation
               </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CircleSizingControl;
