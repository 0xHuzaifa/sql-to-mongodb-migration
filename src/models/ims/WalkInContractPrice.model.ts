import mongoose, { Schema, Document } from "mongoose";

export interface IWalkInContractPrice extends Document {
    companyName?: string; // If assigned to an entire walk-in company
    customerId?: mongoose.Types.ObjectId; // If assigned to a specific walk-in customer (overrides company)
    products: Array<{
        productId: mongoose.Types.ObjectId;
        variants: Array<{
            variantId: mongoose.Types.ObjectId;
            contractPrice: number;
        }>;
    }>;
    createdBy: mongoose.Types.ObjectId; // References 'User'
    createdAt: Date;
    updatedAt: Date;
}

const WalkInContractPriceSchema = new Schema<IWalkInContractPrice>(
    {
        companyName: {
            type: String,
            trim: true,
            index: true,
        },
        customerId: {
            type: Schema.Types.ObjectId,
            ref: "WalkInCustomer",
            index: true,
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

// Ensure that a document must have either companyName or customerId
WalkInContractPriceSchema.pre("validate", function (next) {
    if (!this.companyName && !this.customerId) {
        next(new Error("Either companyName or customerId must be provided."));
    } else if (this.companyName && this.customerId) {
        next(new Error("Cannot provide both companyName and customerId in the same record."));
    } else {
        next();
    }
});

// Create unique compound indexes so we don't have multiple documents for the same company or customer
WalkInContractPriceSchema.index(
    { companyName: 1 },
    { unique: true, partialFilterExpression: { companyName: { $exists: true, $type: "string" } } }
);

WalkInContractPriceSchema.index(
    { customerId: 1 },
    { unique: true, partialFilterExpression: { customerId: { $exists: true } } }
);

export default mongoose.model<IWalkInContractPrice>("WalkInContractPrice", WalkInContractPriceSchema);
