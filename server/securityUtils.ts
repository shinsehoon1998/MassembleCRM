/**
 * Security Utilities - Enhanced PII Protection and Validation
 * Based on PHP security patterns for maximum protection
 */

// ============================================
// PII Protection Functions
// ============================================

/**
 * Enhanced phone number masking (PHP style)
 * Converts: 010-1234-5678 → 010****5678
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || typeof phone !== 'string') return '***';
  
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  
  // Handle different phone number lengths
  if (cleanPhone.length < 8) return '***';
  if (cleanPhone.length <= 6) return '****';
  
  // Korean phone number patterns
  if (cleanPhone.length >= 10) {
    // Mobile/landline: 010-1234-5678 → 010****5678
    return `${cleanPhone.slice(0, 3)}****${cleanPhone.slice(-4)}`;
  } else if (cleanPhone.length >= 8) {
    // Shorter numbers: 12345678 → 12****78
    return `${cleanPhone.slice(0, 2)}****${cleanPhone.slice(-2)}`;
  }
  
  return '****';
}

/**
 * Name masking (PHP style)
 * Converts: 홍길동 → 홍**
 */
export function maskName(name: string): string {
  if (!name || typeof name !== 'string') return '*';
  
  const trimmedName = name.trim();
  if (trimmedName.length === 0) return '*';
  
  // Single character names
  if (trimmedName.length === 1) return '*';
  
  // Multi-character names: show first character, mask the rest
  if (trimmedName.length >= 2) {
    const firstChar = trimmedName.charAt(0);
    const maskCount = trimmedName.length - 1;
    return firstChar + '*'.repeat(maskCount);
  }
  
  return '*';
}

/**
 * Comprehensive data masking for API logs and console output
 * Enhanced to handle camelCase, snake_case, and common field variations
 */
export function maskApiData(data: any): any {
  if (!data) return data;
  
  // Handle string data (try to parse as JSON)
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(maskApiData(parsed));
    } catch {
      // If not JSON, return as-is (could be HTML/text response)
      return data;
    }
  }
  
  // Handle non-object data
  if (typeof data !== 'object') return data;
  
  // Deep clone to avoid modifying original
  const masked = Array.isArray(data) ? [...data] : { ...data };
  
  // Enhanced field normalization function
  const normalizeFieldName = (fieldName: string): string => {
    return fieldName.toLowerCase().replace(/[_-]/g, '');
  };
  
  // Phone number fields (normalized)
  const phoneFieldsNormalized = [
    'phone', 'callee', 'targetphone', 'phonenumber', 'textsendno',
    'mobile', 'tel', 'contact', 'cellphone', 'mobilenumber',
    'callnumber', 'sendnumber', 'receivernumber', 'sendno', 'telno'
  ];
  
  // Name/personal info fields (normalized)
  const nameFieldsNormalized = [
    'name', 'username', 'customername', 'fullname',
    'firstname', 'lastname', 'nickname', 'displayname',
    'realname', 'usrname', 'clientname', 'ownername'
  ];
  
  // Sensitive fields to completely mask (normalized)
  const sensitiveFieldsNormalized = [
    'userid', 'company', 'password', 'token', 'apikey',
    'secret', 'auth', 'sessionid', 'creditcard', 'ssn',
    'authorization', 'bearer', 'key', 'pwd', 'pass',
    'email', 'emailaddress', 'address', 'homeaddress'
  ];
  
  // Process each field with enhanced matching
  for (const key in masked) {
    if (masked.hasOwnProperty(key)) {
      const value = masked[key];
      const normalizedKey = normalizeFieldName(key);
      
      // Check if field contains phone number patterns
      const looksLikePhone = /^[0-9+\-\s()]{8,15}$/.test(String(value));
      
      if (phoneFieldsNormalized.includes(normalizedKey) || looksLikePhone) {
        masked[key] = maskPhoneNumber(String(value));
      } else if (nameFieldsNormalized.includes(normalizedKey)) {
        masked[key] = maskName(String(value));
      } else if (sensitiveFieldsNormalized.includes(normalizedKey)) {
        masked[key] = '***';
      } else if (typeof value === 'object' && value !== null) {
        // Recursively mask nested objects
        masked[key] = maskApiData(value);
      }
    }
  }
  
  return masked;
}

// ============================================
// Data Validation Functions
// ============================================

/**
 * Enhanced Korean phone number validation (PHP style)
 * Supports: Mobile (010), Landline (02-09), Internet phone (050, 070)
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') return false;
  
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  
  // Length check (9-11 digits for Korean numbers)
  if (cleanPhone.length < 9 || cleanPhone.length > 11) return false;
  
  // Korean phone number patterns
  const validPatterns = [
    /^02[0-9]{7,8}$/,      // Seoul landline: 02-xxxx-xxxx
    /^0[3-6][0-9]{8,9}$/,  // Regional landline: 031-xxx-xxxx
    /^01[0-9]{8,9}$/,      // Mobile: 010-xxxx-xxxx
    /^050[0-9]{7,8}$/,     // Internet phone: 050-xxxx-xxxx
    /^070[0-9]{7,8}$/      // Internet phone: 070-xxxx-xxxx
  ];
  
  return validPatterns.some(pattern => pattern.test(cleanPhone));
}

/**
 * Campaign name validation (PHP style)
 */
export function isValidCampaignName(name: string): boolean {
  if (!name || typeof name !== 'string') return false;
  
  const trimmed = name.trim();
  
  // Length check (1-100 characters)
  if (trimmed.length === 0 || trimmed.length > 100) return false;
  
  // Allow Korean, English, numbers, spaces, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9가-힣\s\-_]+$/;
  return validPattern.test(trimmed);
}

/**
 * Input sanitization to prevent XSS/injection (PHP style)
 */
export function sanitizeInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove < and > to prevent XSS
    .replace(/['";]/g, '') // Remove quotes to prevent injection
    .substring(0, 1000); // Limit length
}

/**
 * API key format validation (enhanced to support JWT and various token formats)
 */
export function isValidApiKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  
  // Allow various API key formats:
  // - Alphanumeric (original)
  // - With special characters (common in JWT, OAuth tokens, etc.)
  // - Minimum length 16 characters (more flexible)
  const minLength = process.env.API_KEY_MIN_LENGTH ? parseInt(process.env.API_KEY_MIN_LENGTH) : 16;
  
  if (key.length < minLength) return false;
  
  // Enhanced pattern: Support JWT tokens and various API key formats
  // Includes: +/= (Base64), _ (underscore), - (hyphen), . (period)
  return /^[a-zA-Z0-9._+/=-]+$/.test(key);
}

// ============================================
// Authentication Headers Generation
// ============================================

/**
 * Generate authentication headers for ATALK API
 * Uses standard Bearer token + optional signature headers for enhanced security
 */
export function generateAuthHeaders(apiKey: string, secretKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`
  };
  
  // Add signature headers only if secret key is provided and enabled
  if (secretKey && process.env.ATALK_USE_SIGNATURE === 'true') {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = generateNonce();
    
    // Create signature data
    const signatureData = `${apiKey}${timestamp}${nonce}${secretKey}`;
    const signature = createSignature(signatureData);
    
    headers['X-Timestamp'] = timestamp.toString();
    headers['X-Nonce'] = nonce;
    headers['X-Signature'] = signature;
  }
  
  return headers;
}

/**
 * Generate cryptographically secure nonce
 */
function generateNonce(length: number = 32): string {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create SHA-256 signature
 */
function createSignature(data: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================
// Rate Limiting Utilities
// ============================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory rate limiter (PHP style)
 * In production, use Redis or similar
 */
export function checkRateLimit(
  identifier: string, 
  maxRequests: number = 100, 
  windowSeconds: number = 60
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSeconds;
  
  // Clean up old entries
  const keysToDelete: string[] = [];
  rateLimitStore.forEach((entry, key) => {
    if (entry.resetTime < now) {
      keysToDelete.push(key);
    }
  });
  
  keysToDelete.forEach(key => rateLimitStore.delete(key));
  
  const entry = rateLimitStore.get(identifier);
  
  if (!entry || entry.resetTime < now) {
    // New window
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + windowSeconds
    };
    rateLimitStore.set(identifier, newEntry);
    
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: newEntry.resetTime
    };
  } else {
    // Existing window
    entry.count++;
    
    if (entry.count > maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: entry.resetTime
      };
    }
    
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetTime: entry.resetTime
    };
  }
}

// ============================================
// Request ID Generation
// ============================================

/**
 * Generate unique request ID for traceability
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return `req_${timestamp}_${random}`;
}

// ============================================
// HTTP Status Code Utilities
// ============================================

/**
 * Convert service response to appropriate HTTP status
 */
export function getHttpStatusFromServiceResponse(response: { success: boolean; message?: string }): number {
  if (response.success) return 200;
  
  const message = response.message?.toLowerCase() || '';
  
  // Authentication/Authorization errors
  if (message.includes('인증') || message.includes('토큰') || message.includes('권한')) {
    return 401;
  }
  
  // Validation errors
  if (message.includes('형식') || message.includes('필수') || message.includes('검증')) {
    return 400;
  }
  
  // Not found errors
  if (message.includes('찾을 수 없') || message.includes('존재하지 않')) {
    return 404;
  }
  
  // Rate limiting
  if (message.includes('요청이 너무 많') || message.includes('rate limit')) {
    return 429;
  }
  
  // Default to bad request
  return 400;
}

// ============================================
// Logging Utilities
// ============================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARNING = 2,
  ERROR = 3
}

/**
 * Secure logging with PII protection
 * Single requestId per request to avoid confusion
 */
export function secureLog(
  level: LogLevel, 
  context: string, 
  message: string, 
  data?: any,
  requestId?: string
): void {
  const timestamp = new Date().toISOString();
  const logRequestId = requestId || generateRequestId();
  
  const logEntry = {
    timestamp,
    level: LogLevel[level],
    context,
    message,
    request_id: logRequestId,
    data: data ? maskApiData(data) : undefined
  };
  
  // Always use JSON format for structured logging
  console.log(JSON.stringify(logEntry));
}