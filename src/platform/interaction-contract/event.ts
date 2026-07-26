/**
 * Universal Interaction Contract
 *
 * Events published FROM the business application
 * TO interaction channels.
 */

import type {
    InteractionMetadata
} from "./model"

export interface InteractionEvent<TPayload = unknown> {

    /**
     * Event type.
     */

    readonly type: string

    readonly payload: TPayload

    readonly metadata: InteractionMetadata

}