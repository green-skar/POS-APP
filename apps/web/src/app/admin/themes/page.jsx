'use client';

import { apiFetch } from '@/utils/apiClient';
import { persistThemeToServer, clearThemeOnServer } from '@/utils/themeSync';
import React, { useState, useEffect } from 'react';
// Sidebar is now in admin layout - no need to import here
import { Palette, Save, RotateCcw, Check, Upload, Image as ImageIcon, Moon, Sun, History, X, Trash2, Edit2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { logButtonClick } from '@/utils/logActivity';
import ConfirmationModal from '@/components/ConfirmationModal';
import { usePasswordConfirmation } from '@/utils/usePasswordConfirmation';
import ColorPickerWithOpacity from '@/components/ColorPickerWithOpacity';

// Default theme values
const defaultTheme = {
  name: 'Default',
  mode: 'light',
  colors: {
    primary: '#1A1A1A',
    secondary: '#4B4B4B',
    revenue: '#1DAA5D',
    expense: '#E66E19',
    profit: '#00996D',
    stock: '#007ACC',
    loss: '#D63C3C',
    warning: '#D63C3C',
    success: '#10B981',
    info: '#3B82F6',
    accent: '#8B5CF6',
    sidebar: '#F9FAFB',
    card: '#FFFFFF',
    input: '#F3F4F6',
    buttonPrimary: '#3B82F6',
    buttonSecondary: '#6B7280',
    buttonSuccess: '#10B981',
    buttonDanger: '#EF4444',
    // POS-specific colors
    posBackground: '#F5F5F5',
    posCard: '#FFFFFF',
    posCart: '#FFFFFF',
    posProductCard: '#FFFFFF',
    posButton: '#3B82F6',
    posButtonHover: '#2563EB',
    posText: '#1A1A1A',
    posTextSecondary: '#6B7280',
    posBorder: '#E5E7EB',
    posActive: '#10B981',
    posSelected: '#DBEAFE',
  },
  glass: {
    blur: 9.5,
    opacity: 0.18,
    borderOpacity: 0.3,
  },
  buttonGlass: {
    blur: 12,
    opacity: 0.25,
    borderOpacity: 0.4,
  },
  background: {
    texture: '/Texturelabs_Wood_280L.jpg',
    overlay: 'linear-gradient(120deg, rgba(209, 146, 91, 0.22) 0%, rgba(161, 117, 77, 0.20) 50%, rgba(118, 88, 61, 0.18) 100%)',
    overlayType: 'gradient', // 'solid' or 'gradient'
    overlayOpacity: 1, // 0-1 for overall opacity
    solidColor: '#D1925B', // For solid overlay
    gradientColors: ['rgba(209, 146, 91, 0.22)', 'rgba(161, 117, 77, 0.20)', 'rgba(118, 88, 61, 0.18)'], // For gradient overlay
    gradientAngle: 120, // Gradient angle in degrees
    fit: 'Fill', // Fill, Fit, Stretch, Tile, Center, Span
  },
};

const presetThemes = [
  {
    name: 'Default',
    ...defaultTheme,
  },
  {
    name: 'Ocean',
    mode: 'light',
    colors: {
      primary: '#0A1929',
      secondary: '#4A5568',
      revenue: '#00BCD4',
      expense: '#FF6B6B',
      profit: '#4ECDC4',
      stock: '#2196F3',
      loss: '#E91E63',
      warning: '#FF9800',
      success: '#00E676',
      info: '#00ACC1',
      accent: '#536DFE',
      sidebar: '#E3F2FD',
      card: '#FFFFFF',
      input: '#E1F5FE',
    },
    glass: {
      blur: 12,
      opacity: 0.22,
      borderOpacity: 0.35,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(0, 188, 212, 0.15) 0%, rgba(33, 150, 243, 0.12) 50%, rgba(78, 205, 196, 0.1) 100%)',
    },
  },
  {
    name: 'Forest',
    mode: 'light',
    colors: {
      primary: '#1B3A2E',
      secondary: '#5A7A6F',
      revenue: '#4CAF50',
      expense: '#FF7043',
      profit: '#66BB6A',
      stock: '#26A69A',
      loss: '#EF5350',
      warning: '#FFA726',
      success: '#66BB6A',
      info: '#26A69A',
      accent: '#81C784',
      sidebar: '#E8F5E9',
      card: '#FFFFFF',
      input: '#F1F8E9',
    },
    glass: {
      blur: 10,
      opacity: 0.2,
      borderOpacity: 0.32,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(76, 175, 80, 0.18) 0%, rgba(102, 187, 106, 0.15) 50%, rgba(38, 166, 154, 0.12) 100%)',
    },
  },
  {
    name: 'Sunset',
    mode: 'light',
    colors: {
      primary: '#2C1810',
      secondary: '#6B4E3D',
      revenue: '#FF6B35',
      expense: '#F7931E',
      profit: '#FFA726',
      stock: '#FF7043',
      loss: '#E53935',
      warning: '#FB8C00',
      success: '#FFB74D',
      info: '#FF9800',
      accent: '#FF6F00',
      sidebar: '#FFF3E0',
      card: '#FFFFFF',
      input: '#FFE0B2',
    },
    glass: {
      blur: 11,
      opacity: 0.19,
      borderOpacity: 0.33,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(255, 107, 53, 0.2) 0%, rgba(255, 167, 38, 0.17) 50%, rgba(251, 140, 0, 0.14) 100%)',
    },
  },
  {
    name: 'Dark',
    mode: 'dark',
    colors: {
      primary: '#FFFFFF',
      secondary: '#B0BEC5',
      revenue: '#81C784',
      expense: '#FF8A65',
      profit: '#64B5F6',
      stock: '#90CAF9',
      loss: '#E57373',
      warning: '#FFB74D',
      success: '#81C784',
      info: '#64B5F6',
      accent: '#BA68C8',
      sidebar: '#1E1E1E',
      card: '#2D2D2D',
      input: '#3A3A3A',
    },
    glass: {
      blur: 14,
      opacity: 0.25,
      borderOpacity: 0.4,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(33, 33, 33, 0.85) 0%, rgba(66, 66, 66, 0.8) 50%, rgba(97, 97, 97, 0.75) 100%)',
    },
  },
  {
    name: 'Purple',
    mode: 'light',
    colors: {
      primary: '#1A0B2E',
      secondary: '#5B4A6F',
      revenue: '#9C27B0',
      expense: '#E91E63',
      profit: '#7B1FA2',
      stock: '#673AB7',
      loss: '#D32F2F',
      warning: '#FF5722',
      success: '#8E24AA',
      info: '#9C27B0',
      accent: '#BA68C8',
      sidebar: '#F3E5F5',
      card: '#FFFFFF',
      input: '#E1BEE7',
    },
    glass: {
      blur: 11,
      opacity: 0.2,
      borderOpacity: 0.34,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(156, 39, 176, 0.18) 0%, rgba(123, 31, 162, 0.15) 50%, rgba(103, 58, 183, 0.12) 100%)',
    },
  },
  {
    name: 'Cyber',
    mode: 'dark',
    colors: {
      primary: '#00FF88',
      secondary: '#B0BEC5',
      revenue: '#00FF88',
      expense: '#FF1744',
      profit: '#00E5FF',
      stock: '#7C4DFF',
      loss: '#FF1744',
      warning: '#FFD600',
      success: '#00FF88',
      info: '#00E5FF',
      accent: '#FF00FF',
      sidebar: '#0A0E27',
      card: '#1A1F3A',
      input: '#252B45',
    },
    glass: {
      blur: 15,
      opacity: 0.28,
      borderOpacity: 0.45,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(0, 255, 136, 0.1) 0%, rgba(0, 229, 255, 0.08) 50%, rgba(124, 77, 255, 0.06) 100%)',
    },
  },
  {
    name: 'Minimal',
    mode: 'light',
    colors: {
      primary: '#212121',
      secondary: '#757575',
      revenue: '#00C853',
      expense: '#FF6D00',
      profit: '#0091EA',
      stock: '#00ACC1',
      loss: '#D50000',
      warning: '#FFC400',
      success: '#00C853',
      info: '#0091EA',
      accent: '#7B1FA2',
      sidebar: '#FAFAFA',
      card: '#FFFFFF',
      input: '#F5F5F5',
    },
    glass: {
      blur: 8,
      opacity: 0.15,
      borderOpacity: 0.25,
    },
    background: {
      texture: '/Texturelabs_Wood_280L.jpg',
      overlay: 'linear-gradient(120deg, rgba(250, 250, 250, 0.9) 0%, rgba(245, 245, 245, 0.85) 50%, rgba(238, 238, 238, 0.8) 100%)',
    },
  },
];

/**
 * When true, changing background only updates the image (keeps Ocean/Forest/etc. palette).
 * "Default" is excluded so new users still get palette + glass derived from the uploaded image.
 */
function shouldPreservePresetColorsOnBackground(selectedTheme) {
  if (!selectedTheme) return false;
  return (
    !!presetThemes.find((t) => t.name === selectedTheme) && selectedTheme !== 'Default'
  );
}

const BG_HISTORY_STORAGE_KEY = 'background-history';
/** Keep history small — localStorage quota is ~5MB; data URLs must never be stored. */
const MAX_BG_HISTORY_ITEMS = 12;
const MAX_BG_REF_LENGTH = 2048;
/** If a previous build stored base64 in this key, drop it rather than parsing multi‑MB JSON. */
const MAX_BG_HISTORY_RAW_LENGTH = 120000;

/** Data URLs (base64) exceed quota quickly — only paths/URLs belong in localStorage. */
function isPersistableBackgroundRef(ref) {
  if (typeof ref !== 'string' || ref.length === 0) return false;
  if (ref.startsWith('data:')) return false;
  if (ref.length > MAX_BG_REF_LENGTH) return false;
  return true;
}

function sanitizeBackgroundHistoryForStorage(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPersistableBackgroundRef).slice(0, MAX_BG_HISTORY_ITEMS);
}

function isStorageQuotaError(e) {
  if (!e) return false;
  if (e.name === 'QuotaExceededError') return true;
  if (e.code === 22) return true;
  if (e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  return /quota/i.test(String(e.message || ''));
}

/** Never throws — avoids React crashing if localStorage is full. */
function persistBackgroundHistory(next) {
  try {
    const clean = sanitizeBackgroundHistoryForStorage(next);
    const payload = JSON.stringify(clean);
    try {
      localStorage.setItem(BG_HISTORY_STORAGE_KEY, payload);
    } catch (e) {
      if (isStorageQuotaError(e)) {
        for (let n = clean.length; n >= 0; n--) {
          try {
            if (n === 0) {
              localStorage.removeItem(BG_HISTORY_STORAGE_KEY);
              return;
            }
            localStorage.setItem(BG_HISTORY_STORAGE_KEY, JSON.stringify(clean.slice(0, n)));
            return;
          } catch {
            // keep trimming
          }
        }
        try {
          localStorage.removeItem(BG_HISTORY_STORAGE_KEY);
        } catch {
          // ignore
        }
      } else {
        console.warn('Could not save background history:', e);
      }
    }
  } catch (e) {
    console.warn('persistBackgroundHistory failed:', e);
    try {
      localStorage.removeItem(BG_HISTORY_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export default function ThemeCustomization() {
  // Sidebar state is now managed by AdminLayout
  const [selectedTheme, setSelectedTheme] = useState('Default');
  const [customTheme, setCustomTheme] = useState(defaultTheme);
  const [isEditing, setIsEditing] = useState(false);
  const [backgroundHistory, setBackgroundHistory] = useState([]);
  const [colorHistory, setColorHistory] = useState({});
  const [originalCustomTheme, setOriginalCustomTheme] = useState(null);
  const [presetThemesState, setPresetThemesState] = useState(presetThemes);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showNavigationModal, setShowNavigationModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null); // Store navigation target
  const [pendingThemeSwitch, setPendingThemeSwitch] = useState(null); // Store theme to switch to
  const [themeNameInput, setThemeNameInput] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [hasAppliedChanges, setHasAppliedChanges] = useState(false); // Track if user has applied theme changes
  const [isEditingSavedTheme, setIsEditingSavedTheme] = useState(false); // Track if editing a saved (not preset) theme
  const [originalThemeState, setOriginalThemeState] = useState(null); // Store the theme state before modifications
  const [originalPresetState, setOriginalPresetState] = useState(null); // Store original preset theme state when editing a preset
  const [isThemeApplied, setIsThemeApplied] = useState(true); // Track if currently selected theme is applied/persisted
  const [isUnnamedThemeApplied, setIsUnnamedThemeApplied] = useState(false); // Track if a custom theme is applied but not saved with a name
  const [showDeletePresetModal, setShowDeletePresetModal] = useState(false);
  const [themeToDelete, setThemeToDelete] = useState(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [showThemeSwitchModal, setShowThemeSwitchModal] = useState(false);
  const [pendingPresetTarget, setPendingPresetTarget] = useState(null);
  const [fontSize, setFontSize] = useState(16); // Default font size in pixels
  const [openColorPicker, setOpenColorPicker] = useState(null); // { key, hex, opacity } or null
  const [applyThemeOnExit, setApplyThemeOnExit] = useState(true); // Checkbox state for save modal
  const fileInputRef = React.useRef(null);

  // Helper function to ensure theme has overlay properties (backward compatibility)
  const ensureOverlayProperties = (theme) => {
    if (!theme.background) {
      theme.background = { ...defaultTheme.background };
    }
    
    // Parse existing overlay if it's a gradient string
    if (!theme.background.overlayType) {
      if (theme.background.overlay && theme.background.overlay.includes('gradient')) {
        const parsed = parseGradient(theme.background.overlay);
        theme.background.overlayType = 'gradient';
        theme.background.gradientColors = parsed.colors.length > 0 ? parsed.colors : defaultTheme.background.gradientColors;
        theme.background.gradientAngle = parsed.angle;
      } else {
        theme.background.overlayType = 'solid';
        const rgb = colorToRgb(theme.background.overlay || '#D1925B');
        theme.background.solidColor = `#${[rgb.r, rgb.g, rgb.b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
      }
      theme.background.overlayOpacity = 1;
    }
    
    // Ensure all overlay properties exist
    if (!theme.background.overlayType) theme.background.overlayType = 'gradient';
    if (!theme.background.overlayOpacity) theme.background.overlayOpacity = 1;
    if (!theme.background.solidColor) theme.background.solidColor = '#D1925B';
    if (!theme.background.gradientColors) theme.background.gradientColors = defaultTheme.background.gradientColors;
    if (!theme.background.gradientAngle) theme.background.gradientAngle = 120;
    if (!theme.background.fit) theme.background.fit = 'Fill';
    
    return theme;
  };

  // Helper function to ensure theme has button colors (backward compatibility)
  const ensureButtonColors = (theme) => {
    if (!theme.colors) {
      theme.colors = { ...defaultTheme.colors };
    }
    
    // Ensure button colors exist
    if (!theme.colors.buttonPrimary) theme.colors.buttonPrimary = defaultTheme.colors.buttonPrimary;
    if (!theme.colors.buttonSecondary) theme.colors.buttonSecondary = defaultTheme.colors.buttonSecondary;
    if (!theme.colors.buttonSuccess) theme.colors.buttonSuccess = defaultTheme.colors.buttonSuccess;
    if (!theme.colors.buttonDanger) theme.colors.buttonDanger = defaultTheme.colors.buttonDanger;
    
    return theme;
  };

  // Helper function to ensure theme has button glass properties (backward compatibility)
  const ensureButtonGlass = (theme) => {
    if (!theme.buttonGlass) {
      theme.buttonGlass = { ...defaultTheme.buttonGlass };
    }
    
    // Ensure all button glass properties exist
    if (theme.buttonGlass.blur === undefined) theme.buttonGlass.blur = defaultTheme.buttonGlass.blur;
    if (theme.buttonGlass.opacity === undefined) theme.buttonGlass.opacity = defaultTheme.buttonGlass.opacity;
    if (theme.buttonGlass.borderOpacity === undefined) theme.buttonGlass.borderOpacity = defaultTheme.buttonGlass.borderOpacity;
    
    return theme;
  };

  // Helper function to ensure theme has POS colors (backward compatibility)
  const ensurePOSColors = (theme) => {
    if (!theme.colors) {
      theme.colors = { ...defaultTheme.colors };
    }
    
    // Ensure all POS color properties exist
    const posColorKeys = ['posBackground', 'posCard', 'posCart', 'posProductCard', 'posButton', 'posButtonHover', 'posText', 'posTextSecondary', 'posBorder', 'posActive', 'posSelected'];
    posColorKeys.forEach(key => {
      if (!theme.colors[key]) {
        theme.colors[key] = defaultTheme.colors[key];
      } else {
        // Ensure existing colors are in the new format (object with hex and opacity)
        const parsed = parseColor(theme.colors[key]);
        theme.colors[key] = { hex: parsed.hex, opacity: parsed.opacity };
      }
    });
    
    return theme;
  };

  // Helper function to ensure all colors are in the new format (object with hex and opacity)
  const ensureColorFormat = (theme) => {
    if (!theme.colors) {
      theme.colors = { ...defaultTheme.colors };
    }
    
    // Convert all colors to new format
    Object.keys(theme.colors).forEach(key => {
      const parsed = parseColor(theme.colors[key]);
      theme.colors[key] = { hex: parsed.hex, opacity: parsed.opacity };
    });
    
    return theme;
  };

  // Load saved theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('app-theme');
    const tempTheme = sessionStorage.getItem('temp-theme');
    const savedBackgrounds = localStorage.getItem(BG_HISTORY_STORAGE_KEY);
    const savedColorHistory = localStorage.getItem('color-history');
    const savedCustomPresets = localStorage.getItem('custom-preset-themes');
    
    // Ensure POS colors and color format in all preset themes
    const presetThemesWithPOS = presetThemes.map(theme => {
      const themeWithPOS = { ...theme };
      ensurePOSColors(themeWithPOS);
      ensureColorFormat(themeWithPOS); // Convert all colors to new format
      return themeWithPOS;
    });

    // Load custom preset themes
    if (savedCustomPresets) {
      try {
        const customPresets = JSON.parse(savedCustomPresets);
        // Ensure overlay properties and button colors for custom presets
        customPresets.forEach(theme => {
          ensureOverlayProperties(theme);
          ensureButtonColors(theme);
          ensureButtonGlass(theme);
          ensurePOSColors(theme);
          ensureColorFormat(theme); // Convert all colors to new format
        });
        setPresetThemesState([...presetThemesWithPOS, ...customPresets]);
      } catch (e) {
        console.error('Error loading custom presets:', e);
        setPresetThemesState(presetThemesWithPOS);
      }
    } else {
      setPresetThemesState(presetThemesWithPOS);
    }
    
    // Check for temporary theme first (from sessionStorage)
    if (tempTheme) {
      try {
        const theme = JSON.parse(tempTheme);
        ensureOverlayProperties(theme);
        ensureButtonColors(theme);
        ensureButtonGlass(theme);
        ensurePOSColors(theme);
        ensureColorFormat(theme); // Convert all colors to new format
        setSelectedTheme(theme.name || 'Custom');
        setCustomTheme(theme);
        applyTheme(theme, false); // Apply but don't re-save to sessionStorage
        // Store as original custom theme if it's not light/dark mode
        if (theme.mode !== 'light' && theme.mode !== 'dark' && theme.name !== 'Light Mode' && theme.name !== 'Dark Mode') {
          setOriginalCustomTheme(theme);
        }
      } catch (e) {
        console.error('Error loading temp theme:', e);
        // Fall through to saved theme
      }
    } else if (savedTheme) {
      try {
        const theme = JSON.parse(savedTheme);
        ensureOverlayProperties(theme);
        ensureButtonColors(theme);
        ensureButtonGlass(theme);
        ensurePOSColors(theme);
        ensureColorFormat(theme); // Ensure all colors are in new format
        setSelectedTheme(theme.name);
        setCustomTheme(theme);
        applyTheme(theme, false); // false = persist immediately
        setHasUnsavedChanges(false);
        setIsThemeApplied(true); // Theme is applied on load
        // Check if this is a preset theme or saved theme
        const isPresetTheme = presetThemes.find(t => t.name === theme.name);
        
        // Check if it's an unnamed applied theme (name is 'Custom' but not in saved presets)
        let isUnnamed = false;
        if (theme.name === 'Custom') {
          const customPresets = savedCustomPresets ? JSON.parse(savedCustomPresets) : [];
          isUnnamed = !presetThemes.find(t => t.name === 'Custom') && 
                     !customPresets.find(t => t.name === 'Custom');
        }
        
        setIsUnnamedThemeApplied(isUnnamed);
        setIsEditingSavedTheme(!isPresetTheme && theme.name !== 'Default' && !isUnnamed);
        // Store original theme state for reversion
        setOriginalThemeState(JSON.parse(JSON.stringify(theme)));
        if (isPresetTheme || theme.name === 'Default') {
          setOriginalPresetState(JSON.parse(JSON.stringify(theme)));
        }
        // Store as original custom theme if it's not light/dark mode
        if (theme.mode !== 'light' && theme.mode !== 'dark' && theme.name !== 'Light Mode' && theme.name !== 'Dark Mode') {
          setOriginalCustomTheme(theme);
        }
      } catch (e) {
        console.error('Error loading theme:', e);
      }
    } else {
      applyTheme(defaultTheme);
      setIsThemeApplied(true); // Default theme is applied
      setOriginalThemeState(JSON.parse(JSON.stringify(defaultTheme)));
      setOriginalPresetState(JSON.parse(JSON.stringify(defaultTheme)));
    }

    if (savedBackgrounds) {
      try {
        if (savedBackgrounds.length > MAX_BG_HISTORY_RAW_LENGTH) {
          console.warn('Clearing oversized background-history from localStorage');
          localStorage.removeItem(BG_HISTORY_STORAGE_KEY);
          setBackgroundHistory([]);
        } else {
          const parsed = JSON.parse(savedBackgrounds);
          const clean = sanitizeBackgroundHistoryForStorage(parsed);
          if (Array.isArray(parsed) && clean.length !== parsed.length) {
            persistBackgroundHistory(clean);
          }
          setBackgroundHistory(clean);
        }
      } catch (e) {
        console.error('Error loading background history:', e);
        try {
          localStorage.removeItem(BG_HISTORY_STORAGE_KEY);
        } catch {
          // ignore
        }
        setBackgroundHistory([]);
      }
    }

    if (savedColorHistory) {
      try {
        setColorHistory(JSON.parse(savedColorHistory));
      } catch (e) {
        console.error('Error loading color history:', e);
      }
    }

    // Load saved font size
    const savedFontSize = localStorage.getItem('app-font-size');
    if (savedFontSize) {
      try {
        const size = parseInt(savedFontSize, 10);
        if (size >= 12 && size <= 24) {
          setFontSize(size);
          // Apply font size after a short delay to ensure DOM is ready
          setTimeout(() => {
            applyFontSize(size);
          }, 100);
        }
      } catch (e) {
        console.error('Error loading font size:', e);
      }
    } else {
      // Apply default font size
      setTimeout(() => {
        applyFontSize(16);
      }, 100);
    }
  }, []);

  // Navigation blocking when there are unsaved changes, applied changes, or theme not applied
  // Only show browser alert if modal is not showing (modal handles it)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Only show browser alert if modal is not already showing
      // Check for unsaved changes, applied changes, unnamed applied themes, or unapplied themes
      if ((hasUnsavedChanges || hasAppliedChanges || !isThemeApplied || isUnnamedThemeApplied) && !showNavigationModal && !showSaveModal) {
        // Modern browsers ignore custom messages, but still require setting returnValue
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
        return e.returnValue;
      }
    };

    // Block browser navigation (back/forward/refresh/close)
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Block internal navigation (clicking sidebar links, etc.)
    const handleLinkClick = (e) => {
      // Check if there are unsaved changes, applied changes, unnamed applied themes, or unapplied themes
      if (!hasUnsavedChanges && !hasAppliedChanges && isThemeApplied && !isUnnamedThemeApplied) {
        return; // No unsaved changes and theme is applied and named, allow navigation
      }

      // Check if the clicked element or its parent is a link
      let target = e.target;
      while (target && target !== document.body) {
        if (target.tagName === 'A' && target.href) {
          // Skip anchor links (#)
          if (target.href.includes('#') || target.href === window.location.href) {
            return; // Allow same-page anchors
          }

          // This is a navigation link
          const href = new URL(target.href).pathname;
          const currentPath = window.location.pathname;

          // Only block if navigating to a different page
          if (href !== currentPath) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            // Show navigation modal instead of confirm
            setPendingNavigation(target.href);
            setShowNavigationModal(true);
            
            return false;
          }
          break;
        }
        target = target.parentElement;
      }
    };

    // Listen for clicks on links (using capture phase to intercept early)
    document.addEventListener('click', handleLinkClick, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [hasUnsavedChanges, hasAppliedChanges, isThemeApplied, isUnnamedThemeApplied, showNavigationModal, showSaveModal]);

  // Apply font size to CSS variable
  const applyFontSize = (size) => {
    const root = document.documentElement;
    // Set on html element so rem units scale properly
    root.style.setProperty('--app-font-size', `${size}px`);
    if (document.documentElement) {
      document.documentElement.style.fontSize = `${size}px`;
    }
    // Save to localStorage
    localStorage.setItem('app-font-size', size.toString());
  };

  // Apply theme to CSS variables and persist immediately
  const applyTheme = (theme, isTemporary = false) => {
    const root = document.documentElement;
    const body = document.body;
    
    // Mode
    root.setAttribute('data-theme-mode', theme.mode || 'light');
    
    // Color variables
    Object.entries(theme.colors).forEach(([key, value]) => {
      // Parse color value (could be hex string, rgba string, or object with hex/opacity)
      let colorValue = value;
      let opacity = 1;
      
      if (typeof value === 'object' && value !== null && value.hex) {
        // New format: { hex: '#FF0000', opacity: 0.8 }
        colorValue = toRGBA(value.hex, value.opacity ?? 1);
        opacity = value.opacity ?? 1;
      } else if (typeof value === 'string' && value.startsWith('rgba')) {
        // Already rgba format
        colorValue = value;
        const match = value.match(/rgba?\([\d\s,]+,\s*([\d.]+)\)/);
        if (match) opacity = parseFloat(match[1]);
      } else if (typeof value === 'string' && value.startsWith('#')) {
        // Hex format - convert to rgba with opacity 1
        const parsed = parseColor(value);
        colorValue = toRGBA(parsed.hex, parsed.opacity);
        opacity = parsed.opacity;
      }
      
      root.style.setProperty(`--theme-${key}`, colorValue);
      root.style.setProperty(`--theme-${key}-opacity`, opacity.toString());
      
      // Also set POS-specific variables with proper naming
      if (key.startsWith('pos')) {
        // Convert posBackground -> --pos-background, posButtonHover -> --pos-button-hover
        const posKey = key.replace('pos', '').replace(/([A-Z])/g, '-$1').toLowerCase();
        root.style.setProperty(`--pos-${posKey}`, colorValue);
        root.style.setProperty(`--pos-${posKey}-opacity`, opacity.toString());
      }
    });
    
    // Glass variables
    root.style.setProperty('--glass-blur', `${theme.glass.blur}px`);
    root.style.setProperty('--glass-opacity', theme.glass.opacity);
    root.style.setProperty('--glass-border-opacity', theme.glass.borderOpacity);
    
    // Button glass variables
    const buttonGlass = theme.buttonGlass || { blur: 12, opacity: 0.25, borderOpacity: 0.4 };
    root.style.setProperty('--button-glass-blur', `${buttonGlass.blur}px`);
    root.style.setProperty('--button-glass-opacity', buttonGlass.opacity);
    root.style.setProperty('--button-glass-border-opacity', buttonGlass.borderOpacity);
    
    // Background variables - generate overlay from config
    const overlayString = generateOverlay(theme.background);
    root.style.setProperty('--bg-overlay', overlayString);
    // Handle texture - if it's 'none', set it properly, otherwise set the URL
    if (theme.background.texture === 'none') {
      root.style.setProperty('--bg-texture', 'none');
      // Hide the texture pseudo-element by adding a class
      if (body) {
        body.classList.add('no-texture');
      }
    } else if (theme.background.texture) {
      // Handle both regular URLs and data URLs
      const textureUrl = theme.background.texture;
      // For data URLs, use double quotes to handle special characters
      // For regular URLs, use single quotes
      let cssValue;
      if (textureUrl.startsWith('data:')) {
        // Data URLs may contain special characters, use double quotes and escape if needed
        cssValue = `url("${textureUrl.replace(/"/g, '\\"')}")`;
      } else {
        cssValue = `url('${textureUrl}')`;
      }
      root.style.setProperty('--bg-texture', cssValue);
      // Show the texture by removing the class
      if (body) {
        body.classList.remove('no-texture');
      }
      
      // Force a reflow to ensure the background is applied
      void root.offsetHeight;
      
      // Apply background fit settings
      const fit = theme.background.fit || 'Fill';
      switch (fit) {
        case 'Fill':
          root.style.setProperty('--bg-size', 'cover');
          root.style.setProperty('--bg-repeat', 'no-repeat');
          root.style.setProperty('--bg-position', 'center center');
          break;
        case 'Fit':
          root.style.setProperty('--bg-size', 'contain');
          root.style.setProperty('--bg-repeat', 'no-repeat');
          root.style.setProperty('--bg-position', 'center center');
          break;
        case 'Stretch':
          root.style.setProperty('--bg-size', '100% 100%');
          root.style.setProperty('--bg-repeat', 'no-repeat');
          root.style.setProperty('--bg-position', 'center center');
          break;
        case 'Tile':
          root.style.setProperty('--bg-size', 'auto');
          root.style.setProperty('--bg-repeat', 'repeat');
          root.style.setProperty('--bg-position', 'top left');
          break;
        case 'Center':
          root.style.setProperty('--bg-size', 'auto');
          root.style.setProperty('--bg-repeat', 'no-repeat');
          root.style.setProperty('--bg-position', 'center center');
          break;
        case 'Span':
          root.style.setProperty('--bg-size', 'cover');
          root.style.setProperty('--bg-repeat', 'no-repeat');
          root.style.setProperty('--bg-position', 'center center');
          break;
        default:
          root.style.setProperty('--bg-size', 'cover');
          root.style.setProperty('--bg-repeat', 'no-repeat');
          root.style.setProperty('--bg-position', 'center center');
      }
    }
    
    // Always save theme to localStorage to persist
    if (!isTemporary) {
      localStorage.setItem('app-theme', JSON.stringify(theme));
      void persistThemeToServer(theme);
      sessionStorage.removeItem('temp-theme'); // Clear any temporary theme
      setHasUnsavedChanges(false); // Changes are now saved
      
      // Notify root (same-tab localStorage doesn't fire StorageEvent)
      window.dispatchEvent(new Event('theme-changed'));
      
      // Log theme application
      try {
        apiFetch('/api/users/log-activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            action_type: 'theme_change',
            action_description: `Applied theme: ${theme.name || 'Custom'}`,
            entity_type: 'theme',
            entity_id: null,
            metadata: JSON.stringify({
              theme_name: theme.name || 'Custom',
              theme_mode: theme.mode || 'light',
              has_background: theme.background?.texture && theme.background.texture !== 'none'
            })
          }),
        }).catch(error => {
          console.error('Failed to log theme change:', error);
        });
      } catch (error) {
        console.error('Failed to log theme change:', error);
      }
    } else {
      // Temporary preview: keep a copy in sessionStorage so root.tsx can rehydrate on navigation.
      let tempStored = false;
      try {
      sessionStorage.setItem('temp-theme', JSON.stringify(theme));
        tempStored = true;
      } catch (e) {
        // Large data URLs can exceed quota; DOM styles above still apply.
        // Do NOT dispatch theme-changed — root's applyThemeFromStorage() would read only
        // localStorage app-theme (stale) and overwrite the preview we just set on :root.
        console.warn('temp-theme sessionStorage failed (quota or size); theme still applied in-page:', e);
      }
      setHasUnsavedChanges(true);
      if (tempStored) {
      window.dispatchEvent(new Event('theme-changed'));
    }
    }
  };

  const handlePresetSelect = (themeName, skipConfirmation = false) => {
    if (!skipConfirmation && themeName && selectedTheme && selectedTheme !== themeName) {
      setPendingPresetTarget(themeName);
      setShowThemeSwitchModal(true);
      return;
    }

    // Check if this is a preset theme (not editable) or saved theme (editable)
    const isPresetTheme = presetThemes.find(t => t.name === themeName);
    
    // If editing any theme (preset or saved) with unsaved modifications, show save modal
    // This includes switching between saved themes, between preset and saved themes
    if (hasUnsavedChanges && selectedTheme && selectedTheme !== themeName) {
      // Check if currently selected theme is preset or saved
      const currentIsPreset = presetThemes.find(t => t.name === selectedTheme);
      const currentIsSaved = presetThemesState.find(t => t.name === selectedTheme && t.name !== 'Default' && !currentIsPreset);
      
      if (isEditingSavedTheme || currentIsPreset || currentIsSaved) {
        setPendingThemeSwitch(themeName);
        setShowSaveModal(true);
        return;
      }
    }
    
    const theme = presetThemesState.find(t => t.name === themeName);
    if (theme) {
      // Ensure POS colors and color format exist in the theme
      ensurePOSColors(theme);
      ensureColorFormat(theme); // Convert all colors to new format
      // Check if this is a saved theme (not a preset)
      const isSavedTheme = !isPresetTheme && themeName !== 'Default';
      
      let themeToApply;
      
      if (themeName === 'Default') {
        // Default theme: use default background
        themeToApply = { ...theme };
      } else if (isSavedTheme) {
        // Saved themes: always use their own background (they retain their background image)
        const themeWithFit = {
          ...theme,
          background: {
            ...theme.background,
            fit: theme.background.fit || 'Fill', // Ensure fit exists
          },
        };
        themeToApply = themeWithFit;
      } else {
        // Preset themes: preserve custom uploaded background if present
        const currentBackground = customTheme.background;
        const isCustomBackground = currentBackground.texture && 
          (currentBackground.texture.startsWith('data:') || 
           (backgroundHistory.length > 0 && backgroundHistory.includes(currentBackground.texture)));
        
        if (isCustomBackground) {
          themeToApply = {
            ...theme,
            background: {
              ...currentBackground, // Keep custom texture and fit
              overlay: theme.background.overlay, // Use preset's overlay to match color scheme
              fit: currentBackground.fit || 'Fill', // Preserve fit setting
            },
          };
        } else {
          // Use preset's background if current one is default
          const themeWithFit = {
            ...theme,
            background: {
              ...theme.background,
              fit: theme.background.fit || 'Fill', // Ensure fit exists
            },
          };
          themeToApply = themeWithFit;
        }
      }
      
      // Store current state as original BEFORE applying new theme (only if this is a genuine new selection)
      // When switching between themes, we want to store the state before the switch
      if (!originalThemeState) {
        // First time selecting a theme after page load - store the current state
        setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
      } else if (selectedTheme && selectedTheme !== themeName) {
        // Switching from one theme to another - update original to the current theme's state
        // This allows reverting to the last explicitly applied/saved theme
        const currentThemeData = presetThemesState.find(t => t.name === selectedTheme);
        if (currentThemeData) {
          // Use the current theme as the new baseline for reversion
          setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
        }
      }
      
      setSelectedTheme(themeName);
      setCustomTheme(themeToApply);
      
      // If no unsaved changes, apply theme instantly
      const shouldApplyInstantly = !hasUnsavedChanges && !hasAppliedChanges;
      
      if (shouldApplyInstantly) {
        // Apply theme immediately and persist it
        applyTheme(themeToApply, false); // false = persist to localStorage
        setIsThemeApplied(true);
        toast.success(`Theme "${themeName}" applied`, {
          description: 'Theme has been applied and saved.',
        });
      } else {
        // Apply theme visually but DON'T persist yet - user needs to explicitly apply/save
        applyTheme(themeToApply, true); // true = temporary, don't persist to localStorage yet
        setIsThemeApplied(false); // Theme is selected but not applied/persisted yet
      }
      
      // Set editing state: allow editing for both saved themes and presets (including Default)
      setIsEditingSavedTheme(!isPresetTheme && themeName !== 'Default');
      setIsEditing(false); // Don't enable editing by default - user needs to click edit icon
      setHasUnsavedChanges(false); // Clear unsaved changes
      
      // Store original preset state when editing a preset theme
      if (isPresetTheme || themeName === 'Default') {
        setOriginalPresetState(JSON.parse(JSON.stringify(theme)));
      }
      
      // Log theme selection
      try {
        apiFetch('/api/users/log-activity', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            action_type: 'theme_change',
            action_description: `Selected theme: ${themeName}`,
            entity_type: 'theme',
            entity_id: null,
            metadata: JSON.stringify({
              theme_name: themeName,
              theme_mode: themeToApply.mode || 'light',
              is_preset: !!isPresetTheme,
              is_saved: !isPresetTheme && themeName !== 'Default'
            })
          }),
        }).catch(error => {
          console.error('Failed to log theme selection:', error);
        });
      } catch (error) {
        console.error('Failed to log theme selection:', error);
      }
      
      toast.info(`Theme "${themeName}" selected`, {
        description: 'Click the edit icon to enable editing, or navigate away without applying to revert.',
      });
    }
  };

  // Function to revert to original theme state
  const revertToOriginalTheme = (persist = true) => {
    if (originalThemeState) {
      setCustomTheme(originalThemeState);
      if (persist) {
        // Persist the reversion to localStorage
        applyTheme(originalThemeState, false);
        // Restore the original theme state tracking
        setOriginalThemeState(JSON.parse(JSON.stringify(originalThemeState)));
      } else {
        // Just apply visually without persisting (for navigation scenarios)
        applyTheme(originalThemeState, true);
        // Clear temporary theme from sessionStorage
        sessionStorage.removeItem('temp-theme');
      }
      setSelectedTheme(originalThemeState.name || 'Default');
      const isPresetTheme = presetThemes.find(t => t.name === originalThemeState.name);
      setIsEditingSavedTheme(!isPresetTheme && originalThemeState.name !== 'Default');
      setIsThemeApplied(persist); // Theme is applied only if persisted
      setHasUnsavedChanges(false);
      setHasAppliedChanges(false);
      // Check if original theme was an unnamed applied theme
      if (originalThemeState.name === 'Custom') {
        const customPresets = presetThemesState.filter(t => !presetThemes.find(pt => pt.name === t.name));
        const isUnnamed = !presetThemes.find(t => t.name === 'Custom') && 
                         !customPresets.find(t => t.name === 'Custom');
        setIsUnnamedThemeApplied(isUnnamed);
      } else {
        setIsUnnamedThemeApplied(false);
      }
    }
  };

  // Helper function to parse color (hex or rgba) and extract hex + opacity
  const parseColor = (colorValue) => {
    if (!colorValue) return { hex: '#000000', opacity: 1 };
    
    // If it's already an object with hex and opacity
    if (typeof colorValue === 'object' && colorValue.hex) {
      return { hex: colorValue.hex, opacity: colorValue.opacity ?? 1 };
    }
    
    // If it's rgba/rgb string
    if (typeof colorValue === 'string' && colorValue.startsWith('rgba')) {
      const match = colorValue.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
        const r = parseInt(match[1]);
        const g = parseInt(match[2]);
        const b = parseInt(match[3]);
        const a = match[4] ? parseFloat(match[4]) : 1;
        const hex = `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        return { hex, opacity: a };
      }
    }
    
    // If it's hex (with or without alpha)
    if (typeof colorValue === 'string' && colorValue.startsWith('#')) {
      if (colorValue.length === 9) {
        // #RRGGBBAA format
        const hex = colorValue.substring(0, 7);
        const alpha = parseInt(colorValue.substring(7, 9), 16) / 255;
        return { hex, opacity: alpha };
      } else if (colorValue.length === 7) {
        // #RRGGBB format
        return { hex: colorValue, opacity: 1 };
      }
    }
    
    // Default fallback
    return { hex: '#000000', opacity: 1 };
  };

  // Helper function to convert hex + opacity to rgba string
  const toRGBA = (hex, opacity) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const handleColorChange = (colorKey, value, opacity = null) => {
    // Store original theme state before first modification
    if (!hasUnsavedChanges && !hasAppliedChanges && originalThemeState) {
      // Already have original state, don't overwrite
    } else if (!hasUnsavedChanges && !hasAppliedChanges) {
      // First modification, store current state as original
      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
    }
    
    // Parse current color value
    const currentColor = parseColor(customTheme.colors[colorKey]);
    const currentOpacity = opacity !== null ? opacity : currentColor.opacity;
    
    // Normalize value
    const normalizedValue = value ? value.toUpperCase().trim() : currentColor.hex;
    
    // Validate hex color format
    if (normalizedValue && !/^#[0-9A-Fa-f]{6}$/.test(normalizedValue)) {
      // Allow partial input (while typing)
      if (normalizedValue === '' || /^#[0-9A-Fa-f]{0,6}$/.test(normalizedValue)) {
        const updatedTheme = {
          ...customTheme,
          colors: {
            ...customTheme.colors,
            [colorKey]: { hex: normalizedValue || currentColor.hex, opacity: currentOpacity },
          },
        };
      setCustomTheme(updatedTheme);
      
      // If editing a saved theme or preset theme, apply temporarily until saved
      const isPresetTheme = presetThemes.find(t => t.name === selectedTheme);
      const isSavedTheme = isEditingSavedTheme && selectedTheme !== 'Default' && !isPresetTheme;
      
      if (isEditing && (isSavedTheme || isPresetTheme || selectedTheme === 'Default')) {
        // Editing a saved/preset theme - apply temporarily for valid colors
        if (/^#[0-9A-Fa-f]{6}$/.test(normalizedValue)) {
          applyTheme(updatedTheme, true); // true = temporary
          setHasUnsavedChanges(true);
          setHasAppliedChanges(true);
        } else {
          setHasUnsavedChanges(true);
        }
      } else {
        // Auto-apply theme changes as user types (only for valid hex) and persist
        if (/^#[0-9A-Fa-f]{6}$/.test(normalizedValue)) {
          applyTheme(updatedTheme, false); // false = persist immediately
          setHasUnsavedChanges(false);
          setHasAppliedChanges(true);
        } else {
          setHasUnsavedChanges(true);
        }
      }
        return;
      }
    }

    // Ensure we have a valid hex color
    const finalHex = normalizedValue && /^#[0-9A-Fa-f]{6}$/.test(normalizedValue) 
      ? normalizedValue 
      : currentColor.hex;
    
    const finalOpacity = Math.max(0, Math.min(1, currentOpacity));

    // Save to color history only for valid hex colors that are different
    if (finalHex && /^#[0-9A-Fa-f]{6}$/.test(finalHex)) {
      const updatedHistory = { ...colorHistory };
      if (!updatedHistory[colorKey]) {
        updatedHistory[colorKey] = [];
      }
      const currentValue = customTheme.colors[colorKey];
      const currentParsed = parseColor(currentValue);
      if (currentParsed.hex && currentParsed.hex !== finalHex && /^#[0-9A-Fa-f]{6}$/.test(currentParsed.hex)) {
        const historyKey = `${currentParsed.hex}_${currentParsed.opacity}`;
        if (!updatedHistory[colorKey].includes(historyKey)) {
          const newHistory = [historyKey, ...updatedHistory[colorKey]].slice(0, 10);
          updatedHistory[colorKey] = newHistory;
          setColorHistory(updatedHistory);
          localStorage.setItem('color-history', JSON.stringify(updatedHistory));
        }
      }
    }

    // Store original theme state before modification if not already stored
    if (!originalThemeState || !hasAppliedChanges) {
      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
    }

    const updatedTheme = {
      ...customTheme,
      colors: {
        ...customTheme.colors,
        [colorKey]: { hex: finalHex, opacity: finalOpacity },
      },
    };
    
    setCustomTheme(updatedTheme);
    
    // If editing a saved theme or preset theme, apply temporarily until saved
    const isPresetTheme = presetThemes.find(t => t.name === selectedTheme);
    const isSavedTheme = isEditingSavedTheme && selectedTheme !== 'Default' && !isPresetTheme;
    
    if (isEditing && (isSavedTheme || isPresetTheme || selectedTheme === 'Default')) {
      // Editing a saved/preset theme - apply temporarily
      applyTheme(updatedTheme, true); // true = temporary
      setHasUnsavedChanges(true);
      setHasAppliedChanges(true);
    } else {
      // Custom theme or not editing - apply immediately
      applyTheme(updatedTheme, false); // false = persist immediately
      setHasUnsavedChanges(false);
      
      // Auto-switch to Custom when editing (only if not already editing a theme)
      if (selectedTheme !== 'Custom' && !isEditing) {
        setSelectedTheme('Custom');
        setIsEditing(true);
      }
    }
  };

  const handleColorRevert = (colorKey) => {
    if (colorHistory[colorKey] && colorHistory[colorKey].length > 0) {
      const previousColor = colorHistory[colorKey][0];
      // Remove from history first
      const updatedHistory = { ...colorHistory };
      updatedHistory[colorKey] = updatedHistory[colorKey].slice(1);
      setColorHistory(updatedHistory);
      localStorage.setItem('color-history', JSON.stringify(updatedHistory));
      
      // Store original theme state before modification if not already stored
      if (!originalThemeState || !hasAppliedChanges) {
        setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
      }
      
      // Parse previous color (could be string or "hex_opacity" format)
      let previousHex = previousColor;
      let previousOpacity = 1;
      if (typeof previousColor === 'string' && previousColor.includes('_')) {
        const parts = previousColor.split('_');
        previousHex = parts[0];
        previousOpacity = parseFloat(parts[1]) || 1;
      } else if (typeof previousColor === 'string') {
        // Old format: just hex string
        const parsed = parseColor(previousColor);
        previousHex = parsed.hex;
        previousOpacity = parsed.opacity;
      }
      
      // Apply the previous color
      handleColorChange(colorKey, previousHex, previousOpacity);
    }
  };

  const handleGlassChange = (key, value) => {
    // Store original theme state before first modification
    if (!originalThemeState || !hasAppliedChanges) {
      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
    }
    
    const updatedTheme = {
      ...customTheme,
      glass: {
        ...customTheme.glass,
        [key]: parseFloat(value),
      },
    };
    setCustomTheme(updatedTheme);
    
    // If editing a saved theme or preset theme, apply temporarily until saved
    const isPresetTheme = presetThemes.find(t => t.name === selectedTheme);
    const isSavedTheme = isEditingSavedTheme && selectedTheme !== 'Default' && !isPresetTheme;
    
    if (isEditing && (isSavedTheme || isPresetTheme || selectedTheme === 'Default')) {
      // Editing a saved/preset theme - apply temporarily
      applyTheme(updatedTheme, true); // true = temporary
      setHasUnsavedChanges(true);
      setHasAppliedChanges(true);
    } else {
      // Custom theme or not editing - apply immediately
      applyTheme(updatedTheme, false); // false = persist immediately
      setHasUnsavedChanges(false);
      setHasAppliedChanges(true);
      
      // Auto-switch to Custom when editing (only if not already editing a theme)
      if (selectedTheme !== 'Custom' && !isEditing) {
        setSelectedTheme('Custom');
        setIsEditing(true);
      }
    }
  };

  const handleButtonGlassChange = (key, value) => {
    // Store original theme state before first modification
    if (!originalThemeState || !hasAppliedChanges) {
      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
    }
    
    const updatedTheme = {
      ...customTheme,
      buttonGlass: {
        ...(customTheme.buttonGlass || { blur: 12, opacity: 0.25, borderOpacity: 0.4 }),
        [key]: parseFloat(value),
      },
    };
    setCustomTheme(updatedTheme);
    
    // If editing a saved theme or preset theme, apply temporarily until saved
    const isPresetTheme = presetThemes.find(t => t.name === selectedTheme);
    const isSavedTheme = isEditingSavedTheme && selectedTheme !== 'Default' && !isPresetTheme;
    
    if (isEditing && (isSavedTheme || isPresetTheme || selectedTheme === 'Default')) {
      // Editing a saved/preset theme - apply temporarily
      applyTheme(updatedTheme, true); // true = temporary
      setHasUnsavedChanges(true);
      setHasAppliedChanges(true);
    } else {
      // Custom theme or not editing - apply immediately
      applyTheme(updatedTheme, false); // false = persist immediately
      setHasUnsavedChanges(false);
      setHasAppliedChanges(true);
      
      // Auto-switch to Custom when editing (only if not already editing a theme)
      if (selectedTheme !== 'Custom' && !isEditing) {
        setSelectedTheme('Custom');
        setIsEditing(true);
      }
    }
  };

  const handleModeToggle = (mode) => {
    // If editing saved theme with changes, show save modal
    if ((hasUnsavedChanges || hasAppliedChanges) && isEditingSavedTheme) {
      setPendingThemeSwitch(mode);
      setShowSaveModal(true);
      return;
    }
    
    let updatedTheme;
    
    // Save original custom theme before switching modes (only if switching away from custom)
    if ((mode === 'light' || mode === 'dark') && 
        customTheme.mode !== 'light' && customTheme.mode !== 'dark') {
      // We're switching from custom to light/dark, save the current custom theme
      if (!originalCustomTheme) {
        setOriginalCustomTheme({ ...customTheme });
      }
    }
    
    if (mode === 'light') {
      // Light mode: white/light backgrounds, dark text
      updatedTheme = {
        name: 'Light Mode',
        mode: 'light',
        colors: {
          primary: '#1A1A1A',
          secondary: '#4B4B4B',
          revenue: '#1DAA5D',
          expense: '#E66E19',
          profit: '#00996D',
          stock: '#007ACC',
          loss: '#D63C3C',
          warning: '#D63C3C',
          success: '#10B981',
          info: '#3B82F6',
          accent: '#8B5CF6',
          sidebar: '#F9FAFB',
          card: '#FFFFFF',
          input: '#F3F4F6',
        },
        glass: {
          blur: customTheme.glass.blur,
          opacity: customTheme.glass.opacity,
          borderOpacity: customTheme.glass.borderOpacity,
        },
        background: {
          texture: 'none', // Hide texture for light mode
          overlay: '#FFFFFF', // Solid white background
          overlayType: 'solid', // Solid overlay type
          overlayOpacity: 1,
          solidColor: '#FFFFFF', // White background color
          gradientColors: ['rgba(255, 255, 255, 1)'], // Fallback gradient
          gradientAngle: 120,
          fit: 'Fill', // Default fit
        },
      };
      // Ensure overlay properties and button colors are properly set
      ensureOverlayProperties(updatedTheme);
      ensureButtonColors(updatedTheme);
      ensureButtonGlass(updatedTheme);
    } else if (mode === 'dark') {
      // Dark mode: black/dark backgrounds, light text
      updatedTheme = {
        name: 'Dark Mode',
        mode: 'dark',
        colors: {
          primary: '#FFFFFF',
          secondary: '#B0BEC5',
          revenue: '#81C784',
          expense: '#FF8A65',
          profit: '#64B5F6',
          stock: '#90CAF9',
          loss: '#E57373',
          warning: '#FFB74D',
          success: '#81C784',
          info: '#64B5F6',
          accent: '#BA68C8',
          sidebar: '#1E1E1E',
          card: '#2D2D2D',
          input: '#3A3A3A',
        },
        glass: {
          blur: customTheme.glass.blur,
          opacity: customTheme.glass.opacity,
          borderOpacity: customTheme.glass.borderOpacity,
        },
        background: {
          texture: 'none', // Hide texture for dark mode
          overlay: '#121212', // Solid dark background
          overlayType: 'solid', // Solid overlay type
          overlayOpacity: 1,
          solidColor: '#121212', // Dark background color
          gradientColors: ['rgba(18, 18, 18, 1)'], // Fallback gradient
          gradientAngle: 120,
          fit: 'Fill', // Default fit
        },
      };
      // Ensure overlay properties and button colors are properly set
      ensureOverlayProperties(updatedTheme);
      ensureButtonColors(updatedTheme);
      ensureButtonGlass(updatedTheme);
    } else {
      // Custom mode: restore last applied custom theme
      // First, try to restore the original custom theme that was saved before switching to light/dark
      if (originalCustomTheme) {
        updatedTheme = { ...originalCustomTheme };
      } else {
        // Load from localStorage - get the last saved theme
        const savedTheme = localStorage.getItem('app-theme');
        if (savedTheme) {
          try {
            const parsed = JSON.parse(savedTheme);
            // Check if it's a custom theme (not Light Mode or Dark Mode)
            if (parsed.name !== 'Light Mode' && parsed.name !== 'Dark Mode' && 
                parsed.name !== 'Default') {
              // This is a custom saved theme, use it
              updatedTheme = parsed;
            } else if (parsed.name === 'Light Mode' || parsed.name === 'Dark Mode') {
              // If the saved theme is light/dark mode, we need to look for a previous custom theme
              // Check if there are any custom presets
              const savedCustomPresets = localStorage.getItem('custom-preset-themes');
              if (savedCustomPresets) {
                try {
                  const customPresets = JSON.parse(savedCustomPresets);
                  // Use the most recently saved custom preset, or the first one
                  if (customPresets.length > 0) {
                    updatedTheme = customPresets[customPresets.length - 1];
                  } else {
                    // No custom presets, use default
                    updatedTheme = { ...defaultTheme };
                  }
                } catch (e) {
                  updatedTheme = { ...defaultTheme };
                }
              } else {
                // No custom presets at all, use default
                updatedTheme = { ...defaultTheme };
              }
            } else {
              // It's the default theme or something else, use as is
              updatedTheme = parsed;
            }
          } catch (e) {
            // Error parsing, fall back to default
            updatedTheme = { ...defaultTheme };
          }
        } else {
          // No saved theme at all, use default
          updatedTheme = { ...defaultTheme };
        }
      }
    }
    
    setCustomTheme(updatedTheme);
    applyTheme(updatedTheme, false); // false = persist immediately
    setHasUnsavedChanges(false);
    setHasAppliedChanges(true);
    setIsEditing(true);
    setIsEditingSavedTheme(false); // Light/Dark/Custom modes are not "saved themes"
    
    // Save light/dark mode themes to localStorage for persistence
    if (mode === 'light' || mode === 'dark') {
      setSelectedTheme(mode === 'light' ? 'Light Mode' : 'Dark Mode');
      
      toast.success(`${mode === 'light' ? 'Light' : 'Dark'} mode applied and saved!`, {
        description: 'This theme will persist across page reloads.',
      });
    } else {
      setSelectedTheme(updatedTheme.name || 'Custom');
    }
  };

  // Function to calculate relative luminance (for contrast calculation)
  const getRelativeLuminance = (r, g, b) => {
    const [rs, gs, bs] = [r, g, b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  // Function to calculate contrast ratio between two colors
  const getContrastRatio = (color1, color2) => {
    const l1 = getRelativeLuminance(color1.r, color1.g, color1.b);
    const l2 = getRelativeLuminance(color2.r, color2.g, color2.b);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  };

  // Function to find optimal contrasting color
  const findOptimalContrastColor = (targetColor, colorOptions, minContrast = 4.5) => {
    const bestColors = colorOptions
      .map(color => ({
        ...color,
        contrast: getContrastRatio(targetColor, color)
      }))
      .filter(c => c.contrast >= minContrast)
      .sort((a, b) => b.contrast - a.contrast);
    
    return bestColors.length > 0 ? bestColors[0] : null;
  };

  /**
   * Frosted-glass / acrylic tuning from the image's average luminance so blur & opacity match the photo.
   * (Palette colors come from `mapColorsToTheme`; this only adjusts `glass` + `buttonGlass`.)
   */
  const suggestGlassFromAvgBackground = (avgBackground) => {
    const t = Math.max(0, Math.min(1, avgBackground.brightness / 255));
    const midBusy = 1 - Math.abs(t - 0.5) * 2;
    const blur = 8 + midBusy * 4 + t * 2;
    const opacity = 0.13 + (1 - t) * 0.05 + midBusy * 0.05;
    const borderOpacity = 0.26 + t * 0.12;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    return {
      glass: {
        blur: clamp(Math.round(blur * 10) / 10, 6, 16),
        opacity: clamp(Math.round(opacity * 1000) / 1000, 0.1, 0.32),
        borderOpacity: clamp(Math.round(borderOpacity * 1000) / 1000, 0.2, 0.5),
      },
      buttonGlass: {
        blur: clamp(Math.round((blur + 2.5) * 10) / 10, 8, 18),
        opacity: clamp(Math.round((opacity + 0.06) * 1000) / 1000, 0.12, 0.42),
        borderOpacity: clamp(Math.round((borderOpacity + 0.06) * 1000) / 1000, 0.22, 0.55),
      },
    };
  };

  /**
   * Extract palette from image for theme colors + suggested glass/acrylic.
   * @param {(palette: object | null, glassPatch: object | null) => void} callback — glassPatch is null if extraction failed
   */
  const extractColorsFromImage = (imageUrl, callback) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        // Use larger canvas for better color extraction
        canvas.width = Math.min(img.width, 400);
        canvas.height = Math.min(img.height, 400);
        
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        
        // Calculate average background color and brightness with better sampling
        let totalR = 0, totalG = 0, totalB = 0, count = 0;
        const sampleStep = 3; // More frequent sampling for better accuracy
        
        for (let i = 0; i < pixels.length; i += sampleStep * 4) {
          const a = pixels[i + 3];
          if (a >= 128) {
            totalR += pixels[i];
            totalG += pixels[i + 1];
            totalB += pixels[i + 2];
            count++;
          }
        }
        
        if (count === 0) {
          callback(null, null);
          return;
        }
        
        const avgBackground = {
          r: Math.round(totalR / count),
          g: Math.round(totalG / count),
          b: Math.round(totalB / count),
          brightness: (totalR + totalG + totalB) / (count * 3),
        };
        
        // Sample pixels to extract colors - use more samples for better color diversity
        const colorMap = new Map();
        const colorSampleStep = 5; // Sample more frequently for better color extraction
        
        for (let i = 0; i < pixels.length; i += colorSampleStep * 4) {
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const a = pixels[i + 3];
          
          if (a < 128) continue; // Skip transparent pixels
          
          // Quantize colors to reduce variations
          const quantizedR = Math.round(r / 10) * 10;
          const quantizedG = Math.round(g / 10) * 10;
          const quantizedB = Math.round(b / 10) * 10;
          
          const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
          colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
        }
        
        // Get dominant colors
        const sortedColors = Array.from(colorMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([colorKey]) => {
            const [r, g, b] = colorKey.split(',').map(Number);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            return { 
              r, g, b, 
              hex: `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`,
              brightness
            };
          });
        
        // Calculate additional colors with better contrast
        const processedColors = [];
        sortedColors.forEach(color => {
          processedColors.push(color);
          
          // Create high-contrast variations
          // For light backgrounds, create darker variants
          if (avgBackground.brightness > 128) {
            // Dark variant (for text on light background)
            processedColors.push({
              r: Math.max(0, color.r - 60),
              g: Math.max(0, color.g - 60),
              b: Math.max(0, color.b - 60),
              brightness: ((color.r - 60) * 299 + (color.g - 60) * 587 + (color.b - 60) * 114) / 1000,
              hex: `#${[
                Math.max(0, color.r - 60),
                Math.max(0, color.g - 60),
                Math.max(0, color.b - 60)
              ].map(x => Math.max(0, x).toString(16).padStart(2, '0')).join('')}`
            });
            // Very dark variant
            processedColors.push({
              r: Math.max(0, color.r - 100),
              g: Math.max(0, color.g - 100),
              b: Math.max(0, color.b - 100),
              brightness: ((color.r - 100) * 299 + (color.g - 100) * 587 + (color.b - 100) * 114) / 1000,
              hex: `#${[
                Math.max(0, color.r - 100),
                Math.max(0, color.g - 100),
                Math.max(0, color.b - 100)
              ].map(x => Math.max(0, x).toString(16).padStart(2, '0')).join('')}`
            });
          } else {
            // For dark backgrounds, create lighter variants
            processedColors.push({
              r: Math.min(255, color.r + 80),
              g: Math.min(255, color.g + 80),
              b: Math.min(255, color.b + 80),
              brightness: ((color.r + 80) * 299 + (color.g + 80) * 587 + (color.b + 80) * 114) / 1000,
              hex: `#${[
                Math.min(255, color.r + 80),
                Math.min(255, color.g + 80),
                Math.min(255, color.b + 80)
              ].map(x => Math.min(255, x).toString(16).padStart(2, '0')).join('')}`
            });
            // Very light variant
            processedColors.push({
              r: Math.min(255, color.r + 120),
              g: Math.min(255, color.g + 120),
              b: Math.min(255, color.b + 120),
              brightness: ((color.r + 120) * 299 + (color.g + 120) * 587 + (color.b + 120) * 114) / 1000,
              hex: `#${[
                Math.min(255, color.r + 120),
                Math.min(255, color.g + 120),
                Math.min(255, color.b + 120)
              ].map(x => Math.min(255, x).toString(16).padStart(2, '0')).join('')}`
            });
          }
          
          // Moderate lighter/darker variations for UI elements
          processedColors.push({
            r: Math.min(255, Math.max(0, color.r + 30)),
            g: Math.min(255, Math.max(0, color.g + 30)),
            b: Math.min(255, Math.max(0, color.b + 30)),
            brightness: ((Math.min(255, Math.max(0, color.r + 30))) * 299 + (Math.min(255, Math.max(0, color.g + 30))) * 587 + (Math.min(255, Math.max(0, color.b + 30))) * 114) / 1000,
            hex: `#${[
              Math.min(255, Math.max(0, color.r + 30)),
              Math.min(255, Math.max(0, color.g + 30)),
              Math.min(255, Math.max(0, color.b + 30))
            ].map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('')}`
          });
          
          processedColors.push({
            r: Math.min(255, Math.max(0, color.r - 30)),
            g: Math.min(255, Math.max(0, color.g - 30)),
            b: Math.min(255, Math.max(0, color.b - 30)),
            brightness: ((Math.min(255, Math.max(0, color.r - 30))) * 299 + (Math.min(255, Math.max(0, color.g - 30))) * 587 + (Math.min(255, Math.max(0, color.b - 30))) * 114) / 1000,
            hex: `#${[
              Math.min(255, Math.max(0, color.r - 30)),
              Math.min(255, Math.max(0, color.g - 30)),
              Math.min(255, Math.max(0, color.b - 30))
            ].map(x => Math.min(255, Math.max(0, x)).toString(16).padStart(2, '0')).join('')}`
          });
        });
        
        // Map colors to theme color scheme with contrast optimization
        const mappedColors = mapColorsToTheme(processedColors, avgBackground);
        const glassPatch = suggestGlassFromAvgBackground(avgBackground);
        callback(mappedColors, glassPatch);
      } catch (error) {
        console.error('Error extracting colors:', error);
        callback(null, null);
      }
    };
    
    img.onerror = () => {
      callback(null, null);
    };
    
    img.src = imageUrl;
  };

  // Function to map extracted colors to theme color scheme with contrast optimization
  const mapColorsToTheme = (colors, avgBackground) => {
    if (!colors || colors.length === 0) return null;
    
    // Sort colors by brightness for better mapping
    const sortedByBrightness = colors
      .map(color => ({
        ...color,
        brightness: color.brightness || (color.r * 299 + color.g * 587 + color.b * 114) / 1000
      }))
      .sort((a, b) => b.brightness - a.brightness);
    
    const isLightBackground = avgBackground.brightness > 128;
    
    // Find colors with good contrast against background
    const highContrastColors = colors
      .map(color => ({
        ...color,
        contrast: getContrastRatio(avgBackground, color),
        brightness: color.brightness || (color.r * 299 + color.g * 587 + color.b * 114) / 1000
      }))
      .sort((a, b) => b.contrast - a.contrast);
    
    // For text colors, prefer high contrast
    const textColors = isLightBackground 
      ? highContrastColors.filter(c => c.brightness < 128 && c.contrast >= 4.5) // Dark text on light bg
      : highContrastColors.filter(c => c.brightness >= 128 && c.contrast >= 4.5); // Light text on dark bg
    
    const darkColors = sortedByBrightness.filter(c => c.brightness < 128);
    const lightColors = sortedByBrightness.filter(c => c.brightness >= 128);
    
    // Find warm colors (orange, red, yellow tones)
    const warmColors = colors.filter(c => {
      const hue = getHue(c.r, c.g, c.b);
      return (hue >= 0 && hue <= 60) || (hue >= 300 && hue <= 360);
    }).map(c => ({
      ...c,
      contrast: getContrastRatio(avgBackground, c),
      brightness: c.brightness || (c.r * 299 + c.g * 587 + c.b * 114) / 1000
    })).sort((a, b) => b.contrast - a.contrast);
    
    // Find cool colors (blue, green, teal tones)
    const coolColors = colors.filter(c => {
      const hue = getHue(c.r, c.g, c.b);
      return hue >= 120 && hue <= 240;
    }).map(c => ({
      ...c,
      contrast: getContrastRatio(avgBackground, c),
      brightness: c.brightness || (c.r * 299 + c.g * 587 + c.b * 114) / 1000
    })).sort((a, b) => b.contrast - a.contrast);
    
    // Find green colors (for profit/success)
    const greenColors = colors.filter(c => {
      const hue = getHue(c.r, c.g, c.b);
      return hue >= 60 && hue <= 180 && c.g > c.r && c.g > c.b;
    }).map(c => ({
      ...c,
      contrast: getContrastRatio(avgBackground, c),
      brightness: c.brightness || (c.r * 299 + c.g * 587 + c.b * 114) / 1000
    })).sort((a, b) => b.contrast - a.contrast);
    
    // Map to theme colors with contrast optimization
    return {
      // Text colors - prioritize high contrast
      primary: textColors[0]?.hex || (isLightBackground ? '#1A1A1A' : '#FFFFFF'),
      secondary: textColors[1]?.hex || (isLightBackground ? '#4B4B4B' : '#E0E0E0'),
      
      // Financial colors - prefer high contrast with semantic meaning
      revenue: greenColors[0]?.hex || coolColors[0]?.hex || '#1DAA5D',
      expense: warmColors[0]?.hex || highContrastColors.find(c => c.contrast >= 3)?.hex || '#E66E19',
      profit: greenColors[1]?.hex || coolColors[1]?.hex || '#00996D',
      loss: warmColors[1]?.hex || highContrastColors.find(c => c.contrast >= 3 && warmColors.length === 0)?.hex || '#D63C3C',
      
      // Status colors - prefer high contrast
      warning: warmColors[2]?.hex || warmColors[1]?.hex || highContrastColors.find(c => c.contrast >= 3)?.hex || '#D63C3C',
      success: greenColors[2]?.hex || greenColors[1]?.hex || coolColors[2]?.hex || '#10B981',
      info: coolColors[3]?.hex || coolColors[2]?.hex || highContrastColors.find(c => c.contrast >= 3)?.hex || '#3B82F6',
      stock: coolColors[4]?.hex || coolColors[3]?.hex || highContrastColors.find(c => c.contrast >= 3)?.hex || '#007ACC',
      
      // Accent - use high contrast mid-brightness color
      accent: highContrastColors.find(c => c.brightness >= 60 && c.brightness <= 180 && c.contrast >= 3)?.hex 
        || sortedByBrightness[Math.floor(sortedByBrightness.length * 0.7)]?.hex 
        || '#8B5CF6',
      
      // UI Elements - ensure good contrast but readable
      sidebar: isLightBackground 
        ? (lightColors[0]?.hex || '#F9FAFB')
        : (highContrastColors.find(c => c.brightness >= 100)?.hex || lightColors[0]?.hex || '#2D2D2D'),
      card: isLightBackground 
        ? (lightColors[1]?.hex || '#FFFFFF')
        : (highContrastColors.find(c => c.brightness >= 120)?.hex || lightColors[1]?.hex || '#1E1E1E'),
      input: isLightBackground 
        ? (lightColors[2]?.hex || '#F3F4F6')
        : (highContrastColors.find(c => c.brightness >= 80)?.hex || lightColors[2]?.hex || '#3A3A3A'),
    };
  };

  // Helper function to parse gradient string to extract colors and angle
  const parseGradient = (gradientString) => {
    if (!gradientString || !gradientString.includes('gradient')) {
      return { angle: 120, colors: [] };
    }
    
    const angleMatch = gradientString.match(/(\d+)deg/);
    const angle = angleMatch ? parseInt(angleMatch[1]) : 120;
    
    const colorMatches = gradientString.match(/rgba?\([^)]+\)/g);
    const colors = colorMatches || [];
    
    return { angle, colors };
  };

  // Helper function to convert hex/rgba to RGB object
  const colorToRgb = (colorString) => {
    if (colorString.startsWith('#')) {
      const hex = colorString.replace('#', '');
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b, a: 1 };
    }
    
    if (colorString.startsWith('rgba')) {
      const matches = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (matches) {
        return {
          r: parseInt(matches[1]),
          g: parseInt(matches[2]),
          b: parseInt(matches[3]),
          a: parseFloat(matches[4] || '1'),
        };
      }
    }
    
    return { r: 0, g: 0, b: 0, a: 1 };
  };

  // Helper function to generate overlay CSS string
  const generateOverlay = (background) => {
    if (background.overlayType === 'solid') {
      const rgb = colorToRgb(background.solidColor || '#D1925B');
      const opacity = background.overlayOpacity || 1;
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${opacity})`;
    } else {
      const angle = background.gradientAngle || 120;
      const colors = background.gradientColors || [];
      const opacity = background.overlayOpacity || 1;
      
      // Apply opacity to each color in gradient
      const colorsWithOpacity = colors.map(colorStr => {
        const rgb = colorToRgb(colorStr);
        const finalOpacity = (rgb.a || opacity) * opacity;
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${finalOpacity})`;
      });
      
      if (colorsWithOpacity.length === 0) {
        return 'transparent';
      } else if (colorsWithOpacity.length === 1) {
        return colorsWithOpacity[0];
      } else {
        const stops = colorsWithOpacity.map((color, index) => {
          const percentage = (index / (colorsWithOpacity.length - 1)) * 100;
          return `${color} ${percentage}%`;
        }).join(', ');
        return `linear-gradient(${angle}deg, ${stops})`;
      }
    }
  };

  // Helper function to format extracted colors to theme format
  const formatExtractedColors = (extractedColors) => {
    if (!extractedColors) return null;
    
    const formattedColors = {};
    Object.entries(extractedColors).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('#')) {
        // Convert hex string to object format
        formattedColors[key] = { hex: value, opacity: 1 };
      } else if (typeof value === 'object' && value !== null && value.hex) {
        // Already in correct format
        formattedColors[key] = value;
      } else {
        // Fallback: parse the color
        const parsed = parseColor(value);
        formattedColors[key] = { hex: parsed.hex, opacity: parsed.opacity };
      }
    });
    
    return formattedColors;
  };

  // Helper function to extract colors from solid color or gradient
  const extractColorsFromOverlay = (overlayConfig) => {
    if (overlayConfig.overlayType === 'solid') {
      const rgb = colorToRgb(overlayConfig.solidColor || '#D1925B');
      const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
      
      // Generate contrasting colors based on solid color
      const isLight = brightness > 128;
      const hue = getHue(rgb.r, rgb.g, rgb.b);
      
      // Generate color variations
      const colors = [];
      
      // Base color
      colors.push({ r: rgb.r, g: rgb.g, b: rgb.b, brightness, hex: `#${[rgb.r, rgb.g, rgb.b].map(x => x.toString(16).padStart(2, '0')).join('')}` });
      
      // Lighter variations
      colors.push({
        r: Math.min(255, rgb.r + 50),
        g: Math.min(255, rgb.g + 50),
        b: Math.min(255, rgb.b + 50),
        brightness: ((Math.min(255, rgb.r + 50)) * 299 + (Math.min(255, rgb.g + 50)) * 587 + (Math.min(255, rgb.b + 50)) * 114) / 1000,
        hex: `#${[Math.min(255, rgb.r + 50), Math.min(255, rgb.g + 50), Math.min(255, rgb.b + 50)].map(x => x.toString(16).padStart(2, '0')).join('')}`,
      });
      
      // Darker variations
      colors.push({
        r: Math.max(0, rgb.r - 50),
        g: Math.max(0, rgb.g - 50),
        b: Math.max(0, rgb.b - 50),
        brightness: ((Math.max(0, rgb.r - 50)) * 299 + (Math.max(0, rgb.g - 50)) * 587 + (Math.max(0, rgb.b - 50)) * 114) / 1000,
        hex: `#${[Math.max(0, rgb.r - 50), Math.max(0, rgb.g - 50), Math.max(0, rgb.b - 50)].map(x => x.toString(16).padStart(2, '0')).join('')}`,
      });
      
      // Complementary color
      const compHue = (hue + 180) % 360;
      const compRgb = hslToRgb(compHue, 50, isLight ? 30 : 70);
      colors.push({
        r: compRgb.r,
        g: compRgb.g,
        b: compRgb.b,
        brightness: (compRgb.r * 299 + compRgb.g * 587 + compRgb.b * 114) / 1000,
        hex: `#${[compRgb.r, compRgb.g, compRgb.b].map(x => x.toString(16).padStart(2, '0')).join('')}`,
      });
      
      const avgBackground = { r: rgb.r, g: rgb.g, b: rgb.b, brightness };
      return mapColorsToTheme(colors, avgBackground);
    } else {
      // Extract colors from gradient
      const gradientColors = overlayConfig.gradientColors || [];
      const colors = [];
      
      // Calculate average color from gradient
      let totalR = 0, totalG = 0, totalB = 0;
      gradientColors.forEach(colorStr => {
        const rgb = colorToRgb(colorStr);
        totalR += rgb.r;
        totalG += rgb.g;
        totalB += rgb.b;
        colors.push({
          r: rgb.r,
          g: rgb.g,
          b: rgb.b,
          brightness: (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000,
          hex: `#${[rgb.r, rgb.g, rgb.b].map(x => x.toString(16).padStart(2, '0')).join('')}`,
        });
      });
      
      const avgBackground = {
        r: Math.round(totalR / gradientColors.length),
        g: Math.round(totalG / gradientColors.length),
        b: Math.round(totalB / gradientColors.length),
        brightness: (totalR + totalG + totalB) / (gradientColors.length * 3),
      };
      
      return mapColorsToTheme(colors, avgBackground);
    }
  };

  // Helper function to convert HSL to RGB
  const hslToRgb = (h, s, l) => {
    h = h / 360;
    s = s / 100;
    l = l / 100;
    
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  };

  // Helper function to calculate hue from RGB
  const getHue = (r, g, b) => {
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    
    let hue = 0;
    if (delta !== 0) {
      if (max === r) {
        hue = ((g - b) / delta) % 6;
      } else if (max === g) {
        hue = (b - r) / delta + 2;
      } else {
        hue = (r - g) / delta + 4;
      }
    }
    
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
    return hue;
  };

  const handleBackgroundUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Invalid file type', {
        description: 'Please upload an image file.',
      });
      return;
    }

    // Ensure we're in edit mode (so Save / actions work as expected)
      setIsEditing(true);

    // Store original theme state before modification
    if (!originalThemeState || !hasAppliedChanges) {
      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
    }

    const resetInput = () => {
      if (event.target) {
        event.target.value = '';
      }
    };

    /** @param {string} textureRef — data URL or app URL (e.g. /theme-backgrounds/...) */
    const applyUploadedTexture = (textureRef, savedToApp) => {
      setBackgroundHistory((prev) => {
        // Never persist data: URLs — they are huge and blow the ~5MB localStorage quota.
        if (typeof textureRef === 'string' && textureRef.startsWith('data:')) {
          return prev;
        }
        const next = [textureRef, ...prev.filter(isPersistableBackgroundRef)].slice(
          0,
          MAX_BG_HISTORY_ITEMS
        );
        // Defer localStorage so it never runs inside React's useState updater (avoids quota errors surfacing oddly).
        queueMicrotask(() => persistBackgroundHistory(next));
        return next;
      });

      // Do not rely on `isEditing` here — FileReader/async may run before React re-renders.
      const preservePresetColors = shouldPreservePresetColorsOnBackground(selectedTheme);

      if (preservePresetColors) {
        const updatedTheme = {
          ...customTheme,
          background: {
            ...customTheme.background,
            texture: textureRef,
            fit: customTheme.background.fit || 'Fill',
          },
        };
        setCustomTheme(updatedTheme);
        applyTheme(updatedTheme, true);
        setHasUnsavedChanges(true);
        setHasAppliedChanges(true);
        toast.success('Background updated!', {
          description: savedToApp
            ? 'Image saved in app files. Save the theme to persist.'
            : 'Background applied. Save the theme to persist (large images may use a data URL).',
        });
        resetInput();
        return;
      }

        const themeWithBackground = {
          ...customTheme,
          background: {
            ...customTheme.background,
          texture: textureRef,
            fit: customTheme.background.fit || 'Fill',
          },
        };
        setCustomTheme(themeWithBackground);
      applyTheme(themeWithBackground, true);
        
      extractColorsFromImage(textureRef, (extractedColors, glassPatch) => {
          if (extractedColors) {
            const formattedColors = formatExtractedColors(extractedColors);
            const updatedTheme = {
              ...themeWithBackground,
              colors: {
                ...customTheme.colors,
                ...formattedColors,
              },
            ...(glassPatch && {
              glass: { ...customTheme.glass, ...glassPatch.glass },
              buttonGlass: {
                ...(customTheme.buttonGlass || defaultTheme.buttonGlass),
                ...glassPatch.buttonGlass,
              },
            }),
            };
            setCustomTheme(updatedTheme);
          applyTheme(updatedTheme, true);
          setHasUnsavedChanges(true);
            setHasAppliedChanges(true);
            if (!isEditing || (selectedTheme !== 'Custom' && selectedTheme !== undefined)) {
            // keep selection
            } else {
              setIsEditing(true);
              setSelectedTheme('Custom');
              setIsEditingSavedTheme(false);
            }
            toast.success('Background updated!', {
              description: 'Background image and colors have been applied. Save to persist changes.',
            });
          } else {
          setHasUnsavedChanges(true);
            setHasAppliedChanges(true);
            if (!isEditing || (selectedTheme !== 'Custom' && selectedTheme !== undefined)) {
            // keep selection
            } else {
              setIsEditing(true);
              setSelectedTheme('Custom');
              setIsEditingSavedTheme(false);
            }
            toast.success('Background updated!', {
              description: 'Your background image has been applied. Save to persist changes.',
            });
          }
        resetInput();
      });
    };

    // Prefer server upload: small URL in storage, survives quota, file lives under public/
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await apiFetch('/api/theme/background', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.url) {
          applyUploadedTexture(data.url, true);
          return;
        }
      } else {
        const err = await res.json().catch(() => ({}));
        console.warn('Theme background upload failed:', err?.error || res.status);
      }
    } catch (e) {
      console.warn('Theme background upload error:', e);
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (!dataUrl) return;
      applyUploadedTexture(dataUrl, false);
    };
    reader.readAsDataURL(file);
  };

  const handleBackgroundSelect = (bgUrl) => {
    // Ensure we're in edit mode
    if (!isEditing) {
      setIsEditing(true);
    }
    
    // Store original theme state before modification
    if (!originalThemeState || !hasAppliedChanges) {
      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
    }
    
    // Named presets (not Default): keep brand palette; only swap background texture.
    const preservePresetColors = shouldPreservePresetColorsOnBackground(selectedTheme);
    
    if (preservePresetColors) {
      // Preset theme: keep original colors, only update background (do not depend on isEditing — may be stale)
      const updatedTheme = {
        ...customTheme,
        // Keep original colors unchanged
        background: {
          ...customTheme.background,
          texture: bgUrl,
          fit: customTheme.background.fit || 'Fill',
        },
      };
      setCustomTheme(updatedTheme);
      // Apply visually but don't persist yet - user needs to save
      applyTheme(updatedTheme, true); // true = temporary
      setHasUnsavedChanges(true); // Mark as unsaved
      setHasAppliedChanges(true);
      
      toast.success('Background updated!', {
        description: 'Background image has been applied. Preset colors are preserved. Save to persist changes.',
      });
    } else {
      // Not editing a preset theme - extract colors from image (Custom or saved themes)
      // IMPORTANT: Apply background immediately, then extract colors
      // First, apply the background image immediately so it's visible
      const themeWithBackground = {
        ...customTheme,
        background: {
          ...customTheme.background,
          texture: bgUrl,
          fit: customTheme.background.fit || 'Fill',
        },
      };
      setCustomTheme(themeWithBackground);
      // Force immediate application of background - ensure it's properly applied
      applyTheme(themeWithBackground, true); // Apply background immediately
      
      // Force a small delay to ensure background is rendered before color extraction
      setTimeout(() => {
        // Then extract colors from the image
        extractColorsFromImage(bgUrl, (extractedColors, glassPatch) => {
          if (extractedColors) {
            // Convert extracted colors (hex strings) to new format (objects with hex and opacity)
            const formattedColors = formatExtractedColors(extractedColors);
            
            // Update theme with extracted colors, ensuring background texture is preserved
            const updatedTheme = {
              ...themeWithBackground, // Preserve background from themeWithBackground
              colors: {
                ...customTheme.colors,
                ...formattedColors,
              },
              ...(glassPatch && {
                glass: { ...customTheme.glass, ...glassPatch.glass },
                buttonGlass: {
                  ...(customTheme.buttonGlass || defaultTheme.buttonGlass),
                  ...glassPatch.buttonGlass,
                },
              }),
            };
            setCustomTheme(updatedTheme);
            // Apply theme with colors - background should already be set, but ensure it's reapplied
            applyTheme(updatedTheme, true); // true = temporary - this will reapply background too
            setHasUnsavedChanges(true); // Mark as unsaved
            setHasAppliedChanges(true);
            
            // Don't change selected theme if already editing a preset/saved theme
            if (!isEditing || (selectedTheme !== 'Custom' && selectedTheme !== undefined)) {
              // Keep current theme selected when in edit mode
            } else {
              setIsEditing(true);
              setSelectedTheme('Custom');
              setIsEditingSavedTheme(false);
            }
            
            toast.success('Background updated!', {
              description: 'Background image and colors have been applied. Save to persist changes.',
            });
          } else {
            // Color extraction failed - ensure background is still applied
            setCustomTheme(themeWithBackground);
            applyTheme(themeWithBackground, true); // Reapply background to ensure it's visible
            setHasUnsavedChanges(true); // Mark as unsaved
            setHasAppliedChanges(true);
            
            // Don't change selected theme if already editing a preset/saved theme
            if (!isEditing || (selectedTheme !== 'Custom' && selectedTheme !== undefined)) {
              // Keep current theme selected when in edit mode
            } else {
              setIsEditing(true);
              setSelectedTheme('Custom');
              setIsEditingSavedTheme(false);
            }
            
            toast.success('Background updated!', {
              description: 'Your background image has been applied. Save to persist changes.',
            });
          }
        });
      }, 100); // Small delay to ensure background is rendered
    }
  };

  const handleBackgroundRemove = (index) => {
    const newHistory = backgroundHistory.filter((_, i) => i !== index);
    setBackgroundHistory(newHistory);
    queueMicrotask(() => persistBackgroundHistory(newHistory));
    toast.success('Background removed from history');
  };


  const handleSave = () => {
    logButtonClick('Save Theme', 'Save theme changes', {
      theme_name: selectedTheme,
      is_editing: isEditing
    });
    
    // If editing a theme (preset or saved), update it
    if (isEditing && selectedTheme) {
      const isPreset = presetThemes.find(t => t.name === selectedTheme);
      // Check if it's a saved theme (exists in presetThemesState but not in presetThemes)
      const isSavedTheme = !isPreset && selectedTheme !== 'Default' && presetThemesState.find(t => t.name === selectedTheme);
      
      if (isPreset || selectedTheme === 'Default') {
        // This is a preset theme that has been edited - save it as a new custom theme
        // We'll show the name modal to save it with a new name, or update the current selection
        // For preset themes, we should prompt for a name unless saving as a new custom theme
        const themeToSave = { ...customTheme, name: selectedTheme };
        
        // Save to app-theme
        localStorage.setItem('app-theme', JSON.stringify(themeToSave));
        applyTheme(themeToSave, false);
        
        // Update original preset state to the saved state
        if (originalPresetState) {
          // Update the preset in the state (but don't overwrite the original preset)
          setOriginalPresetState(JSON.parse(JSON.stringify(themeToSave)));
        }
        setOriginalThemeState(JSON.parse(JSON.stringify(themeToSave)));
        
        setHasUnsavedChanges(false);
        setHasAppliedChanges(false);
        setIsThemeApplied(true); // Theme is now saved/applied
        setIsEditing(false);
        
        // Log theme save
        try {
          apiFetch('/api/users/log-activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              action_type: 'theme_change',
              action_description: `Saved theme: ${selectedTheme}`,
              entity_type: 'theme',
              entity_id: null,
              metadata: JSON.stringify({
                theme_name: selectedTheme,
                action: 'save',
                is_preset: true
              })
            }),
          }).catch(error => {
            console.error('Failed to log theme save:', error);
          });
        } catch (error) {
          console.error('Failed to log theme save:', error);
        }
        
        toast.success(`Theme "${selectedTheme}" saved successfully!`, {
          description: 'Your changes have been saved and applied.',
        });
        return;
      } else if (isSavedTheme || (isEditingSavedTheme && selectedTheme !== 'Default')) {
        // This is a saved custom theme, update it directly
        const themeToSave = { ...customTheme, name: selectedTheme };
        localStorage.setItem('app-theme', JSON.stringify(themeToSave));
        applyTheme(themeToSave, false);
        
        // Update in custom presets
        const customPresets = presetThemesState.filter(t => !presetThemes.find(pt => pt.name === t.name));
        const updatedCustomPresets = customPresets.map(t => 
          t.name === selectedTheme ? themeToSave : t
        );
        setPresetThemesState([...presetThemes, ...updatedCustomPresets]);
        localStorage.setItem('custom-preset-themes', JSON.stringify(updatedCustomPresets));
        
        setHasUnsavedChanges(false);
        setHasAppliedChanges(false);
        setIsThemeApplied(true); // Theme is now saved/applied
        // Update original theme state to the saved state
        setOriginalThemeState(JSON.parse(JSON.stringify(themeToSave)));
        setIsEditing(false);
        
        // Log theme update
        try {
          apiFetch('/api/users/log-activity', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({
              action_type: 'theme_change',
              action_description: `Updated theme: ${selectedTheme}`,
              entity_type: 'theme',
              entity_id: null,
              metadata: JSON.stringify({
                theme_name: selectedTheme,
                action: 'update'
              })
            }),
          }).catch(error => {
            console.error('Failed to log theme update:', error);
          });
        } catch (error) {
          console.error('Failed to log theme update:', error);
        }
        
        toast.success('Theme updated successfully!');
        return;
      }
      
      // If we get here and we're editing a theme, it means it's a preset that's been edited but not recognized
      // Don't show name modal if we're editing an existing theme (preset or saved)
      // Only show name modal for truly new Custom themes
      if (selectedTheme && selectedTheme !== 'Custom') {
        // We're editing an existing theme but didn't match above conditions
        // This shouldn't happen, but to be safe, don't show name modal
        return;
      }
    }
    
    // Clear temporary theme when saving
    sessionStorage.removeItem('temp-theme');
    
    // Check if this is a custom theme (not light/dark mode)
    if (customTheme.mode === 'light' && customTheme.name === 'Light Mode') {
      // This is a light mode, save it directly
      const themeToSave = { ...customTheme };
      localStorage.setItem('app-theme', JSON.stringify(themeToSave));
      applyTheme(themeToSave, false);
      sessionStorage.removeItem('temp-theme'); // Clear temporary theme when saving
      // Update originalCustomTheme to preserve any custom theme that was there before
      if (!originalCustomTheme) {
        // Try to find a previously saved custom theme
        const savedCustomPresets = localStorage.getItem('custom-preset-themes');
        if (savedCustomPresets) {
          try {
            const customPresets = JSON.parse(savedCustomPresets);
            if (customPresets.length > 0) {
              setOriginalCustomTheme(customPresets[customPresets.length - 1]);
            }
          } catch (e) {
            // Ignore error
          }
        }
      }
      setHasUnsavedChanges(false);
      setHasAppliedChanges(false);
      setIsEditing(false);
      toast.success('Light mode saved successfully!');
      return;
    }
    
    if (customTheme.mode === 'dark' && customTheme.name === 'Dark Mode') {
      // This is a dark mode, save it directly
      const themeToSave = { ...customTheme };
      localStorage.setItem('app-theme', JSON.stringify(themeToSave));
      applyTheme(themeToSave, false);
      sessionStorage.removeItem('temp-theme'); // Clear temporary theme when saving
      // Update originalCustomTheme to preserve any custom theme that was there before
      if (!originalCustomTheme) {
        // Try to find a previously saved custom theme
        const savedCustomPresets = localStorage.getItem('custom-preset-themes');
        if (savedCustomPresets) {
          try {
            const customPresets = JSON.parse(savedCustomPresets);
            if (customPresets.length > 0) {
              setOriginalCustomTheme(customPresets[customPresets.length - 1]);
            }
          } catch (e) {
            // Ignore error
          }
        }
      }
      setHasUnsavedChanges(false);
      setHasAppliedChanges(false);
      setIsEditing(false);
      toast.success('Dark mode saved successfully!');
      return;
    }
    
    // For new custom themes, show name modal
    // But only if we're NOT in the middle of saving from the save modal
    // Check if we're editing a theme that exists in presetThemesState
    const existingTheme = presetThemesState.find(t => t.name === selectedTheme);
    if (!existingTheme && selectedTheme === 'Custom') {
      // Only show name modal for truly new Custom themes
      setShowNameModal(true);
    }
    // If we get here and selectedTheme is not 'Custom' or doesn't exist, don't show name modal
  };
  
  const handleSaveWithName = () => {
    logButtonClick('Save Theme with Name', 'Save theme with custom name', {
      theme_name: themeNameInput.trim()
    });
    
    if (!themeNameInput.trim()) {
      toast.error('Please enter a theme name');
      return;
    }
    
    // Check if name already exists (excluding Default)
    const existingTheme = presetThemesState.find(t => t.name === themeNameInput.trim());
    if (existingTheme && existingTheme.name !== 'Default') {
      toast.error('A theme with this name already exists');
      return;
    }
    
    const themeToSave = {
      ...customTheme,
      name: themeNameInput.trim(),
    };
    
    // Save to app-theme and clear temporary theme
    localStorage.setItem('app-theme', JSON.stringify(themeToSave));
    applyTheme(themeToSave, false);
    sessionStorage.removeItem('temp-theme'); // Clear temporary theme when saving
    setOriginalCustomTheme(themeToSave);
    
    // Add to custom presets if it doesn't already exist in default presets
    const isDefaultPreset = presetThemes.find(t => t.name === themeNameInput.trim());
    if (!isDefaultPreset) {
      const customPresets = presetThemesState.filter(t => !presetThemes.find(pt => pt.name === t.name));
      const updatedCustomPresets = [...customPresets, themeToSave];
      setPresetThemesState([...presetThemes, ...updatedCustomPresets]);
      localStorage.setItem('custom-preset-themes', JSON.stringify(updatedCustomPresets));
    }
    
    setSelectedTheme(themeNameInput.trim());
    setIsEditingSavedTheme(true); // Now it's a saved theme
    setIsUnnamedThemeApplied(false); // Clear unnamed theme flag - it's now saved with a name
    setShowNameModal(false);
    setThemeNameInput('');
    setHasUnsavedChanges(false);
    setHasAppliedChanges(false);
    // Update original theme state to the saved state
    setOriginalThemeState(JSON.parse(JSON.stringify(themeToSave)));
    setIsEditing(false);
    
    // Log theme save with name
    try {
      apiFetch('/api/users/log-activity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          action_type: 'theme_change',
          action_description: `Saved new theme: ${themeNameInput.trim()}`,
          entity_type: 'theme',
          entity_id: null,
          metadata: JSON.stringify({
            theme_name: themeNameInput.trim(),
            action: 'save_new'
          })
        }),
      }).catch(error => {
        console.error('Failed to log theme save:', error);
      });
    } catch (error) {
      console.error('Failed to log theme save:', error);
    }
    
    // If there was a pending navigation, proceed with it after saving
    if (pendingNavigation) {
      setTimeout(() => {
        window.location.href = pendingNavigation;
        setPendingNavigation(null);
      }, 100);
    }
    
    toast.success('Theme saved successfully!', {
      description: `Your custom theme "${themeNameInput.trim()}" has been added to presets.`,
    });
  };
  
  const handleEditPreset = (themeName, e) => {
    e.stopPropagation();
    
    const isPresetTheme = presetThemes.find(t => t.name === themeName);
    const theme = presetThemesState.find(t => t.name === themeName);
    
    if (!theme) return;
    
    // If clicking edit on a different theme than currently selected, switch to that theme first
    if (selectedTheme !== themeName) {
      // Show save modal if there are unsaved changes
      if (hasUnsavedChanges && selectedTheme) {
        setPendingThemeSwitch(themeName);
        setShowSaveModal(true);
        return;
      }
      // Switch to the theme
      handlePresetSelect(themeName);
      // Small delay to ensure state is updated
      setTimeout(() => {
        setIsEditing(true);
      }, 100);
      return;
    }
    
    // Toggle editing mode for the currently selected theme
    if (isEditing && selectedTheme === themeName) {
      // Already editing this theme, just ensure it's enabled
      setIsEditing(true);
    } else {
      // Enable editing mode
      // Store as original state before editing if not already stored
      if (!originalThemeState || selectedTheme !== themeName) {
        setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
        if (isPresetTheme || themeName === 'Default') {
          setOriginalPresetState(JSON.parse(JSON.stringify(theme)));
        }
      }
      
      setSelectedTheme(themeName);
      setCustomTheme(theme);
      applyTheme(theme, true); // true = temporary, don't persist yet
      setIsEditing(true); // Enable editing mode
      setIsEditingSavedTheme(!isPresetTheme && themeName !== 'Default');
      setIsThemeApplied(false); // Not applied yet
      setHasUnsavedChanges(false);
      setHasAppliedChanges(false);
    }
  };
  
  const handleRestorePreset = (themeName, e) => {
    e.stopPropagation();
    
    const theme = presetThemesState.find(t => t.name === themeName);
    if (!theme || !originalPresetState) return;
    
    // Restore to original preset state
    setCustomTheme(originalPresetState);
    applyTheme(originalPresetState, true); // temporary
    setHasUnsavedChanges(false);
    setHasAppliedChanges(false);
    
    toast.success(`Theme "${themeName}" restored to original settings`);
  };
  
  // Password confirmation hook
  const {
    showPasswordModal,
    setShowPasswordModal,
    password,
    setPassword,
    handlePasswordConfirm,
    requirePassword
  } = usePasswordConfirmation();

  const handleDeletePreset = (themeName, e) => {
    e.stopPropagation();
    
    // Prevent deleting Default
    if (themeName === 'Default') {
      toast.error('Cannot delete the default theme');
      return;
    }
    
    requirePassword('delete', () => {
      setThemeToDelete(themeName);
      setShowDeletePresetModal(true);
    }, { theme_name: themeName });
  };

  const confirmDeleteTheme = () => {
    if (themeToDelete) {
      logButtonClick('Delete Theme', `Delete theme: ${themeToDelete}`, {
        theme_name: themeToDelete
      });
      
      // Remove from state
      const updatedPresets = presetThemesState.filter(t => t.name !== themeToDelete);
      setPresetThemesState(updatedPresets);
      
      // Update localStorage
      const customPresets = updatedPresets.filter(t => !presetThemes.find(pt => pt.name === t.name));
      localStorage.setItem('custom-preset-themes', JSON.stringify(customPresets));
      
      // If the deleted theme was selected, switch to Default
      if (selectedTheme === themeToDelete) {
        setSelectedTheme('Default');
        setCustomTheme(defaultTheme);
        applyTheme(defaultTheme);
      }
      
      toast.success('Theme deleted successfully');
      setThemeToDelete(null);
    }
  };

  const handleReset = () => {
    // Require password for reset
    requirePassword('reset', () => {
      // Show confirmation if there are unsaved changes
      if (hasUnsavedChanges) {
        setShowResetModal(true);
        return;
      }
    
      // Store as original before resetting
      setOriginalThemeState(JSON.parse(JSON.stringify(defaultTheme)));
      setOriginalPresetState(JSON.parse(JSON.stringify(defaultTheme)));
      setSelectedTheme('Default');
      setCustomTheme(defaultTheme);
      applyTheme(defaultTheme, false); // false = persist immediately
      setHasUnsavedChanges(false);
      setHasAppliedChanges(true);
      setIsThemeApplied(true); // Default theme is applied
      setIsEditingSavedTheme(false);
      localStorage.removeItem('app-theme');
      toast.info('Theme reset to default', {
        description: 'All customizations have been reset.',
      });
      setIsEditing(false);
    }, { action: 'reset_theme' });
  };

  const confirmReset = () => {
    // Store as original before resetting
    setOriginalThemeState(JSON.parse(JSON.stringify(defaultTheme)));
    setOriginalPresetState(JSON.parse(JSON.stringify(defaultTheme)));
    setSelectedTheme('Default');
    setCustomTheme(defaultTheme);
    applyTheme(defaultTheme, false); // false = persist immediately
    setHasUnsavedChanges(false);
    setHasAppliedChanges(true);
    setIsThemeApplied(true); // Default theme is applied
    setIsEditingSavedTheme(false);
    localStorage.removeItem('app-theme');
    toast.info('Theme reset to default', {
      description: 'All customizations have been reset.',
    });
    setIsEditing(false);
    setShowResetModal(false);
  };

  const colorSections = [
    { title: 'Text Colors', keys: ['primary', 'secondary'] },
    { title: 'Financial', keys: ['revenue', 'expense', 'profit', 'loss'] },
    { title: 'Status', keys: ['success', 'warning', 'info', 'stock'] },
    { title: 'UI Elements', keys: ['accent', 'sidebar', 'card', 'input'] },
    { title: 'Buttons', keys: ['buttonPrimary', 'buttonSecondary', 'buttonSuccess', 'buttonDanger'] },
  ];

  const posColorSections = [
    { title: 'POS Background & Cards', keys: ['posBackground', 'posCard', 'posCart', 'posProductCard'] },
    { title: 'POS Buttons', keys: ['posButton', 'posButtonHover', 'posActive'] },
    { title: 'POS Text', keys: ['posText', 'posTextSecondary'] },
    { title: 'POS Borders & Selection', keys: ['posBorder', 'posSelected'] },
  ];

  return (
    <div className="min-h-screen font-sans">
      {/* Name Modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card-pro p-6 rounded-xl max-w-md w-full relative">
            <button
              onClick={() => {
                setShowNameModal(false);
                setThemeNameInput('');
              }}
              className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded transition-colors"
              title="Close"
            >
              <X size={18} className="text-analytics-primary" />
            </button>
            <h3 className="text-lg font-semibold text-analytics-primary mb-4 pr-8">Save Custom Theme</h3>
            <p className="text-sm text-analytics-secondary mb-4">
              Enter a name for your custom theme. This will add it to your preset themes.
            </p>
            <input
              type="text"
              value={themeNameInput}
              onChange={(e) => setThemeNameInput(e.target.value)}
              placeholder="Theme name..."
              className="glass-input w-full px-4 py-2 text-sm mb-4"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveWithName();
                } else if (e.key === 'Escape') {
                  setShowNameModal(false);
                  setThemeNameInput('');
                }
              }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setThemeNameInput('');
                }}
                className="glass-button-secondary px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveWithName}
                className="glass-button-primary px-4 py-2 text-sm text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save Confirmation Modal - When editing saved theme and switching */}
      {showSaveModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card-pro p-6 rounded-xl max-w-md w-full relative">
            <button
              onClick={() => {
                setShowSaveModal(false);
                setPendingThemeSwitch(null);
              }}
              className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded transition-colors"
              title="Close"
            >
              <X size={18} className="text-analytics-primary" />
            </button>
            <h3 className="text-lg font-semibold text-analytics-primary mb-4 pr-8">Save Changes?</h3>
            <p className="text-sm text-analytics-secondary mb-4">
              You have unsaved changes to this theme. Do you want to save your changes before switching to another theme?
            </p>
            {/* Apply theme checkbox */}
            <div className="mb-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="apply-theme-checkbox"
                checked={applyThemeOnExit}
                onChange={(e) => setApplyThemeOnExit(e.target.checked)}
                className="w-4 h-4 rounded border-white/30 bg-white/10 text-analytics-primary focus:ring-2 focus:ring-analytics-primary cursor-pointer accent-analytics-primary"
              />
              <label htmlFor="apply-theme-checkbox" className="text-sm text-analytics-secondary cursor-pointer">
                Apply theme when saving
              </label>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  // Revert to original theme state before switching and persist it
                  if (originalThemeState) {
                    revertToOriginalTheme(true); // true = persist to localStorage
                  }
                  
                  // Clear all flags and state BEFORE switching to prevent modal from appearing again
                  setHasAppliedChanges(false);
                  setHasUnsavedChanges(false);
                  setIsEditing(false);
                  const themeToSwitch = pendingThemeSwitch;
                  
                  // Close modal and clear pending
                  setShowSaveModal(false);
                  setPendingThemeSwitch(null);
                  
                  // Use setTimeout to ensure state is cleared before switching
                  setTimeout(() => {
                    if (themeToSwitch === 'light' || themeToSwitch === 'dark' || themeToSwitch === 'custom') {
                      // It's a mode toggle
                      handleModeToggle(themeToSwitch);
                    } else if (themeToSwitch) {
                      // It's a theme name - call handlePresetSelect directly without checks
                      const isPresetTheme = presetThemes.find(t => t.name === themeToSwitch);
                      const theme = presetThemesState.find(t => t.name === themeToSwitch);
                      
                      if (theme) {
                        // Check if this is a saved theme (not a preset)
                        const isSavedTheme = !isPresetTheme && themeToSwitch !== 'Default';
                        
                        let themeToApply;
                        
                        if (themeToSwitch === 'Default') {
                          themeToApply = { ...theme };
                        } else if (isSavedTheme) {
                          // Saved themes: always use their own background
                          const themeWithFit = {
                            ...theme,
                            background: {
                              ...theme.background,
                              fit: theme.background.fit || 'Fill',
                            },
                          };
                          themeToApply = themeWithFit;
                        } else {
                          // Preset themes: preserve custom uploaded background if present
                          const currentBackground = customTheme.background;
                          const isCustomBackground = currentBackground.texture && 
                            (currentBackground.texture.startsWith('data:') || 
                             (backgroundHistory.length > 0 && backgroundHistory.includes(currentBackground.texture)));
                          
                          if (isCustomBackground) {
                            themeToApply = {
                              ...theme,
                              background: {
                                ...currentBackground,
                                overlay: theme.background.overlay,
                                fit: currentBackground.fit || 'Fill',
                              },
                            };
                          } else {
                            const themeWithFit = {
                              ...theme,
                              background: {
                                ...theme.background,
                                fit: theme.background.fit || 'Fill',
                              },
                            };
                            themeToApply = themeWithFit;
                          }
                        }
                        
                        // Store current state as original before applying new theme
                        setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                        
                        setSelectedTheme(themeToSwitch);
                        setCustomTheme(themeToApply);
                        applyTheme(themeToApply, true);
                        setIsEditingSavedTheme(!isPresetTheme && themeToSwitch !== 'Default');
                        setIsEditing(false);
                        setHasUnsavedChanges(false);
                        setIsThemeApplied(false);
                        
                        if (isPresetTheme || themeToSwitch === 'Default') {
                          setOriginalPresetState(JSON.parse(JSON.stringify(theme)));
                        }
                        
                        toast.info(`Theme "${themeToSwitch}" selected`, {
                          description: 'Click the edit icon to enable editing, or navigate away without applying to revert.',
                        });
                      }
                    }
                  }, 100);
                }}
                className="glass-button-secondary px-4 py-2 text-sm"
              >
                Continue Without Saving
              </button>
              <button
                onClick={async () => {
                  // Save changes first
                  // Prevent name modal from showing by checking if it's a saved/preset theme first
                  const isPreset = presetThemes.find(t => t.name === selectedTheme);
                  const isSavedTheme = !isPreset && selectedTheme !== 'Default' && presetThemesState.find(t => t.name === selectedTheme);
                  
                  if (isEditing && selectedTheme && (isPreset || selectedTheme === 'Default' || isSavedTheme || isEditingSavedTheme)) {
                    // It's a preset or saved theme - handleSave will save it directly
                    handleSave();
                    // Wait a bit to ensure save completes before closing modal
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    // Apply theme if checkbox is checked
                    if (applyThemeOnExit) {
                      applyTheme(customTheme, false); // Apply and persist
                      setIsThemeApplied(true);
                    }
                  } else {
                    // It's a new custom theme - save will show name modal, but we don't want that here
                    // Apply theme if checkbox is checked
                    if (applyThemeOnExit) {
                      applyTheme(customTheme, false); // Apply and persist
                      setIsThemeApplied(true);
                    } else {
                      // Just apply the theme temporarily
                      applyTheme(customTheme, false);
                      setIsThemeApplied(true);
                    }
                    setHasUnsavedChanges(false);
                    setHasAppliedChanges(false);
                  }
                  
                  // Clear all flags BEFORE closing modal and switching
                  setIsThemeApplied(applyThemeOnExit ? true : false); // Mark as applied if checkbox is checked
                  setHasUnsavedChanges(false);
                  setHasAppliedChanges(false);
                  setIsEditing(false);
                  
                  // Store the theme to switch to before closing modal
                  const themeToSwitch = pendingThemeSwitch;
                  
                  // Close modal and clear pending
                  setShowSaveModal(false);
                  setPendingThemeSwitch(null);
                  
                  if (themeToSwitch) {
                    // After save completes, switch theme or mode
                    // Use setTimeout to ensure state is cleared before switching
                    setTimeout(() => {
                      // Ensure flags are still cleared before switching
                      setHasUnsavedChanges(false);
                      setHasAppliedChanges(false);
                      
                      if (themeToSwitch === 'light' || themeToSwitch === 'dark' || themeToSwitch === 'custom') {
                        // It's a mode toggle
                        handleModeToggle(themeToSwitch);
                      } else {
                        // It's a theme name - call handlePresetSelect directly without triggering save modal
                        // Since we just saved, there should be no unsaved changes
                        const isPresetTheme = presetThemes.find(t => t.name === themeToSwitch);
                        const theme = presetThemesState.find(t => t.name === themeToSwitch);
                        
                        if (theme) {
                          // Check if this is a saved theme (not a preset)
                          const isSavedThemeSwitch = !isPresetTheme && themeToSwitch !== 'Default';
                          
                          let themeToApply;
                          
                          if (themeToSwitch === 'Default') {
                            themeToApply = { ...theme };
                          } else if (isSavedThemeSwitch) {
                            // Saved themes: always use their own background
                            const themeWithFit = {
                              ...theme,
                              background: {
                                ...theme.background,
                                fit: theme.background.fit || 'Fill',
                              },
                            };
                            themeToApply = themeWithFit;
                          } else {
                            // Preset themes: preserve custom uploaded background if present
                            const currentBackground = customTheme.background;
                            const isCustomBackground = currentBackground.texture && 
                              (currentBackground.texture.startsWith('data:') || 
                               (backgroundHistory.length > 0 && backgroundHistory.includes(currentBackground.texture)));
                            
                            if (isCustomBackground) {
                              themeToApply = {
                                ...theme,
                                background: {
                                  ...currentBackground,
                                  overlay: theme.background.overlay,
                                  fit: currentBackground.fit || 'Fill',
                                },
                              };
                            } else {
                              const themeWithFit = {
                                ...theme,
                                background: {
                                  ...theme.background,
                                  fit: theme.background.fit || 'Fill',
                                },
                              };
                              themeToApply = themeWithFit;
                            }
                          }
                          
                          setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                          setSelectedTheme(themeToSwitch);
                          setCustomTheme(themeToApply);
                          applyTheme(themeToApply, true);
                          setIsEditingSavedTheme(!isPresetTheme && themeToSwitch !== 'Default');
                          setIsEditing(false);
                          setHasUnsavedChanges(false);
                          setIsThemeApplied(false);
                          
                          if (isPresetTheme || themeToSwitch === 'Default') {
                            setOriginalPresetState(JSON.parse(JSON.stringify(theme)));
                          }
                          
                          toast.info(`Theme "${themeToSwitch}" selected`, {
                            description: 'Click the edit icon to enable editing, or navigate away without applying to revert.',
                          });
                        }
                      }
                    }, 100);
                  }
                }}
                className="glass-button-primary px-4 py-2 text-sm text-white"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Confirmation Modal - When navigating away with applied changes or switching themes */}
      {showNavigationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card-pro p-6 rounded-xl max-w-md w-full relative">
            <button
              onClick={() => {
                setShowNavigationModal(false);
                setPendingNavigation(null);
                setPendingThemeSwitch(null);
              }}
              className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded transition-colors"
              title="Close"
            >
              <X size={18} className="text-analytics-primary" />
            </button>
            <h3 className="text-lg font-semibold text-analytics-primary mb-4 pr-8">
              {pendingThemeSwitch ? 'Switch Theme?' : (isUnnamedThemeApplied ? 'Save Theme?' : (hasUnsavedChanges ? 'Unsaved Changes' : 'Apply Theme?'))}
            </h3>
            <p className="text-sm text-analytics-secondary mb-4">
              {isUnnamedThemeApplied
                ? 'You have an applied custom theme that has not been saved with a name. Would you like to save it with a name before leaving?'
                : pendingThemeSwitch
                  ? `You have applied theme changes. Do you want to apply the current theme before switching to "${pendingThemeSwitch}" or continue without applying?`
                  : hasUnsavedChanges 
                    ? 'You have unsaved theme changes. If you navigate away, your changes will be lost.'
                    : 'You have selected a theme. Would you like to apply the theme or continue without applying?'}
            </p>
            {/* Apply theme checkbox - only show when not unnamed theme */}
            {!isUnnamedThemeApplied && (
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="apply-theme-nav-checkbox"
                  checked={applyThemeOnExit}
                  onChange={(e) => setApplyThemeOnExit(e.target.checked)}
                  className="w-4 h-4 rounded border-white/30 bg-white/10 text-analytics-primary focus:ring-2 focus:ring-analytics-primary cursor-pointer accent-analytics-primary"
                />
                <label htmlFor="apply-theme-nav-checkbox" className="text-sm text-analytics-secondary cursor-pointer">
                  Apply theme when saving
                </label>
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  // Revert to original theme state and persist it
                  if (originalThemeState) {
                    revertToOriginalTheme(true); // true = persist to localStorage
                  } else {
                    // If no original state, just clear flags and temporary theme
                    sessionStorage.removeItem('temp-theme');
                    setHasUnsavedChanges(false);
                    setHasAppliedChanges(false);
                  }
                  setIsUnnamedThemeApplied(false); // Clear unnamed theme flag when reverting
                  
                  // Store values before clearing
                  const navTarget = pendingNavigation;
                  const themeToSwitch = pendingThemeSwitch;
                  
                  // Clear all flags and state BEFORE switching/navigating
                  setHasAppliedChanges(false);
                  setHasUnsavedChanges(false);
                  setIsEditing(false);
                  
                  // Close modal and clear pending
                  setShowNavigationModal(false);
                  setPendingNavigation(null);
                  setPendingThemeSwitch(null);
                  
                  // Use setTimeout to ensure state is cleared before switching/navigating
                  setTimeout(() => {
                    if (navTarget) {
                      window.location.href = navTarget;
                    }
                    if (themeToSwitch) {
                      // Directly apply theme without checks
                      const isPresetTheme = presetThemes.find(t => t.name === themeToSwitch);
                      const theme = presetThemesState.find(t => t.name === themeToSwitch);
                      
                      if (theme) {
                        // Check if this is a saved theme (not a preset)
                        const isSavedTheme = !isPresetTheme && themeToSwitch !== 'Default';
                        
                        let themeToApply;
                        
                        if (themeToSwitch === 'Default') {
                          themeToApply = { ...theme };
                        } else if (isSavedTheme) {
                          // Saved themes: always use their own background
                          const themeWithFit = {
                            ...theme,
                            background: {
                              ...theme.background,
                              fit: theme.background.fit || 'Fill',
                            },
                          };
                          themeToApply = themeWithFit;
                        } else {
                          // Preset themes: preserve custom uploaded background if present
                          const currentBackground = customTheme.background;
                          const isCustomBackground = currentBackground.texture && 
                            (currentBackground.texture.startsWith('data:') || 
                             (backgroundHistory.length > 0 && backgroundHistory.includes(currentBackground.texture)));
                          
                          if (isCustomBackground) {
                            themeToApply = {
                              ...theme,
                              background: {
                                ...currentBackground,
                                overlay: theme.background.overlay,
                                fit: currentBackground.fit || 'Fill',
                              },
                            };
                          } else {
                            const themeWithFit = {
                              ...theme,
                              background: {
                                ...theme.background,
                                fit: theme.background.fit || 'Fill',
                              },
                            };
                            themeToApply = themeWithFit;
                          }
                        }
                        
                        setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                        setSelectedTheme(themeToSwitch);
                        setCustomTheme(themeToApply);
                        applyTheme(themeToApply, true);
                        setIsEditingSavedTheme(!isPresetTheme && themeToSwitch !== 'Default');
                        setIsEditing(false);
                        setHasUnsavedChanges(false);
                        setIsThemeApplied(false);
                        
                        if (isPresetTheme || themeToSwitch === 'Default') {
                          setOriginalPresetState(JSON.parse(JSON.stringify(theme)));
                        }
                        
                        toast.info(`Theme "${themeToSwitch}" selected`, {
                          description: 'Click the edit icon to enable editing, or navigate away without applying to revert.',
                        });
                      }
                    }
                  }, 100);
                }}
                className="glass-button-secondary px-4 py-2 text-sm"
              >
                {isUnnamedThemeApplied 
                  ? 'Continue Without Saving' 
                  : (pendingThemeSwitch ? 'Continue Without Applying' : (hasUnsavedChanges ? 'Discard Changes' : 'Continue Without Applying'))}
              </button>
              <button
                onClick={() => {
                  // If unnamed theme is applied, open name modal to save it
                  if (isUnnamedThemeApplied) {
                    setShowNavigationModal(false);
                    setShowNameModal(true);
                    // Store pending navigation to proceed after saving
                    return;
                  }
                  
                  // Apply/Save theme
                  if (hasUnsavedChanges) {
                    // Save current changes if editing saved theme
                    if (isEditingSavedTheme) {
                      handleSave();
                      // After save, originalThemeState will be updated in handleSave
                      // Apply theme if checkbox is checked
                      if (applyThemeOnExit) {
                        applyTheme(customTheme, false); // Apply and persist
                        setIsThemeApplied(true);
                      }
                    } else {
                      // For new themes, persist to localStorage and update original state
                      if (applyThemeOnExit) {
                        applyTheme(customTheme, false); // false = persist to localStorage
                        setIsThemeApplied(true);
                      }
                      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                      setHasUnsavedChanges(false);
                      setHasAppliedChanges(false);
                    }
                  } else {
                    // Theme is already applied visually, now persist it to localStorage if checkbox is checked
                    if (applyThemeOnExit) {
                      applyTheme(customTheme, false); // false = persist to localStorage
                      setIsThemeApplied(true); // Theme is now applied
                    }
                    setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                    setHasUnsavedChanges(false);
                    setHasAppliedChanges(false);
                  }
                  setShowNavigationModal(false);
                  if (pendingNavigation) {
                    setTimeout(() => {
                      window.location.href = pendingNavigation;
                      setPendingNavigation(null);
                    }, 100);
                  }
                  if (pendingThemeSwitch) {
                    // Clear flags first to prevent modal from appearing again
                    setHasAppliedChanges(false);
                    setHasUnsavedChanges(false);
                    setTimeout(() => {
                      handlePresetSelect(pendingThemeSwitch);
                      setPendingThemeSwitch(null);
                    }, 100);
                  }
                }}
                className="glass-button-primary px-4 py-2 text-sm text-white"
              >
                {isUnnamedThemeApplied 
                  ? 'Save Theme & Continue' 
                  : (pendingThemeSwitch ? 'Apply Theme & Switch' : (hasUnsavedChanges ? 'Save & Continue' : 'Apply Theme & Continue'))}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <main className="px-4 py-7">
        <div className="analytics-header text-2xl mb-6 flex items-center gap-3">
          <Palette size={28} className="text-analytics-primary" />
          <span>Theme Customization</span>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => handleModeToggle('light')}
              className={`glass-button-secondary px-4 py-2 flex items-center gap-2 ${
                customTheme.mode === 'light' ? 'ring-2 ring-white/50' : ''
              }`}
              title="Light Mode"
            >
              <Sun size={18} />
              <span className="text-sm">Light Mode</span>
            </button>
            <button
              onClick={() => handleModeToggle('dark')}
              className={`glass-button-secondary px-4 py-2 flex items-center gap-2 ${
                customTheme.mode === 'dark' ? 'ring-2 ring-white/50' : ''
              }`}
              title="Dark Mode"
            >
              <Moon size={18} />
              <span className="text-sm">Dark Mode</span>
            </button>
            <button
              onClick={() => handleModeToggle('custom')}
              className={`glass-button-secondary px-4 py-2 flex items-center gap-2 ${
                customTheme.mode !== 'light' && customTheme.mode !== 'dark' ? 'ring-2 ring-white/50' : ''
              }`}
              title="Custom Mode"
            >
              <Palette size={18} />
              <span className="text-sm">Custom</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Preset Themes */}
          <div className="lg:col-span-1 space-y-6">
            <div className="glass-card-pro p-6">
              <h3 className="text-lg font-semibold text-analytics-primary mb-4">Preset Themes</h3>
              <div className="space-y-3 max-h-[400px] overflow-y-auto category-dropdown-scroll">
                {[...presetThemesState].sort((a, b) => {
                  // Put the selected/applied theme at the top
                  if (a.name === selectedTheme) return -1;
                  if (b.name === selectedTheme) return 1;
                  return 0;
                }).map((theme) => (
                  <div
                    key={theme.name}
                    className="relative group"
                  >
                    <button
                      onClick={() => handlePresetSelect(theme.name)}
                      className={`w-full p-4 rounded-xl transition-all duration-200 ${
                        selectedTheme === theme.name
                          ? 'glass-button-primary text-white'
                          : 'glass-button-secondary'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{theme.name}</span>
                          {theme.mode === 'dark' && <Moon size={14} />}
                          {theme.mode === 'light' && <Sun size={14} />}
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedTheme === theme.name && <Check size={18} />}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {/* Show edit button for all themes (presets can now be edited) */}
                            <button
                              onClick={(e) => handleEditPreset(theme.name, e)}
                              className="p-1 hover:bg-white/20 rounded transition-colors"
                              title="Edit theme"
                              type="button"
                            >
                              <Pencil size={14} />
                            </button>
                            {/* Show restore icon for preset themes if edited */}
                            {(presetThemes.find(t => t.name === theme.name) || theme.name === 'Default') && 
                             originalPresetState && 
                             selectedTheme === theme.name && 
                             JSON.stringify(customTheme) !== JSON.stringify(originalPresetState) && (
                              <button
                                onClick={(e) => handleRestorePreset(theme.name, e)}
                                className="p-1 hover:bg-blue-500/30 rounded transition-colors text-blue-300"
                                title="Restore to original settings"
                                type="button"
                              >
                                <RotateCcw size={14} />
                              </button>
                            )}
                            {/* Only show delete button for saved themes (not presets) */}
                            {!presetThemes.find(t => t.name === theme.name) && theme.name !== 'Default' && (
                              <button
                                onClick={(e) => handleDeletePreset(theme.name, e)}
                                className="p-1 hover:bg-red-500/30 rounded transition-colors text-red-300"
                                title="Delete theme"
                                type="button"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    // If editing any theme (preset or saved) with changes, show save modal
                    if (hasUnsavedChanges && selectedTheme && selectedTheme !== 'Custom') {
                      const currentIsPreset = presetThemes.find(t => t.name === selectedTheme);
                      const currentIsSaved = presetThemesState.find(t => t.name === selectedTheme && t.name !== 'Default' && !currentIsPreset);
                      
                      if (isEditingSavedTheme || currentIsPreset || currentIsSaved) {
                        setPendingThemeSwitch('Custom');
                        setShowSaveModal(true);
                        return;
                      }
                    }
                    // Activate Custom theme and enable editing immediately
                    setSelectedTheme('Custom');
                    setIsEditing(true); // Enable editing immediately for new theme creation
                    setIsEditingSavedTheme(false); // Custom is not a saved theme until saved
                    setHasUnsavedChanges(false); // Clear unsaved changes
                    setHasAppliedChanges(false); // Clear applied changes
                    
                    // Store current state as original before switching to Custom
                    if (selectedTheme && selectedTheme !== 'Custom') {
                      setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                    }
                  }}
                  className={`w-full p-4 rounded-xl transition-all duration-200 ${
                    selectedTheme === 'Custom'
                      ? 'glass-button-primary text-white'
                      : 'glass-button-secondary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Custom</span>
                    {selectedTheme === 'Custom' && <Check size={18} />}
                  </div>
                </button>
                <p className="text-xs text-analytics-secondary mt-3 text-center">
                  Select any preset or start customizing colors to create your own theme
                </p>
              </div>
            </div>

            {/* Background Management */}
            <div className="glass-card-pro p-6">
              <h3 className="text-lg font-semibold text-analytics-primary mb-4">Background</h3>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!isEditing}
                className="glass-button-secondary w-full py-3 flex items-center justify-center gap-2 mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Upload size={18} />
                Upload Background
              </button>
              
              {/* Background Fit Dropdown */}
              {customTheme.background.texture && customTheme.background.texture !== 'none' && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-analytics-secondary mb-2">
                    Picture Position
                  </label>
                  <select
                    value={customTheme.background.fit || 'Fill'}
                    onChange={(e) => {
                      // Store original theme state before first modification
                      if (!originalThemeState && !hasAppliedChanges) {
                        setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                      }
                      
                      const updatedTheme = {
                        ...customTheme,
                        background: {
                          ...customTheme.background,
                          fit: e.target.value,
                        },
                      };
                      setCustomTheme(updatedTheme);
                      applyTheme(updatedTheme, false); // false = persist immediately
                      setHasUnsavedChanges(false);
                      setHasAppliedChanges(true);
                      setIsEditing(true);
                      if (selectedTheme !== 'Custom') {
                        setSelectedTheme('Custom');
                      }
                    }}
                    disabled={!isEditing}
                    className="glass-input w-full px-3 py-2 text-sm cursor-pointer appearance-none bg-white/10 backdrop-blur-md border border-white/30 rounded-lg text-analytics-primary focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%23ffffff\' d=\'M6 9L1 4h10z\'/%3E%3C/svg%3E")',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'right 0.75rem center',
                      paddingRight: '2.5rem',
                    }}
                  >
                    <option value="Fill" className="bg-gray-800 text-white">Fill</option>
                    <option value="Fit" className="bg-gray-800 text-white">Fit</option>
                    <option value="Stretch" className="bg-gray-800 text-white">Stretch</option>
                    <option value="Tile" className="bg-gray-800 text-white">Tile</option>
                    <option value="Center" className="bg-gray-800 text-white">Center</option>
                    <option value="Span" className="bg-gray-800 text-white">Span</option>
                  </select>
                  <p className="text-xs text-analytics-secondary mt-1">
                    Choose how the background image is displayed
                  </p>
                </div>
              )}
              
              {backgroundHistory.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-analytics-secondary">Recent Backgrounds</span>
                    <History size={16} className="text-analytics-secondary" />
                  </div>
                  <div className="grid grid-cols-4 gap-2 max-h-[200px] overflow-y-auto category-dropdown-scroll">
                    {backgroundHistory.map((bgUrl, index) => (
                      <div key={index} className="relative group">
                        <button
                          onClick={() => handleBackgroundSelect(bgUrl)}
                          disabled={!isEditing}
                          className="w-full h-16 rounded-lg overflow-hidden border-2 border-white/20 hover:border-white/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                          style={{
                            backgroundImage: `url(${bgUrl})`,
                            backgroundSize: 'cover',
                            backgroundPosition: 'center',
                          }}
                        >
                          {customTheme.background.texture === bgUrl && (
                            <div className="absolute inset-0 bg-white/30 flex items-center justify-center">
                              <Check size={16} className="text-white" />
                            </div>
                          )}
                        </button>
                        <button
                          onClick={() => handleBackgroundRemove(index)}
                          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                          title="Remove from history"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Font Size Slider */}
            <div className="glass-card-pro p-6">
              <h3 className="text-lg font-semibold text-analytics-primary mb-4">Font Size</h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-analytics-secondary">
                    Base Font Size: {fontSize}px
                  </label>
                  <span className="text-xs text-analytics-secondary">
                    {fontSize < 14 ? 'Small' : fontSize < 18 ? 'Medium' : 'Large'}
                  </span>
                </div>
                <input
                  type="range"
                  min="12"
                  max="24"
                  step="1"
                  value={fontSize}
                  onChange={(e) => {
                    const newSize = parseInt(e.target.value, 10);
                    setFontSize(newSize);
                    applyFontSize(newSize);
                  }}
                  className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.3) ${((fontSize - 12) / (24 - 12)) * 100}%, rgba(255,255,255,0.1) ${((fontSize - 12) / (24 - 12)) * 100}%, rgba(255,255,255,0.1) 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-analytics-secondary">
                  <span>12px</span>
                  <span>18px</span>
                  <span>24px</span>
                </div>
                <p className="text-xs text-analytics-secondary mt-2">
                  Adjust the base font size for the entire application
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="glass-card-pro p-6">
              <div className="flex flex-col gap-3">
                {selectedTheme === 'Custom' ? (
                  <>
                    <button
                      onClick={() => {
                        // Apply Custom theme (persist without name)
                        // Mark theme as unnamed so user gets prompted to save it
                        const themeToApply = { ...customTheme, name: 'Custom' };
                        applyTheme(themeToApply, false); // false = persist to localStorage
                        setCustomTheme(themeToApply);
                        setIsThemeApplied(true);
                        setHasUnsavedChanges(false);
                        setHasAppliedChanges(false);
                        setIsUnnamedThemeApplied(true); // Mark as unnamed applied theme
                        // Store as original state after applying
                        setOriginalThemeState(JSON.parse(JSON.stringify(themeToApply)));
                        toast.success('Theme applied successfully', {
                          description: 'Your custom theme is now active. Remember to save it with a name!',
                        });
                      }}
                      disabled={!isEditing}
                      className="glass-button-primary text-white w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={18} />
                      Apply Theme
                    </button>
                    <button
                      onClick={() => {
                        setShowNameModal(true);
                      }}
                      disabled={!isEditing}
                      className="glass-button-secondary w-full py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={18} />
                      Save Theme With Name
                    </button>
                  </>
                ) : (
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => {
                        applyTheme(customTheme, false); // Apply immediately
                        setIsThemeApplied(true);
                        setHasAppliedChanges(true);
                        toast.success('Theme applied', {
                          description: 'Theme has been applied. Save to persist changes.',
                        });
                      }}
                      disabled={!isEditing}
                      className="flex-1 glass-button-secondary py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Check size={18} />
                      Apply
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!isEditing}
                      className="flex-1 glass-button-primary text-white py-3 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Save size={18} />
                      Save Theme
                    </button>
                  </div>
                )}
                <button
                  onClick={handleReset}
                  className="glass-button-secondary w-full py-3 flex items-center justify-center gap-2"
                >
                  <RotateCcw size={18} />
                  Reset to Default
                </button>
              </div>
            </div>
          </div>

          {/* Theme Editor */}
          <div className="lg:col-span-2">
            <div className="glass-card-pro p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-analytics-primary">
                  {selectedTheme === 'Custom' ? 'Custom Theme Editor' : `${selectedTheme} Theme Preview`}
                </h3>
                {/* Save and Apply buttons appear when editing */}
                {isEditing && hasUnsavedChanges && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        applyTheme(customTheme, false); // Apply immediately
                        setIsThemeApplied(true);
                        setHasAppliedChanges(true);
                        toast.success('Theme applied', {
                          description: 'Theme has been applied. Save to persist changes.',
                        });
                      }}
                      className="glass-button-secondary px-4 py-2 flex items-center gap-2 text-sm"
                    >
                      <Check size={16} />
                      Apply
                    </button>
                    <button
                      onClick={handleSave}
                      className="glass-button-primary text-white px-4 py-2 flex items-center gap-2 text-sm"
                    >
                      <Save size={16} />
                      Save Changes
                    </button>
                  </div>
                )}
              </div>

              {/* Admin Dashboard Color Customization by Sections */}
              <div className="space-y-6 mb-8">
                <h3 className="text-base font-semibold text-analytics-primary mb-4">Admin Dashboard Colors</h3>
                {colorSections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-sm font-medium text-analytics-secondary mb-4 uppercase tracking-wide">
                      {section.title}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {section.keys.map((key) => {
                        const hasHistory = colorHistory[key] && colorHistory[key].length > 0;
                        const parsedColor = parseColor(customTheme.colors[key]);
                        const colorHex = parsedColor.hex;
                        const colorOpacity = parsedColor.opacity;
                        return (
                          <div key={key} className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between w-full">
                              <label className="text-xs font-medium text-analytics-secondary capitalize flex-shrink-0">
                                {key.replace('_', ' ')}
                              </label>
                              {hasHistory && (
                                <button
                                  onClick={() => handleColorRevert(key)}
                                  className="text-analytics-secondary hover:text-analytics-primary transition-colors p-1 rounded hover:bg-white/10 flex-shrink-0 ml-2"
                                  title="Revert to previous color"
                                  type="button"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 w-full">
                              <div className="relative flex-shrink-0">
                                {/* Checkerboard pattern background for transparency */}
                                <div 
                                  className="absolute inset-0 rounded border-2 border-white/20"
                                  style={{
                                    backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                                    backgroundSize: '8px 8px',
                                    backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                                  }}
                                />
                                {/* Color button that opens picker */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isEditing) return;
                                    setOpenColorPicker({ key, hex: colorHex, opacity: colorOpacity });
                                  }}
                                  disabled={!isEditing}
                                  className="relative w-10 h-10 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
                                  style={{ 
                                    backgroundColor: toRGBA(colorHex, colorOpacity),
                                  }}
                                />
                              </div>
                              <input
                                type="text"
                                value={colorHex}
                                disabled={!isEditing}
                                onChange={(e) => {
                                  let hexValue = e.target.value.toUpperCase().trim();
                                  
                                  // Handle empty input
                                  if (hexValue === '') {
                                    setCustomTheme(prev => ({
                                      ...prev,
                                      colors: {
                                        ...prev.colors,
                                        [key]: { hex: parsedColor.hex, opacity: colorOpacity },
                                      },
                                    }));
                                    return;
                                  }

                                  // Auto-add # if missing
                                  if (!hexValue.startsWith('#') && /^[0-9A-Fa-f]{1,6}$/.test(hexValue)) {
                                    hexValue = '#' + hexValue;
                                  }

                                  // Validate and update
                                  if (hexValue.startsWith('#')) {
                                    if (/^#[0-9A-Fa-f]{0,6}$/.test(hexValue)) {
                                      if (hexValue.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
                                        // Complete valid hex - apply immediately
                                        handleColorChange(key, hexValue, colorOpacity);
                                      } else {
                                        // Partial hex - update state but don't apply theme yet
                                        setCustomTheme(prev => ({
                                          ...prev,
                                          colors: {
                                            ...prev.colors,
                                            [key]: { hex: hexValue, opacity: colorOpacity },
                                          },
                                        }));
                                      }
                                    }
                                  }
                                }}
                                onBlur={(e) => {
                                  let value = e.target.value.toUpperCase().trim();
                                  if (!value || value === '#') {
                                    // Restore current valid color
                                    handleColorChange(key, colorHex, colorOpacity);
                                    return;
                                  }
                                  
                                  // Ensure # prefix
                                  if (!value.startsWith('#')) {
                                    value = '#' + value;
                                  }
                                  
                                  // Pad or fix incomplete hex
                                  if (value.startsWith('#') && value.length < 7) {
                                    const hexPart = value.replace('#', '').padEnd(6, '0').substring(0, 6);
                                    value = '#' + hexPart;
                                  }
                                  
                                  // Validate and apply
                                  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                                    handleColorChange(key, value, colorOpacity);
                                  } else {
                                    // Invalid - restore
                                    handleColorChange(key, colorHex, colorOpacity);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.target.blur();
                                  }
                                }}
                                className="flex-1 glass-input px-3 py-2 text-sm font-mono min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                placeholder="#000000"
                                maxLength={7}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* POS Color Customization by Sections */}
              <div className="space-y-6 mb-8 border-t border-white/10 pt-6">
                <h3 className="text-base font-semibold text-analytics-primary mb-4">POS System Colors</h3>
                {posColorSections.map((section) => (
                  <div key={section.title}>
                    <h4 className="text-sm font-medium text-analytics-secondary mb-4 uppercase tracking-wide">
                      {section.title}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {section.keys.map((key) => {
                        const hasHistory = colorHistory[key] && colorHistory[key].length > 0;
                        const parsedColor = parseColor(customTheme.colors[key]);
                        const colorHex = parsedColor.hex;
                        const colorOpacity = parsedColor.opacity;
                        return (
                          <div key={key} className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between w-full">
                              <label className="text-xs font-medium text-analytics-secondary capitalize flex-shrink-0">
                                {key.replace('pos', '').replace(/([A-Z])/g, ' $1').trim()}
                              </label>
                              {hasHistory && (
                                <button
                                  onClick={() => handleColorRevert(key)}
                                  className="text-analytics-secondary hover:text-analytics-primary transition-colors p-1 rounded hover:bg-white/10 flex-shrink-0 ml-2"
                                  title="Revert to previous color"
                                  type="button"
                                >
                                  <RotateCcw size={12} />
                                </button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 w-full">
                              <div className="relative flex-shrink-0">
                                {/* Checkerboard pattern background for transparency */}
                                <div 
                                  className="absolute inset-0 rounded border-2 border-white/20"
                                  style={{
                                    backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
                                    backgroundSize: '8px 8px',
                                    backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                                  }}
                                />
                                {/* Color button that opens picker */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isEditing) return;
                                    setOpenColorPicker({ key, hex: colorHex, opacity: colorOpacity });
                                  }}
                                  disabled={!isEditing}
                                  className="relative w-10 h-10 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-0"
                                  style={{ 
                                    backgroundColor: toRGBA(colorHex, colorOpacity),
                                  }}
                                />
                              </div>
                              <input
                                type="text"
                                value={colorHex}
                                disabled={!isEditing}
                                onChange={(e) => {
                                  let hexValue = e.target.value.toUpperCase().trim();
                                  
                                  // Handle empty input
                                  if (hexValue === '') {
                                    setCustomTheme(prev => ({
                                      ...prev,
                                      colors: {
                                        ...prev.colors,
                                        [key]: { hex: parsedColor.hex, opacity: colorOpacity },
                                      },
                                    }));
                                    return;
                                  }

                                  // Auto-add # if missing
                                  if (!hexValue.startsWith('#') && /^[0-9A-Fa-f]{1,6}$/.test(hexValue)) {
                                    hexValue = '#' + hexValue;
                                  }

                                  // Validate and update
                                  if (hexValue.startsWith('#')) {
                                    if (/^#[0-9A-Fa-f]{0,6}$/.test(hexValue)) {
                                      if (hexValue.length === 7 && /^#[0-9A-Fa-f]{6}$/.test(hexValue)) {
                                        // Complete valid hex - apply immediately
                                        handleColorChange(key, hexValue, colorOpacity);
                                      } else {
                                        // Partial hex - update state but don't apply theme yet
                                        setCustomTheme(prev => ({
                                          ...prev,
                                          colors: {
                                            ...prev.colors,
                                            [key]: { hex: hexValue, opacity: colorOpacity },
                                          },
                                        }));
                                      }
                                    }
                                  }
                                }}
                                onBlur={(e) => {
                                  let value = e.target.value.toUpperCase().trim();
                                  if (!value || value === '#') {
                                    // Restore current valid color
                                    handleColorChange(key, colorHex, colorOpacity);
                                    return;
                                  }
                                  
                                  // Ensure # prefix
                                  if (!value.startsWith('#')) {
                                    value = '#' + value;
                                  }
                                  
                                  // Pad or fix incomplete hex
                                  if (value.startsWith('#') && value.length < 7) {
                                    const hexPart = value.replace('#', '').padEnd(6, '0').substring(0, 6);
                                    value = '#' + hexPart;
                                  }
                                  
                                  // Validate and apply
                                  if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                                    handleColorChange(key, value, colorOpacity);
                                  } else {
                                    // Invalid - restore
                                    handleColorChange(key, colorHex, colorOpacity);
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.target.blur();
                                  }
                                }}
                                className="flex-1 glass-input px-3 py-2 text-sm font-mono min-w-0 disabled:opacity-50 disabled:cursor-not-allowed"
                                placeholder="#000000"
                                maxLength={7}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Glass Effects */}
              <div className="mb-8">
                <h4 className="text-sm font-medium text-analytics-secondary mb-4 uppercase tracking-wide">
                  Glass Effects
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-analytics-secondary">
                      Blur ({customTheme.glass.blur}px)
                    </label>
                    <div className="relative w-full h-8 flex items-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                      </div>
                      <input
                        type="range"
                        min="5"
                        max="20"
                        step="0.5"
                        value={customTheme.glass.blur}
                        onChange={(e) => handleGlassChange('blur', e.target.value)}
                        disabled={!isEditing}
                        className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-analytics-secondary">
                      Opacity ({Math.round(customTheme.glass.opacity * 100)}%)
                    </label>
                    <div className="relative w-full h-8 flex items-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                      </div>
                      <input
                        type="range"
                        min="0.05"
                        max="0.5"
                        step="0.01"
                        value={customTheme.glass.opacity}
                        onChange={(e) => handleGlassChange('opacity', e.target.value)}
                        disabled={!isEditing}
                        className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-analytics-secondary">
                      Border Opacity ({Math.round(customTheme.glass.borderOpacity * 100)}%)
                    </label>
                    <div className="relative w-full h-8 flex items-center">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="0.8"
                        step="0.01"
                        value={customTheme.glass.borderOpacity}
                        onChange={(e) => handleGlassChange('borderOpacity', e.target.value)}
                        disabled={!isEditing}
                        className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
                
                {/* Button Glass Effects */}
                <div className="mt-6 pt-6 border-t border-white/10">
                  <h5 className="text-xs font-medium text-analytics-secondary mb-4 uppercase tracking-wide">
                    Button Glass Effects
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-analytics-secondary">
                        Blur ({customTheme.buttonGlass?.blur || 12}px)
                      </label>
                      <div className="relative w-full h-8 flex items-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="25"
                          step="0.5"
                          value={customTheme.buttonGlass?.blur || 12}
                          onChange={(e) => handleButtonGlassChange('blur', e.target.value)}
                          disabled={!isEditing}
                          className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-analytics-secondary">
                        Opacity ({Math.round((customTheme.buttonGlass?.opacity || 0.25) * 100)}%)
                      </label>
                      <div className="relative w-full h-8 flex items-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="0.6"
                          step="0.01"
                          value={customTheme.buttonGlass?.opacity || 0.25}
                          onChange={(e) => handleButtonGlassChange('opacity', e.target.value)}
                          disabled={!isEditing}
                          className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-medium text-analytics-secondary">
                        Border Opacity ({Math.round((customTheme.buttonGlass?.borderOpacity || 0.4) * 100)}%)
                      </label>
                      <div className="relative w-full h-8 flex items-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                        </div>
                        <input
                          type="range"
                          min="0.1"
                          max="0.8"
                          step="0.01"
                          value={customTheme.buttonGlass?.borderOpacity || 0.4}
                          onChange={(e) => handleButtonGlassChange('borderOpacity', e.target.value)}
                          disabled={!isEditing}
                          className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Background Overlay */}
              <div className="mb-8">
                <h4 className="text-sm font-medium text-analytics-secondary mb-4 uppercase tracking-wide">
                  Background Overlay
                </h4>
                
                {/* Overlay Type Toggle */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-analytics-secondary mb-2">
                    Overlay Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (!originalThemeState && !hasAppliedChanges) {
                          setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                        }
                        
                        const updatedTheme = {
                          ...customTheme,
                          background: {
                            ...customTheme.background,
                            overlayType: 'solid',
                            overlay: generateOverlay({ ...customTheme.background, overlayType: 'solid' }),
                          },
                        };
                        setCustomTheme(updatedTheme);
                        applyTheme(updatedTheme, true);
                        setHasUnsavedChanges(true);
                        setHasAppliedChanges(true);
                        setIsEditing(true);
                      }}
                      disabled={!isEditing}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        customTheme.background.overlayType === 'solid'
                          ? 'glass-button-primary text-white'
                          : 'glass-button-secondary'
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      onClick={() => {
                        if (!originalThemeState && !hasAppliedChanges) {
                          setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                        }
                        
                        const updatedTheme = {
                          ...customTheme,
                          background: {
                            ...customTheme.background,
                            overlayType: 'gradient',
                            overlay: generateOverlay({ ...customTheme.background, overlayType: 'gradient' }),
                          },
                        };
                        setCustomTheme(updatedTheme);
                        applyTheme(updatedTheme, true);
                        setHasUnsavedChanges(true);
                        setHasAppliedChanges(true);
                        setIsEditing(true);
                      }}
                      disabled={!isEditing}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        customTheme.background.overlayType === 'gradient'
                          ? 'glass-button-primary text-white'
                          : 'glass-button-secondary'
                      }`}
                    >
                      Gradient
                    </button>
                  </div>
                </div>

                {/* Opacity Slider */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-analytics-secondary mb-2">
                    Opacity: {Math.round((customTheme.background.overlayOpacity || 1) * 100)}%
                  </label>
                  <div className="relative w-full h-8 flex items-center">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={customTheme.background.overlayOpacity || 1}
                      onChange={(e) => {
                        if (!originalThemeState && !hasAppliedChanges) {
                          setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                        }
                        
                        const opacity = parseFloat(e.target.value);
                        const updatedTheme = {
                          ...customTheme,
                          background: {
                            ...customTheme.background,
                            overlayOpacity: opacity,
                            overlay: generateOverlay({ ...customTheme.background, overlayOpacity: opacity }),
                          },
                        };
                        setCustomTheme(updatedTheme);
                        applyTheme(updatedTheme, true);
                        setHasUnsavedChanges(true);
                        setHasAppliedChanges(true);
                        setIsEditing(true);
                      }}
                      disabled={!isEditing}
                      className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Solid Color Picker */}
                {customTheme.background.overlayType === 'solid' && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-analytics-secondary mb-2">
                      Solid Color
                    </label>
                    <div className="flex gap-2 items-center">
                      <input
                        type="color"
                        value={customTheme.background.solidColor || '#D1925B'}
                        onChange={(e) => {
                          if (!originalThemeState && !hasAppliedChanges) {
                            setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                          }
                          
                          const newColor = e.target.value;
                          const updatedTheme = {
                            ...customTheme,
                            background: {
                              ...customTheme.background,
                              solidColor: newColor,
                              overlay: generateOverlay({ ...customTheme.background, solidColor: newColor }),
                            },
                          };
                          setCustomTheme(updatedTheme);
                          applyTheme(updatedTheme, true);
                          setHasUnsavedChanges(true);
                          setHasAppliedChanges(true);
                          setIsEditing(true);
                          
                          // Auto-extract colors from solid color
                          const extractedColors = extractColorsFromOverlay({
                            overlayType: 'solid',
                            solidColor: newColor,
                          });
                          if (extractedColors) {
                            const formattedColors = formatExtractedColors(extractedColors);
                            const themeWithColors = {
                              ...updatedTheme,
                              colors: {
                                ...updatedTheme.colors,
                                ...formattedColors,
                              },
                            };
                            setCustomTheme(themeWithColors);
                            applyTheme(themeWithColors, true);
                          }
                        }}
                        disabled={!isEditing}
                        className="w-16 h-12 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-2 border-white/30"
                      />
                      <input
                        type="text"
                        value={customTheme.background.solidColor || '#D1925B'}
                        onChange={(e) => {
                          if (!originalThemeState && !hasAppliedChanges) {
                            setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                          }
                          
                          const newColor = e.target.value;
                          if (/^#[0-9A-Fa-f]{6}$/.test(newColor)) {
                            const updatedTheme = {
                              ...customTheme,
                              background: {
                                ...customTheme.background,
                                solidColor: newColor,
                                overlay: generateOverlay({ ...customTheme.background, solidColor: newColor }),
                              },
                            };
                            setCustomTheme(updatedTheme);
                            applyTheme(updatedTheme, true);
                            setHasUnsavedChanges(true);
                            setHasAppliedChanges(true);
                            setIsEditing(true);
                            
                            // Auto-extract colors from solid color
                            const extractedColors = extractColorsFromOverlay({
                              overlayType: 'solid',
                              solidColor: newColor,
                            });
                            if (extractedColors) {
                              const formattedColors = formatExtractedColors(extractedColors);
                              const themeWithColors = {
                                ...updatedTheme,
                                colors: {
                                  ...updatedTheme.colors,
                                  ...formattedColors,
                                },
                              };
                              setCustomTheme(themeWithColors);
                              applyTheme(themeWithColors, true);
                            }
                          }
                        }}
                        disabled={!isEditing}
                        className="flex-1 glass-input px-3 py-2 text-sm"
                        placeholder="#D1925B"
                      />
                    </div>
                    
                    {/* Preset Colors */}
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">
                        Preset Colors
                      </label>
                      <div className="grid grid-cols-6 gap-2">
                        {['#FFFFFF', '#000000', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B500', '#95E1D3'].map((presetColor) => (
                          <button
                            key={presetColor}
                            onClick={() => {
                              if (!originalThemeState && !hasAppliedChanges) {
                                setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                              }
                              
                              const updatedTheme = {
                                ...customTheme,
                                background: {
                                  ...customTheme.background,
                                  solidColor: presetColor,
                                  overlay: generateOverlay({ ...customTheme.background, solidColor: presetColor }),
                                },
                              };
                              setCustomTheme(updatedTheme);
                              applyTheme(updatedTheme, true);
                              setHasUnsavedChanges(true);
                              setHasAppliedChanges(true);
                              setIsEditing(true);
                              
                              // Auto-extract colors from solid color
                              const extractedColors = extractColorsFromOverlay({
                                overlayType: 'solid',
                                solidColor: presetColor,
                              });
                              if (extractedColors) {
                                const formattedColors = formatExtractedColors(extractedColors);
                                const themeWithColors = {
                                  ...updatedTheme,
                                  colors: {
                                    ...updatedTheme.colors,
                                    ...formattedColors,
                                  },
                                };
                                setCustomTheme(themeWithColors);
                                applyTheme(themeWithColors, true);
                              }
                            }}
                            disabled={!isEditing}
                            className="w-10 h-10 rounded-lg border-2 border-white/30 hover:border-white/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: presetColor }}
                            title={presetColor}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Gradient Color Picker */}
                {customTheme.background.overlayType === 'gradient' && (
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-analytics-secondary mb-2">
                      Gradient Colors
                    </label>
                    
                    {/* Gradient Direction Presets */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">
                        Direction
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { label: '→', title: 'Horizontal (to right)', angle: 90 },
                          { label: '↓', title: 'Vertical (to bottom)', angle: 180 },
                          { label: '↘', title: 'Diagonal Top-Left to Bottom-Right', angle: 135 },
                          { label: '↙', title: 'Diagonal Top-Right to Bottom-Left', angle: 225 },
                          { label: '←', title: 'Horizontal (to left)', angle: 270 },
                          { label: '↑', title: 'Vertical (to top)', angle: 0 },
                          { label: '↗', title: 'Diagonal Bottom-Left to Top-Right', angle: 45 },
                          { label: '↖', title: 'Diagonal Bottom-Right to Top-Left', angle: 315 },
                        ].map((direction) => (
                          <button
                            key={direction.angle}
                            onClick={() => {
                              if (!originalThemeState && !hasAppliedChanges) {
                                setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                              }
                              
                              const updatedTheme = {
                                ...customTheme,
                                background: {
                                  ...customTheme.background,
                                  gradientAngle: direction.angle,
                                  overlay: generateOverlay({ ...customTheme.background, gradientAngle: direction.angle }),
                                },
                              };
                              setCustomTheme(updatedTheme);
                              applyTheme(updatedTheme, true);
                              setHasUnsavedChanges(true);
                              setHasAppliedChanges(true);
                              setIsEditing(true);
                            }}
                            disabled={!isEditing}
                            title={direction.title}
                            className={`p-2 rounded-lg text-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              customTheme.background.gradientAngle === direction.angle
                                ? 'glass-button-primary text-white'
                                : 'glass-button-secondary'
                            }`}
                          >
                            {direction.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    {/* Gradient Angle Slider */}
                    <div className="mb-3">
                      <label className="block text-xs font-medium text-analytics-secondary mb-2">
                        Angle: {customTheme.background.gradientAngle || 120}°
                      </label>
                      <div className="relative w-full h-8 flex items-center">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full h-2 bg-black/30 rounded-full border-2 border-white/50 shadow-inner"></div>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="360"
                          step="1"
                          value={customTheme.background.gradientAngle || 120}
                          onChange={(e) => {
                            if (!originalThemeState && !hasAppliedChanges) {
                              setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                            }
                            
                            const angle = parseInt(e.target.value);
                            const updatedTheme = {
                              ...customTheme,
                              background: {
                                ...customTheme.background,
                                gradientAngle: angle,
                                overlay: generateOverlay({ ...customTheme.background, gradientAngle: angle }),
                              },
                            };
                            setCustomTheme(updatedTheme);
                            applyTheme(updatedTheme, true);
                            setHasUnsavedChanges(true);
                            setHasAppliedChanges(true);
                            setIsEditing(true);
                          }}
                          disabled={!isEditing}
                          className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>
                    
                    {/* Gradient Color Stops */}
                    <div className="space-y-2">
                      {(customTheme.background.gradientColors || []).map((color, index) => {
                        const rgb = colorToRgb(color);
                        const hexValue = `#${[rgb.r, rgb.g, rgb.b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
                        return (
                        <div key={index} className="flex gap-2 items-center">
                          <label className="text-xs font-medium text-analytics-secondary w-16 flex-shrink-0">
                            Color {index + 1}
                          </label>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <input
                              type="color"
                              value={hexValue}
                              onChange={(e) => {
                              if (!originalThemeState && !hasAppliedChanges) {
                                setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                              }
                              
                              const rgb = colorToRgb(e.target.value);
                              const currentRgb = colorToRgb(color);
                              const newColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${currentRgb.a || 0.5})`;
                              const newColors = [...(customTheme.background.gradientColors || [])];
                              newColors[index] = newColor;
                              
                              const updatedTheme = {
                                ...customTheme,
                                background: {
                                  ...customTheme.background,
                                  gradientColors: newColors,
                                  overlay: generateOverlay({ ...customTheme.background, gradientColors: newColors }),
                                },
                              };
                              setCustomTheme(updatedTheme);
                              applyTheme(updatedTheme, true);
                              setHasUnsavedChanges(true);
                              setHasAppliedChanges(true);
                              setIsEditing(true);
                              
                              // Auto-extract colors from gradient
                              const extractedColors = extractColorsFromOverlay({
                                overlayType: 'gradient',
                                gradientColors: newColors,
                              });
                              if (extractedColors) {
                                const formattedColors = formatExtractedColors(extractedColors);
                                const themeWithColors = {
                                  ...updatedTheme,
                                  colors: {
                                    ...updatedTheme.colors,
                                    ...formattedColors,
                                  },
                                };
                                setCustomTheme(themeWithColors);
                                applyTheme(themeWithColors, true);
                              }
                            }}
                            disabled={!isEditing}
                            className="w-8 h-8 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-2 border-white/30"
                            style={{ backgroundColor: hexValue }}
                          />
                            <span className="text-xs text-analytics-secondary w-16 text-center">
                              {hexValue}
                            </span>
                          </div>
                          <div className="flex-1 flex items-center gap-2">
                            <label className="text-xs font-medium text-analytics-secondary w-14 flex-shrink-0">
                              Opacity
                            </label>
                            <div className="relative flex-1 h-6 flex items-center">
                              <div className="absolute inset-0 flex items-center">
                                <div className="w-full h-1.5 bg-black/30 rounded-full border border-white/50 shadow-inner"></div>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={rgb.a || 0.5}
                                onChange={(e) => {
                                if (!originalThemeState && !hasAppliedChanges) {
                                  setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                                }
                                
                                const rgb = colorToRgb(color);
                                const newAlpha = parseFloat(e.target.value);
                                const newColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${newAlpha})`;
                                const newColors = [...(customTheme.background.gradientColors || [])];
                                newColors[index] = newColor;
                                
                                const updatedTheme = {
                                  ...customTheme,
                                  background: {
                                    ...customTheme.background,
                                    gradientColors: newColors,
                                    overlay: generateOverlay({ ...customTheme.background, gradientColors: newColors }),
                                  },
                                };
                                setCustomTheme(updatedTheme);
                                applyTheme(updatedTheme, true);
                                setHasUnsavedChanges(true);
                                setHasAppliedChanges(true);
                                setIsEditing(true);
                              }}
                              disabled={!isEditing}
                              className="relative w-full z-10 disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                            </div>
                            <span className="text-xs text-analytics-secondary w-10 text-right">
                              {Math.round((rgb.a || 0.5) * 100)}%
                            </span>
                            {(customTheme.background.gradientColors || []).length > 2 && (
                            <button
                              onClick={() => {
                                if (!originalThemeState && !hasAppliedChanges) {
                                  setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                                }
                                
                                const newColors = [...(customTheme.background.gradientColors || [])];
                                newColors.splice(index, 1);
                                
                                const updatedTheme = {
                                  ...customTheme,
                                  background: {
                                    ...customTheme.background,
                                    gradientColors: newColors,
                                    overlay: generateOverlay({ ...customTheme.background, gradientColors: newColors }),
                                  },
                                };
                                setCustomTheme(updatedTheme);
                                applyTheme(updatedTheme, true);
                                setHasUnsavedChanges(true);
                                setHasAppliedChanges(true);
                                setIsEditing(true);
                              }}
                              disabled={!isEditing}
                              className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50"
                            >
                                <X size={14} />
                              </button>
                              )}
                          </div>
                        </div>
                        );
                      })}
                      
                      {/* Add Color Button */}
                      <button
                        onClick={() => {
                          if (!originalThemeState && !hasAppliedChanges) {
                            setOriginalThemeState(JSON.parse(JSON.stringify(customTheme)));
                          }
                          
                          const newColors = [...(customTheme.background.gradientColors || ['rgba(209, 146, 91, 0.22)', 'rgba(161, 117, 77, 0.20)'])];
                          newColors.push('rgba(118, 88, 61, 0.18)');
                          
                          const updatedTheme = {
                            ...customTheme,
                            background: {
                              ...customTheme.background,
                              gradientColors: newColors,
                              overlay: generateOverlay({ ...customTheme.background, gradientColors: newColors }),
                            },
                          };
                          setCustomTheme(updatedTheme);
                          applyTheme(updatedTheme, true);
                          setHasUnsavedChanges(true);
                          setHasAppliedChanges(true);
                          setIsEditing(true);
                        }}
                        disabled={!isEditing || (customTheme.background.gradientColors || []).length >= 5}
                        className="w-full py-2 px-3 rounded-lg glass-button-secondary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        + Add Color Stop
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview */}
              <div>
                <h4 className="text-sm font-medium text-analytics-secondary mb-4 uppercase tracking-wide">
                  Preview
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Primary</div>
                    <div className="text-lg font-bold text-analytics-primary">Sample</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Revenue</div>
                    <div className="text-lg font-bold text-analytics-revenue">$1,234</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Profit</div>
                    <div className="text-lg font-bold text-analytics-profit">$567</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Expense</div>
                    <div className="text-lg font-bold text-analytics-expense">$890</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Success</div>
                    <div className="text-lg font-bold" style={{ color: customTheme.colors.success }}>✓</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Warning</div>
                    <div className="text-lg font-bold" style={{ color: customTheme.colors.warning }}>⚠</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Info</div>
                    <div className="text-lg font-bold" style={{ color: customTheme.colors.info }}>ℹ</div>
                  </div>
                  <div className="glass-card-pro text-center p-4">
                    <div className="text-xs text-analytics-secondary mb-2">Accent</div>
                    <div className="text-lg font-bold" style={{ color: customTheme.colors.accent }}>★</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Delete Theme Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeletePresetModal}
        onClose={() => {
          setShowDeletePresetModal(false);
          setThemeToDelete(null);
        }}
        onConfirm={confirmDeleteTheme}
        title="Delete Theme"
        message={themeToDelete ? `Are you sure you want to delete "${themeToDelete}"? This action cannot be undone.` : ''}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
      />

      {/* Reset Theme Confirmation Modal */}
      <ConfirmationModal
        isOpen={showResetModal}
        onClose={() => {
          setShowResetModal(false);
        }}
        onConfirm={confirmReset}
        title="Reset Theme"
        message="You have unsaved theme changes. Resetting to default will discard your changes. Do you want to continue?"
        confirmText="Reset"
        cancelText="Cancel"
        type="warning"
      />

      {/* Theme Switch Confirmation Modal */}
      <ConfirmationModal
        isOpen={showThemeSwitchModal}
        onClose={() => {
          setShowThemeSwitchModal(false);
          setPendingPresetTarget(null);
        }}
        onConfirm={() => {
          const target = pendingPresetTarget;
          setShowThemeSwitchModal(false);
          setPendingPresetTarget(null);
          if (target) {
            handlePresetSelect(target, true);
          }
        }}
        title="Switch Theme"
        message={pendingPresetTarget ? `Switch from "${selectedTheme}" to "${pendingPresetTarget}"?` : 'Switch to selected theme?'}
        confirmText="Switch"
        cancelText="Cancel"
        type="info"
      />

      {/* Password Confirmation Modal */}
      <ConfirmationModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setPassword('');
        }}
        onConfirm={handlePasswordConfirm}
        title="Confirm Action"
        message="Please enter your password to confirm this critical action."
        confirmText="Verify & Continue"
        cancelText="Cancel"
        type="info"
        requirePassword={true}
        password={password}
        setPassword={setPassword}
        disabled={!password.trim()}
      />

      {/* Color Picker Modal */}
      {openColorPicker && (
        <ColorPickerWithOpacity
          color={openColorPicker.hex}
          opacity={openColorPicker.opacity}
          onChange={(hex, opacity) => {
            handleColorChange(openColorPicker.key, hex, opacity);
            setOpenColorPicker({ ...openColorPicker, hex, opacity });
          }}
          onClose={() => setOpenColorPicker(null)}
          disabled={!isEditing}
        />
      )}
    </div>
  );
}
