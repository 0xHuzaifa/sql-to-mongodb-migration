// src/types/index.ts

import { Request } from "express";
import { Document, Types } from "mongoose";

// ============= EXPRESS REQUEST TYPES =============
export interface AuthenticatedRequest extends Request {
  user?: {
    _id: Types.ObjectId | string;
    email?: string;
    name?: string;
    role?: string;
    officerId?: string;
    assignedPortals?: (Types.ObjectId | string)[];
    employeeGroupIds?: (Types.ObjectId | string)[];
    isActive?: boolean;
    isVerified?: boolean;
    tenantId?: Types.ObjectId | string;
  };
}

// ============= VENDOR TYPES =============
export interface VendorConnectionConfig {
  apiUrl?: string;
  apiKey?: string;
  ftpHost?: string;
  ftpUser?: string;
  ftpPassword?: string;
  ftpPath?: string;
  ftpPort?: number;
  ftpSecure?: boolean;
}

export interface ValidationRules {
  requiredFields: string[];
}

export interface RetryPolicy {
  maxAttempts: number;
  retryIntervalMinutes: number;
}

export interface VendorConfig {
  vendorId: string;
  name: string;
  syncType: "API" | "FTP" | "CSV";
  isActive: boolean;
  connection: VendorConnectionConfig;
  validationRules: ValidationRules;
  retryPolicy: RetryPolicy;
}

// ============= SYNC TYPES =============
export interface SyncResult {
  syncId: string;
  vendor: string;
  total: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  skipped: number;
  status: "SUCCESS" | "FAILED" | "PENDING";
}

export interface SyncLogData {
  syncId: string;
  vendorId: string;
  startTime: Date;
  endTime?: Date;
  status: "PENDING" | "SUCCESS" | "FAILED";
  fetchedItems: number;
  validRecords: number;
  invalidRecords: number;
  created: number;
  updated: number;
  skipped: number;
  errorsMessage: string[];
  attempts: number;
}

// ============= PRODUCT TYPES =============
export interface UnifiedProduct {
  item_number?: string;
  name?: string;
  item_description?: string;
  category?: string;
  brand?: string;
  retail_price?: number;
  currency?: string;
  quantity_on_hand?: number;
  vendor_sku?: string;
  images?: string[];
  attributes?: Record<string, any>;
  taxonomies?: string[];
  color?: string;
  size?: string;
  // Raw vendor payload stored under unified.vendor_data
  vendor_data?: Record<string, any>;
}

export interface VendorPayload {
  [key: string]: any;
}

// ============= MAPPING TYPES =============
export interface FieldMapping {
  vendorField: string;
  unified: string | null;
  confidence: number;
  method: "exact" | "keyword" | "fuzzy" | "embedding" | "llm" | "unmapped";
}

export interface NormalizationResult {
  unified: UnifiedProduct;
  vendor_data: Record<string, any>;
  unmapped: string[];
  mappings: FieldMapping[];
}

export interface MappingCacheEntry {
  unified: string;
  confidence: number;
  method: string;
  lastUsed: Date;
}

// ============= QUALITY CHECK TYPES =============
export interface QualityCheckResult {
  valid: VendorPayload[];
  invalid: Array<{
    record: VendorPayload;
    reason: string;
  }>;
}

// ============= API RESPONSE TYPES =============
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  products: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// ============= MATCHER TYPES =============
export interface MatchResult {
  unified: string;
  confidence: number;
  method: "exact" | "keyword" | "fuzzy" | "embedding" | "llm";
}
