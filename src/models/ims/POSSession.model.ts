import mongoose, { Schema, Document } from "mongoose";

export interface DrawerDenominations {
  bills100: number;
  bills50: number;
  bills20: number;
  bills10: number;
  bills5: number;
  bills1: number;
  coins100: number; // $1 coins
  coins25: number;  // quarters
  coins10: number;  // dimes
  coins5: number;   // nickels
  coins1: number;   // pennies
  rollsQuarters?: number; // $10 per roll
  rollsDimes?: number;    // $5 per roll
  rollsNickels?: number;  // $2 per roll
  rollsPennies?: number;  // $0.50 per roll
}

export interface IPOSSession extends Document {
  serverId: string;
  userId: mongoose.Types.ObjectId;
  terminalId: string;                          // Physical cash drawer / register ID
  openingBalance: number;
  expectedOpeningBalance?: number;             // Auto-calculated from previous session
  openingDiscrepancy?: number;                 // Cashier count vs expected at open
  closingBalance?: number;
  actualCashInDrawer?: number;
  closingDiscrepancy?: number;                 // Cashier count vs expected at close
  cashDropAmount?: number;                     // Amount removed from drawer (safe/bank drop)
  openingNotes?: string;
  closingNotes?: string;
  openingDenominations?: DrawerDenominations;
  closingDenominations?: DrawerDenominations;
  openedByManagerId?: mongoose.Types.ObjectId; // Manager who authorized open (if override)
  closedByManagerId?: mongoose.Types.ObjectId; // Manager who authorized close (if override)
  status: "open" | "closed";
  openedAt: Date;
  closedAt?: Date;
  eodReport?: any;
  createdAt: Date;
  updatedAt: Date;
}

const denominationSubSchema = {
  bills100: { type: Number, default: 0 },
  bills50:  { type: Number, default: 0 },
  bills20:  { type: Number, default: 0 },
  bills10:  { type: Number, default: 0 },
  bills5:   { type: Number, default: 0 },
  bills1:   { type: Number, default: 0 },
  coins100: { type: Number, default: 0 },
  coins25:  { type: Number, default: 0 },
  coins10:  { type: Number, default: 0 },
  coins5:   { type: Number, default: 0 },
  coins1:   { type: Number, default: 0 },
  rollsQuarters: { type: Number, default: 0 },
  rollsDimes:    { type: Number, default: 0 },
  rollsNickels:  { type: Number, default: 0 },
  rollsPennies:  { type: Number, default: 0 },
};

const POSSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Cashier",
      required: true,
      index: true,
    },
    terminalId: {
      type: String,
      required: true,
      index: true,
      default: "default",
    },
    openingBalance: { type: Number, required: true, default: 0 },
    expectedOpeningBalance: { type: Number },
    openingDiscrepancy: { type: Number },
    closingBalance: { type: Number },
    actualCashInDrawer: { type: Number },
    closingDiscrepancy: { type: Number },
    cashDropAmount: { type: Number, default: 0 },
    openingNotes: { type: String, trim: true },
    closingNotes: { type: String, trim: true },
    openingDenominations: { type: denominationSubSchema, _id: false },
    closingDenominations: { type: denominationSubSchema, _id: false },
    openedByManagerId: { type: Schema.Types.ObjectId, ref: "Cashier" },
    closedByManagerId: { type: Schema.Types.ObjectId, ref: "Cashier" },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date },
    eodReport: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export default mongoose.model<IPOSSession>("POSSession", POSSessionSchema);
