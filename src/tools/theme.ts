import SITE_CONSTANTS from '../siteConstants'

export const gradient = (color?: string, color2?: string) =>
  `linear-gradient(90deg, ${
    color || SITE_CONSTANTS.PALETTE.primary.dark
  } 0%, ${
    color2 || SITE_CONSTANTS.PALETTE.primary.main
  } 100%)`