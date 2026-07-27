/**
 * Platform Core — логгер границы контракта.
 *
 * Строки с префиксом [InteractionContract] — механизм приёмки Stage 1 и
 * единственная наблюдаемость границы; их формат меняться не должен.
 *
 * Вынесено из прямых console.* ради инъекции (тесты фиксируют формат строк).
 * Реализация по умолчанию пишет в консоль ровно то же, что писалось раньше:
 * первый аргумент — '[InteractionContract] <message>', остальные — как есть.
 */

export interface IInteractionLogger {
  log(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

const PREFIX = '[InteractionContract]'

export const consoleInteractionLogger: IInteractionLogger = {
  log(message: string, ...args: unknown[]): void {
    console.log(`${PREFIX} ${message}`, ...args)
  },
  error(message: string, ...args: unknown[]): void {
    console.error(`${PREFIX} ${message}`, ...args)
  },
}
