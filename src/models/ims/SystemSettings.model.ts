import mongoose, { Schema, Document } from "mongoose";

export interface ISystemSettings extends Document {
  receiptLogoUrl?: string;
  receiptPhoneNumber?: string;
  receiptAddress?: string;
  receiptReturnPolicy?: string;
  receiptFooterText?: string;
  reportLogoUrl?: string;
  reportFooterText?: string;
  invoiceCompanyName?: string;
  invoiceCompanyAddress?: string;
  invoiceCompanyContact?: string;
  // New invoice customization fields
  invoiceCompanyPhone?: string;
  invoiceCompanyEmail?: string;
  achInstructions?: string;
  checkInstructions?: string;
  defaultInvoiceNotes?: string;
  inactiveUserThresholdDays?: number;
  enableInactiveAutoFlag?: boolean;
  imsUserThresholdDays?: number;
  cashierThresholdDays?: number;
  companyUserThresholdDays?: number;
  batchCutOffHour?: number;
  batchCutOffMinute?: number;
  createdAt: Date;
  updatedAt: Date;
}

const SystemSettingsSchema = new Schema(
  {
    receiptLogoUrl: {
      type: String,
      default: "",
    },
    reportLogoUrl: {
      type: String,
      default: "",
    },
    receiptPhoneNumber: {
      type: String,
      default: "",
    },
    receiptAddress: {
      type: String,
      default: "",
    },
    receiptReturnPolicy: {
      type: String,
      default: "",
    },
    receiptFooterText: {
      type: String,
      default: "THANK YOU",
    },
    reportFooterText: {
      type: String,
      default: "RETURN POLICY: VALID ONLY WITH RECEIPT,\nUP TO 30 DAYS AFTER PURCHASE,\nMUST BE UNUSED, UNALTERED,\nWITH ORIGINAL PACKAGING/TAGS.\nThank You For Your Business!",
    },
    invoiceCompanyName: {
      type: String,
      default: "CHICAGO UNIFORM",
    },
    invoiceCompanyAddress: {
      type: String,
      default: "222 W 22nd Street Suite 114\nChicago, IL 60616",
    },
    invoiceCompanyContact: {
      type: String,
      default: "(312) 326-5800 | sales@chicagouniform.com",
    },
    invoiceCompanyPhone: {
      type: String,
      default: "",
    },
    invoiceCompanyEmail: {
      type: String,
      default: "",
    },
    achInstructions: {
      type: String,
      default: "ACH Transfer:\nBank: First National Bank\nRouting #: 071000013\nAccount #: 1234567890\nAccount Name: Chicago Uniform Company",
    },
    checkInstructions: {
      type: String,
      default: "Make checks payable to: Chicago Uniform Company\nMail to: 222 W 22nd Street Suite 114, Chicago, IL 60616",
    },
    defaultInvoiceNotes: {
      type: String,
      default: "",
    },
    inactiveUserThresholdDays: {
      type: Number,
      default: 30,
    },
    enableInactiveAutoFlag: {
      type: Boolean,
      default: true,
    },
    imsUserThresholdDays: {
      type: Number,
      default: 30,
    },
    cashierThresholdDays: {
      type: Number,
      default: 30,
    },
    companyUserThresholdDays: {
      type: Number,
      default: 30,
    },
    batchCutOffHour: {
      type: Number,
      default: 23,
    },
    batchCutOffMinute: {
      type: Number,
      default: 59,
    },
  },
  { timestamps: true }
);

export default mongoose.model<ISystemSettings>("SystemSettings", SystemSettingsSchema);
