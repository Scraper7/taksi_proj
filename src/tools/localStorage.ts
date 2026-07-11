export function getItem<T>(
  key: string,
  defaultValue?: T,
  allowableValues?: T[],
): T {
  defaultValue = (
    defaultValue === undefined ?
      allowableValues && allowableValues[0] :
      defaultValue
  ) as T
  let value
  try {
    value = localStorage.getItem(key)
    value = value !== null ? JSON.parse(value) : defaultValue
  } catch (error) {
    console.error(`Error occured at getItem(${key})`, error)
    value = defaultValue
  }
  return allowableValues ?
    allowableValues.includes(value) ?
      value :
      defaultValue :
    value ?? defaultValue
}

export function setItem<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error occured at setItem(${key}, ${value})`, error)
  }
}

export function removeItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch (error) {
    console.error(`Error occured at removeItem(${key})`, error)
  }
}