jest.mock('../../../siteConstants', () => ({
  __esModule: true,
  default: {
    BOOKING_LOCATION_CLASSES: [
      { id: 'city', kind: 0 },
      { id: 'intercity', kind: 1 },
    ],
    CAR_CLASSES: {
      petit: { id: 'petit', max_seats: 4, booking_location_classes: ['city', 'intercity'] },
    },
    DEFAULT_CAR_CLASS: 'petit',
  },
}))

jest.mock('../../../tools/utils', () => ({
  firstItem: value => Array.from(value || [])[0],
}))

jest.mock('../util', () => ({
  availableCarClasses: () => [{ id: 'petit', max_seats: 4, booking_location_classes: ['city', 'intercity'] }],
  carClassAllowedForRoute: () => true,
  carClassSupportsLocationClass: () => true,
  maxAvailableSeats: () => 4,
  polygonsLocationClasses: () => [{ id: 'city', kind: 0 }],
}))

import { resolveButtonLayout, resolveOrderModes, resolveTripType } from '../orderFormResolvers'

describe('Order form resolver chain', () => {
  it('resolves trip type from location class kind', () => {
    expect(resolveTripType({ id: 'city', kind: 0 })).toBe('CITY')
    expect(resolveTripType({ id: 'intercity', kind: 1 })).toBe('INTERCITY')
    expect(resolveTripType(null)).toBe('UNKNOWN')
  })

  it('recommends offer mode for intercity routes', () => {
    const modes = resolveOrderModes({ time: 'now' }, { tripType: 'INTERCITY' }, { validatedSelectedClassId: 'x', fallbackClassId: 'x' })
    expect(modes.preferOfferMode).toBe(true)
    expect(modes.recommendedMode).toBe('offer')
    expect(modes.allowedModes).toEqual(['vote', 'offer', 'order'])
  })

  it('keeps button layout deterministic for city routes', () => {
    const modes = { allowedModes: ['vote', 'offer', 'order'], recommendedMode: 'vote', preferOfferMode: false, reasons: [] }
    const layout = resolveButtonLayout(modes)
    expect(layout.primary).toEqual(['vote', 'order'])
    expect(layout.compactModes).toEqual(['offer'])
    expect(layout.emphasizedMode).toBe('vote')
  })
})
