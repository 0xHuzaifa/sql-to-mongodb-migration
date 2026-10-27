import { Schema, model, Document, Types } from "mongoose";

/**
 * EmployeeGroup Model
 *
 * Purpose: Represents dynamic employee groups created implicitly via CSV import
 * or manual user creation. Groups are tenant-scoped and referenceable by rules
 * and reports.
 *
 * Key Characteristics:
 * - Created implicitly (not predefined)
 * - Each employee MUST belong to exactly one group
 * - Groups are tenant-scoped
 * - Cannot be changed by employees themselves
 *
 * Relationships:
 * - pageId: Page this group belongs to
 * - employeeIds: Users (employees) in this group
 * - createdBy: User who created this group (via CSV or manual)
 */
// Assigned category structure
export interface IAssignedCategory {
  categoryId: Types.ObjectId;
  categoryName: string;
  subcategories?: string[]; // Specific subcategories if assigned at subcategory level
}

export interface IEmployeeGroup extends Document {
  // Basic Information
  name: string;
  code?: string; // Optional group code (e.g., from CSV)
  description?: string;

  // Page Relationship (Page serves as tenant)
  pageId: Types.ObjectId; // Page this group belongs to

  // Employees
  employeeIds: Types.ObjectId[]; // Users (employees) in this group

  // Assigned Categories (populated from product assignments)
  // This stores which categories/subcategories have been assigned to this group
  assignedCategories: IAssignedCategory[];

  // Creation Source
  source: "csv_import" | "manual" | "auto_created";
  sourceReference?: Types.ObjectId; // Reference to CSVImport if created via CSV

  // Metadata
  metadata?: Map<string, any>; // Additional group metadata (e.g., department, location)

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  addEmployee(employeeId: Types.ObjectId): Promise<this>;
  removeEmployee(employeeId: Types.ObjectId): Promise<this>;
  addAssignedCategory(categoryId: Types.ObjectId, categoryName: string, subcategory?: string): Promise<this>;
  removeAssignedCategory(categoryId: Types.ObjectId, subcategory?: string): Promise<this>;
}

const EmployeeGroupSchema = new Schema<IEmployeeGroup>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      sparse: true,
    },
    description: {
      type: String,
      maxlength: 500,
    },
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    employeeIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    source: {
      type: String,
      enum: ["csv_import", "manual", "auto_created"],
      required: true,
      default: "manual",
      index: true,
    },
    sourceReference: {
      type: Schema.Types.ObjectId,
      ref: "CSVImport",
      sparse: true,
    },
    assignedCategories: [
      {
        categoryId: {
          type: Schema.Types.ObjectId,
          ref: "Taxonomy",
          required: true,
        },
        categoryName: {
          type: String,
          required: true,
        },
        subcategories: [String], // Specific subcategories if assigned at subcategory level
      },
    ],
    metadata: {
      type: Map,
      of: Schema.Types.Mixed,
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
EmployeeGroupSchema.index({ pageId: 1, isActive: 1 });
EmployeeGroupSchema.index({ employeeIds: 1 });
EmployeeGroupSchema.index({ source: 1 });
EmployeeGroupSchema.index({ pageId: 1, name: 1 }); // For unique group names per page

// Compound index: Ensure unique group name per page
EmployeeGroupSchema.index({ pageId: 1, name: 1 }, { unique: true });

// Validation: Ensure each employee belongs to exactly one group
// This is enforced at application level, not schema level
EmployeeGroupSchema.pre("save", async function (next) {
  // If this is a new group or employeeIds changed, validate uniqueness
  if (this.isNew || this.isModified("employeeIds")) {
    // Note: Application-level validation required to ensure
    // employees don't belong to multiple groups
  }
  next();
});

// Method: Add employee to group
EmployeeGroupSchema.methods.addEmployee = async function (
  employeeId: Types.ObjectId,
) {
  if (this.employeeIds.includes(employeeId)) {
    throw new Error("Employee already in this group");
  }
  this.employeeIds.push(employeeId);
  const saved = await this.save();

  // Note: Credit records are created when allotments are assigned, not when users join groups
  // The credit service's getOrCreateCredit handles this automatically

  return saved;
};

// Method: Remove employee from group
EmployeeGroupSchema.methods.removeEmployee = async function (
  employeeId: Types.ObjectId,
) {
  this.employeeIds = this.employeeIds.filter(
    (id: Types.ObjectId) => id.toString() !== employeeId.toString(),
  );
  const saved = await this.save();

  // Note: Credit records remain intact when users are removed from groups
  // This preserves purchase history. Admins can manually deactivate if needed.

  return saved;
};

// Method: Add assigned category to group
EmployeeGroupSchema.methods.addAssignedCategory = async function (
  categoryId: Types.ObjectId,
  categoryName: string,
  subcategory?: string,
) {
  if (!this.assignedCategories) {
    this.assignedCategories = [];
  }

  // Find existing category entry
  const existingIndex = this.assignedCategories.findIndex(
    (c: IAssignedCategory) => c.categoryId.toString() === categoryId.toString(),
  );

  if (existingIndex >= 0) {
    // Category already exists, add subcategory if provided
    if (subcategory) {
      const existing = this.assignedCategories[existingIndex];
      if (!existing.subcategories) {
        existing.subcategories = [];
      }
      if (!existing.subcategories.includes(subcategory)) {
        existing.subcategories.push(subcategory);
      }
    }
  } else {
    // Add new category entry
    this.assignedCategories.push({
      categoryId,
      categoryName,
      subcategories: subcategory ? [subcategory] : [],
    });
  }

  return this.save();
};

// Method: Remove assigned category from group
EmployeeGroupSchema.methods.removeAssignedCategory = async function (
  categoryId: Types.ObjectId,
  subcategory?: string,
) {
  if (!this.assignedCategories) return this;

  if (subcategory) {
    // Remove only the specific subcategory
    const existingIndex = this.assignedCategories.findIndex(
      (c: IAssignedCategory) => c.categoryId.toString() === categoryId.toString(),
    );
    if (existingIndex >= 0) {
      const existing = this.assignedCategories[existingIndex];
      if (existing.subcategories) {
        existing.subcategories = existing.subcategories.filter(
          (s: string) => s !== subcategory,
        );
      }
    }
  } else {
    // Remove entire category
    this.assignedCategories = this.assignedCategories.filter(
      (c: IAssignedCategory) => c.categoryId.toString() !== categoryId.toString(),
    );
  }

  return this.save();
};

export const EmployeeGroup = model<IEmployeeGroup>(
  "EmployeeGroup",
  EmployeeGroupSchema,
);
export default EmployeeGroup;
