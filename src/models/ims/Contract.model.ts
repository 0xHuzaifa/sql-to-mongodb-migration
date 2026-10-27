
import mongoose, { Schema, Document } from "mongoose";

export interface IContract extends Document {
    contractName: string;
    contractorName: string;
    contractWith: string; // The entity/company being contracted
    description?: string;
    contractPeriod: {
        startDate: Date;
        endDate: Date;
    };
    status: "draft" | "active" | "expired" | "cancelled";
    products: Array<{
        productId: mongoose.Types.ObjectId;
        variants: Array<{
            variantId: mongoose.Types.ObjectId;
            contractPrice: number;
        }>;
    }>;
    portalIds: mongoose.Types.ObjectId[]; // Array of references to 'Page' (Portal)
    createdBy: mongoose.Types.ObjectId; // References 'User'
    createdAt: Date;
    updatedAt: Date;
}

const ContractSchema = new Schema<IContract>(
    {
        contractName: {
            type: String,
            required: true,
            trim: true,
        },
        contractorName: {
            type: String,
            required: true,
            trim: true,
        },
        contractWith: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        contractPeriod: {
            startDate: {
                type: Date,
                required: true,
            },
            endDate: {
                type: Date,
                required: true,
            },
        },
        status: {
            type: String,
            enum: ["draft", "active", "expired", "cancelled"],
            default: "draft",
        },
        products: [
            {
                productId: {
                    type: Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                variants: [
                    {
                        variantId: {
                            type: Schema.Types.ObjectId,
                            ref: "Variant",
                            required: true,
                        },
                        contractPrice: {
                            type: Number,
                            required: true,
                            min: 0,
                        },
                    },
                ],
            },
        ],
        portalIds: [
            {
                type: Schema.Types.ObjectId,
                ref: "Page",
            },
        ],
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

ContractSchema.index({ status: 1 });
ContractSchema.index({ "products.productId": 1 });
ContractSchema.index({ portalIds: 1 });

export default mongoose.model<IContract>("Contract", ContractSchema);
