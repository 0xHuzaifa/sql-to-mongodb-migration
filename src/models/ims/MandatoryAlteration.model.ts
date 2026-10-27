import { Schema, model, Document, Types } from "mongoose";

/**
 * MandatoryAlteration Model
 *
 * Purpose: Defines mandatory alterations that are hard-enforced requirements,
 * not UI options. These can be product-based (badges, patches, hemming) or
 * attribute-based (size selection, custom attributes).
 *
 * Rules:
 * - Auto-attached to orders
 * - Cannot be removed
 * - Must block checkout if missing
 *
 * Relationships:
 * - pageId: Page this alteration belongs to
 * - productIds: Products this alteration applies to (if product-based)
 * - categoryIds: Categories this alteration applies to (if category-based)
 */
export enum AlterationType {
  PRODUCT_BASED = "product_based", // Real products (badges, patches, hemming)
  ATTRIBUTE_BASED = "attribute_based", // Attributes (size, custom fields)
}

export enum AlterationScope {
  PRODUCT = "product", // Applies to specific products
  CATEGORY = "category", // Applies to all products in category
  GLOBAL = "global", // Applies to all products in portal
}

/**
 * Custom Input Field Types
 * Used to collect additional information from customers during checkout
 */
export enum CustomInputFieldType {
  TEXT = "text", // Single line text input
  TEXTAREA = "textarea", // Multi-line text input
  NUMBER = "number", // Number input
  SELECT = "select", // Dropdown selection
}

export interface ICustomInputField {
  id: string; // Unique identifier
  type: "label" | "input"; // Field type: label for display only, input for user entry
  inputType?: CustomInputFieldType; // Input type (only for input fields)
  label: string; // Label text or display text
  placeholder?: string; // Placeholder for input fields
  isRequired?: boolean; // Whether input is required
  options?: string[]; // Options for select type
  validationRegex?: string; // Regex pattern for validation
  minLength?: number; // Minimum length for text
  maxLength?: number; // Maximum length for text
  min?: number; // Minimum value for number
  max?: number; // Maximum value for number
}

export interface IMandatoryAlteration extends Document {
  // Page Relationship
  pageId: Types.ObjectId; // Page this alteration belongs to (ref: Page)

  // Alteration Information
  name: string;
  description?: string;
  type: AlterationType;

  // Scope
  scope: AlterationScope;

  // Product-based Alteration
  productBasedConfig?: {
    productIds: Types.ObjectId[]; // Products that serve as alterations (badges, patches, etc.)
    isRequired: boolean; // Must be included in order
    minQuantity?: number; // Minimum quantity required
    maxQuantity?: number; // Maximum quantity allowed
  };

  // Attribute-based Alteration
  attributeBasedConfig?: {
    attributeKey: string; // Attribute key (e.g., "size", "custom_text")
    attributeType: "text" | "number" | "select" | "multiselect" | "boolean";
    requiredValues?: string[]; // Required values for select/multiselect
    validationRule?: string; // Validation regex or rule
    defaultValue?: any; // Default value
  };

  // Custom Input Fields - Collected from customer during checkout
  customInputFields?: ICustomInputField[];

  // Application Rules
  applicationRules: {
    autoAttach: boolean; // Automatically attach to orders
    blockCheckout: boolean; // Block checkout if missing
    showInUI: boolean; // Show in UI (even though mandatory)
    allowMultiple: boolean; // Allow multiple instances
  };

  // Priority (for conflict resolution)
  priority: number; // Higher priority = more important

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const MandatoryAlterationSchema = new Schema<IMandatoryAlteration>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: Object.values(AlterationType),
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: Object.values(AlterationScope),
      required: true,
      default: AlterationScope.GLOBAL,
      index: true,
    },
    productBasedConfig: {
      productIds: [
        {
          type: Schema.Types.ObjectId,
          ref: "Product",
        },
      ],
      isRequired: {
        type: Boolean,
        default: true,
      },
      minQuantity: {
        type: Number,
        min: 0,
        default: 1,
      },
      maxQuantity: {
        type: Number,
        min: 1,
      },
    },
    attributeBasedConfig: {
      attributeKey: {
        type: String,
        trim: true,
      },
      attributeType: {
        type: String,
        enum: ["text", "number", "select", "multiselect", "boolean"],
      },
      requiredValues: [String],
      validationRule: String,
      defaultValue: Schema.Types.Mixed,
    },
    customInputFields: [
      {
        id: {
          type: String,
          required: true,
        },
        type: {
          type: String,
          enum: ["label", "input"],
          required: true,
        },
        inputType: {
          type: String,
          enum: Object.values(CustomInputFieldType),
        },
        label: {
          type: String,
          required: true,
          trim: true,
          maxlength: 200,
        },
        placeholder: {
          type: String,
          trim: true,
          maxlength: 200,
        },
        isRequired: {
          type: Boolean,
          default: true,
        },
        options: [String],
        validationRegex: String,
        minLength: Number,
        maxLength: Number,
        min: Number,
        max: Number,
      },
    ],
    applicationRules: {
      autoAttach: {
        type: Boolean,
        default: true,
      },
      blockCheckout: {
        type: Boolean,
        default: true,
      },
      showInUI: {
        type: Boolean,
        default: true,
      },
      allowMultiple: {
        type: Boolean,
        default: false,
      },
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
MandatoryAlterationSchema.index({ pageId: 1, type: 1 });
MandatoryAlterationSchema.index({ pageId: 1, scope: 1 });
MandatoryAlterationSchema.index({ pageId: 1, isActive: 1 });
MandatoryAlterationSchema.index({ priority: -1 });
MandatoryAlterationSchema.index({ "productBasedConfig.productIds": 1 });

// Validation: Ensure productBasedConfig exists only for PRODUCT_BASED type
MandatoryAlterationSchema.pre("save", function (next) {
  if (this.type === AlterationType.PRODUCT_BASED && !this.productBasedConfig) {
    return next(
      new Error("productBasedConfig is required for PRODUCT_BASED type"),
    );
  }
  if (
    this.type === AlterationType.ATTRIBUTE_BASED &&
    !this.attributeBasedConfig
  ) {
    return next(
      new Error("attributeBasedConfig is required for ATTRIBUTE_BASED type"),
    );
  }

  // Clear configs that don't apply
  if (this.type === AlterationType.PRODUCT_BASED) {
    this.attributeBasedConfig = undefined;
  }
  if (this.type === AlterationType.ATTRIBUTE_BASED) {
    this.productBasedConfig = undefined;
  }

  next();
});

// Validation: Ensure scope-specific fields are set
MandatoryAlterationSchema.pre("save", function (next) {
  if (
    this.scope === AlterationScope.PRODUCT &&
    (!this.productBasedConfig?.productIds ||
      this.productBasedConfig.productIds.length === 0)
  ) {
    return next(new Error("productIds required for PRODUCT scope alterations"));
  }
  next();
});

export const MandatoryAlteration = model<IMandatoryAlteration>(
  "MandatoryAlteration",
  MandatoryAlterationSchema,
);
export default MandatoryAlteration;
