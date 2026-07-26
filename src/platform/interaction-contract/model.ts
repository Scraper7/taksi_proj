/**
 * Universal Interaction Contract
 *
 * Core data models.
 */

export type InteractionId = string

export type Revision = number

export type Timestamp = string

export interface InteractionMetadata {

    /**
     * Source of the message.
     *
     * Examples:
     *  voice
     *  web
     *  whatsapp
     *  ai-agent
     */

    readonly source: string

    readonly timestamp: Timestamp

    readonly correlationId?: InteractionId

}

export interface InteractionContext {

    /**
     * Arbitrary immutable context.
     */

    readonly values:
        Readonly<Record<string, unknown>>

}

export interface InteractionSnapshot {

    /**
     * Monotonically increasing revision.
     */

    readonly revision: Revision

    /**
     * Domain state.
     *
     * interaction-contract does not know
     * its structure.
     */

    readonly state:
        Readonly<Record<string, unknown>>

}