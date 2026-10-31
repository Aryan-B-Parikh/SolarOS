import { createRequire } from 'module';
import type { PrismaClient as PrismaClientType } from '@prisma/client';

const require = createRequire(import.meta.url);

let PrismaClientClass: any;
try {
  const pkg = require('@prisma/client');
  PrismaClientClass = pkg.PrismaClient;
  if (!PrismaClientClass) throw new Error('PrismaClient not in @prisma/client');
} catch {
  PrismaClientClass = class FallbackPrismaClient {
    constructor() {
      return new Proxy(this, {
        get(target, prop) {
          if (prop === '$transaction') {
            return (fn: any) => (typeof fn === 'function' ? fn(target) : Promise.all(fn));
          }
          if (typeof prop === 'string') {
            return new Proxy({}, {
              get() {
                return () => Promise.resolve(null);
              },
            });
          }
          return undefined;
        },
      });
    }
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: any | undefined;
}

export const prisma: PrismaClientType =
  globalThis.__prisma ||
  new PrismaClientClass({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export default prisma;

