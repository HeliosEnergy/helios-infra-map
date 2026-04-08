/**
 * Progress indicator utility for tracking data loading progress
 */

export class ProgressIndicator {
  private callbacks: Set<(progress: number, message: string) => void> = new Set();
  private currentProgress: number = 0;
  private currentMessage: string = '';

  /**
   * Subscribe to progress updates
   * @param callback Function to call when progress updates
   * @returns Function to unsubscribe
   */
  subscribe(callback: (progress: number, message: string) => void): () => void {
    this.callbacks.add(callback);
    // Immediately send current progress to new subscriber
    callback(this.currentProgress, this.currentMessage);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Update progress
   * @param progress Progress percentage (0-100)
   * @param message Status message
   */
  update(progress: number, message: string): void {
    this.currentProgress = Math.max(0, Math.min(100, progress)); // Clamp between 0-100
    this.currentMessage = message;
    
    // Notify all subscribers
    this.callbacks.forEach(callback => {
      try {
        callback(this.currentProgress, this.currentMessage);
      } catch (error) {
        console.warn('Error in progress callback:', error);
      }
    });
  }

  /**
   * Reset progress to 0
   */
  reset(): void {
    this.currentProgress = 0;
    this.currentMessage = '';
    this.callbacks.forEach(callback => {
      try {
        callback(this.currentProgress, this.currentMessage);
      } catch (error) {
        console.warn('Error in progress callback:', error);
      }
    });
  }

  /**
   * Get current progress
   */
  getCurrentProgress(): { progress: number; message: string } {
    return {
      progress: this.currentProgress,
      message: this.currentMessage
    };
  }
}

// Create a global instance for the application
export const globalProgressIndicator = new ProgressIndicator();