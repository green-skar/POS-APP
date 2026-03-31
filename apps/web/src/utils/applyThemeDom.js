/**
 * Apply theme JSON to document (same rules as root.tsx Layout).
 * Used by shell layout and server-theme sync on clients.
 */

function toRGBA(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * @param {object} theme
 */
export function applyThemeToDocument(theme) {
  if (!theme || typeof theme !== "object") return;

  const root = document.documentElement;
  const body = document.body;

  root.setAttribute("data-theme-mode", theme.mode || "light");

  Object.entries(theme.colors || {}).forEach(([key, value]) => {
    let colorValue = value;
    let opacity = 1;

    if (typeof value === "object" && value !== null && value.hex) {
      colorValue = toRGBA(value.hex, value.opacity ?? 1);
      opacity = value.opacity ?? 1;
    } else if (typeof value === "string" && value.startsWith("rgba")) {
      colorValue = value;
      const match = value.match(/rgba?\([\d\s,]+,\s*([\d.]+)\)/);
      if (match) opacity = parseFloat(match[1]);
    } else if (typeof value === "string" && value.startsWith("#")) {
      const r = parseInt(value.slice(1, 3), 16);
      const g = parseInt(value.slice(3, 5), 16);
      const b = parseInt(value.slice(5, 7), 16);
      colorValue = `rgba(${r}, ${g}, ${b}, 1)`;
      opacity = 1;
    }

    root.style.setProperty(`--theme-${key}`, colorValue);
    root.style.setProperty(`--theme-${key}-opacity`, opacity.toString());

    if (key.startsWith("pos")) {
      const posKey = key.replace("pos", "").replace(/([A-Z])/g, "-$1").toLowerCase();
      root.style.setProperty(`--pos-${posKey}`, colorValue);
      root.style.setProperty(`--pos-${posKey}-opacity`, opacity.toString());
    }
  });

  root.style.setProperty("--glass-blur", `${theme.glass?.blur || 9.5}px`);
  root.style.setProperty("--glass-opacity", theme.glass?.opacity || 0.18);
  root.style.setProperty("--glass-border-opacity", theme.glass?.borderOpacity || 0.3);

  const buttonGlass = theme.buttonGlass || { blur: 12, opacity: 0.25, borderOpacity: 0.4 };
  root.style.setProperty("--button-glass-blur", `${buttonGlass.blur}px`);
  root.style.setProperty("--button-glass-opacity", buttonGlass.opacity);
  root.style.setProperty("--button-glass-border-opacity", buttonGlass.borderOpacity);

  const overlayString =
    theme.background?.overlay ||
    "linear-gradient(120deg, rgba(209, 146, 91, 0.22) 0%, rgba(161, 117, 77, 0.20) 50%, rgba(118, 88, 61, 0.18) 100%)";
  root.style.setProperty("--bg-overlay", overlayString);

  if (theme.background?.texture === "none") {
    root.style.setProperty("--bg-texture", "none");
    if (body) body.classList.add("no-texture");
  } else if (theme.background?.texture) {
    const textureUrl = theme.background.texture;
    let cssValue;
    if (textureUrl.startsWith("data:")) {
      cssValue = `url("${textureUrl.replace(/"/g, '\\"')}")`;
    } else {
      cssValue = `url('${textureUrl}')`;
    }
    root.style.setProperty("--bg-texture", cssValue);
    if (body) body.classList.remove("no-texture");

    const fit = theme.background?.fit || "Fill";
    switch (fit) {
      case "Fill":
        root.style.setProperty("--bg-size", "cover");
        root.style.setProperty("--bg-repeat", "no-repeat");
        root.style.setProperty("--bg-position", "center center");
        break;
      case "Fit":
        root.style.setProperty("--bg-size", "contain");
        root.style.setProperty("--bg-repeat", "no-repeat");
        root.style.setProperty("--bg-position", "center center");
        break;
      case "Stretch":
        root.style.setProperty("--bg-size", "100% 100%");
        root.style.setProperty("--bg-repeat", "no-repeat");
        root.style.setProperty("--bg-position", "center center");
        break;
      case "Tile":
        root.style.setProperty("--bg-size", "auto");
        root.style.setProperty("--bg-repeat", "repeat");
        root.style.setProperty("--bg-position", "top left");
        break;
      case "Center":
        root.style.setProperty("--bg-size", "auto");
        root.style.setProperty("--bg-repeat", "no-repeat");
        root.style.setProperty("--bg-position", "center center");
        break;
      case "Span":
        root.style.setProperty("--bg-size", "cover");
        root.style.setProperty("--bg-repeat", "no-repeat");
        root.style.setProperty("--bg-position", "center center");
        break;
      default:
        root.style.setProperty("--bg-size", "cover");
        root.style.setProperty("--bg-repeat", "no-repeat");
        root.style.setProperty("--bg-position", "center center");
    }
  }
}
