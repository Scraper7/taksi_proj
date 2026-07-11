/**
 * Utility functions for phone number handling
 */

/**
 * Get the phone mask from site constants
 */
export const getPhoneMask = (): string => {
  // Маска используется только для отображения формата ввода
  // Например: +34(___)___-___-___ или +34___-___-___
  return (window as any).data?.site_constants?.def_maska_tel?.value || '+34(___)___-___-___'
}

/**
 * Get the prefix from the phone mask
 */
export const getPhonePrefix = (): string => {
  const mask = getPhoneMask();
  if (!mask) return '';
  
  // Extract prefix from mask like +34(___)-___-___
  const match = mask.match(/^\+?(\d+)/);
  return match ? match[1] : '';
};

/**
 * Normalize phone number for API submission
 * Replaces the original prefix with +11
 */
export const normalizePhoneNumber = (phone: string, isRegistration: boolean = false, isDriver: boolean = false): string => {
  console.log('Normalize phone number input:', { phone, isRegistration, isDriver })
  const prefix = getPhonePrefix()
  console.log('Phone prefix from mask:', prefix)
  if (!prefix) return phone

  // Удаляем все нецифровые символы (включая скобки, если они были введены)
  const digits = phone.replace(/\D/g, '')
  console.log('Digits only:', digits)
  
  // Проверяем начало номера с префикса (с + или без)
  // Скобки и другие символы форматирования игнорируются
  const prefixWithoutPlus = prefix.replace('+', '')
  console.log('Prefix without plus:', prefixWithoutPlus)
  
  if (isDriver) {
    // Для водителя всегда заменяем префикс на +11, если номер начинается с префикса маски
    if (digits.startsWith(prefixWithoutPlus)) {
      const result = '+11' + digits.slice(prefixWithoutPlus.length)
      console.log('Normalized for driver:', result)
      return result
    }
    // При входе водителя заменяем +11 на префикс из маски
    if (!isRegistration && digits.startsWith('11')) {
      const result = prefix + digits.slice(2)
      console.log('Normalized for driver login:', result)
      return result
    }
  }
  
  console.log('Phone number unchanged:', phone)
  return phone
}

/**
 * Format phone number for display
 * Ensures the original prefix is shown to the user
 */
export const formatPhoneNumber = (phone: string): string => {
  if (!phone) return ''
  
  // Если номер уже содержит нецифровые символы (форматированный), возвращаем как есть
  if (/\D/.test(phone)) {
    return phone
  }

  const mask = getPhoneMask()
  if (!mask) return phone

  const digits = phone.replace(/\D/g, '')
  const prefix = getPhonePrefix()
  
  // Если номер начинается с 11 (для водителей), заменяем 11 на префикс из маски
  if (digits.startsWith('11')) {
    return prefix + digits.slice(2)
  }

  // Форматируем номер по маске
  let result = mask
  let digitIndex = 0
  
  // Заменяем все символы подчеркивания на цифры из номера
  for (let i = 0; i < mask.length && digitIndex < digits.length; i++) {
    if (mask[i] === '_') {
      result = result.slice(0, i) + digits[digitIndex] + result.slice(i + 1)
      digitIndex++
    }
  }
  
  // Если в результате остались символы подчеркивания, заменяем их на пустую строку
  result = result.replace(/_/g, '')
  
  return result
} 