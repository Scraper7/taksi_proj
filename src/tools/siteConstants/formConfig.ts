export class PassengerOrderConfig {
  visibility: {
    fromWay: boolean,
    toWay: boolean,
    fromMission: boolean,
    toMission: boolean,
    cost: boolean
  }
  values: {
    weight: {id: string}[]
  }

  constructor(config?: string) {
    this.visibility = {
      fromWay: true,
      toWay: true,
      fromMission: true,
      toMission: true,
      cost: true,
    }

    this.values = {
      weight: [
        { id: '50' },
        { id: '100' },
        { id: '150' },
        { id: '200' },
      ],
    }

    if (config) {this.apply(config)}
  }

  apply(config?: string) {
    if (!config) return

    let _config

    try {
      _config = JSON.parse(config)
    } catch (e) {
      return
    }

    this.visibility = { ..._config.visibility }
    this.values = { ..._config.values }
  }
}
