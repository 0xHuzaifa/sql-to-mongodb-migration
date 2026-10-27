import mongoose, { Schema, Document } from "mongoose";

export interface IStockMovementItem {
  inventoryId?: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  productId?: mongoose.Types.ObjectId;
  sku: string;
  productName: string;
  quantity: number;
  fromBinId?: string;
  fromBoxId?: string;
  fromRack?: string;
  toBinId?: string;
  toBoxId?: string;
  toRack?: string;
}

export interface IStockMovement extends Document {
  movementNumber: string;
  movementType: "transfer" | "restock" | "adjustment" | "relocation";
  sourceLocationId: string;
  sourceLocationName: string;
  destLocationId: string;
  destLocationName: string;
  facilityId?: string;
  sourceFacilityId?: string;
  sourceFacilityName?: string;
  destFacilityId?: string;
  destFacilityName?: string;
  sourceLocationType?: string;
  destLocationType?: string;
  sourceRack?: string;
  sourceBinId?: string;
  sourceBoxId?: string;
  destRack?: string;
  destBinId?: string;
  destBoxId?: string;
  sourceHierarchyPath?: string;
  destHierarchyPath?: string;
  items: IStockMovementItem[];
  totalQuantity: number;
  status: "completed" | "cancelled";
  initiatedBy?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StockMovementSchema = new Schema(
  {
    movementNumber: { type: String, required: true, unique: true, index: true },
    movementType: { type: String, enum: ["transfer", "restock", "adjustment", "relocation"], default: "transfer" },
    sourceLocationId: { type: String, required: true, index: true },
    sourceLocationName: { type: String, required: true },
    destLocationId: { type: String, required: true, index: true },
    destLocationName: { type: String, required: true },
    facilityId: { type: String, index: true },
    sourceFacilityId: { type: String, index: true },
    sourceFacilityName: { type: String },
    destFacilityId: { type: String, index: true },
    destFacilityName: { type: String },
    sourceLocationType: { type: String },
    destLocationType: { type: String },
    sourceRack: { type: String },
    sourceBinId: { type: String },
    sourceBoxId: { type: String },
    destRack: { type: String },
    destBinId: { type: String },
    destBoxId: { type: String },
    sourceHierarchyPath: { type: String },
    destHierarchyPath: { type: String },
    items: [
      {
        inventoryId: { type: Schema.Types.ObjectId, ref: "Inventory" },
        variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
        productId: { type: Schema.Types.ObjectId, ref: "Product" },
        sku: { type: String, required: true },
        productName: { type: String, default: "" },
        quantity: { type: Number, required: true, min: 1 },
        fromBinId: { type: String },
        fromBoxId: { type: String },
        fromRack: { type: String },
        toBinId: { type: String },
        toBoxId: { type: String },
        toRack: { type: String },
      },
    ],
    totalQuantity: { type: Number, required: true },
    status: { type: String, enum: ["completed", "cancelled"], default: "completed" },
    initiatedBy: { type: String, default: "IMS User" },
    notes: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<IStockMovement>("StockMovement", StockMovementSchema);
