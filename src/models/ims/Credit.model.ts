import mongoose, { Document, Schema, Types } from "mongoose";

export enum CreditTransactionType {
  ALLOCATION = "allocation", // Credit allocation (group or individual)
  PURCHASE = "purchase", // Credit used for purchase
  REFUND = "refund", // Credit refunded
  ADJUSTMENT = "adjustment", // Manual adjustment by admin
  EXPIRED = "expired", // Credits expired
  ROLLOVER = "rollover", // Credits rolled over to new period
}

export interface ICreditTransaction {
  type: CreditTransactionType;
  amount: number;
  balance: number; // Balance after transaction
  description?: string;
  referenceId?: string; // Order ID, Refund ID, etc.
  // Category/Product specific (optional)
  categoryId?: Types.ObjectId;
  subcategoryName?: string;
  productId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
}

// Limit structure for categories, subcategories, and products
export interface IAllotmentLimit {
  allocated: number; // Total allocated
  used: number; // Total used
  isUnlimited?: boolean;
  lastUpdatedAt: Date;
  lastUpdatedBy?: Types.ObjectId;
}

export interface ICredit extends Document {
  userId: Types.ObjectId;
  pageId: Types.ObjectId; // Page (portal) this credit belongs to
  groupId?: Types.ObjectId; // Optional legacy field

  // Overall Balance (sum of all category allotments)
  totalAllocated: number;
  totalUsed: number;
  balance: number; // Current available balance (totalAllocated - totalUsed)

  // Category Limits - { categoryId: { allocated, used } }
  categoryLimits: Map<string, IAllotmentLimit>;

  // Subcategory Limits - { "categoryId:subcategoryName": { allocated, used } }
  subcategoryLimits: Map<string, IAllotmentLimit>;

  // Product Limits - { productId: { allocated, used } }
  // Product limits are SUBSET constraints within category limits
  productLimits: Map<string, IAllotmentLimit>;

  // Period Configuration
  periodStartDate?: Date;
  periodEndDate?: Date;
  lastRolloverDate?: Date;

  // Transaction History
  transactions: ICreditTransaction[];

  // Carry Forward Settings (inherited from Allotment but stored per user)
  carryForward: boolean;
  maxCarryForward?: number;

  // Status
  isActive: boolean;
  isFrozen: boolean; // Temporarily frozen (no transactions allowed)

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Simple balance methods (for backward compatibility with money-based credit)
  hasSufficientCredits(amount: number): boolean;
  addTransaction(
    type: CreditTransactionType,
    amount: number,
    description?: string,
    referenceId?: string,
    createdBy?: Types.ObjectId,
  ): Promise<void>;

  // Allotment methods
  setCategoryAllotment(
    categoryId: string,
    amount: number,
    updatedBy?: Types.ObjectId,
    isUnlimited?: boolean,
  ): Promise<void>;
  setSubcategoryAllotment(
    categoryId: string,
    subcategoryName: string,
    amount: number,
    updatedBy?: Types.ObjectId,
    isUnlimited?: boolean,
  ): Promise<void>;
  setProductAllotment(
    productId: string,
    amount: number,
    updatedBy?: Types.ObjectId,
    isUnlimited?: boolean,
  ): Promise<void>;
  getCategoryRemaining(categoryId: string): number;
  getSubcategoryRemaining(categoryId: string, subcategoryName: string): number;
  getProductRemaining(productId: string): number;
  canPurchase(
    productId: string,
    categoryId: string,
    subcategoryName: string | null,
    quantity: number,
  ): {
    allowed: boolean;
    reason?: string;
    deductFrom?: "product" | "subcategory" | "category" | "mixed";
    isUnlimited?: boolean;
  };
  deductPurchase(
    productId: string,
    categoryId: string | null,
    subcategoryName: string | null,
    quantity: number,
    orderId?: string,
    createdBy?: Types.ObjectId,
    isOverride?: boolean,
  ): Promise<void>;
  refundPurchase(
    productId: string,
    categoryId: string,
    subcategoryName: string | null,
    quantity: number,
    orderId?: string,
    createdBy?: Types.ObjectId,
  ): Promise<void>;
  rollover(newPeriodStart: Date, newPeriodEnd: Date): Promise<void>;
  recalculateTotals(): void;
  incrementLimitUsage(
    productId: string,
    categoryId: string | null,
    subcategoryName: string | null,
    amount: number
  ): void;
}

const AllotmentLimitSchema = new Schema<IAllotmentLimit>(
  {
    allocated: { type: Number, default: 0, min: 0 },
    used: { type: Number, default: 0, min: 0 },
    isUnlimited: { type: Boolean, default: false },
    lastUpdatedAt: { type: Date, default: Date.now },
    lastUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const CreditTransactionSchema = new Schema<ICreditTransaction>(
  {
    type: {
      type: String,
      enum: Object.values(CreditTransactionType),
      required: true,
    },
    amount: { type: Number, required: true },
    balance: { type: Number, required: true },
    description: String,
    referenceId: String,
    categoryId: { type: Schema.Types.ObjectId, ref: "Taxonomy" },
    subcategoryName: String,
    productId: { type: Schema.Types.ObjectId, ref: "Product" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const CreditSchema = new Schema<ICredit>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeGroup",
      required: false,
      index: true,
    },

    // Overall Balance
    totalAllocated: { type: Number, default: 0, min: 0 },
    totalUsed: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },

    // Limits
    categoryLimits: {
      type: Map,
      of: AllotmentLimitSchema,
      default: () => new Map(),
    },
    subcategoryLimits: {
      type: Map,
      of: AllotmentLimitSchema,
      default: () => new Map(),
    },
    productLimits: {
      type: Map,
      of: AllotmentLimitSchema,
      default: () => new Map(),
    },

    // Period Configuration
    periodStartDate: Date,
    periodEndDate: Date,
    lastRolloverDate: Date,

    // Transaction History
    transactions: [CreditTransactionSchema],

    // Carry Forward
    carryForward: { type: Boolean, default: false },
    maxCarryForward: { type: Number, min: 0 },

    // Status
    isActive: { type: Boolean, default: true },
    isFrozen: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Compound unique index: one credit record per user per page per group
// Note: groupId is optional for backward compatibility, but unique constraint applies to the combination
CreditSchema.index({ userId: 1, pageId: 1, groupId: 1 }, { unique: true });
CreditSchema.index({ pageId: 1, isActive: 1 });
CreditSchema.index({ "transactions.createdAt": -1 });

// Helper to get subcategory key
function getSubcategoryKey(
  categoryId: string,
  subcategoryName: string,
): string {
  return `${categoryId}:${subcategoryName.toLowerCase()}`;
}

// Helper to find subcategory limit flexibly from credit document
function findSubcategoryLimitEntry(
  creditDoc: any,
  categoryId: string | null | undefined,
  subcategoryName: string | null | undefined,
): { key: string; limit: IAllotmentLimit } | null {
  if (!subcategoryName) return null;
  const subLower = subcategoryName.toLowerCase().trim();

  // 1. Try standard `${categoryId}:${subLower}`
  if (categoryId) {
    const stdKey = getSubcategoryKey(categoryId, subcategoryName);
    const limit = creditDoc.subcategoryLimits?.get?.(stdKey) || creditDoc.subcategoryLimits?.[stdKey];
    if (limit) return { key: stdKey, limit };
  }

  // 2. Fallback: Search all entries in subcategoryLimits
  if (creditDoc.subcategoryLimits) {
    const entries = creditDoc.subcategoryLimits.entries
      ? Array.from(creditDoc.subcategoryLimits.entries())
      : Object.entries(creditDoc.subcategoryLimits);
    for (const [key, limit] of entries as Array<[string, any]>) {
      const parts = key.split(':');
      const keySubName = parts.length > 1 ? parts[1] : parts[0];
      if (keySubName.toLowerCase().trim() === subLower || key.toLowerCase().trim() === subLower) {
        return { key, limit };
      }
    }
  }

  return null;
}

// Recalculate totals from ALL limits (category, subcategory, and product)
// Each limit type is an independent pool of allotment
CreditSchema.methods.recalculateTotals = function () {
  const hasSpecificLimits =
    (this.categoryLimits && this.categoryLimits.size > 0) ||
    (this.subcategoryLimits && this.subcategoryLimits.size > 0) ||
    (this.productLimits && this.productLimits.size > 0);

  if (!hasSpecificLimits) {
    this.balance = Math.max(0, (this.totalAllocated || 0) - (this.totalUsed || 0));
    return;
  }

  let totalAllocated = 0;
  let totalUsed = 0;
  let effectiveUsedForBalance = 0;

  // Sum up all category allocations
  this.categoryLimits.forEach((limit: IAllotmentLimit) => {
    totalAllocated += limit.allocated;
    totalUsed += limit.used;
    effectiveUsedForBalance += Math.min(limit.used, limit.allocated);
  });

  // Sum up all subcategory allocations (independent pools)
  this.subcategoryLimits.forEach((limit: IAllotmentLimit) => {
    totalAllocated += limit.allocated;
    totalUsed += limit.used;
    effectiveUsedForBalance += Math.min(limit.used, limit.allocated);
  });

  // Sum up all product allocations (independent pools)
  this.productLimits.forEach((limit: IAllotmentLimit) => {
    totalAllocated += limit.allocated;
    totalUsed += limit.used;
    effectiveUsedForBalance += Math.min(limit.used, limit.allocated);
  });

  this.totalAllocated = totalAllocated;
  this.totalUsed = effectiveUsedForBalance; // Cap global total used at allocated amounts so overrides don't skew global balance
  // Ensure balance is never negative (can happen if used > allocated due to data inconsistency)
  this.balance = Math.max(0, totalAllocated - effectiveUsedForBalance);
};

// Check if user has sufficient credits (simple balance check)
CreditSchema.methods.hasSufficientCredits = function (amount: number): boolean {
  return this.balance >= amount;
};

// Add a simple transaction (for money-based credits, backward compatibility)
CreditSchema.methods.addTransaction = async function (
  type: CreditTransactionType,
  amount: number,
  description?: string,
  referenceId?: string,
  createdBy?: Types.ObjectId,
): Promise<void> {
  // Calculate new balance based on transaction type
  let newBalance = this.balance;
  if (
    type === CreditTransactionType.PURCHASE ||
    type === CreditTransactionType.EXPIRED
  ) {
    newBalance -= amount;
    this.totalUsed += amount;
  } else if (type === CreditTransactionType.REFUND) {
    newBalance += amount;
    this.totalUsed = Math.max(0, this.totalUsed - amount);
  } else if (type === CreditTransactionType.ALLOCATION) {
    newBalance += amount;
    this.totalAllocated += amount;
  } else if (type === CreditTransactionType.ADJUSTMENT) {
    // Adjustment can be positive or negative
    newBalance += amount;
    if (amount > 0) {
      this.totalAllocated += amount;
    } else {
      this.totalUsed += Math.abs(amount);
    }
  }

  // Ensure balance doesn't go negative
  this.balance = Math.max(0, newBalance);

  // Add transaction record
  this.transactions.push({
    type,
    amount: Math.abs(amount),
    balance: this.balance,
    description,
    referenceId,
    createdBy,
    createdAt: new Date(),
  });

  await this.save();
};

// Set category allotment
// If amount is 0, removes the category limit entirely
CreditSchema.methods.setCategoryAllotment = async function (
  categoryId: string,
  amount: number,
  updatedBy?: Types.ObjectId,
  isUnlimited: boolean = false,
): Promise<void> {
  if (amount === 0 && !isUnlimited) {
    // Remove the category limit entirely
    const existingLimit = this.categoryLimits.get(categoryId);
    if (!existingLimit) return; // already gone
    this.categoryLimits.delete(categoryId);
    this.markModified("categoryLimits");
    this.recalculateTotals();
    this.transactions.push({
      type: CreditTransactionType.ALLOCATION,
      amount: 0,
      balance: this.balance,
      description: `Category allotment removed`,
      categoryId: new Types.ObjectId(categoryId),
      createdBy: updatedBy,
      createdAt: new Date(),
    });
    await this.save();
    return;
  }

  const existingLimit = this.categoryLimits.get(categoryId);
  const previousAllocated = existingLimit?.allocated || 0;
  const newAllocated = isUnlimited ? 0 : previousAllocated + amount;

  this.set(`categoryLimits.${categoryId}`, {
    allocated: newAllocated,
    used: existingLimit?.used || 0,
    isUnlimited: isUnlimited,
    lastUpdatedAt: new Date(),
    lastUpdatedBy: updatedBy,
  });


  // Recalculate totals FIRST to get correct balance
  this.recalculateTotals();

  // Add transaction with correct balance
  this.transactions.push({
    type: CreditTransactionType.ALLOCATION,
    amount: amount,
    balance: this.balance,
    description: `Category allotment ${previousAllocated > 0 ? "increased by" : "set to"} ${amount} (total: ${newAllocated})`,
    categoryId: new Types.ObjectId(categoryId),
    createdBy: updatedBy,
    createdAt: new Date(),
  });

  await this.save();
};

// Set subcategory allotment
// If amount is 0, removes the subcategory limit entirely
CreditSchema.methods.setSubcategoryAllotment = async function (
  categoryId: string,
  subcategoryName: string,
  amount: number,
  updatedBy?: Types.ObjectId,
  isUnlimited: boolean = false,
): Promise<void> {
  const key = getSubcategoryKey(categoryId, subcategoryName);

  if (amount === 0 && !isUnlimited) {
    // Remove the subcategory limit entirely
    const existingLimit = this.subcategoryLimits.get(key);
    if (!existingLimit) return; // already gone
    this.subcategoryLimits.delete(key);
    this.markModified("subcategoryLimits");
    this.recalculateTotals();
    this.transactions.push({
      type: CreditTransactionType.ALLOCATION,
      amount: 0,
      balance: this.balance,
      description: `Subcategory allotment removed`,
      categoryId: new Types.ObjectId(categoryId),
      subcategoryName,
      createdBy: updatedBy,
      createdAt: new Date(),
    });
    await this.save();
    return;
  }

  const existingLimit = this.subcategoryLimits.get(key);
  const previousAllocated = existingLimit?.allocated || 0;
  const newAllocated = isUnlimited ? 0 : previousAllocated + amount;

  this.set(`subcategoryLimits.${key}`, {
    allocated: newAllocated,
    used: existingLimit?.used || 0,
    isUnlimited: isUnlimited,
    lastUpdatedAt: new Date(),
    lastUpdatedBy: updatedBy,
  });

  // Recalculate totals FIRST to get correct balance
  this.recalculateTotals();

  // Add transaction with correct balance
  this.transactions.push({
    type: CreditTransactionType.ALLOCATION,
    amount: amount,
    balance: this.balance,
    description: `Subcategory allotment for ${subcategoryName} ${previousAllocated > 0 ? "increased by" : "set to"} ${amount} (total: ${newAllocated})`,
    categoryId: new Types.ObjectId(categoryId),
    subcategoryName,
    createdBy: updatedBy,
    createdAt: new Date(),
  });

  await this.save();
};

// Set product allotment
// If amount is 0, removes the product limit entirely
CreditSchema.methods.setProductAllotment = async function (
  productId: string,
  amount: number,
  updatedBy?: Types.ObjectId,
  isUnlimited: boolean = false,
): Promise<void> {
  if (amount === 0 && !isUnlimited) {
    // Remove the product limit entirely
    const existingLimit = this.productLimits.get(productId);
    if (!existingLimit) return; // already gone
    this.productLimits.delete(productId);
    this.markModified("productLimits");
    this.recalculateTotals();
    this.transactions.push({
      type: CreditTransactionType.ALLOCATION,
      amount: 0,
      balance: this.balance,
      description: `Product allotment removed`,
      productId: new Types.ObjectId(productId),
      createdBy: updatedBy,
      createdAt: new Date(),
    });
    await this.save();
    return;
  }

  const existingLimit = this.productLimits.get(productId);
  const previousAllocated = existingLimit?.allocated || 0;
  const newAllocated = isUnlimited ? 0 : previousAllocated + amount;

  this.set(`productLimits.${productId}`, {
    allocated: newAllocated,
    used: existingLimit?.used || 0,
    isUnlimited: isUnlimited,
    lastUpdatedAt: new Date(),
    lastUpdatedBy: updatedBy,
  });

  // Recalculate totals FIRST to get correct balance
  this.recalculateTotals();

  // Add transaction with correct balance
  this.transactions.push({
    type: CreditTransactionType.ALLOCATION,
    amount: amount,
    balance: this.balance,
    description: `Product allotment ${previousAllocated > 0 ? "increased by" : "set to"} ${amount} (total: ${newAllocated})`,
    productId: new Types.ObjectId(productId),
    createdBy: updatedBy,
    createdAt: new Date(),
  });

  await this.save();
};

// Get remaining for category
CreditSchema.methods.getCategoryRemaining = function (
  categoryId: string,
): number {
  const limit = this.categoryLimits.get(categoryId);
  if (!limit) return 0;
  return Math.max(0, limit.allocated - limit.used);
};

// Get remaining for subcategory
CreditSchema.methods.getSubcategoryRemaining = function (
  categoryId: string,
  subcategoryName: string,
): number {
  const key = getSubcategoryKey(categoryId, subcategoryName);
  const limit = this.subcategoryLimits.get(key);
  if (!limit) return -1; // -1 means no specific limit (falls back to category)
  return Math.max(0, limit.allocated - limit.used);
};

// Get remaining for product
CreditSchema.methods.getProductRemaining = function (
  productId: string,
): number {
  const limit = this.productLimits.get(productId);
  if (!limit) return -1; // -1 means no specific limit (falls back to category)
  return Math.max(0, limit.allocated - limit.used);
};

// Safely increment usage for money-based limits without recalculating global totals
CreditSchema.methods.incrementLimitUsage = function (
  productId: string,
  categoryId: string | null,
  subcategoryName: string | null,
  amount: number
): void {
  if (productId) {
    const productLimit = this.productLimits.get(productId);
    if (productLimit) {
      productLimit.used += amount;
      productLimit.lastUpdatedAt = new Date();
      this.productLimits.set(productId, productLimit);
      this.markModified("productLimits");
    }
  }

  if (categoryId && subcategoryName) {
    const subcategoryKey = getSubcategoryKey(categoryId, subcategoryName);
    const subcategoryLimit = this.subcategoryLimits.get(subcategoryKey);
    if (subcategoryLimit) {
      subcategoryLimit.used += amount;
      subcategoryLimit.lastUpdatedAt = new Date();
      this.subcategoryLimits.set(subcategoryKey, subcategoryLimit);
      this.markModified("subcategoryLimits");
    }
  }

  if (categoryId) {
    const categoryLimit = this.categoryLimits.get(categoryId);
    if (categoryLimit) {
      categoryLimit.used += amount;
      categoryLimit.lastUpdatedAt = new Date();
      this.categoryLimits.set(categoryId, categoryLimit);
      this.markModified("categoryLimits");
    }
  }
};

// Check if purchase is allowed
// Priority: Product → Subcategory → Category (most specific first)
// Falls back to general balance when no specific limits are configured
CreditSchema.methods.canPurchase = function (
  productId: string,
  categoryId: string,
  subcategoryName: string | null,
  quantity: number,
): {
  allowed: boolean;
  reason?: string;
  deductFrom?: "product" | "subcategory" | "category" | "mixed" | "general";
  isUnlimited?: boolean;
} {
  const productIdStr = productId ? String(productId) : null;
  const categoryIdStr = categoryId ? String(categoryId) : null;

  console.log("[Credit.canPurchase] Called with:", {
    creditId: this._id,
    productIdStr,
    categoryIdStr,
    subcategoryName,
    quantity,
    categoryLimitsKeys: Array.from(this.categoryLimits.keys()),
    subcategoryLimitsKeys: Array.from(this.subcategoryLimits.keys()),
    productLimitsKeys: Array.from(this.productLimits.keys()),
  });

  if (this.isFrozen) {
    return { allowed: false, reason: "Your account is temporarily frozen" };
  }
  if (!this.isActive) {
    return { allowed: false, reason: "Your account is not active" };
  }

  // --- General balance mode: no specific limits configured ---
  const hasSpecificLimits = this.categoryLimits.size > 0 || this.subcategoryLimits.size > 0 || this.productLimits.size > 0;
  if (!hasSpecificLimits) {
    if (this.isUnlimited) {
      console.log("[Credit.canPurchase] ALLOWED from general balance (unlimited)");
      return { allowed: true, deductFrom: "general", isUnlimited: true };
    }
    const generalBalance = this.balance || 0;
    if (generalBalance >= quantity) {
      console.log("[Credit.canPurchase] ALLOWED from general balance:", generalBalance);
      return { allowed: true, deductFrom: "general", isUnlimited: false };
    }
    return {
      allowed: false,
      reason: `Insufficient balance. Available: $${generalBalance.toFixed(2)}, needed: $${Number(quantity).toFixed(2)}.`,
    };
  }

  // --- Specific limits mode: normalize ID lookups to strings ---
  const findProductLimit = () => {
    if (!productIdStr) return null;
    let lim = this.productLimits.get(productIdStr);
    if (!lim) {
      for (const [k, v] of this.productLimits.entries()) {
        if (String(k) === productIdStr) { lim = v; break; }
      }
    }
    return lim || null;
  };
  const findCategoryLimit = () => {
    if (!categoryIdStr) return null;
    let lim = this.categoryLimits.get(categoryIdStr);
    if (!lim) {
      for (const [k, v] of this.categoryLimits.entries()) {
        if (String(k) === categoryIdStr) { lim = v; break; }
      }
    }
    return lim || null;
  };

  // Get remaining at each level
  const productLimit = findProductLimit();
  const productRemaining = productLimit
    ? Math.max(0, productLimit.allocated - productLimit.used)
    : 0;

  const subcategoryEntry = findSubcategoryLimitEntry(this, categoryIdStr, subcategoryName);
  const subcategoryLimit = subcategoryEntry ? subcategoryEntry.limit : null;
  const subcategoryRemaining = subcategoryLimit
    ? Math.max(0, subcategoryLimit.allocated - subcategoryLimit.used)
    : 0;

  const categoryLimit = findCategoryLimit();
  const categoryRemaining = categoryLimit
    ? Math.max(0, categoryLimit.allocated - categoryLimit.used)
    : 0;

  console.log("[Credit.canPurchase] Remaining at each level:", {
    productRemaining,
    subcategoryRemaining,
    categoryRemaining,
    totalAvailable: productRemaining + subcategoryRemaining + categoryRemaining,
    quantityNeeded: quantity,
  });

  // 1. Check if product limit alone can cover the quantity
  if (productLimit?.isUnlimited || productRemaining >= quantity) {
    console.log("[Credit.canPurchase] ALLOWED from product limit alone");
    return { allowed: true, deductFrom: "product", isUnlimited: productLimit?.isUnlimited };
  }

  // 2. Check if subcategory limit alone can cover the quantity
  if (subcategoryLimit?.isUnlimited || subcategoryRemaining >= quantity) {
    console.log("[Credit.canPurchase] ALLOWED from subcategory limit alone");
    return { allowed: true, deductFrom: "subcategory", isUnlimited: subcategoryLimit?.isUnlimited };
  }

  // 3. Check if category limit alone can cover the quantity
  if (categoryLimit?.isUnlimited || categoryRemaining >= quantity) {
    console.log("[Credit.canPurchase] ALLOWED from category limit alone");
    return { allowed: true, deductFrom: "category", isUnlimited: categoryLimit?.isUnlimited };
  }

  // 4. Check if COMBINED limits can cover the quantity (product + subcategory + category)
  // This handles cases like: need 2, subcategory has 1, category has 1 = 2 total
  const totalAvailable =
    productRemaining + subcategoryRemaining + categoryRemaining;
  if (totalAvailable >= quantity) {
    console.log("[Credit.canPurchase] ALLOWED from mixed limits (combined)");
    return { allowed: true, deductFrom: "mixed", isUnlimited: false };
  }

  // No sufficient allotment at any level or combined
  const existingLimits: string[] = [];
  if (productLimit) existingLimits.push(`product: ${productRemaining}`);
  if (subcategoryLimit)
    existingLimits.push(`${subcategoryName}: ${subcategoryRemaining}`);
  if (categoryLimit) existingLimits.push(`category: ${categoryRemaining}`);

  console.log("[Credit.canPurchase] DENIED - insufficient allotment:", {
    productRemaining,
    subcategoryRemaining,
    categoryRemaining,
    totalAvailable,
    existingLimits,
  });

  if (existingLimits.length === 0) {
    return {
      allowed: false,
      reason: "Product, subcategory, or category is not assigned to your allotment",
    };
  }

  return {
    allowed: false,
    reason: `Insufficient allotment. Remaining: ${existingLimits.join(", ")} (total: ${totalAvailable}). You need ${quantity}.`,
  };
};

// Deduct from balance after purchase
// Priority: Product → Subcategory → Category (deduct from most specific first)
// Supports "mixed" deduction across multiple levels when no single level has enough
CreditSchema.methods.deductPurchase = async function (
  productId: string,
  categoryId: string | null,
  subcategoryName: string | null,
  quantity: number,
  orderId?: string,
  createdBy?: Types.ObjectId,
  isOverride: boolean = false,
): Promise<void> {
  console.log("[Credit.deductPurchase] Called with:", {
    creditId: this._id,
    userId: this.userId,
    productId,
    categoryId,
    subcategoryName,
    quantity,
    currentTotals: {
      totalAllocated: this.totalAllocated,
      totalUsed: this.totalUsed,
      balance: this.balance,
    },
  });

  // Validate first - this also tells us which level to deduct from
  const validation = this.canPurchase(
    productId,
    categoryId as any,
    subcategoryName,
    quantity,
  );
  if (!validation.allowed && !isOverride) {
    console.log(
      "[Credit.deductPurchase] Validation failed:",
      validation.reason,
    );
    throw new Error(validation.reason);
  }

  let deductFrom = validation.deductFrom;
  let deductedFromDescription = "";
  const deductionDetails: string[] = [];

  if (!validation.allowed && isOverride) {
    // Override requested when no balance available or unassigned item.
    // Allow fallback deduction in step 6 to decrement appropriate limit
    deductFrom = "override" as any;
  } else {
    console.log("[Credit.deductPurchase] Will deduct from:", deductFrom);
  }

  // Deduct from the appropriate level based on validation result
  const productIdStr = productId ? String(productId) : null;
  const categoryIdStr = categoryId ? String(categoryId) : null;

  // Normalize find helpers (same as canPurchase)
  const findProductLimitEntry = () => {
    if (!productIdStr) return null;
    let lim = this.productLimits.get(productIdStr);
    let key = productIdStr;
    if (!lim) {
      for (const [k, v] of this.productLimits.entries()) {
        if (String(k) === productIdStr) { lim = v; key = String(k); break; }
      }
    }
    return lim ? { key, limit: lim } : null;
  };
  const findCategoryLimitEntry = () => {
    if (!categoryIdStr) return null;
    let lim = this.categoryLimits.get(categoryIdStr);
    let key = categoryIdStr;
    if (!lim) {
      for (const [k, v] of this.categoryLimits.entries()) {
        if (String(k) === categoryIdStr) { lim = v; key = String(k); break; }
      }
    }
    return lim ? { key, limit: lim } : null;
  };

  if (deductFrom === "general") {
    // General balance deduction: no specific limits configured — deduct from global balance
    this.totalUsed = (this.totalUsed || 0) + quantity;
    this.balance = Math.max(0, (this.totalAllocated || 0) - this.totalUsed);
    deductedFromDescription = "general balance";
    console.log("[Credit.deductPurchase] General balance deduction:", { totalUsed: this.totalUsed, balance: this.balance });
  } else if (deductFrom === "product") {
    // Deduct from product limit only
    const entry = findProductLimitEntry();
    const productLimit = entry?.limit;
    if (productLimit) {
      console.log("[Credit.deductPurchase] Before deduction - product limit:", {
        productId: entry!.key,
        allocated: productLimit.allocated,
        used: productLimit.used,
        remaining: productLimit.allocated - productLimit.used,
      });

      productLimit.used += quantity;
      productLimit.lastUpdatedAt = new Date();
      this.productLimits.set(entry!.key, productLimit);
      this.markModified("productLimits");
      deductedFromDescription = "product allotment";

      console.log("[Credit.deductPurchase] After deduction - product limit:", {
        productId: entry!.key,
        allocated: productLimit.allocated,
        used: productLimit.used,
        remaining: productLimit.allocated - productLimit.used,
      });
    }
  } else if (deductFrom === "subcategory") {
    // Deduct from subcategory limit only
    const subcategoryEntry = findSubcategoryLimitEntry(
      this,
      categoryIdStr as any,
      subcategoryName,
    );
    if (subcategoryEntry) {
      const { key: subcategoryKey, limit: subcategoryLimit } = subcategoryEntry;
      console.log(
        "[Credit.deductPurchase] Before deduction - subcategory limit:",
        {
          subcategoryKey,
          allocated: subcategoryLimit.allocated,
          used: subcategoryLimit.used,
          remaining: subcategoryLimit.allocated - subcategoryLimit.used,
        },
      );

      subcategoryLimit.used += quantity;
      subcategoryLimit.lastUpdatedAt = new Date();
      this.subcategoryLimits.set(subcategoryKey, subcategoryLimit);
      this.markModified("subcategoryLimits");
      deductedFromDescription = `subcategory (${subcategoryName}) allotment`;

      console.log(
        "[Credit.deductPurchase] After deduction - subcategory limit:",
        {
          subcategoryKey,
          allocated: subcategoryLimit.allocated,
          used: subcategoryLimit.used,
          remaining: subcategoryLimit.allocated - subcategoryLimit.used,
        },
      );
    }
  } else if (deductFrom === "category") {
    // Deduct from category limit only (normalized key lookup)
    const catEntry = findCategoryLimitEntry();
    const categoryLimit = catEntry?.limit;
    if (categoryLimit) {
      console.log(
        "[Credit.deductPurchase] Before deduction - category limit:",
        {
          categoryId: catEntry!.key,
          allocated: categoryLimit.allocated,
          used: categoryLimit.used,
          remaining: categoryLimit.allocated - categoryLimit.used,
        },
      );

      categoryLimit.used += quantity;
      categoryLimit.lastUpdatedAt = new Date();
      this.categoryLimits.set(catEntry!.key, categoryLimit);
      this.markModified("categoryLimits");
      deductedFromDescription = "category allotment";

      console.log("[Credit.deductPurchase] After deduction - category limit:", {
        categoryId,
        allocated: categoryLimit.allocated,
        used: categoryLimit.used,
        remaining: categoryLimit.allocated - categoryLimit.used,
      });
    }
  } else if (deductFrom === "mixed") {
    // Deduct across multiple levels: product → subcategory → category
    // Take as much as possible from each level in priority order
    let remainingToDeduct = quantity;

    console.log(
      "[Credit.deductPurchase] MIXED deduction - starting with:",
      remainingToDeduct,
    );

    // 1. First, deduct from product limit
    const productLimit = this.productLimits.get(productId);
    if (productLimit && remainingToDeduct > 0) {
      const productRemaining = Math.max(
        0,
        productLimit.allocated - productLimit.used,
      );
      const deductFromProduct = Math.min(remainingToDeduct, productRemaining);
      if (deductFromProduct > 0) {
        productLimit.used += deductFromProduct;
        productLimit.lastUpdatedAt = new Date();
        this.productLimits.set(productId, productLimit);
        this.markModified("productLimits");
        remainingToDeduct -= deductFromProduct;
        deductionDetails.push(`${deductFromProduct} from product`);
        console.log("[Credit.deductPurchase] Mixed - deducted from product:", {
          deductFromProduct,
          remainingToDeduct,
        });
      }
    }

    // 2. Then, deduct from subcategory limit
    if (subcategoryName && remainingToDeduct > 0) {
      const subcategoryEntry = findSubcategoryLimitEntry(
        this,
        categoryId as any,
        subcategoryName,
      );
      if (subcategoryEntry) {
        const { key: subcategoryKey, limit: subcategoryLimit } = subcategoryEntry;
        const subcategoryRemaining = Math.max(
          0,
          subcategoryLimit.allocated - subcategoryLimit.used,
        );
        const deductFromSubcategory = Math.min(
          remainingToDeduct,
          subcategoryRemaining,
        );
        if (deductFromSubcategory > 0) {
          subcategoryLimit.used += deductFromSubcategory;
          subcategoryLimit.lastUpdatedAt = new Date();
          this.subcategoryLimits.set(subcategoryKey, subcategoryLimit);
          this.markModified("subcategoryLimits");
          remainingToDeduct -= deductFromSubcategory;
          deductionDetails.push(
            `${deductFromSubcategory} from ${subcategoryName}`,
          );
          console.log(
            "[Credit.deductPurchase] Mixed - deducted from subcategory:",
            {
              deductFromSubcategory,
              remainingToDeduct,
            },
          );
        }
      }
    }

    // 3. Finally, deduct from category limit (use normalized key)
    if (remainingToDeduct > 0) {
      const catEntry2 = findCategoryLimitEntry();
      const categoryLimit = catEntry2?.limit;
      if (categoryLimit) {
        const categoryRemaining = Math.max(
          0,
          categoryLimit.allocated - categoryLimit.used,
        );
        const deductFromCategory = Math.min(
          remainingToDeduct,
          categoryRemaining,
        );
        if (deductFromCategory > 0) {
          categoryLimit.used += deductFromCategory;
          categoryLimit.lastUpdatedAt = new Date();
          this.categoryLimits.set(catEntry2!.key, categoryLimit);
          this.markModified("categoryLimits");
          remainingToDeduct -= deductFromCategory;
          deductionDetails.push(`${deductFromCategory} from category`);
          console.log(
            "[Credit.deductPurchase] Mixed - deducted from category:",
            {
              deductFromCategory,
              remainingToDeduct,
            },
          );
        }
      }
    }

    deductedFromDescription = `mixed allotment (${deductionDetails.join(", ")})`;
    console.log("[Credit.deductPurchase] Mixed deduction complete:", {
      totalDeducted: quantity - remainingToDeduct,
      remainingToDeduct,
      deductionDetails,
    });
  }

  // 6. Override or Fallback deduction: If deductFrom is override or no specific limit matched, deduct from available limits
  if (!deductedFromDescription && deductFrom !== "general") {
    let remainingToDeduct = quantity;

    // Try specific category limit first
    const catEntry = findCategoryLimitEntry();
    if (catEntry && catEntry.limit) {
      catEntry.limit.used += remainingToDeduct;
      catEntry.limit.lastUpdatedAt = new Date();
      this.categoryLimits.set(catEntry.key, catEntry.limit);
      this.markModified("categoryLimits");
      deductedFromDescription = "override category limit";
      remainingToDeduct = 0;
    }

    // Try specific product limit next
    if (remainingToDeduct > 0) {
      const prodEntry = findProductLimitEntry();
      if (prodEntry && prodEntry.limit) {
        prodEntry.limit.used += remainingToDeduct;
        prodEntry.limit.lastUpdatedAt = new Date();
        this.productLimits.set(prodEntry.key, prodEntry.limit);
        this.markModified("productLimits");
        deductedFromDescription = "override product limit";
        remainingToDeduct = 0;
      }
    }

    // Fallback: Deduct from any category limit with available balance
    if (remainingToDeduct > 0 && this.categoryLimits && this.categoryLimits.size > 0) {
      for (const [k, limit] of this.categoryLimits.entries()) {
        const avail = Math.max(0, limit.allocated - limit.used);
        if (avail > 0 && remainingToDeduct > 0) {
          const dec = Math.min(avail, remainingToDeduct);
          limit.used += dec;
          limit.lastUpdatedAt = new Date();
          this.categoryLimits.set(k, limit);
          this.markModified("categoryLimits");
          remainingToDeduct -= dec;
          deductedFromDescription = "available category limit";
        }
      }
      // If still remaining or all were exhausted, increment the first category limit
      if (remainingToDeduct > 0) {
        const firstKey = Array.from(this.categoryLimits.keys())[0];
        const firstLimit = this.categoryLimits.get(firstKey);
        if (firstLimit) {
          firstLimit.used += remainingToDeduct;
          firstLimit.lastUpdatedAt = new Date();
          this.categoryLimits.set(firstKey, firstLimit);
          this.markModified("categoryLimits");
          deductedFromDescription = "category limit override";
          remainingToDeduct = 0;
        }
      }
    }

    // Fallback: Deduct from product limits if no category limits exist
    if (remainingToDeduct > 0 && this.productLimits && this.productLimits.size > 0) {
      for (const [k, limit] of this.productLimits.entries()) {
        const avail = Math.max(0, limit.allocated - limit.used);
        if (avail > 0 && remainingToDeduct > 0) {
          const dec = Math.min(avail, remainingToDeduct);
          limit.used += dec;
          limit.lastUpdatedAt = new Date();
          this.productLimits.set(k, limit);
          this.markModified("productLimits");
          remainingToDeduct -= dec;
          deductedFromDescription = "available product limit";
        }
      }
      if (remainingToDeduct > 0) {
        const firstKey = Array.from(this.productLimits.keys())[0];
        const firstLimit = this.productLimits.get(firstKey);
        if (firstLimit) {
          firstLimit.used += remainingToDeduct;
          firstLimit.lastUpdatedAt = new Date();
          this.productLimits.set(firstKey, firstLimit);
          this.markModified("productLimits");
          deductedFromDescription = "product limit override";
          remainingToDeduct = 0;
        }
      }
    }

    // Ultimate fallback: General balance deduction
    if (remainingToDeduct > 0) {
      this.totalUsed = (this.totalUsed || 0) + remainingToDeduct;
      this.balance = Math.max(0, (this.totalAllocated || 0) - this.totalUsed);
      deductedFromDescription = "general balance override";
    }
  }

  // Add transaction
  this.transactions.push({
    type: CreditTransactionType.PURCHASE,
    amount: quantity,
    balance: this.balance - quantity,
    description: `Purchased ${quantity} item(s) from ${deductedFromDescription}`,
    referenceId: orderId,
    categoryId: categoryId && mongoose.Types.ObjectId.isValid(categoryId) ? new Types.ObjectId(categoryId) : undefined,
    subcategoryName: subcategoryName || undefined,
    productId: productId && mongoose.Types.ObjectId.isValid(productId) ? new Types.ObjectId(productId) : undefined,
    createdBy,
    createdAt: new Date(),
  });

  this.recalculateTotals();

  console.log("[Credit.deductPurchase] After recalculateTotals:", {
    totalAllocated: this.totalAllocated,
    totalUsed: this.totalUsed,
    balance: this.balance,
  });

  await this.save();
  console.log("[Credit.deductPurchase] Saved successfully");
};

// Refund purchase
CreditSchema.methods.refundPurchase = async function (
  productId: string,
  categoryId: string,
  subcategoryName: string | null,
  quantity: number,
  orderId?: string,
  createdBy?: Types.ObjectId,
): Promise<void> {
  const productIdStr = productId ? String(productId) : null;
  const categoryIdStr = categoryId ? String(categoryId) : null;
  let refundedToSpecificLimit = false;

  // 1. Refund to product limit (if limit exists)
  if (productIdStr) {
    let productLimit = this.productLimits?.get(productIdStr);
    let prodKey = productIdStr;
    if (!productLimit && this.productLimits) {
      for (const [k, v] of this.productLimits.entries()) {
        if (String(k) === productIdStr) { productLimit = v; prodKey = String(k); break; }
      }
    }
    if (productLimit) {
      productLimit.used = Math.max(0, (productLimit.used || 0) - quantity);
      productLimit.lastUpdatedAt = new Date();
      this.productLimits.set(prodKey, productLimit);
      this.markModified("productLimits");
      refundedToSpecificLimit = true;
    }
  }

  // 2. Refund to subcategory limit (if limit exists)
  if (subcategoryName) {
    const subEntry = findSubcategoryLimitEntry(this, categoryIdStr, subcategoryName);
    if (subEntry && subEntry.limit) {
      subEntry.limit.used = Math.max(0, (subEntry.limit.used || 0) - quantity);
      subEntry.limit.lastUpdatedAt = new Date();
      this.subcategoryLimits.set(subEntry.key, subEntry.limit);
      this.markModified("subcategoryLimits");
      refundedToSpecificLimit = true;
    }
  }

  // 3. Refund to category limit (if limit exists)
  if (categoryIdStr) {
    let categoryLimit = this.categoryLimits?.get(categoryIdStr);
    let catKey = categoryIdStr;
    if (!categoryLimit && this.categoryLimits) {
      for (const [k, v] of this.categoryLimits.entries()) {
        if (String(k) === categoryIdStr) { categoryLimit = v; catKey = String(k); break; }
      }
    }
    if (categoryLimit) {
      categoryLimit.used = Math.max(0, (categoryLimit.used || 0) - quantity);
      categoryLimit.lastUpdatedAt = new Date();
      this.categoryLimits.set(catKey, categoryLimit);
      this.markModified("categoryLimits");
      refundedToSpecificLimit = true;
    }
  }

  // 4. Fallback: If no specific limit matched, try decrementing usage on any limit with used > 0
  if (!refundedToSpecificLimit && this.categoryLimits && this.categoryLimits.size > 0) {
    let remainingToRefund = quantity;
    for (const [k, limit] of this.categoryLimits.entries()) {
      if (limit.used > 0 && remainingToRefund > 0) {
        const dec = Math.min(limit.used, remainingToRefund);
        limit.used = Math.max(0, limit.used - dec);
        limit.lastUpdatedAt = new Date();
        this.categoryLimits.set(k, limit);
        this.markModified("categoryLimits");
        remainingToRefund -= dec;
        refundedToSpecificLimit = true;
      }
    }
  }

  // 5. General balance refund path
  if (!refundedToSpecificLimit) {
    this.totalUsed = Math.max(0, (this.totalUsed || 0) - quantity);
    this.balance = (this.balance || 0) + quantity;
  }

  const validCategoryId = categoryIdStr && mongoose.Types.ObjectId.isValid(categoryIdStr) ? new Types.ObjectId(categoryIdStr) : undefined;
  const validProductId = productIdStr && mongoose.Types.ObjectId.isValid(productIdStr) ? new Types.ObjectId(productIdStr) : undefined;

  // Add transaction
  this.transactions.push({
    type: CreditTransactionType.REFUND,
    amount: quantity,
    balance: this.balance,
    description: `Refunded ${quantity} item(s) allotment`,
    referenceId: orderId,
    categoryId: validCategoryId,
    subcategoryName: subcategoryName || undefined,
    productId: validProductId,
    createdBy,
    createdAt: new Date(),
  });

  if (refundedToSpecificLimit) {
    this.recalculateTotals();
  }
  await this.save();
};

// Rollover to new period
CreditSchema.methods.rollover = async function (
  newPeriodStart: Date,
  newPeriodEnd: Date,
): Promise<void> {
  // Reset all usage while keeping allocations
  this.categoryLimits.forEach((limit: IAllotmentLimit, key: string) => {
    let carryOver = 0;
    if (this.carryForward) {
      const remaining = limit.allocated - limit.used;
      carryOver = this.maxCarryForward
        ? Math.min(remaining, this.maxCarryForward)
        : remaining;
    }
    this.categoryLimits.set(key, {
      ...limit,
      used: 0,
      allocated: limit.allocated + carryOver,
      lastUpdatedAt: new Date(),
    });
  });

  this.subcategoryLimits.forEach((limit: IAllotmentLimit, key: string) => {
    this.subcategoryLimits.set(key, {
      ...limit,
      used: 0,
      lastUpdatedAt: new Date(),
    });
  });

  this.productLimits.forEach((limit: IAllotmentLimit, key: string) => {
    this.productLimits.set(key, {
      ...limit,
      used: 0,
      lastUpdatedAt: new Date(),
    });
  });

  this.markModified("categoryLimits");
  this.markModified("subcategoryLimits");
  this.markModified("productLimits");

  // Add rollover transaction
  this.transactions.push({
    type: CreditTransactionType.ROLLOVER,
    amount: 0,
    balance: this.balance,
    description: `Period rollover from ${this.periodStartDate?.toISOString()} to ${newPeriodStart.toISOString()}`,
    createdAt: new Date(),
  });

  this.periodStartDate = newPeriodStart;
  this.periodEndDate = newPeriodEnd;
  this.lastRolloverDate = new Date();

  this.recalculateTotals();
  await this.save();
};

// Pre-save hook
CreditSchema.pre("save", function (next) {
  // Ensure balance is never negative (can happen temporarily during recalculations)
  if (this.balance < 0) {
    this.balance = 0;
  }
  next();
});

export const Credit = mongoose.model<ICredit>("Credit", CreditSchema);
export default Credit;
