/**
 * A rate limiter controls how many requests we send per second.
 *
 * Think of it like a ticket counter: you can only go through when you have a ticket.
 * If all tickets are taken, you wait until more are available.
 */
export interface RateLimiter {
  acquire(): Promise<void>;
}
