import mongoose, { Schema, Document } from "mongoose";

export interface IInventoryLocation extends Document {
    inventoryId: mongoose.Types.ObjectId;
    variantId?: mongoose.Types.ObjectId;
    warehouseId: string;
    binId: string;
    boxId?: string;
    quantity: number;
    createdAt: Date;
    updatedAt: Date;
}

const InventoryLocationSchema = new Schema(
    {
        inventoryId: { type: Schema.Types.ObjectId, ref: "Inventory", required: true, index: true },
        variantId: { type: Schema.Types.ObjectId, ref: "Variant", index: true },
        warehouseId: { type: String, required: true, index: true },
        binId: { type: String, required: true, index: true },
        boxId: { type: String, default: null, index: true },
        quantity: { type: Number, required: true, min: 1 },
    },
    { timestamps: true }
);

InventoryLocationSchema.index({ warehouseId: 1, binId: 1, boxId: 1 });

export default mongoose.model<IInventoryLocation>("InventoryLocation", InventoryLocationSchema);
