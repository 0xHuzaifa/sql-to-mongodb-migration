import mongoose, { Schema, Document } from "mongoose";

export interface INote extends Document {
  entityType: string;
  entityId: string;
  content: string;
  authorId?: string;
  authorName: string;
  authorRole?: string;
  isWarning: boolean;
  priority: "low" | "medium" | "high" | "critical";
  tags?: string[];
  metadata?: Record<string, any>;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NoteSchema = new Schema<INote>(
  {
    entityType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    authorId: {
      type: String,
      default: "",
    },
    authorName: {
      type: String,
      required: true,
      default: "System User",
      trim: true,
    },
    authorRole: {
      type: String,
      default: "Cashier",
    },
    isWarning: {
      type: Boolean,
      default: false,
      index: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    tags: {
      type: [String],
      default: [],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound index for querying active notes for a given record sorted by newest first
NoteSchema.index({ entityType: 1, entityId: 1, isArchived: 1, createdAt: -1 });

// Compound index for warning queries
NoteSchema.index({ entityType: 1, entityId: 1, isWarning: 1, isArchived: 1 });

export default mongoose.model<INote>("Note", NoteSchema);
