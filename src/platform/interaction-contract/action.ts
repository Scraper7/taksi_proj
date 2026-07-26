/**
 * Universal Interaction Contract
 *
 * Actions sent FROM interaction channels
 * TO the business application.
 */

import type {
    InteractionMetadata
} from "./model"

export interface InteractionAction<TPayload = unknown> {

    /**
     * Action type.
     *
     * Examples:
     *
     * taxi.accept-order
     * taxi.arrived
     * crm.find-client
     */

    readonly type: string

    /**
     * Domain payload.
     */

    readonly payload: TPayload

    /**
     * Optional transport metadata.
     */

    readonly metadata?: InteractionMetadata

}