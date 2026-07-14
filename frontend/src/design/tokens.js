/**
 * ClawOS Design Tokens
 * Single source of truth for all design values
 */
export const colors = {
  bg: {
    base:    '#0F172A',
    surface: '#1B2748',
    card:    '#24335F',
    elevated: '#2D3E72',
    overlay: 'rgba(15, 23, 42, 0.9)',
  },
  brand: {
    primary:   '#F15B42',
    pink:      '#F49CC4',
    blue:      '#7CAADC',
    primaryDark: '#e04a31',
  },
  text: {
    primary:  '#F1F5F9',
    secondary: '#94A3B8',
    muted:    '#475569',
    disabled: '#334155',
  },
  border: {
    default: 'rgba(255,255,255,0.07)',
    hover:   'rgba(255,255,255,0.12)',
    accent:  'rgba(241,91,66,0.25)',
  },
  status: {
    success: '#22C55E',
    warning: '#F59E0B',
    error:   '#EF4444',
    info:    '#7CAADC',
  }
};

export const spacing = {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '20px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
  '12': '48px',
  '16': '64px',
  '20': '80px',
};

export const radius = {
  sm:  '6px',
  md:  '10px',
  lg:  '14px',
  xl:  '18px',
  '2xl': '24px',
  full: '9999px',
};

export const transitions = {
  fast:   'all 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
  normal: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
  slow:   'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
};

export const shadows = {
  sm:  '0 2px 8px rgba(0,0,0,0.3)',
  md:  '0 4px 16px rgba(0,0,0,0.4)',
  lg:  '0 8px 32px rgba(0,0,0,0.5)',
  xl:  '0 16px 64px rgba(0,0,0,0.6)',
  brand: '0 8px 32px rgba(241, 91, 66, 0.25)',
};

export const motionVariants = {
  // Page transitions
  pageEnter: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
    exit:    { opacity: 0, y: -8, transition: { duration: 0.2 } },
  },
  // Container stagger
  staggerContainer: {
    initial: {},
    animate: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } }
  },
  // Item
  staggerItem: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } }
  },
  // Fade
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1, transition: { duration: 0.3 } }
  },
  // Scale
  scaleIn: {
    initial: { opacity: 0, scale: 0.93 },
    animate: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
  },
  // Slide from left
  slideLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }
  },
};
