import mongoose, { Schema, Document } from "mongoose";

export interface ILocation extends Document {
  warehouseId: string;
  warehouseName: string;
  facilityId?: string;
  facilityName?: string;
  locationType?: "warehouse" | "showroom" | "hold" | "storeroom" | "tailor_shop" | "other";
  canSellDirectly?: boolean;
  allowsReceiving?: boolean;
  isCustomerHold?: boolean;
  capacity?: number;
  isUnlimitedCapacity?: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  bins: Array<{
    binId: string;
    binCode: string;
    structureType?: "box" | "shelf" | "rack" | "pallet" | "bin" | "peg" | "drawer";
    aisle?: string;
    side?: "A" | "B" | "None";
    column?: string;
    row?: string;
    shelf?: string;
    boxNumber?: string;
    capacity?: number;
    occupied?: number;
    isUnlimitedCapacity?: boolean;
    capacityUnit?: string;
    status: "active" | "maintenance" | "full";
    boxes?: Array<{
      boxId: string;
      boxNumber: number;
      boxCode: string;
      fullAddress: string;
      status: "empty" | "occupied";
      itemCount: number;
      notes?: string;
      createdAt?: Date;
    }>;
  }>;
  isActive: boolean;

  // 🔽 ADD THESE
  findBin(binCode: string): any;
  updateBinOccupancy(binCode: string, quantity: number): Promise<any>;

  createdAt: Date;
  updatedAt: Date;
}

export function getDefaultLocationFlags(locationType?: string) {
  switch (locationType) {
    case "showroom":
      return { canSellDirectly: true, allowsReceiving: false, isCustomerHold: false };
    case "warehouse":
      return { canSellDirectly: false, allowsReceiving: true, isCustomerHold: false };
    case "hold":
      return { canSellDirectly: false, allowsReceiving: false, isCustomerHold: true };
    case "storeroom":
    case "tailor_shop":
    default:
      return { canSellDirectly: false, allowsReceiving: false, isCustomerHold: false };
  }
}

const LocationSchema = new Schema(
  {
    warehouseId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    warehouseName: {
      type: String,
      required: true,
    },
    facilityId: {
      type: String,
      index: true,
      default: null,
    },
    facilityName: {
      type: String,
      default: "",
    },
    locationType: {
      type: String,
      enum: ["warehouse", "showroom", "hold", "storeroom", "tailor_shop", "other"],
      default: "warehouse",
      index: true,
    },
    canSellDirectly: {
      type: Boolean,
      default: false,
    },
    allowsReceiving: {
      type: Boolean,
      default: true,
    },
    isCustomerHold: {
      type: Boolean,
      default: false,
    },
    capacity: {
      type: Number,
      default: 0,
    },
    isUnlimitedCapacity: {
      type: Boolean,
      default: false,
    },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    bins: [
      {
        binId: {
          type: String,
          required: true,
        },
        binCode: {
          type: String,
          required: true,
        },
        structureType: {
          type: String,
          enum: ["box", "shelf", "rack", "pallet", "bin", "peg", "drawer"],
          default: "bin",
        },
        aisle: String,
        side: {
          type: String,
          enum: ["A", "B", "None"],
          default: "None",
        },
        column: String,
        row: String,
        shelf: String,
        boxNumber: String,
        capacity: {
          type: Number,
          default: 100,
        },
        occupied: {
          type: Number,
          default: 0,
        },
        isUnlimitedCapacity: {
          type: Boolean,
          default: false,
        },
        capacityUnit: {
          type: String,
          default: "units",
        },
        status: {
          type: String,
          enum: ["active", "maintenance", "full"],
          default: "active",
        },
        boxes: [
          {
            boxId: { type: String, required: true },
            boxNumber: { type: Number, required: true },
            boxCode: { type: String, required: true },
            fullAddress: { type: String, required: true },
            status: { type: String, enum: ["empty", "occupied"], default: "empty" },
            itemCount: { type: Number, default: 0 },
            notes: { type: String, default: "" },
            createdAt: { type: Date, default: Date.now },
          },
        ],
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for bin search
LocationSchema.index({ "bins.binCode": 1 });
LocationSchema.index({ isActive: 1 });

// Method: Find bin by code
LocationSchema.methods.findBin = function (binCode: string) {
  return this.bins.find((b: any) => b.binCode === binCode);
};

// Method: Update bin occupancy
LocationSchema.methods.updateBinOccupancy = async function (
  binCode: string,
  quantity: number
) {
  const bin = this.findBin(binCode);

  if (!bin) {
    throw new Error(`Bin ${binCode} not found`);
  }

  bin.occupied = (bin.occupied || 0) + quantity;

  // Auto-mark as full if at capacity
  if (bin.occupied >= bin.capacity) {
    bin.status = "full";
  } else if (bin.status === "full") {
    bin.status = "active";
  }

  await this.save();
  return bin;
};

export default mongoose.model<ILocation>("Location", LocationSchema);
