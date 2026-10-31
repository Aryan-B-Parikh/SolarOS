/**
 * Sentry Monitoring & Error Reporting Adapter (PRD Phase 9 / Operations)
 */

interface SentryBreadcrumb {
  category: string;
  message: string;
  level?: 'info' | 'warning' | 'error';
  data?: Record<string, any>;
  timestamp?: number;
}

class SentryClient {
  private dsn: string | null;
  private environment: string;

  constructor() {
    this.dsn = process.env.SENTRY_DSN || null;
    this.environment = process.env.NODE_ENV || 'development';
  }

  public isEnabled(): boolean {
    return Boolean(this.dsn);
  }

  public captureException(error: Error | unknown, context?: { tags?: Record<string, string>; extra?: Record<string, any> }) {
    if (this.isEnabled()) {
      // When live Sentry SDK is configured
      try {
        // e.g. Sentry.captureException(error, context);
      } catch (err) {
        console.error('Failed to dispatch error to Sentry:', err);
      }
    }
    // Always log locally in structured format
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Sentry Error Captured]', {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        tags: context?.tags,
        extra: context?.extra,
      });
    }
  }

  public captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', extra?: Record<string, any>) {
    if (this.isEnabled()) {
      try {
        // Sentry.captureMessage(message, level);
      } catch (err) {
        console.error('Failed to dispatch message to Sentry:', err);
      }
    }
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[Sentry ${level.toUpperCase()}] ${message}`, extra || '');
    }
  }

  public addBreadcrumb(breadcrumb: SentryBreadcrumb) {
    if (this.isEnabled()) {
      // Sentry.addBreadcrumb(breadcrumb);
    }
  }
}

export const sentry = new SentryClient();

