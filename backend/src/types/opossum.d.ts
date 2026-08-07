declare module 'opossum' {
  interface CircuitBreakerOptions {
    timeout?: number;
    errorThresholdPercentage?: number;
    resetTimeout?: number;
    volumeThreshold?: number;
    rollingCountTimeout?: number;
  }

  class CircuitBreaker {
    constructor(
      action: (...args: any[]) => Promise<any>,
      options?: CircuitBreakerOptions,
    );
    fire(...args: any[]): Promise<any>;
    on(event: string, listener: (...args: any[]) => void): this;
    readonly opened: boolean;
    readonly closed: boolean;
    readonly halfOpen: boolean;
  }

  export default CircuitBreaker;
}
