# Glassmorphism Design System

## Overview
This application now uses a modern glassmorphism design with teal accents, gray color scheme, and smooth transitions.

## Color Palette

### Main Colors
- **Background Gradient**: `from-gray-50 via-gray-100 to-gray-200`
- **Teal Accents**: `#0C969C`, `#6BA3BE`, `#0A7075`, `#032F30`, `#031716`
- **Dark Gray**: `#274D60` (blue-gray)
- **Accent Colors**: 
  - Red/Orange: For alerts and warnings
  - Green: For success states
  - Blue: For primary actions

## CSS Classes

### Glassmorphism Components

#### Buttons
```jsx
// Primary button with teal gradient
<button className="glass-button-primary">
  Click Me
</button>

// Secondary button
<button className="glass-button-secondary">
  Secondary
</button>

// Base glass button
<button className="glass-button">
  Glass Button
</button>
```

#### Cards
```jsx
<div className="glass-card p-6">
  Card content
</div>
```

#### Inputs
```jsx
<input 
  type="text" 
  className="glass-input px-4 py-3"
  placeholder="Enter text..."
/>
```

### Additional Utilities

#### Smooth Transitions
```jsx
<div className="smooth-transition">
  Hover to see effect
</div>
```

#### Glow Effects
```jsx
// Static glow
<div className="glow-effect">
  Glowing element
</div>

// Hover glow
<button className="hover-glow">
  Hover me
</button>
```

## Implementation Examples

### Card with Glassmorphism
```jsx
<div className="glass-card p-6 mb-6">
  <h2 className="text-2xl font-bold text-gray-900 mb-4">Card Title</h2>
  <p className="text-gray-600">Content goes here</p>
</div>
```

### Button with Hover Effect
```jsx
<button className="glass-button-primary hover-glow smooth-transition px-6 py-3">
  Submit
</button>
```

### Gradient Background
```jsx
<div className="bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 min-h-screen">
  Content
</div>
```

## Design Principles

1. **Backdrop Blur**: Use `backdrop-blur-lg` or `backdrop-blur-xl` for glass effect
2. **Semi-transparent backgrounds**: Use `bg-white/60` or similar opacity
3. **Smooth transitions**: Always use `smooth-transition` class
4. **Hover effects**: Scale and shadow on hover
5. **Teal accents**: Use for primary actions and highlights
6. **Shadow depth**: Multi-layer shadows for depth
7. **Border subtlety**: Semi-transparent borders `border-white/20`

## Applying to Components

### Old Style:
```jsx
<div className="bg-white shadow-sm p-6">
  Content
</div>
```

### New Glassmorphism Style:
```jsx
<div className="glass-card p-6">
  Content
</div>
```

## Alerts and Warnings

Keep red/orange for alerts:
```jsx
<div className="bg-red-50 border-red-200 glass-card">
  Alert message
</div>
```

## Best Practices

1. Use glass cards for main content areas
2. Apply glass buttons for primary actions
3. Use hover-glow for important interactive elements
4. Maintain consistent backdrop blur values
5. Combine smooth transitions with hover effects
6. Use teal gradient for accents and highlights
7. Keep backgrounds light and airy with gradients

