/**
 * Universal Interaction Contract
 *
 * Error hierarchy.
 */

export abstract class InteractionError extends Error {

    protected constructor(message: string) {
        super(message)
        Object.setPrototypeOf(this, new.target.prototype)
        this.name = new.target.name
    }

}

export class TransportError extends InteractionError {

    constructor(message = "Transport error") {
        super(message)
    }

}

export class ValidationError extends InteractionError {

    constructor(message = "Validation error") {
        super(message)
    }

}

export class TimeoutError extends InteractionError {

    constructor(message = "Operation timeout") {
        super(message)
    }

}