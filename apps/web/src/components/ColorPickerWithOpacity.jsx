'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

// Helper function to convert hex to RGB
const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

// Helper function to convert RGB to hex
const rgbToHex = (r, g, b) => {
  return `#${[r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('')}`.toUpperCase();
};

// Helper function to convert hex + opacity to rgba
const toRGBA = (hex, opacity) => {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
};

const ColorPickerWithOpacity = ({ 
  color, 
  opacity, 
  onChange, 
  onClose,
  disabled = false 
}) => {
  const [localColor, setLocalColor] = useState(color || '#000000');
  const [localOpacity, setLocalOpacity] = useState(opacity ?? 1);
  const [hue, setHue] = useState(0);
  const [saturation, setSaturation] = useState(100);
  const [lightness, setLightness] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggingHue, setIsDraggingHue] = useState(false);
  const pickerRef = useRef(null);
  const hueRef = useRef(null);

  // Initialize color on mount
  useEffect(() => {
    if (color) {
      setLocalColor(color);
    }
    if (opacity !== undefined && opacity !== null) {
      setLocalOpacity(opacity);
    }
  }, [color, opacity]);

  // Convert hex to HSL on mount and when color changes
  useEffect(() => {
    const rgb = hexToRgb(localColor);
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
        default: h = 0;
      }
    }
    
    setHue(Math.round(h * 360));
    setSaturation(Math.round(s * 100));
    setLightness(Math.round(l * 100));
  }, [localColor]);

  // Convert HSL to hex
  const hslToHex = (h, s, l) => {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (0 <= h && h < 60) {
      r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
      r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
      r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
      r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
      r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
      r = c; g = 0; b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return rgbToHex(r, g, b);
  };

  const handlePickerClick = (e) => {
    if (disabled) return;
    const rect = pickerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    setSaturation(Math.round(x * 100));
    setLightness(Math.round((1 - y) * 100));
    const newColor = hslToHex(hue, x * 100, (1 - y) * 100);
    setLocalColor(newColor);
    onChange(newColor, localOpacity);
  };

  const handleHueClick = (e) => {
    if (disabled) return;
    const rect = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newHue = Math.round(x * 360);
    setHue(newHue);
    const newColor = hslToHex(newHue, saturation, lightness);
    setLocalColor(newColor);
    onChange(newColor, localOpacity);
  };

  const handleOpacityChange = (e) => {
    if (disabled) return;
    const newOpacity = parseFloat(e.target.value);
    setLocalOpacity(newOpacity);
    onChange(localColor, newOpacity);
  };

  const handleHexChange = (e) => {
    if (disabled) return;
    let value = e.target.value.toUpperCase().trim();
    if (!value.startsWith('#')) {
      value = '#' + value;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
      setLocalColor(value);
      onChange(value, localOpacity);
    }
  };

  const handleRGBChange = (component, value) => {
    if (disabled) return;
    const rgb = hexToRgb(localColor);
    const numValue = Math.max(0, Math.min(255, parseInt(value) || 0));
    rgb[component] = numValue;
    const newColor = rgbToHex(rgb.r, rgb.g, rgb.b);
    setLocalColor(newColor);
    onChange(newColor, localOpacity);
  };

  const rgb = hexToRgb(localColor);
  const currentHslColor = `hsl(${hue}, 100%, 50%)`;
  const gradientColor = `linear-gradient(to bottom, 
    hsl(${hue}, 100%, 50%) 0%,
    hsl(${hue}, 100%, 25%) 50%,
    hsl(${hue}, 0%, 0%) 100%
  )`;

  return typeof document !== 'undefined' && createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div 
        className="glass-card-pro p-4 max-w-md w-full shadow-2xl my-auto max-h-[90vh] overflow-y-auto color-picker-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-analytics-primary">Color Picker</h3>
          <button
            onClick={onClose}
            className="text-analytics-secondary hover:text-analytics-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Main color picker area */}
        <div className="mb-3">
          <div className="relative w-full aspect-square max-h-48 rounded-lg overflow-hidden border-2 border-white/20 mb-2">
            {/* Saturation/Lightness picker */}
            <div
              ref={pickerRef}
              className="absolute inset-0 cursor-crosshair"
              style={{
                background: `linear-gradient(to top, #000 0%, transparent 100%), linear-gradient(to right, ${currentHslColor} 0%, #fff 100%)`,
              }}
              onClick={handlePickerClick}
              onMouseDown={() => setIsDragging(true)}
              onMouseMove={(e) => {
                if (isDragging) handlePickerClick(e);
              }}
              onMouseUp={() => setIsDragging(false)}
              onMouseLeave={() => setIsDragging(false)}
            >
              {/* Picker indicator */}
              <div
                className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none z-10"
                style={{
                  left: `${saturation}%`,
                  top: `${100 - lightness}%`,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
                }}
              />
            </div>
          </div>

          {/* Hue slider */}
          <div className="relative h-5 rounded-lg overflow-hidden border-2 border-white/20">
            <div
              ref={hueRef}
              className="absolute inset-0 cursor-pointer"
              style={{
                background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
              }}
              onClick={handleHueClick}
              onMouseDown={() => setIsDraggingHue(true)}
              onMouseMove={(e) => {
                if (isDraggingHue) handleHueClick(e);
              }}
              onMouseUp={() => setIsDraggingHue(false)}
              onMouseLeave={() => setIsDraggingHue(false)}
            >
              {/* Hue indicator */}
              <div
                className="absolute top-0 bottom-0 w-1 bg-white border border-black/20 pointer-events-none z-10"
                style={{
                  left: `${(hue / 360) * 100}%`,
                  transform: 'translateX(-50%)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Opacity slider */}
        <div className="mb-3">
          <label className="text-xs font-medium text-analytics-secondary mb-1.5 block">
            Opacity
          </label>
          <div className="space-y-1.5">
            <div className="relative h-5 rounded-lg overflow-hidden border-2 border-white/20">
              {/* Checkerboard pattern */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                }}
              />
              {/* Color gradient overlay */}
              <div
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(to right, ${toRGBA(localColor, 0)} 0%, ${toRGBA(localColor, 1)} 100%)`,
                }}
              />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={localOpacity}
                onChange={handleOpacityChange}
                disabled={disabled}
                className="absolute inset-0 w-full h-full appearance-none cursor-pointer z-10 opacity-0"
                style={{
                  background: 'transparent',
                  WebkitAppearance: 'none',
                  MozAppearance: 'none',
                }}
              />
              {/* Opacity indicator - visible thumb */}
              <div
                className="absolute top-1/2 w-4 h-4 bg-white border-2 border-black/30 pointer-events-none z-20 rounded-full"
                style={{
                  left: `${localOpacity * 100}%`,
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-analytics-secondary">0</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={localOpacity}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                  handleOpacityChange({ target: { value: val } });
                }}
                disabled={disabled}
                className="w-20 glass-input px-2 py-1 text-xs font-mono text-center"
              />
              <span className="text-xs text-analytics-secondary">1</span>
            </div>
          </div>
        </div>

        {/* Color preview */}
        <div className="mb-3">
          <label className="text-xs font-medium text-analytics-secondary mb-1.5 block">
            Preview
          </label>
          <div className="flex items-center gap-2">
            <div className="relative w-12 h-12 rounded-lg border-2 border-white/20 overflow-hidden flex-shrink-0">
              {/* Checkerboard pattern */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                }}
              />
              {/* Color with opacity */}
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: toRGBA(localColor, localOpacity),
                }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-analytics-secondary mb-1">RGBA</div>
              <div className="text-xs font-mono text-analytics-primary break-all">
                {`rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${localOpacity.toFixed(2)})`}
              </div>
            </div>
          </div>
        </div>

        {/* Hex and RGB inputs */}
        <div className="space-y-2">
          <div>
            <label className="text-xs font-medium text-analytics-secondary mb-1.5 block">
              Hex
            </label>
            <input
              type="text"
              value={localColor}
              onChange={handleHexChange}
              disabled={disabled}
              className="w-full glass-input px-2 py-1.5 text-xs font-mono"
              placeholder="#000000"
              maxLength={7}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-analytics-secondary mb-1.5 block">
              RGB
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="0"
                max="255"
                value={rgb.r}
                onChange={(e) => handleRGBChange('r', e.target.value)}
                disabled={disabled}
                className="flex-1 glass-input px-1.5 py-1.5 text-xs font-mono text-center"
                placeholder="R"
              />
              <input
                type="number"
                min="0"
                max="255"
                value={rgb.g}
                onChange={(e) => handleRGBChange('g', e.target.value)}
                disabled={disabled}
                className="flex-1 glass-input px-1.5 py-1.5 text-xs font-mono text-center"
                placeholder="G"
              />
              <input
                type="number"
                min="0"
                max="255"
                value={rgb.b}
                onChange={(e) => handleRGBChange('b', e.target.value)}
                disabled={disabled}
                className="flex-1 glass-input px-1.5 py-1.5 text-xs font-mono text-center"
                placeholder="B"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 glass-button-secondary py-1.5 text-xs"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onChange(localColor, localOpacity);
              onClose();
            }}
            disabled={disabled}
            className="flex-1 glass-button-primary py-1.5 text-xs text-white"
          >
            Apply
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ColorPickerWithOpacity;

