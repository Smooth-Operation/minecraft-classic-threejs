import * as jose from 'jose';
import { JWKS_CACHE_TTL_MS } from '../types/constants.js';

interface JWKSCache {
  jwks: jose.JSONWebKeySet | null;
  fetchedAt: number;
}

const jwksCache: JWKSCache = {
  jwks: null,
  fetchedAt: 0,
};

let supabaseUrl: string = '';

export function initAuth(url: string): void {
  supabaseUrl = url;
}

async function getJWKS(): Promise<jose.JSONWebKeySet> {
  const now = Date.now();

  // Return cached if still valid
  if (jwksCache.jwks && (now - jwksCache.fetchedAt) < JWKS_CACHE_TTL_MS) {
    return jwksCache.jwks;
  }

  // Fetch fresh JWKS
  const jwksUrl = `${supabaseUrl}/auth/v1/.well-known/jwks.json`;
  const response = await fetch(jwksUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = await response.json() as jose.JSONWebKeySet;
  jwksCache.jwks = jwks;
  jwksCache.fetchedAt = now;

  return jwks;
}

export interface JWTPayload {
  sub: string; // User ID
  email?: string;
  displayName?: string;
  aud?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  role?: string;
}

export interface VerifyResult {
  valid: boolean;
  payload?: JWTPayload;
  error?: string;
  errorCode?: 'AUTH_FAILED' | 'AUTH_EXPIRED';
}

// Simple token format: base64 encoded JSON with { displayName, odId, ts }
interface SimpleToken {
  displayName: string;
  odId: string;
  ts: number;
}

export async function verifyJWT(token: string): Promise<VerifyResult> {
  // First, try to decode as a simple base64 token (display name only mode)
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const simpleToken = JSON.parse(decoded) as SimpleToken;

    if (simpleToken.displayName && simpleToken.odId && simpleToken.ts) {
      // Check token isn't too old (24 hours)
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours
      if (now - simpleToken.ts > maxAge) {
        return {
          valid: false,
          error: 'Token expired',
          errorCode: 'AUTH_EXPIRED',
        };
      }

      // Valid simple token
      return {
        valid: true,
        payload: {
          sub: simpleToken.odId,
          displayName: simpleToken.displayName,
        },
      };
    }
  } catch {
    // Not a simple token, try JWT
  }

  // Fall back to Supabase JWT verification
  try {
    const jwks = await getJWKS();
    const keySet = jose.createLocalJWKSet(jwks);

    const { payload } = await jose.jwtVerify(token, keySet, {
      issuer: `${supabaseUrl}/auth/v1`,
      audience: 'authenticated',
      clockTolerance: 30, // 30 seconds tolerance
    });

    // Check expiration explicitly (jose should handle this, but be safe)
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return {
        valid: false,
        error: 'Token expired',
        errorCode: 'AUTH_EXPIRED',
      };
    }

    return {
      valid: true,
      payload: payload as JWTPayload,
    };
  } catch (error) {
    // On verification failure, try refreshing JWKS once (handles key rotation)
    if (jwksCache.jwks) {
      jwksCache.jwks = null;
      try {
        const jwks = await getJWKS();
        const keySet = jose.createLocalJWKSet(jwks);

        const { payload } = await jose.jwtVerify(token, keySet, {
          issuer: `${supabaseUrl}/auth/v1`,
          audience: 'authenticated',
          clockTolerance: 30,
        });

        return {
          valid: true,
          payload: payload as JWTPayload,
        };
      } catch {
        // Still failed after refresh
      }
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Determine error type
    if (errorMessage.includes('expired')) {
      return {
        valid: false,
        error: 'Token expired',
        errorCode: 'AUTH_EXPIRED',
      };
    }

    return {
      valid: false,
      error: `JWT verification failed: ${errorMessage}`,
      errorCode: 'AUTH_FAILED',
    };
  }
}

// Validate origin header
export function validateOrigin(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return false;

  for (const allowed of allowedOrigins) {
    // Exact match
    if (origin === allowed) return true;

    // Wildcard subdomain match (e.g., https://*.vercel.app)
    if (allowed.includes('*')) {
      const pattern: string = allowed
        .replace(/\./g, '\\.')
        .replace(/\*/g, '[a-zA-Z0-9-]+');
      const regex: RegExp = new RegExp(`^${pattern}$`);
      if (regex.test(origin)) return true;
    }

    // Localhost with any port
    if (allowed.startsWith('http://localhost:') && origin.startsWith('http://localhost:')) {
      return true;
    }
    if (allowed.startsWith('http://127.0.0.1:') && origin.startsWith('http://127.0.0.1:')) {
      return true;
    }
  }

  return false;
}
