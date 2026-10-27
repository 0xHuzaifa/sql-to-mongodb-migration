import { Schema, model, Document, Types } from "mongoose";

/**
 * Alteration Model
 *
 * Purpose: Standalone alterations (custom services) that can be attached to product assignments.
 * These are NOT products - they are services/add-ons that can be required when purchasing a product.
 *
 * Global scope - alterations can be reused across all pages and product assignments.
 *
 * Examples:
 * - Custom embroidery service
 * - Logo printing service
 * - Personalization service
 * - Hemming/tailoring service
 */

// Custom Input Field Types for customer checkout
export type CustomInputFieldType = "text" | "textarea" | "number" | "select";

export interface ICustomInputField {
  id: string;
  type: "label" | "input"; // label for display, input for user entry
  inputType?: CustomInputFieldType; // Input type (only for input fields)
  label: string; // Label text or display text
  placeholder?: string; // Placeholder for input fields
  isRequired?: boolean; // Whether input is required
  options?: string[]; // Options for select type
  validationRegex?: string; // Regex pattern for validation
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

export interface IAlteration extends Document {
  // Basic Information
  name: string;
  description?: string;

  // Categorization (optional, for organization)
  category?: string;
  subcategory?: string;
  brand?: string;

  // Pricing
  price: number; // Price for this alteration/service

  // Images (S3 URLs)
  images: string[]; // Array of S3 image URLs

  // Custom Input Fields - collected from customer during checkout
  customInputFields?: ICustomInputField[];

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const CustomInputFieldSchema = new Schema<ICustomInputField>(
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
      enum: ["text", "textarea", "number", "select"],
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
  { _id: false }
);

const AlterationSchema = new Schema<IAlteration>(
  {
    name: {
      type: String,
      required: [true, "Alteration name is required"],
      trim: true,
      maxlength: [200, "Name cannot exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    category: {
      type: String,
      trim: true,
    },
    subcategory: {
      type: String,
      trim: true,
      lowercase: true,
    },
    brand: {
      type: String,
      trim: true,
    },
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: [0, "Price cannot be negative"],
      default: 0,
    },
    images: {
      type: [String],
      default: [],
    },
    customInputFields: {
      type: [CustomInputFieldSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
AlterationSchema.index({ name: "text", description: "text" });
AlterationSchema.index({ category: 1 });
AlterationSchema.index({ isActive: 1, createdAt: -1 });

export const Alteration = model<IAlteration>("Alteration", AlterationSchema);
export default Alteration;
