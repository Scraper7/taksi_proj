/**
 * Universal Interaction Contract
 *
 * Public API.
 */

import type { InteractionAction } from "./action"
import type { InteractionEvent } from "./event"
import type { InteractionSnapshot } from "./model"

export type Unsubscribe = () => void

/**
 * Universal interaction contract.
 *
 * Implementations:
 *
 * - Voice
 * - Web
 * - WhatsApp
 * - Telegram
 * - AI Agent
 * - Phone
 */
export interface InteractionContract {

    /**
     * Send action to application.
     */
    dispatch<TPayload>(
        action: InteractionAction<TPayload>
    ): Promise<void>

    /**
     * Subscribe to application events.
     */
    subscribe(
        listener: (
            event: InteractionEvent
        ) => void
    ): Unsubscribe

    /**
     * Read current application snapshot.
     */
    snapshot(): Promise<InteractionSnapshot>

}