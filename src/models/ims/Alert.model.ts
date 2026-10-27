import mongoose, { Schema, Document } from "mongoose";

export interface IAlert extends Document {
  type: "lowStock" | "conflict" | "expiring" | "custom";
  name: string;
  description?: string;
  threshold?: number;
  condition?: {
    field: string;
    operator: "lt" | "lte" | "gt" | "gte" | "eq";
    value: number | string;
  };
  scope?: {
    vendorId?: string;
    productId?: string;
  };
  recipients: string[]; // Email addresses
  notificationChannels: ("email" | "sms" | "webhook")[];
  webhookUrl?: string;
  active: boolean;
  lastTriggered?: Date;
  triggerCount: number;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AlertSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["lowStock", "conflict", "expiring", "custom"],
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    threshold: {
      type: Number,
      default: null,
    },

    // Used only when type === 'custom'
    condition: {
      field: String,
      operator: {
        type: String,
        enum: ["lt", "lte", "gt", "gte", "eq"],
      },
      value: Schema.Types.Mixed,
    },
    recipients: {
      type: [String],
      required: true,
      validate: {
        validator: function (v: string[]) {
          return v && v.length > 0;
        },
        message: "At least one recipient is required",
      },
    },
    notificationChannels: {
      type: [String],
      enum: ["email", "sms", "webhook"],
      default: ["email"],
    },
    scope: {
      vendorId: { type: String, default: null },
      productId: { type: String, default: null },
    },
    webhookUrl: {
      type: String,
      default: null,
      validate: {
        validator: function (v: string) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: "Invalid webhook URL",
      },
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastTriggered: {
      type: Date,
      default: null,
    },
    triggerCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Index for active alerts
AlertSchema.index({ active: 1, type: 1 });

// Method to trigger alert
AlertSchema.methods.trigger = async function () {
  this.lastTriggered = new Date();
  this.triggerCount += 1;
  await this.save();

  console.log(`[Alert] Triggered: ${this.name} (Count: ${this.triggerCount})`);

  return {
    alertId: this._id,
    name: this.name,
    type: this.type,
    recipients: this.recipients,
    channels: this.notificationChannels,
  };
};

export default mongoose.model<IAlert>("Alert", AlertSchema);
